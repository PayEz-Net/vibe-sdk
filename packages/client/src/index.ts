/**
 * @vibe/client
 *
 * Vibe data client SDK - Zero-config data access with full type safety.
 *
 * @example
 * ```typescript
 * import { createVibeClient } from '@vibe/client';
 *
 * const vibe = createVibeClient();
 *
 * // List documents
 * const { data, pagination } = await vibe.collection('products').list();
 *
 * // Get single document
 * const product = await vibe.collection('products').get(123);
 *
 * // Create document
 * const newProduct = await vibe.collection('products').create({
 *   name: 'Widget',
 *   price: 9.99,
 * });
 *
 * // Update document
 * const updated = await vibe.collection('products').update(123, {
 *   price: 12.99,
 * });
 *
 * // Delete document
 * await vibe.collection('products').delete(123);
 *
 * // Admin operations
 * const roles = await vibe.admin.roles.list();
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { createVibeClient, getVibeClient, resolveConfig } from './client';
export type { ResolvedVibeConfig } from './client';

// HTTP utilities (for advanced use cases)
export { convertFiltersToVibeFormat } from './http';

// Error handling
export { VibeError } from './error';

// Types
export type {
  VibeClient,
  VibeClientConfig,
  VibeAdminClient,
  Collection,
  ListOptions,
  ListResult,
  Pagination,
  Role,
  CreateRole,
  UpdateRole,
  User,
  TenantConfig,
  VibeErrorCode,
  VibeErrorDetails,
} from './types';
