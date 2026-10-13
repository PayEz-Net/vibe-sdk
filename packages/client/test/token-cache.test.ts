import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTokenCache, jwtExpSeconds, memoMs, TOKEN_EXPIRY_MARGIN_MS } from '../src/token-cache';
import { resolveConfig, resetProxyHintForTests } from '../src/client';
import { httpRequest } from '../src/http';

/**
 * PAY-2317 (0.3.1): single-flight + short memo for the access-token getter, and the proxy-mode hint.
 *
 *   A  single-flight: a burst shares ONE getter read; a later burst after the memo window reads again
 *   B  what is never cached: null, a thrown error; invalidate() drops the memo AND an in-flight read's right to cache
 *   C  lifetime: expiresIn / JWT exp cap the memo (never into the last 30 s); a long-lived token is still capped at cacheMs
 *   D  cacheMs 0 restores the pre-0.3.1 behaviour (getter on every call, no sharing); string getters still work
 *   E  http: a 401 invalidates the memo; the cached token is what goes into Authorization
 *   F  the proxy hint: once per process, informational, not in production, nothing without idpUrl
 */
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('A single-flight', () => {
  it('15 concurrent calls with a slow getter read it ONCE; a burst after the window reads again', async () => {
    const c = clock();
    let reads = 0;
    const cache = createTokenCache(async () => { reads++; await new Promise((r) => setTimeout(r, 20)); return 'tok'; }, { cacheMs: 5000, now: c.now });
    const first = await Promise.all(Array.from({ length: 15 }, () => cache.get()));
    expect(first.every((t) => t === 'tok')).toBe(true);
    expect(reads).toBe(1);
    c.advance(4_000);
    await cache.get();
    expect(reads).toBe(1); // still inside the 5 s memo
    c.advance(1_500);
    await Promise.all([cache.get(), cache.get()]);
    expect(reads).toBe(2); // memo expired: one new shared read
  });
});

describe('B what is never cached', () => {
  it('null is not memoised: the next call re-reads (a signed-out state is not frozen)', async () => {
    const c = clock();
    let reads = 0;
    const cache = createTokenCache(async () => { reads++; return reads === 1 ? null : 'tok'; }, { cacheMs: 5000, now: c.now });
    expect(await cache.get()).toBeNull();
    expect(await cache.get()).toBe('tok');
    expect(reads).toBe(2);
  });

  it('a thrown error reaches every waiter and is not memoised', async () => {
    const c = clock();
    let reads = 0;
    const cache = createTokenCache(async () => { reads++; if (reads === 1) throw new Error('session fetch failed'); return 'ok'; }, { cacheMs: 5000, now: c.now });
    const both = await Promise.allSettled([cache.get(), cache.get()]);
    expect(both.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(reads).toBe(1);
    expect(await cache.get()).toBe('ok');
    expect(reads).toBe(2);
  });

  it('invalidate() drops the memo, and a read already in flight may not repopulate it', async () => {
    const c = clock();
    let reads = 0;
    let release: (() => void) | undefined;
    const cache = createTokenCache(async () => {
      reads++;
      if (reads === 1) await new Promise<void>((r) => { release = r; });
      return `tok${reads}`;
    }, { cacheMs: 5000, now: c.now });
    const stale = cache.get(); // read 1, parked
    cache.invalidate();
    release?.();
    expect(await stale).toBe('tok1'); // the caller that asked gets its answer
    expect(await cache.get()).toBe('tok2'); // but it was NOT memoised: a fresh read
    expect(reads).toBe(2);
    cache.invalidate();
    expect(await cache.get()).toBe('tok3');
  });
});

describe('C token lifetime caps the memo', () => {
  it('memoMs: unknown life -> cacheMs; short life -> 0; long life -> still cacheMs', () => {
    expect(memoMs('opaque', undefined, 5000, 0)).toBe(5000);
    expect(memoMs('opaque', 20, 5000, 0)).toBe(0); // 20 s left, minus the 30 s margin
    expect(memoMs('opaque', 30, 5000, 0)).toBe(0);
    expect(memoMs('opaque', 36, 5000, 0)).toBe(5000); // 6 s usable, capped at cacheMs
    expect(memoMs('opaque', 33, 5000, 0)).toBe(3000);
    expect(memoMs('opaque', 3600, 5000, 0)).toBe(5000); // an hour-long token is NOT held for an hour
  });

  it('expiresIn from the getter: a 20 s token is never cached; a 3600 s token is cached only for cacheMs', async () => {
    const c = clock();
    let reads = 0;
    const short = createTokenCache(async () => { reads++; return { token: 't', expiresIn: 20 }; }, { cacheMs: 5000, now: c.now });
    await short.get(); await short.get();
    expect(reads).toBe(2);
    reads = 0;
    const long = createTokenCache(async () => { reads++; return { token: 't', expiresIn: 3600 }; }, { cacheMs: 5000, now: c.now });
    await long.get(); c.advance(4_000); await long.get();
    expect(reads).toBe(1);
    c.advance(1_500); await long.get();
    expect(reads).toBe(2);
  });

  it('a JWT exp claim is read WITHOUT a network call and obeys the same margin', async () => {
    const nowMs = 2_000_000_000_000;
    const c = clock(nowMs);
    expect(jwtExpSeconds(jwt(1234))).toBe(1234);
    expect(jwtExpSeconds('not-a-jwt')).toBeUndefined();
    expect(jwtExpSeconds('a.!!!.c')).toBeUndefined();
    let reads = 0;
    const expiring = createTokenCache(async () => { reads++; return jwt(Math.floor(nowMs / 1000) + 20); }, { cacheMs: 5000, now: c.now });
    await expiring.get(); await expiring.get();
    expect(reads).toBe(2); // 20 s of life left: not cached
    reads = 0;
    const healthy = createTokenCache(async () => { reads++; return jwt(Math.floor(nowMs / 1000) + 600); }, { cacheMs: 5000, now: c.now });
    await healthy.get(); await healthy.get();
    expect(reads).toBe(1);
    expect(TOKEN_EXPIRY_MARGIN_MS).toBe(30_000);
  });
});

describe('D cacheMs 0 and string getters', () => {
  it('cacheMs 0: the getter runs on EVERY call, concurrent calls do not share', async () => {
    let reads = 0;
    const cache = createTokenCache(async () => { reads++; return 'tok'; }, { cacheMs: 0 });
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(reads).toBe(3);
  });
  it('a plain string getter and a plain null getter still work', async () => {
    expect(await createTokenCache(async () => 'abc').get()).toBe('abc');
    expect(await createTokenCache(async () => null).get()).toBeNull();
  });
});

describe('E http wiring', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a 401 invalidates the memo; the memoised token is what goes into Authorization', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers.Authorization);
      return new Response(JSON.stringify({ error: { message: 'no' } }), { status: seen.length === 1 ? 401 : 200, headers: { 'content-type': 'application/json' } });
    }));
    let reads = 0;
    const cfg = resolveConfig({ apiUrl: 'http://api.test', tokenCacheMs: 5000, getAccessToken: async () => `tok${++reads}` });
    await expect(httpRequest(cfg, '/x', { method: 'GET' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await httpRequest(cfg, '/x', { method: 'GET' });
    expect(seen).toEqual(['Bearer tok1', 'Bearer tok2']); // memo dropped by the 401
    await httpRequest(cfg, '/x', { method: 'GET' });
    expect(seen[2]).toBe('Bearer tok2'); // and then reused
    expect(reads).toBe(2);
  });

  it('a non-401 failure does NOT drop the memo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })));
    let reads = 0;
    const cfg = resolveConfig({ apiUrl: 'http://api.test', tokenCacheMs: 5000, getAccessToken: async () => `tok${++reads}` });
    await expect(httpRequest(cfg, '/x', { method: 'GET' })).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    await expect(httpRequest(cfg, '/x', { method: 'GET' })).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    expect(reads).toBe(1);
  });
});

describe('F proxy-mode hint', () => {
  const env = process.env.NODE_ENV;
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { resetProxyHintForTests(); info = vi.spyOn(console, 'info').mockImplementation(() => {}); });
  afterEach(() => { info.mockRestore(); process.env.NODE_ENV = env; });

  it('proxy mode: ONE info line per process, however many clients are resolved', () => {
    process.env.NODE_ENV = 'development';
    resolveConfig({ idpUrl: 'http://idp.test', clientId: 'vibe_x' });
    resolveConfig({ idpUrl: 'http://idp.test', clientId: 'vibe_x' });
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toMatch(/proxy mode.*two hops/);
  });
  it('direct mode: no line', () => {
    process.env.NODE_ENV = 'development';
    resolveConfig({ apiUrl: 'http://api.test' });
    expect(info).not.toHaveBeenCalled();
  });
  it('production without debug: no line; production WITH debug: the line', () => {
    process.env.NODE_ENV = 'production';
    resolveConfig({ idpUrl: 'http://idp.test', clientId: 'vibe_x' });
    expect(info).not.toHaveBeenCalled();
    resolveConfig({ idpUrl: 'http://idp.test', clientId: 'vibe_x', debug: true });
    expect(info).toHaveBeenCalledTimes(1);
  });
});

describe('G opt-in: default OFF, and the shared-server-client leak (BAPert 73841, NightHawk 73840)', () => {
  it('the DEFAULT is off: two sequential calls with different getter results make TWO reads and each gets its own', async () => {
    let n = 0;
    const cfg = resolveConfig({ apiUrl: 'http://api.test', getAccessToken: async () => `user${++n}` });
    expect(await cfg.getAccessToken()).toBe('user1');
    expect(await cfg.getAccessToken()).toBe('user2');
    expect(n).toBe(2);
  });

  it('the DEFAULT also does NOT share an in-flight read: two concurrent calls make two reads', async () => {
    let n = 0;
    const cfg = resolveConfig({
      apiUrl: 'http://api.test',
      getAccessToken: async () => { const mine = `user${++n}`; await new Promise((r) => setTimeout(r, 10)); return mine; },
    });
    const [a, b] = await Promise.all([cfg.getAccessToken(), cfg.getAccessToken()]);
    expect([a, b]).toEqual(['user1', 'user2']);
  });

  it('SHARED CLIENT: getter answers A then B inside the window. Memo ON -> B receives A (the documented leak); memo OFF (default) -> B receives B', async () => {
    const principal = { current: 'A' };
    const getter = async () => `token-of-${principal.current}`;
    const on = resolveConfig({ apiUrl: 'http://api.test', tokenCacheMs: 5000, getAccessToken: getter });
    principal.current = 'A';
    await on.getAccessToken();
    principal.current = 'B';
    expect(await on.getAccessToken()).toBe('token-of-A'); // why a shared client must NOT opt in

    const off = resolveConfig({ apiUrl: 'http://api.test', getAccessToken: getter });
    principal.current = 'A';
    await off.getAccessToken();
    principal.current = 'B';
    expect(await off.getAccessToken()).toBe('token-of-B');
  });

  it('opt-in: tokenCacheMs > 0 turns both the memo and the single-flight on', async () => {
    let n = 0;
    const cfg = resolveConfig({ apiUrl: 'http://api.test', tokenCacheMs: 5000, getAccessToken: async () => `t${++n}` });
    await Promise.all([cfg.getAccessToken(), cfg.getAccessToken(), cfg.getAccessToken()]);
    await cfg.getAccessToken();
    expect(n).toBe(1);
  });

  it('the documented warning is in the README, the CHANGELOG and the type doc, in so many words', () => {
    const root = join(__dirname, '..', '..', '..');
    const needle = 'a client shared across users must leave `tokenCacheMs` at 0 or be created per request';
    for (const f of ['README.md', 'CHANGELOG.md']) {
      expect(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n').replace(/\n\s*/g, ' ').toLowerCase()).toContain(needle.toLowerCase());
    }
    expect(readFileSync(join(__dirname, '..', 'src', 'types.ts'), 'utf8').replace(/\r\n/g, '\n').replace(/\n\s*\*\s*/g, ' ').toLowerCase()).toContain('a client shared across users must leave this at 0 or be created per request');
  });
});
