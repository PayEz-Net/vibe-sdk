import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VibeError, parseRetryAfter } from '../src/error';
import { vibeRetry, VIBE_DEFAULT_RETRIES } from '../src/retry';

/**
 * PAY-2140 (client half). PAY-2130's 429 AUTH_BLOCKED carries a Retry-After (the live block TTL, up to 900 s).
 * Before this card the header was dropped by VibeError.fromResponse (so nothing could honour it) and the
 * React hooks fell back to TanStack's default of 3 retries on every error, RATE_LIMITED included.
 *
 *   A  VibeError.fromResponse carries retryAfterSeconds from the header (seconds, HTTP-date), undefined otherwise
 *   B  vibeRetry never retries RATE_LIMITED / 429, and keeps TanStack's default (3) for every other failure
 *   C  every useQuery in react.ts passes it (a new hook cannot silently skip the policy)
 */
const res = (status: number, headers: Record<string, string> = {}, body: unknown = { error: { message: 'm' } }) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('A VibeError.retryAfterSeconds', () => {
  it('429 with Retry-After: 900 -> RATE_LIMITED carrying 900', async () => {
    const e = await VibeError.fromResponse(res(429, { 'Retry-After': '900' }));
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.status).toBe(429);
    expect(e.retryAfterSeconds).toBe(900);
    expect(e.toJSON().retryAfterSeconds).toBe(900);
  });

  it('no header -> undefined (never a guessed number)', async () => {
    const e = await VibeError.fromResponse(res(429));
    expect(e.retryAfterSeconds).toBeUndefined();
  });

  it('works on any status that carries the header (503 + Retry-After)', async () => {
    expect((await VibeError.fromResponse(res(503, { 'Retry-After': '30' }))).retryAfterSeconds).toBe(30);
  });

  it('parseRetryAfter: delta-seconds, HTTP-date, past date, garbage, negative, empty', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter(' 7 ', now)).toBe(7);
    expect(parseRetryAfter('Thu, 08 Oct 2026 12:01:30 GMT', now)).toBe(90);
    expect(parseRetryAfter('Thu, 08 Oct 2026 11:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter('-5', now)).toBeUndefined();
    expect(parseRetryAfter('1.5', now)).toBeUndefined();
    expect(parseRetryAfter('', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });
});

describe('B vibeRetry', () => {
  const rate = new VibeError({ code: 'RATE_LIMITED', message: 'blocked', status: 429, retryAfterSeconds: 900 });

  it('never retries RATE_LIMITED at any failure count', () => {
    for (let n = 0; n < 6; n++) expect(vibeRetry(n, rate)).toBe(false);
  });

  it('never retries a bare 429 status even under another code', () => {
    expect(vibeRetry(0, new VibeError({ code: 'UNKNOWN_ERROR', message: 'x', status: 429 }))).toBe(false);
  });

  it('keeps the TanStack default for other failures: retry 3 times, then stop', () => {
    const net = new VibeError({ code: 'NETWORK_ERROR', message: 'down' });
    expect([0, 1, 2].map((n) => vibeRetry(n, net))).toEqual([true, true, true]);
    expect(vibeRetry(VIBE_DEFAULT_RETRIES, net)).toBe(false);
    expect(vibeRetry(0, new VibeError({ code: 'SERVER_ERROR', message: 's', status: 500 }))).toBe(true);
    expect(vibeRetry(0, new Error('plain'))).toBe(true);
  });
});

describe('C every useQuery passes the policy', () => {
  it('react.ts: each useQuery({ is followed by retry: vibeRetry', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'react.ts'), 'utf8').replace(/\r\n/g, '\n');
    const sites = src.split('useQuery({').length - 1;
    const withPolicy = src.split('useQuery({\n    retry: vibeRetry').length - 1;
    expect(sites).toBeGreaterThan(0);
    expect(withPolicy).toBe(sites);
    expect(src).toContain("import { vibeRetry } from './retry';");
  });
});
