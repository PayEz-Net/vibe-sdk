/**
 * Vibe Client Types
 *
 * Core type definitions for the Vibe SDK.
 */

// =============================================================================
// Configuration
// =============================================================================

export interface VibeClientConfig {
  /** Vibe API URL. Default: process.env.VIBE_API_URL */
  apiUrl?: string;

  /** Function to get access token for authenticated requests */
  getAccessToken?: () => Promise<string | null>;

  /** Enable debug logging */
  debug?: boolean;

  /** Default request timeout in milliseconds. Default: 30000 */
  timeout?: number;
}

// =============================================================================
// List Operations
// =============================================================================

export interface ListOptions {
  /** Number of items per page. Default: 20 */
  limit?: number;

  /** Offset for pagination. Default: 0 */
  offset?: number;

  /** Field to order by */
  orderBy?: string;

  /** Order direction */
  orderDir?: 'asc' | 'desc';

  /** Field filters */
  filter?: Record<string, unknown>;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListResult<T> {
  data: T[];
  pagination: Pagination;
}

// =============================================================================
// Collection Interface
// =============================================================================

export interface Collection<T> {
  /** List documents with optional pagination and filtering */
  list(options?: ListOptions): Promise<ListResult<T>>;

  /** Get a single document by ID */
  get(id: string | number): Promise<T | null>;

  /** Create a new document */
  create(data: Partial<T>): Promise<T>;

  /** Update an existing document */
  update(id: string | number, data: Partial<T>): Promise<T>;

  /** Delete a document */
  delete(id: string | number): Promise<void>;
}

// =============================================================================
// Client Interface
// =============================================================================

export interface VibeClient {
  /** Get a typed collection accessor */
  collection<T = unknown>(name: string): Collection<T>;

  /** Admin namespace for administrative operations */
  admin: VibeAdminClient;
}

// =============================================================================
// Admin Client Interface
// =============================================================================

export interface VibeAdminClient {
  /** Role management */
  roles: {
    list(options?: ListOptions): Promise<ListResult<Role>>;
    get(id: number): Promise<Role | null>;
    create(data: CreateRole): Promise<Role>;
    update(id: number, data: UpdateRole): Promise<Role>;
    delete(id: number): Promise<void>;
  };

  /** User management */
  users: {
    list(options?: ListOptions): Promise<ListResult<User>>;
    get(id: string): Promise<User | null>;
    getRoles(id: string): Promise<Role[]>;
  };

  /** Tenant configuration */
  tenant: {
    getConfig(): Promise<TenantConfig>;
  };
}

// =============================================================================
// Admin Types
// =============================================================================

export interface Role {
  id: number;
  name: string;
  description?: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRole {
  name: string;
  description?: string;
  source?: string;
}

export interface UpdateRole {
  name?: string;
  description?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
  last_login?: string;
}

export interface TenantConfig {
  client_id: string;
  site_name: string;
  branding?: {
    logo_url?: string;
    primary_color?: string;
  };
}

// =============================================================================
// Error Types
// =============================================================================

export type VibeErrorCode =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface VibeErrorDetails {
  code: VibeErrorCode;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}
