/**
 * Vibe Client
 *
 * Main client factory and implementation.
 */

import type { VibeClient, VibeClientConfig, Collection } from './types';
import { CollectionImpl } from './collection';
import { AdminClientImpl } from './admin';
import { createTokenCache, DEFAULT_TOKEN_CACHE_MS } from './token-cache';

// Internal resolved config type with all fields required
export interface ResolvedVibeConfig {
  apiUrl: string;
  idpUrl: string;
  clientId: string;
  signingKey: string;
  defaultCollection: string;
  getAccessToken: () => Promise<string | null>;
  /** Drop the memoised token (called on a 401) so the next call re-reads the getter. */
  invalidateAccessToken?: () => void;
  debug: boolean;
  timeout: number;
  /** True if using IDP proxy mode (idpUrl is set) */
  useProxy: boolean;
}

let proxyHintShown = false;

/** Test hook: forget that the proxy-mode hint was shown. */
export function resetProxyHintForTests(): void {
  proxyHintShown = false;
}

/**
 * PAY-2317 (0.3.1): ONE informational line per process when the client runs in IDP proxy mode, outside production (or with `debug`).
 * It does not judge distance (the SDK cannot know where the app or the IdP run, and it makes no network call to find out); it states
 * the cost so a slow app has somewhere to look. Direct mode is not recommended blindly: some Vibe routes (Enterprise) need the proxy.
 */
function announceProxyMode(idpUrl: string, debug: boolean): void {
  if (proxyHintShown) return;
  const prod = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  if (prod && !debug) return;
  proxyHintShown = true;
  console.info(
    `[vibe] proxy mode: every call goes client -> ${idpUrl}/api/vibe/proxy -> Vibe API (two hops). ` +
      'If calls are slow and the IdP is far from this app, ask whether your routes can use direct mode (VIBE_API_URL without IDP_URL); ' +
      'Enterprise routes require the proxy.'
  );
}

/**
 * Resolve configuration with defaults and environment variables
 */
export function resolveConfig(config?: VibeClientConfig): ResolvedVibeConfig {
  const getEnv = (key: string): string | undefined => {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
    return undefined;
  };

  // IDP Proxy config
  const idpUrl = (
    config?.idpUrl ||
    getEnv('IDP_URL') ||
    getEnv('NEXT_PUBLIC_IDP_URL') ||
    ''
  ).replace(/\/$/, '');

  const clientId = config?.clientId || getEnv('VIBE_CLIENT_ID') || '';
  const signingKey = config?.signingKey || getEnv('VIBE_HMAC_KEY') || '';
  const defaultCollection = config?.defaultCollection || getEnv('VIBE_COLLECTION') || 'vibe_app';

  // Direct Vibe URL (fallback when not using proxy)
  const apiUrl = (
    config?.apiUrl ||
    getEnv('VIBE_API_URL') ||
    getEnv('NEXT_PUBLIC_VIBE_API_URL') ||
    ''
  ).replace(/\/$/, '');

  // Determine mode: proxy if idpUrl is set, otherwise direct
  const useProxy = !!idpUrl;

  if (!useProxy && !apiUrl) {
    console.warn(
      '[vibe] No API URL configured. Set IDP_URL for proxy mode or VIBE_API_URL for direct mode.'
    );
  }

  if (useProxy && !clientId) {
    console.warn('[vibe] IDP proxy mode requires VIBE_CLIENT_ID to be set.');
  }

  if (config?.debug) {
    console.log('[vibe] Config resolved:', {
      useProxy,
      idpUrl: idpUrl ? 'set' : 'empty',
      clientId: clientId ? 'set' : 'empty',
      signingKey: signingKey ? 'set' : 'empty',
      apiUrl: apiUrl ? 'set' : 'empty',
    });
  }

  const tokenCache = createTokenCache(config?.getAccessToken || (async () => null), {
    cacheMs: config?.tokenCacheMs ?? DEFAULT_TOKEN_CACHE_MS,
  });

  if (useProxy) announceProxyMode(idpUrl, config?.debug ?? false);

  return {
    apiUrl,
    idpUrl,
    clientId,
    signingKey,
    defaultCollection,
    getAccessToken: tokenCache.get,
    invalidateAccessToken: tokenCache.invalidate,
    debug: config?.debug ?? false,
    timeout: config?.timeout ?? 30000,
    useProxy,
  };
}

/**
 * Internal client implementation
 */
class VibeClientImpl implements VibeClient {
  private readonly config: ResolvedVibeConfig;
  private readonly collections: Map<string, Collection<unknown>> = new Map();

  readonly admin: AdminClientImpl;

  constructor(config: ResolvedVibeConfig) {
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
