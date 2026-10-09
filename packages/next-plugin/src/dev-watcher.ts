/**
 * Dev Watcher
 *
 * Watches for schema changes in development mode and regenerates types.
 *
 * PAY-2140: an ERROR answer from the schema-hash probe is not a schema change. Before this, any non-ok response
 * (a 429 AUTH_BLOCKED included) fell through to `String(Date.now())`, a value that differs on every tick, so after
 * one failure EVERY 10 s tick ran a full generateTypes fan-out (collections + per-collection types/schema, all
 * signed) and, with a wrong key, kept re-burning the 10 failures behind PAY-2130's 15-minute block. Now:
 *   - 429  -> pause, and send NOTHING until Retry-After (min 10 s, cap 1 h) has passed; without the header,
 *             back off exponentially (20 s, 40 s ... capped at 15 min, the block length); ONE warn per block;
 *   - 5xx / other non-ok / network error -> no regeneration, next tick tries again as normal;
 *   - 404 or no hash in the body -> the legacy "server has no hash endpoint" behaviour is KEPT (regenerate).
 */

import { generateTypes, resolveGeneratorOptions } from './type-generator';
import type { VibePluginOptions } from './types';

let watcherInterval: NodeJS.Timeout | null = null;
let lastSchemaHash: string | null = null;

/** Never poll sooner than this after a 429, even if the server's Retry-After is smaller. */
export const MIN_PAUSE_MS = 10_000;
/** A Retry-After above this is clamped (a misconfigured header must not park the watcher for a day). */
export const MAX_RETRY_AFTER_MS = 3_600_000;
/** Headerless back-off ceiling = the PAY-2130 block length (900 s). */
export const MAX_HEADERLESS_BACKOFF_MS = 900_000;

let pausedUntil = 0;
let headerlessBackoffMs = 0;
let pauseLogged = false;

type GeneratorOpts = ReturnType<typeof resolveGeneratorOptions>;

export type SchemaHashResult =
  | { kind: 'hash'; hash: string }
  /** 404, no hash in the body, or no endpoint configured: the server cannot tell us if the schema changed. */
  | { kind: 'no-endpoint' }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  /** 5xx, any other non-ok, or the request itself failed. NOT a schema change. */
  | { kind: 'unavailable'; status?: number };

export type TickOutcome =
  | 'paused'
  | 'rate-limited'
  | 'unavailable'
  | 'unchanged'
  | 'regenerated'
  | 'regenerate-failed';

export interface WatcherDeps {
  fetchHash: (options: GeneratorOpts) => Promise<SchemaHashResult>;
  generate: typeof generateTypes;
  touch: () => void;
}

const defaultDeps: WatcherDeps = {
  fetchHash: fetchSchemaHash,
  generate: generateTypes,
  touch: touchTsConfig,
};

/**
 * Start watching for schema changes in development mode
 */
export function startDevWatcher(options: VibePluginOptions): void {
  if (watcherInterval) {
    console.log('[vibe-plugin] Dev watcher already running');
    return;
  }

  const pollInterval = options.pollInterval ?? 10000; // Default 10 seconds
  const debug = options.debug ?? false;

  if (debug) {
    console.log(`[vibe-plugin] Starting dev watcher with ${pollInterval}ms poll interval`);
  }

  // Initial type generation
  void initialSync(options);

  // Start polling for changes
  watcherInterval = setInterval(() => {
    void runWatcherTick(options);
  }, pollInterval);

  // Handle process exit
  process.on('exit', () => stopDevWatcher());
  process.on('SIGINT', () => {
    stopDevWatcher();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopDevWatcher();
    process.exit(0);
  });
}

/**
 * Stop the dev watcher
 */
export function stopDevWatcher(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log('[vibe-plugin] Dev watcher stopped');
  }
  resetWatcherState();
}

/** Reset the module-level state (stop, and tests). */
export function resetWatcherState(): void {
  lastSchemaHash = null;
  pausedUntil = 0;
  headerlessBackoffMs = 0;
  pauseLogged = false;
}

/** The first generation at start-up: unconditional, as before. */
async function initialSync(options: VibePluginOptions, deps: WatcherDeps = defaultDeps): Promise<void> {
  const debug = options.debug ?? false;
  try {
    await generateAndReport(resolveGeneratorOptions(options), false, deps);
  } catch (error) {
    if (debug) {
      console.error('[vibe-plugin] Sync failed:', error);
    }
  }
}

async function generateAndReport(
  generatorOptions: GeneratorOpts,
  checkForChanges: boolean,
  deps: WatcherDeps
): Promise<boolean> {
  const debug = generatorOptions.debug;
  const result = await deps.generate(generatorOptions);

  if (result.success) {
    if (debug || !checkForChanges) {
      console.log(`[vibe-plugin] Types generated for ${result.collections.length} collections`);
    }

    // Touch a file to trigger TypeScript server reload
    deps.touch();
    return true;
  }
  console.error('[vibe-plugin] Type generation failed:', result.error);
  return false;
}

/**
 * One poll tick. `nowMs` and `deps` are parameters so the back-off is testable without timers or a network.
 */
export async function runWatcherTick(
  options: VibePluginOptions,
  nowMs: number = Date.now(),
  deps: WatcherDeps = defaultDeps
): Promise<TickOutcome> {
  const debug = options.debug ?? false;
  const pollInterval = options.pollInterval ?? 10000;

  // A 429 pause: send nothing at all until it has passed.
  if (nowMs < pausedUntil) return 'paused';

  try {
    const generatorOptions = resolveGeneratorOptions(options);
    const probe = await deps.fetchHash(generatorOptions);

    if (probe.kind === 'rate-limited') {
      let pauseMs: number;
      if (probe.retryAfterSeconds !== undefined) {
        pauseMs = Math.min(Math.max(probe.retryAfterSeconds * 1000, MIN_PAUSE_MS), MAX_RETRY_AFTER_MS);
      } else {
        // No Retry-After reached us (a proxy can drop it): exponential back-off, never faster than 2 polls.
        headerlessBackoffMs = Math.min(Math.max(headerlessBackoffMs * 2, pollInterval * 2), MAX_HEADERLESS_BACKOFF_MS);
        pauseMs = headerlessBackoffMs;
      }
      pausedUntil = nowMs + pauseMs;
      if (!pauseLogged) {
        pauseLogged = true;
        console.warn(
          `[vibe-plugin] Schema sync paused for ${Math.ceil(pauseMs / 1000)}s: the server answered 429` +
            `${probe.retryAfterSeconds !== undefined ? ' with Retry-After' : ''}. ` +
            'A wrong VIBE_CLIENT_ID / signing key keeps this block in place; fix the credential.'
        );
      }
      return 'rate-limited';
    }

    if (probe.kind === 'unavailable') {
      if (debug) {
        console.log(`[vibe-plugin] Schema hash unavailable${probe.status ? ` (HTTP ${probe.status})` : ''}; not regenerating`);
      }
      return 'unavailable';
    }

    // We got a real answer: any earlier block is over.
    headerlessBackoffMs = 0;
    pauseLogged = false;

    const currentHash = probe.kind === 'hash' ? probe.hash : String(nowMs); // legacy: no hash endpoint -> always regenerate
    if (currentHash === lastSchemaHash) {
      if (debug) {
        console.log('[vibe-plugin] No schema changes detected');
      }
      return 'unchanged';
    }
    lastSchemaHash = currentHash;

    if (debug) {
      console.log('[vibe-plugin] Schema changes detected, regenerating types...');
    }
    return (await generateAndReport(generatorOptions, true, deps)) ? 'regenerated' : 'regenerate-failed';
  } catch (error) {
    if (debug) {
      console.error('[vibe-plugin] Sync failed:', error);
    }
    return 'unavailable';
  }
}

/**
 * Fetch a hash of the current schema state for change detection.
 * Returns what the server SAID; the caller decides what that means (see the file header).
 */
export async function fetchSchemaHash(options: {
  idpUrl: string;
  clientId: string;
  signingKey: string;
  apiUrl?: string;
  clientSecret?: string;
}): Promise<SchemaHashResult> {
  try {
    const endpoint = '/v1/schemas/hash';
    let response: Response;

    // Use IDP proxy if configured
    if (options.idpUrl) {
      const { createHmac } = await import('crypto');
      const timestamp = Math.floor(Date.now() / 1000);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Vibe-Client-Id': options.clientId,
      };

      if (options.signingKey) {
        const stringToSign = `${timestamp}|GET|${endpoint}`;
        const signature = createHmac('sha256', Buffer.from(options.signingKey, 'base64'))
          .update(stringToSign)
          .digest('base64');
        headers['X-Vibe-Timestamp'] = String(timestamp);
        headers['X-Vibe-Signature'] = signature;
      }

      response = await fetch(`${options.idpUrl}/api/vibe/proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint, method: 'GET', data: null }),
      });
    } else if (options.apiUrl) {
      // Legacy direct API
      response = await fetch(`${options.apiUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'X-Vibe-Client-Id': options.clientId,
          'X-Vibe-Client-Secret': options.clientSecret || '',
        },
      });
    } else {
      return { kind: 'no-endpoint' };
    }

    if (response.ok) {
      const body = (await response.json()) as { hash?: string; data?: { hash?: string } };
      const data = (body as any)?.data ?? body;
      return data?.hash ? { kind: 'hash', hash: String(data.hash) } : { kind: 'no-endpoint' };
    }
    if (response.status === 429) {
      return { kind: 'rate-limited', retryAfterSeconds: parseRetryAfterHeader(response.headers.get('retry-after')) };
    }
    if (response.status === 404) {
      return { kind: 'no-endpoint' };
    }
    return { kind: 'unavailable', status: response.status };
  } catch {
    // The request itself failed (network down, DNS, a body that is not JSON): not a schema change.
    return { kind: 'unavailable' };
  }
}

/** Retry-After: delta-seconds or an HTTP-date -> whole seconds; undefined when absent or unparseable. */
export function parseRetryAfterHeader(value: string | null, nowMs: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  const v = value.trim();
  if (v === '') return undefined;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  if (!/[A-Za-z]{3}/.test(v)) return undefined; // lenient Date.parse reads '-5' / '1.5' as dates
  const at = Date.parse(v);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/**
 * Touch tsconfig.json to trigger TypeScript server reload
 */
function touchTsConfig(): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');

    if (fs.existsSync(tsconfigPath)) {
      const now = new Date();
      fs.utimesSync(tsconfigPath, now, now);
    }
  } catch {
    // Ignore errors
  }
}
