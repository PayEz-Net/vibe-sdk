import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runWatcherTick,
  fetchSchemaHash,
  parseRetryAfterHeader,
  resetWatcherState,
  MIN_PAUSE_MS,
  MAX_RETRY_AFTER_MS,
  MAX_HEADERLESS_BACKOFF_MS,
  type SchemaHashResult,
  type WatcherDeps,
} from '../src/dev-watcher';

/**
 * PAY-2140: the dev watcher polls the schema-hash endpoint every 10 s. Before this card a non-ok answer
 * (a 429 AUTH_BLOCKED included) fell through to String(Date.now()) - a value that differs every tick - so
 * every tick ran a full signed generateTypes fan-out, and a wrong key re-burned PAY-2130's 10 failures
 * the moment each 15-minute block expired.
 *
 *   P  fetchSchemaHash classifies what the server SAID (hash / no-endpoint / rate-limited / unavailable)
 *   R  429 -> NO generate, and NO request at all until Retry-After (min 10 s) has passed
 *   H  429 without a header -> exponential back-off (20 s, 40 s ... capped at the 900 s block length)
 *   U  5xx / network error -> no regeneration, next tick tries again normally
 *   C  a real hash drives generate exactly once per change; the legacy "no hash endpoint" (404) still regenerates
 *   W  ONE warn per block, not per tick
 */
const options = { idpUrl: 'https://idp.test', clientId: 'c', signingKey: 'k', debug: false, pollInterval: 10_000 };

function makeDeps(script: SchemaHashResult[]) {
  const fetchHash = vi.fn(async () => script.shift() as SchemaHashResult);
  const generate = vi.fn(async () => ({ success: true as const, collections: ['a'], outputDir: 'x' }));
  const touch = vi.fn();
  return { fetchHash, generate, touch, deps: { fetchHash, generate, touch } as unknown as WatcherDeps };
}

const T0 = 1_000_000_000_000;
const sec = (n: number) => n * 1000;

describe('P fetchSchemaHash classifies the answer', () => {
  afterEach(() => vi.unstubAllGlobals());
  const gen = { idpUrl: 'https://idp.test', clientId: 'c', signingKey: Buffer.from('k').toString('base64') };
  const stub = (res: Response | Error) =>
    vi.stubGlobal('fetch', vi.fn(async () => { if (res instanceof Error) throw res; return res; }));

  it('200 with a hash -> hash', async () => {
    stub(new Response(JSON.stringify({ success: true, data: { hash: 'h1' } }), { status: 200 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'hash', hash: 'h1' });
  });
  it('200 without a hash -> no-endpoint (legacy)', async () => {
    stub(new Response('{}', { status: 200 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'no-endpoint' });
  });
  it('404 -> no-endpoint (legacy)', async () => {
    stub(new Response('nope', { status: 404 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'no-endpoint' });
  });
  it('429 with Retry-After: 900 -> rate-limited carrying 900', async () => {
    stub(new Response('{}', { status: 429, headers: { 'Retry-After': '900' } }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'rate-limited', retryAfterSeconds: 900 });
  });
  it('429 without the header -> rate-limited, retryAfterSeconds undefined', async () => {
    stub(new Response('{}', { status: 429 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'rate-limited', retryAfterSeconds: undefined });
  });
  it('500 -> unavailable (NOT a hash)', async () => {
    stub(new Response('boom', { status: 500 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'unavailable', status: 500 });
  });
  it('the request throwing, or an ok body that is not JSON -> unavailable', async () => {
    stub(new Error('ECONNREFUSED'));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'unavailable' });
    stub(new Response('<html>', { status: 200 }));
    expect(await fetchSchemaHash(gen)).toEqual({ kind: 'unavailable' });
  });
  it('parseRetryAfterHeader: seconds, date, garbage', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(parseRetryAfterHeader('120', now)).toBe(120);
    expect(parseRetryAfterHeader('Thu, 08 Oct 2026 12:01:30 GMT', now)).toBe(90);
    expect(parseRetryAfterHeader('Thu, 08 Oct 2026 11:00:00 GMT', now)).toBe(0); // a past date is 0, never negative
    for (const bad of ['-5', '1.5', 'soon', '', null]) expect(parseRetryAfterHeader(bad as string | null, now)).toBeUndefined();
  });
});

describe('watcher tick', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetWatcherState();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('R: 429 + Retry-After 120 -> no generate, and nothing is sent until 120 s have passed', async () => {
    const { fetchHash, generate, deps } = makeDeps([
      { kind: 'rate-limited', retryAfterSeconds: 120 },
      { kind: 'hash', hash: 'h1' },
    ]);
    expect(await runWatcherTick(options, T0, deps)).toBe('rate-limited');
    expect(generate).not.toHaveBeenCalled();
    // every 10 s tick inside the window sends NOTHING
    for (let s = 10; s < 120; s += 10) expect(await runWatcherTick(options, T0 + sec(s), deps)).toBe('paused');
    expect(fetchHash).toHaveBeenCalledTimes(1);
    // at exactly Retry-After the probe goes out again
    expect(await runWatcherTick(options, T0 + sec(120), deps)).toBe('regenerated');
    expect(fetchHash).toHaveBeenCalledTimes(2);
  });

  it('R: a tiny Retry-After is held to the 10 s minimum', async () => {
    const { fetchHash, deps } = makeDeps([{ kind: 'rate-limited', retryAfterSeconds: 1 }, { kind: 'hash', hash: 'h' }]);
    await runWatcherTick(options, T0, deps);
    expect(await runWatcherTick(options, T0 + MIN_PAUSE_MS - 1, deps)).toBe('paused');
    expect(fetchHash).toHaveBeenCalledTimes(1);
    expect(await runWatcherTick(options, T0 + MIN_PAUSE_MS, deps)).not.toBe('paused');
  });

  it('R: a huge Retry-After is capped at 1 h (a misconfigured header cannot park the watcher for a day)', async () => {
    const { fetchHash, deps } = makeDeps([{ kind: 'rate-limited', retryAfterSeconds: 86_400 }, { kind: 'hash', hash: 'h' }]);
    await runWatcherTick(options, T0, deps);
    expect(await runWatcherTick(options, T0 + MAX_RETRY_AFTER_MS - 1, deps)).toBe('paused');
    expect(fetchHash).toHaveBeenCalledTimes(1);
    expect(await runWatcherTick(options, T0 + MAX_RETRY_AFTER_MS, deps)).not.toBe('paused');
    expect(fetchHash).toHaveBeenCalledTimes(2);
  });

  it('H: no header -> 20 s, 40 s, 80 s ... never above 900 s; a good answer resets it', async () => {
    const script: SchemaHashResult[] = Array.from({ length: 9 }, () => ({ kind: 'rate-limited' as const }));
    const { deps } = makeDeps([...script, { kind: 'hash', hash: 'h' }, { kind: 'rate-limited' }]);
    let now = T0;
    const waits: number[] = [];
    for (let i = 0; i < 9; i++) {
      expect(await runWatcherTick(options, now, deps)).toBe('rate-limited');
      // find how long it stays paused (probe the boundary in 1 s steps would be slow; use known pause via binary check)
      let lo = 0;
      let hi = MAX_HEADERLESS_BACKOFF_MS;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        // a paused tick consumes nothing, so probing is free
        (await runWatcherTick(options, now + mid, makeDeps([]).deps)) === 'paused' ? (lo = mid) : (hi = mid);
      }
      waits.push(hi / 1000);
      now += hi;
    }
    expect(waits).toEqual([20, 40, 80, 160, 320, 640, 900, 900, 900]);
    // a real answer resets the ladder: the next 429 starts again at 20 s
    expect(await runWatcherTick(options, now, deps)).toBe('regenerated');
    expect(await runWatcherTick(options, now + sec(10), deps)).toBe('rate-limited');
    expect(await runWatcherTick(options, now + sec(10) + sec(19), deps)).toBe('paused');
    expect(await runWatcherTick(options, now + sec(10) + sec(20), makeDeps([{ kind: 'hash', hash: 'h' }]).deps)).not.toBe('paused');
  });

  it('U: 500 and a failed request never regenerate and never pause', async () => {
    const { fetchHash, generate, deps } = makeDeps([
      { kind: 'unavailable', status: 500 },
      { kind: 'unavailable' },
      { kind: 'hash', hash: 'h1' },
    ]);
    expect(await runWatcherTick(options, T0, deps)).toBe('unavailable');
    expect(await runWatcherTick(options, T0 + sec(10), deps)).toBe('unavailable');
    expect(generate).not.toHaveBeenCalled();
    expect(await runWatcherTick(options, T0 + sec(20), deps)).toBe('regenerated');
    expect(fetchHash).toHaveBeenCalledTimes(3);
  });

  it('C: generate once per CHANGED hash; the legacy no-endpoint server still regenerates every tick', async () => {
    const a = makeDeps([{ kind: 'hash', hash: 'h1' }, { kind: 'hash', hash: 'h1' }, { kind: 'hash', hash: 'h2' }]);
    expect(await runWatcherTick(options, T0, a.deps)).toBe('regenerated');
    expect(await runWatcherTick(options, T0 + sec(10), a.deps)).toBe('unchanged');
    expect(await runWatcherTick(options, T0 + sec(20), a.deps)).toBe('regenerated');
    expect(a.generate).toHaveBeenCalledTimes(2);
    expect(a.touch).toHaveBeenCalledTimes(2);

    resetWatcherState();
    const b = makeDeps([{ kind: 'no-endpoint' }, { kind: 'no-endpoint' }]);
    expect(await runWatcherTick(options, T0, b.deps)).toBe('regenerated');
    expect(await runWatcherTick(options, T0 + sec(10), b.deps)).toBe('regenerated');
    expect(b.generate).toHaveBeenCalledTimes(2);
  });

  it('W: one warn for the whole block, however many ticks, and again for the next block', async () => {
    const { deps } = makeDeps([
      { kind: 'rate-limited', retryAfterSeconds: 60 },
      { kind: 'hash', hash: 'h' },
      { kind: 'rate-limited', retryAfterSeconds: 60 },
    ]);
    await runWatcherTick(options, T0, deps);
    for (let s = 10; s < 60; s += 10) await runWatcherTick(options, T0 + sec(s), deps);
    expect(warn).toHaveBeenCalledTimes(1);
    await runWatcherTick(options, T0 + sec(60), deps); // ok -> block over
    await runWatcherTick(options, T0 + sec(70), deps); // second block
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('W: consecutive 429s across expired pauses (one long block) still warn ONCE', async () => {
    const { deps } = makeDeps(Array.from({ length: 4 }, () => ({ kind: 'rate-limited' as const, retryAfterSeconds: 30 })));
    let now = T0;
    for (let i = 0; i < 4; i++) {
      expect(await runWatcherTick(options, now, deps)).toBe('rate-limited');
      now += sec(30);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('paused for 30s');
  });
});
