/**
 * PAY-2317 (0.3.1): single-flight + short memo for the access-token getter.
 *
 * WHY. `httpRequest` awaits `config.getAccessToken()` before EVERY call. If the app's getter does a network round trip (a session
 * fetch), that is one extra serial round trip per call, and 15 calls in a burst make 15 of them. This wraps the getter so a burst
 * shares ONE in-flight read and a result is reused for a few seconds.
 *
 * *** OPT-IN, DEFAULT OFF (BAPert 73841, NightHawk 73840). *** A client shared across users (ONE client created at module scope in a server
 * whose getter reads the CURRENT request's session) would hand user A's token to user B, by the memo AND by the single-flight: a
 * request that arrives while another user's read is in flight would join that read. So both are off unless `tokenCacheMs > 0`.
 * A client shared across users must leave `tokenCacheMs` at 0 or be created per request; set it only on a client bound to one
 * principal (a browser tab, a per-request client, a service account).
 *
 * WHAT IT WILL NOT DO (each of these is a security or correctness line, not a tuning knob):
 *   - it never caches a null token or a thrown error (a signed-out state is re-read on the next call);
 *   - it never holds a token past its own life: when the getter reports `expiresIn` (seconds) or the token is a JWT with an `exp`
 *     claim, the memo is capped at (remaining life - 30 s), so a token with under 30 s left is not cached at all;
 *   - the memo is capped at `cacheMs` even when the token lives for an hour, because the SDK cannot see the app's
 *     logout / account switch: a long memo would keep sending the previous user's token. An app that knows better raises
 *     `tokenCacheMs` itself;
 *   - a 401 from the API drops the memo (`invalidate()`), so a revoked or rotated token is re-read on the next call;
 *   - `cacheMs: 0` (the DEFAULT) disables both the memo and the single-flight: the getter runs on every call, exactly as before 0.3.1.
 */

/** What a getter may return besides a bare token string: the token plus its remaining life in SECONDS (an OAuth `expires_in`). */
export interface TokenResult {
  token: string | null;
  expiresIn?: number;
}

export type AccessTokenGetter = () => Promise<string | null | TokenResult>;

export interface TokenCache {
  get(): Promise<string | null>;
  /** Forget the memo and make any read already in flight unusable for caching. */
  invalidate(): void;
}

/** OFF by default: see the header. Opt in with `tokenCacheMs` (5000 is a sensible value for a client bound to one principal). */
export const DEFAULT_TOKEN_CACHE_MS = 0;
/** A token is not memoised into the last 30 s of its life. */
export const TOKEN_EXPIRY_MARGIN_MS = 30_000;

/** `exp` (seconds since epoch) of a JWT, or undefined when the string is not a JWT or the claim is absent. No network, no verification. */
export function jwtExpSeconds(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : undefined;
  } catch {
    return undefined;
  }
}

/** How long (ms) this token may be memoised: at most `cacheMs`, and never into the last 30 s of its life. 0 = do not cache. */
export function memoMs(token: string, expiresIn: number | undefined, cacheMs: number, nowMs: number): number {
  let remainingMs: number | undefined;
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) remainingMs = expiresIn * 1000;
  else {
    const exp = jwtExpSeconds(token);
    if (exp !== undefined) remainingMs = exp * 1000 - nowMs;
  }
  if (remainingMs === undefined) return cacheMs;
  return Math.max(0, Math.min(cacheMs, remainingMs - TOKEN_EXPIRY_MARGIN_MS));
}

export function createTokenCache(
  getter: AccessTokenGetter,
  options: { cacheMs?: number; now?: () => number } = {}
): TokenCache {
  const cacheMs = options.cacheMs ?? DEFAULT_TOKEN_CACHE_MS;
  const now = options.now ?? Date.now;

  if (!(cacheMs > 0)) {
    return {
      async get() {
        const r = await getter();
        return typeof r === 'object' && r !== null ? r.token : r;
      },
      invalidate() {},
    };
  }

  let cached: { token: string; until: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  let generation = 0;

  return {
    get() {
      if (cached && now() < cached.until) return Promise.resolve(cached.token);
      if (inflight) return inflight;
      const gen = generation;
      const p = (async () => {
        const raw = await getter();
        const token = typeof raw === 'object' && raw !== null ? raw.token : raw;
        const expiresIn = typeof raw === 'object' && raw !== null ? raw.expiresIn : undefined;
        if (token && gen === generation) {
          const ms = memoMs(token, expiresIn, cacheMs, now());
          if (ms > 0) cached = { token, until: now() + ms };
        }
        return token ?? null;
      })().finally(() => {
        if (inflight === p) inflight = null;
      });
      inflight = p;
      return p;
    },
    invalidate() {
      generation++;
      cached = null;
      inflight = null;
    },
  };
}
