/**
 * @vibe/next-plugin
 *
 * Next.js plugin for Vibe type generation.
 *
 * @example
 * ```javascript
 * // next.config.js
 * const withVibe = require('@vibe/next-plugin');
 *
 * module.exports = withVibe({
 *   // Your Next.js config
 *   reactStrictMode: true,
 * });
 * ```
 *
 * @example
 * ```javascript
 * // With custom options
 * const { createWithVibe } = require('@vibe/next-plugin');
 *
 * const withVibe = createWithVibe({
 *   apiUrl: 'https://vibe.example.com',
 *   collections: ['products', 'users'],
 *   debug: true,
 * });
 *
 * module.exports = withVibe({
 *   reactStrictMode: true,
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main exports
export { withVibe, createWithVibe } from './with-vibe';

// Type generation
export { generateTypes, resolveGeneratorOptions } from './type-generator';

// Dev watcher
export { startDevWatcher, stopDevWatcher } from './dev-watcher';

// Types
export type {
  VibePluginOptions,
  TypeGenerationResult,
  CollectionSchema,
  SchemaField,
} from './types';

// Default export for CommonJS compatibility
import { withVibe } from './with-vibe';
export default withVibe;
