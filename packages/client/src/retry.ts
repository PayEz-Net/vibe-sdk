/**
 * PAY-2140: the retry policy for the React query hooks.
 *
 * TanStack Query v5 retries EVERY failed query 3 times with exponential backoff by default. For a 429 that is
 * the wrong thing: a RATE_LIMITED answer (PAY-2130's AUTH_BLOCKED carries a Retry-After of up to 15 minutes) is
 * the server saying "stop", and 3 more requests inside the first seconds only multiply the load on a block.
 *
 * So: never retry RATE_LIMITED / HTTP 429 from a query (the caller can read `error.retryAfterSeconds` and
 * decide); every other failure keeps TanStack's default (3 retries). Mutations are unaffected (default 0).
 */
import { VibeError } from './error';

/** TanStack's default retry count, kept for every non-429 failure so behaviour there does not change. */
export const VIBE_DEFAULT_RETRIES = 3;

export function vibeRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof VibeError && (error.code === 'RATE_LIMITED' || error.status === 429)) {
    return false;
  }
  return failureCount < VIBE_DEFAULT_RETRIES;
}
