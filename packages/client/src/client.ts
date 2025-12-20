/**
 * Vibe Client
 *
 * Main client factory and implementation.
 */

import type { VibeClient, VibeClientConfig, Collection } from './types';
import { CollectionImpl } from './collection';
import { AdminClientImpl } from './admin';

// Default configuration values
const DEFAULT_CONFIG: Required<VibeClientConfig> = {
  apiUrl: '',
  getAccessToken: async () => null,
  debug: false,
  timeout: 30000,
};

/**
 * Resolve configuration with defaults and environment variables
 */
function resolveConfig(config?: VibeClientConfig): Required<VibeClientConfig> {
  // Get API URL from config or environment
  const apiUrl =
    config?.apiUrl ||
    (typeof process !== 'undefined' ? process.env.VIBE_API_URL : undefined) ||
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_VIBE_API_URL : undefined) ||
    '';

  if (!apiUrl) {
    console.warn(
      '[vibe] No API URL configured. Set VIBE_API_URL environment variable or pass apiUrl to createVibeClient().'
    );
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ''), // Remove trailing slash
    getAccessToken: config?.getAccessToken || DEFAULT_CONFIG.getAccessToken,
    debug: config?.debug ?? DEFAULT_CONFIG.debug,
    timeout: config?.timeout ?? DEFAULT_CONFIG.timeout,
  };
}

/**
 * Internal client implementation
 */
class VibeClientImpl implements VibeClient {
  private readonly config: Required<VibeClientConfig>;
  private readonly collections: Map<string, Collection<unknown>> = new Map();

  readonly admin: AdminClientImpl;

  constructor(config: Required<VibeClientConfig>) {
    this.config = config;
    this.admin = new AdminClientImpl(config);
  }

  /**
   * Get a typed collection accessor
   *
   * @param name - Collection name
   * @returns Collection instance with CRUD methods
   *
   * @example
   * ```typescript
   * const vibe = createVibeClient();
   *
   * // With explicit type
   * const products = vibe.collection<Product>('products');
   *
   * // Type is inferred from @vibe/types when using next-plugin
   * const products = vibe.collection('products');
   * ```
   */
  collection<T = unknown>(name: string): Collection<T> {
    // Return cached collection if exists
    if (this.collections.has(name)) {
      return this.collections.get(name) as Collection<T>;
    }

    // Create new collection accessor
    const collection = new CollectionImpl<T>(name, this.config);
    this.collections.set(name, collection as Collection<unknown>);

    return collection;
  }
}

/**
 * Create a Vibe client instance
 *
 * @param config - Optional configuration overrides
 * @returns Configured Vibe client
 *
 * @example
 * ```typescript
 * // Basic usage - auto-configures from environment
 * const vibe = createVibeClient();
 *
 * // With custom configuration
 * const vibe = createVibeClient({
 *   apiUrl: 'https://vibe.example.com',
 *   getAccessToken: async () => session?.accessToken,
 *   debug: true,
 * });
 *
 * // Server component usage
 * const products = await vibe.collection('products').list();
 *
 * // Admin operations
 * const roles = await vibe.admin.roles.list();
 * ```
 */
export function createVibeClient(config?: VibeClientConfig): VibeClient {
  const resolvedConfig = resolveConfig(config);
  return new VibeClientImpl(resolvedConfig);
}

/**
 * Default client instance for convenience
 *
 * Uses environment variables for configuration.
 * For custom configuration, use createVibeClient() instead.
 */
let defaultClient: VibeClient | null = null;

export function getVibeClient(): VibeClient {
  if (!defaultClient) {
    defaultClient = createVibeClient();
  }
  return defaultClient;
}
