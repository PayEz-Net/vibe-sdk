/**
 * Dev Watcher
 *
 * Watches for schema changes in development mode and regenerates types.
 */

import { generateTypes, resolveGeneratorOptions } from './type-generator';
import type { VibePluginOptions } from './types';

let watcherInterval: NodeJS.Timeout | null = null;
let lastSchemaHash: string | null = null;

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
  syncTypes(options);

  // Start polling for changes
  watcherInterval = setInterval(() => {
    syncTypes(options, true);
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
}

/**
 * Sync types (with optional change detection)
 */
async function syncTypes(options: VibePluginOptions, checkForChanges = false): Promise<void> {
  const debug = options.debug ?? false;

  try {
    const generatorOptions = resolveGeneratorOptions(options);

    // If checking for changes, first fetch schema hash
    if (checkForChanges) {
      const currentHash = await fetchSchemaHash(generatorOptions);
      if (currentHash === lastSchemaHash) {
        if (debug) {
          console.log('[vibe-plugin] No schema changes detected');
        }
        return;
      }
      lastSchemaHash = currentHash;

      if (debug) {
        console.log('[vibe-plugin] Schema changes detected, regenerating types...');
      }
    }

    const result = await generateTypes(generatorOptions);

    if (result.success) {
      if (debug || !checkForChanges) {
        console.log(
          `[vibe-plugin] Types generated for ${result.collections.length} collections`
        );
      }

      // Touch a file to trigger TypeScript server reload
      touchTsConfig();
    } else {
      console.error('[vibe-plugin] Type generation failed:', result.error);
    }
  } catch (error) {
    if (debug) {
      console.error('[vibe-plugin] Sync failed:', error);
    }
  }
}

/**
 * Fetch a hash of the current schema state for change detection
 */
async function fetchSchemaHash(options: {
  idpUrl: string;
  clientId: string;
  signingKey: string;
  apiUrl?: string;
  clientSecret?: string;
}): Promise<string> {
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
      return String(Date.now());
    }

    if (response.ok) {
      const body = await response.json() as { hash?: string; data?: { hash?: string } };
      const data = (body as any)?.data ?? body;
      return data?.hash || String(Date.now());
    }
  } catch {
    // Fallback to timestamp-based hash if endpoint doesn't exist
  }

  // Use timestamp as fallback (will always trigger regeneration)
  return String(Date.now());
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
