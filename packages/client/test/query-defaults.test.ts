import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { VibeError } from '../src/error';
import { vibeRetry, queryBehavior, VIBE_QUERY_DEFAULTS } from '../src/retry';

/**
 * PAY-2317 (0.3.0): cache defaults + retry policy for the query hooks.
 *
 *   A  retry policy per failure class (429/timeout/4xx never; 5xx once; network twice; unknown once)
 *   B  the policy and defaults drive a REAL TanStack observer: call counts, not just the predicate
 *   C  a timeout is its own code (TIMEOUT), not NETWORK_ERROR, so the policy can tell them apart
 *   D  queryBehavior: defaults, per-hook overrides, undefined keeps the default
 *   E  source: every useQuery in react.ts spreads queryBehavior, and the collection/document hooks do not leak
 *      staleTime/refetchOnWindowFocus into the list options (they would change the query key and the request)
 */
const err = (code: VibeError['code'], status?: number) => new VibeError({ code, message: 'm', status });

describe('A vibeRetry per failure class', () => {
  it('429 / RATE_LIMITED never', () => {
    for (let n = 0; n < 4; n++) expect(vibeRetry(n, err('RATE_LIMITED', 429))).toBe(false);
  });
  it('TIMEOUT never', () => {
    for (let n = 0; n < 4; n++) expect(vibeRetry(n, err('TIMEOUT'))).toBe(false);
  });
  it('any other 4xx never (400 reaches us as UNKNOWN_ERROR with a status)', () => {
    const cases: Array<[VibeError['code'], number]> = [
      ['UNKNOWN_ERROR', 400], ['UNAUTHORIZED', 401], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['CONFLICT', 409], ['VALIDATION_ERROR', 422],
    ];
    for (const [code, status] of cases) {
      expect(vibeRetry(0, err(code, status)), `${code} ${status}`).toBe(false);
    }
  });
  it('5xx once', () => {
    expect([0, 1, 2].map((n) => vibeRetry(n, err('SERVER_ERROR', 503)))).toEqual([true, false, false]);
  });
  it('network error twice', () => {
    expect([0, 1, 2, 3].map((n) => vibeRetry(n, err('NETWORK_ERROR')))).toEqual([true, true, false, false]);
  });
  it('an unclassified failure once', () => {
    expect([0, 1].map((n) => vibeRetry(n, new Error('plain')))).toEqual([true, false]);
  });
});

describe('B behaviour against a real TanStack observer', () => {
  async function attempts(error: unknown): Promise<number> {
    let calls = 0;
    const qc = new QueryClient();
    const obs = new QueryObserver(qc, {
      queryKey: ['k'],
      queryFn: async () => {
        calls++;
        throw error;
      },
      retry: vibeRetry,
      retryDelay: 0,
    });
    await new Promise<void>((resolve) => {
      const un = obs.subscribe((r) => {
        if (r.status === 'error') {
          un();
          resolve();
        }
      });
    });
    return calls;
  }

  it('calls made = 1 + retries: timeout 1, 404 1, 5xx 2, network 3, 429 1', async () => {
    expect(await attempts(err('TIMEOUT'))).toBe(1);
    expect(await attempts(err('NOT_FOUND', 404))).toBe(1);
    expect(await attempts(err('SERVER_ERROR', 500))).toBe(2);
    expect(await attempts(err('NETWORK_ERROR'))).toBe(3);
    expect(await attempts(err('RATE_LIMITED', 429))).toBe(1);
  });

  async function fetchesAfterRemount(opts: ReturnType<typeof queryBehavior>): Promise<number> {
    let calls = 0;
    const qc = new QueryClient();
    const make = () =>
      new QueryObserver<number>(qc, {
        queryKey: ['k'],
        queryFn: async () => {
          calls++;
          return calls;
        },
        retry: vibeRetry,
        ...opts,
      });
    const settle = (o: QueryObserver<number>) =>
      new Promise<void>((resolve) => {
        // A fresh cache hit is already settled when the observer mounts, so subscribe() would never notify: read it first.
        const done = (r: { status: string; isFetching: boolean }) => r.status === 'success' && !r.isFetching;
        const un = o.subscribe((r) => {
          if (done(r)) {
            un();
            resolve();
          }
        });
        if (done(o.getCurrentResult())) {
          un();
          resolve();
        }
      });
    await settle(make());
    await settle(make()); // a remount
    return calls;
  }

  it('default staleTime: a remount inside the window makes NO second request; staleTime 0 makes one', async () => {
    expect(await fetchesAfterRemount(queryBehavior())).toBe(1);
    expect(await fetchesAfterRemount(queryBehavior({ staleTime: 0 }))).toBe(2);
  });
});

describe('C a timeout is TIMEOUT, not NETWORK_ERROR', () => {
  it('AbortError -> TIMEOUT; a dropped connection stays NETWORK_ERROR', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    expect(VibeError.fromError(abort).code).toBe('TIMEOUT');
    expect(VibeError.fromError(new TypeError('fetch failed')).code).toBe('NETWORK_ERROR');
  });
  it('TIMEOUT is not in isRetryable()', () => {
    expect(err('TIMEOUT').isRetryable()).toBe(false);
  });
});

describe('D queryBehavior', () => {
  it('defaults are 30 s and no refocus refetch', () => {
    expect(VIBE_QUERY_DEFAULTS).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false });
    expect(queryBehavior()).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false });
  });
  it('overrides apply; undefined keeps the default; 0 and false are real overrides', () => {
    expect(queryBehavior({ staleTime: 0 })).toEqual({ staleTime: 0, refetchOnWindowFocus: false });
    expect(queryBehavior({ refetchOnWindowFocus: true })).toEqual({ staleTime: 30_000, refetchOnWindowFocus: true });
    expect(queryBehavior({ staleTime: undefined, refetchOnWindowFocus: undefined })).toEqual({ staleTime: 30_000, refetchOnWindowFocus: false });
  });
});

describe('E react.ts wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'react.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('every useQuery spreads queryBehavior right after retry', () => {
    const sites = src.split('useQuery({').length - 1;
    const wired = src.split(/useQuery\(\{\n {4}retry: vibeRetry,[^\n]*\n {4}\.\.\.queryBehavior\(/).length - 1;
    expect(sites).toBe(8);
    expect(wired).toBe(sites);
  });
  it('collection/document hooks take staleTime/refetchOnWindowFocus OUT of the list options', () => {
    expect(src).toContain('const { enabled = true, staleTime, refetchOnWindowFocus, ...listOptions } = options;');
    expect(src).toContain('const { enabled = true, staleTime, refetchOnWindowFocus } = options;');
  });
});
