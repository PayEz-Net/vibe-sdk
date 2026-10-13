/**
 * PAY-2140 + PAY-2317: the retry policy and cache defaults for the React query hooks.
 *
 * PAY-2140. TanStack Query v5 retries EVERY failed query 3 times with exponential backoff by default. For a 429 that is
 * the wrong thing: a RATE_LIMITED answer (PAY-2130's AUTH_BLOCKED carries a Retry-After of up to 15 minutes) is
 * the server saying "stop", and 3 more requests inside the first seconds only multiply the load on a block.
 *
 * PAY-2317 (0.3.0). The same default also sent a call that can never succeed (a 400/401/403/404) four times, and a call that
 * had just waited the whole request timeout four times (a 30 s timeout becomes two minutes and triples the load on a server
 * that is already slow). The policy is now, per failure:
 *
 *   RATE_LIMITED / HTTP 429   never (unchanged)
 *   TIMEOUT                   never: it already waited `timeout` ms
 *   any other 4xx             never: the answer will not change
 *   5xx / SERVER_ERROR        once
 *   NETWORK_ERROR             twice
 *   anything else             once
 *
 * Mutations are unaffected (TanStack default 0).
 */
import { VibeError } from './error';

/** TanStack's default retry count. Kept as the exported ceiling; no failure class now exceeds 2. */
export const VIBE_DEFAULT_RETRIES = 3;

/** Retries allowed per failure class (see the table above). */
export const VIBE_RETRY_LIMITS = { network: 2, server: 1, other: 1 } as const;

export function vibeRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof VibeError) {
    if (error.code === 'RATE_LIMITED' || error.status === 429) return false;
    if (error.code === 'TIMEOUT') return false;
    if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) return false;
    if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND' ||
        error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT') return false;
    if (error.code === 'SERVER_ERROR') return failureCount < VIBE_RETRY_LIMITS.server;
    if (error.code === 'NETWORK_ERROR') return failureCount < VIBE_RETRY_LIMITS.network;
  }
  return failureCount < VIBE_RETRY_LIMITS.other;
}

/**
 * PAY-2317: cache defaults for the query hooks. TanStack's own defaults are staleTime 0 plus a refetch on every mount, window
 * focus and reconnect, which on a slow link turns one page into repeated identical calls. A hook's caller can override either
 * value per hook (see QueryBehavior); mutations still invalidate the affected keys, so the user's own writes are not hidden.
 */
export const VIBE_QUERY_DEFAULTS = { staleTime: 30_000, refetchOnWindowFocus: false } as const;

/** Per-hook override of VIBE_QUERY_DEFAULTS. */
export interface QueryBehavior {
  /** ms a result stays fresh (no refetch on remount inside this window). Default 30 000. 0 restores TanStack's refetch-on-mount. */
  staleTime?: number;
  /** Refetch when the window regains focus. Default false. */
  refetchOnWindowFocus?: boolean;
}

/** The defaults with the caller's overrides applied. Only defined values override, so `{ staleTime: undefined }` keeps the default. */
export function queryBehavior(b: QueryBehavior = {}): { staleTime: number; refetchOnWindowFocus: boolean } {
  return {
    staleTime: b.staleTime !== undefined ? b.staleTime : VIBE_QUERY_DEFAULTS.staleTime,
    refetchOnWindowFocus: b.refetchOnWindowFocus !== undefined ? b.refetchOnWindowFocus : VIBE_QUERY_DEFAULTS.refetchOnWindowFocus,
  };
}
