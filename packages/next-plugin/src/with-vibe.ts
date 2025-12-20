/**
 * withVibe Next.js Config Wrapper
 *
 * Wraps your Next.js configuration to enable Vibe type generation.
 *
 * @example
 * ```javascript
 * // next.config.js
 * const withVibe = require('@vibe/next-plugin');
 *
 * module.exports = withVibe({
 *   // Your Next.js config here
 * });
 * ```
 */

import type { NextConfig } from 'next';
import { generateTypes, resolveGeneratorOptions } from './type-generator';
import { startDevWatcher } from './dev-watcher';
import type { VibePluginOptions } from './types';

/**
 * Create a Next.js configuration wrapper that enables Vibe type generation
 *
 * @param vibeOptions - Vibe plugin options
 * @returns Next.js config wrapper function
 */
export function createWithVibe(vibeOptions: VibePluginOptions = {}) {
  return function withVibe(nextConfig: NextConfig = {}): NextConfig {
    const isDev = process.env.NODE_ENV === 'development';
    const debug = vibeOptions.debug ?? false;

    if (debug) {
      console.log('[vibe-plugin] Initializing withVibe wrapper');
      console.log('[vibe-plugin] Environment:', isDev ? 'development' : 'production');
    }

    // Generate types at build time
    const originalWebpack = nextConfig.webpack;

    return {
      ...nextConfig,

      webpack(config, options) {
        // Only run type generation once (on server build)
        if (options.isServer) {
          if (debug) {
            console.log('[vibe-plugin] Running type generation (server webpack)');
          }

          // Run type generation asynchronously
          runTypeGeneration(vibeOptions, isDev);
        }

        // Call original webpack config if exists
        if (typeof originalWebpack === 'function') {
          return originalWebpack(config, options);
        }

        return config;
      },
    };
  };
}

/**
 * Run type generation (and optionally start dev watcher)
 */
async function runTypeGeneration(options: VibePluginOptions, isDev: boolean): Promise<void> {
  try {
    const generatorOptions = resolveGeneratorOptions(options);

    // Always generate types on startup
    const result = await generateTypes(generatorOptions);

    if (result.success) {
      console.log(
        `[vibe-plugin] Generated types for ${result.collections.length} collections`
      );
    } else {
      console.warn('[vibe-plugin] Type generation failed:', result.error);
    }

    // Start dev watcher in development mode
    if (isDev && options.devSync !== false) {
      startDevWatcher(options);
    }
  } catch (error) {
    console.error('[vibe-plugin] Error during type generation:', error);
  }
}

/**
 * Default withVibe wrapper with no additional options
 *
 * @example
 * ```javascript
 * const withVibe = require('@vibe/next-plugin');
 * module.exports = withVibe({ reactStrictMode: true });
 * ```
 */
export const withVibe = createWithVibe();
