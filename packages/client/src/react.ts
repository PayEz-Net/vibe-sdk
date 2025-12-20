/**
 * @vibe/client/react
 *
 * React hooks for Vibe data operations.
 * Uses TanStack Query for caching, deduplication, and state management.
 *
 * @example
 * ```typescript
 * 'use client';
 *
 * import { useVibeCollection, useVibeDocument } from '@vibe/client/react';
 *
 * function ProductList() {
 *   const { data, isLoading, error } = useVibeCollection('products', {
 *     limit: 10,
 *     orderBy: 'created_at',
 *     orderDir: 'desc',
 *   });
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <ul>
 *       {data?.map(p => <li key={p.id}>{p.name}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { createVibeClient } from './client';
import { VibeError } from './error';
import type {
  ListOptions,
  Pagination,
  VibeClientConfig,
  Role,
  CreateRole,
  UpdateRole,
  User,
  TenantConfig,
} from './types';

// =============================================================================
// Context & Configuration
// =============================================================================

let clientConfig: VibeClientConfig | undefined;

/**
 * Configure the Vibe client for React hooks
 *
 * Call this once at app initialization (e.g., in a provider or layout).
 *
 * @param config - Client configuration
 *
 * @example
 * ```typescript
 * // app/providers.tsx
 * 'use client';
 *
 * import { configureVibeClient } from '@vibe/client/react';
 * import { useSession } from 'next-auth/react';
 *
 * export function Providers({ children }) {
 *   const { data: session } = useSession();
 *
 *   configureVibeClient({
 *     getAccessToken: async () => session?.accessToken,
 *   });
 *
 *   return <>{children}</>;
 * }
 * ```
 */
export function configureVibeClient(config: VibeClientConfig): void {
  clientConfig = config;
}

/**
 * Get the configured Vibe client for hooks
 */
function getClient() {
  return createVibeClient(clientConfig);
}

// =============================================================================
// Query Key Factories
// =============================================================================

export const vibeKeys = {
  all: ['vibe'] as const,
  collections: () => [...vibeKeys.all, 'collection'] as const,
  collection: (name: string) => [...vibeKeys.collections(), name] as const,
  list: (name: string, options?: ListOptions) =>
    [...vibeKeys.collection(name), 'list', options] as const,
  detail: (name: string, id: string | number) =>
    [...vibeKeys.collection(name), 'detail', id] as const,
  admin: () => [...vibeKeys.all, 'admin'] as const,
  roles: () => [...vibeKeys.admin(), 'roles'] as const,
  role: (id: number) => [...vibeKeys.roles(), id] as const,
  users: () => [...vibeKeys.admin(), 'users'] as const,
  user: (id: string) => [...vibeKeys.users(), id] as const,
  userRoles: (id: string) => [...vibeKeys.user(id), 'roles'] as const,
  tenant: () => [...vibeKeys.admin(), 'tenant'] as const,
};

// =============================================================================
// Collection Hooks
// =============================================================================

export interface UseVibeCollectionOptions extends ListOptions {
  /** Enable or disable the query */
  enabled?: boolean;
}

export interface UseVibeCollectionResult<T> {
  data: T[] | undefined;
  pagination: Pagination | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: VibeError | null;
  refetch: () => void;
}

/**
 * Hook to fetch a paginated list of documents from a collection
 *
 * @param collection - Collection name
 * @param options - List options (limit, offset, orderBy, filter) and query options
 * @returns Query result with data array and pagination info
 *
 * @example
 * ```typescript
 * const { data, pagination, isLoading } = useVibeCollection('products', {
 *   limit: 10,
 *   offset: 0,
 *   orderBy: 'created_at',
 *   orderDir: 'desc',
 * });
 * ```
 */
export function useVibeCollection<T = unknown>(
  collection: string,
  options: UseVibeCollectionOptions = {}
): UseVibeCollectionResult<T> {
  const { enabled = true, ...listOptions } = options;
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.list(collection, listOptions),
    queryFn: async () => {
      const result = await client.collection<T>(collection).list(listOptions);
      return result;
    },
    enabled,
  });

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

export interface UseVibeDocumentOptions {
  /** Enable or disable the query */
  enabled?: boolean;
}

export interface UseVibeDocumentResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: VibeError | null;
  refetch: () => void;
}

/**
 * Hook to fetch a single document by ID
 *
 * @param collection - Collection name
 * @param id - Document ID (pass null to disable query)
 * @param options - Query options
 * @returns Query result with document data
 *
 * @example
 * ```typescript
 * const { data: product, isLoading } = useVibeDocument('products', productId);
 * ```
 */
export function useVibeDocument<T = unknown>(
  collection: string,
  id: string | number | null,
  options: UseVibeDocumentOptions = {}
): UseVibeDocumentResult<T> {
  const { enabled = true } = options;
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.detail(collection, id ?? ''),
    queryFn: async () => {
      if (id === null) return null;
      return client.collection<T>(collection).get(id);
    },
    enabled: enabled && id !== null,
  });

  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

export interface UseVibeCreateResult<T> {
  mutate: (data: Partial<T>) => void;
  mutateAsync: (data: Partial<T>) => Promise<T>;
  isLoading: boolean;
  isError: boolean;
  error: VibeError | null;
  data: T | undefined;
  reset: () => void;
}

/**
 * Hook to create a new document in a collection
 *
 * @param collection - Collection name
 * @returns Mutation result with mutate function
 *
 * @example
 * ```typescript
 * const { mutate, isLoading } = useVibeCreate('products');
 *
 * const handleCreate = () => {
 *   mutate({ name: 'New Product', price: 9.99 });
 * };
 * ```
 */
export function useVibeCreate<T = unknown>(collection: string): UseVibeCreateResult<T> {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: Partial<T>) => {
      return client.collection<T>(collection).create(data);
    },
    onSuccess: () => {
      // Invalidate list queries for this collection
      queryClient.invalidateQueries({ queryKey: vibeKeys.collection(collection) });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

export interface UseVibeUpdateResult<T> {
  mutate: (args: { id: string | number; data: Partial<T> }) => void;
  mutateAsync: (args: { id: string | number; data: Partial<T> }) => Promise<T>;
  isLoading: boolean;
  isError: boolean;
  error: VibeError | null;
  data: T | undefined;
  reset: () => void;
}

/**
 * Hook to update an existing document
 *
 * @param collection - Collection name
 * @returns Mutation result with mutate function
 *
 * @example
 * ```typescript
 * const { mutate, isLoading } = useVibeUpdate('products');
 *
 * const handleUpdate = () => {
 *   mutate({ id: 123, data: { price: 12.99 } });
 * };
 * ```
 */
export function useVibeUpdate<T = unknown>(collection: string): UseVibeUpdateResult<T> {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id, data }: { id: string | number; data: Partial<T> }) => {
      return client.collection<T>(collection).update(id, data);
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: vibeKeys.collection(collection) });
      queryClient.invalidateQueries({ queryKey: vibeKeys.detail(collection, variables.id) });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

export interface UseVibeDeleteResult {
  mutate: (id: string | number) => void;
  mutateAsync: (id: string | number) => Promise<void>;
  isLoading: boolean;
  isError: boolean;
  error: VibeError | null;
  reset: () => void;
}

/**
 * Hook to delete a document
 *
 * @param collection - Collection name
 * @returns Mutation result with mutate function
 *
 * @example
 * ```typescript
 * const { mutate, isLoading } = useVibeDelete('products');
 *
 * const handleDelete = () => {
 *   mutate(123);
 * };
 * ```
 */
export function useVibeDelete(collection: string): UseVibeDeleteResult {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: string | number) => {
      await client.collection(collection).delete(id);
    },
    onSuccess: (_, id) => {
      // Invalidate list queries and remove detail from cache
      queryClient.invalidateQueries({ queryKey: vibeKeys.collection(collection) });
      queryClient.removeQueries({ queryKey: vibeKeys.detail(collection, id) });
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    reset: mutation.reset,
  };
}

// =============================================================================
// Admin Hooks
// =============================================================================

/**
 * Hook to fetch roles list
 */
export function useVibeRoles(options: ListOptions = {}): UseVibeCollectionResult<Role> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.roles(),
    queryFn: async () => client.admin.roles.list(options),
  });

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

/**
 * Hook to fetch a single role
 */
export function useVibeRole(id: number): UseVibeDocumentResult<Role> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.role(id),
    queryFn: async () => client.admin.roles.get(id),
  });

  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

/**
 * Hook to create a role
 */
export function useVibeCreateRole(): UseVibeCreateResult<Role> {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: CreateRole) => client.admin.roles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vibeKeys.roles() });
    },
  });

  return {
    mutate: mutation.mutate as (data: Partial<Role>) => void,
    mutateAsync: mutation.mutateAsync as (data: Partial<Role>) => Promise<Role>,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Hook to update a role
 */
export function useVibeUpdateRole(): UseVibeUpdateResult<Role> {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateRole }) =>
      client.admin.roles.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: vibeKeys.roles() });
      queryClient.invalidateQueries({ queryKey: vibeKeys.role(variables.id) });
    },
  });

  return {
    mutate: mutation.mutate as (args: { id: string | number; data: Partial<Role> }) => void,
    mutateAsync: mutation.mutateAsync as (args: {
      id: string | number;
      data: Partial<Role>;
    }) => Promise<Role>,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    data: mutation.data,
    reset: mutation.reset,
  };
}

/**
 * Hook to delete a role
 */
export function useVibeDeleteRole(): UseVibeDeleteResult {
  const client = getClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: number) => client.admin.roles.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vibeKeys.roles() });
    },
  });

  return {
    mutate: mutation.mutate as (id: string | number) => void,
    mutateAsync: mutation.mutateAsync as (id: string | number) => Promise<void>,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error ? VibeError.fromError(mutation.error) : null,
    reset: mutation.reset,
  };
}

/**
 * Hook to fetch users list
 */
export function useVibeUsers(options: ListOptions = {}): UseVibeCollectionResult<User> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.users(),
    queryFn: async () => client.admin.users.list(options),
  });

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

/**
 * Hook to fetch a single user
 */
export function useVibeUser(id: string): UseVibeDocumentResult<User> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.user(id),
    queryFn: async () => client.admin.users.get(id),
  });

  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

/**
 * Hook to fetch a user's roles
 */
export function useVibeUserRoles(userId: string): UseVibeCollectionResult<Role> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.userRoles(userId),
    queryFn: async () => {
      const roles = await client.admin.users.getRoles(userId);
      return {
        data: roles,
        pagination: { total: roles.length, limit: roles.length, offset: 0, hasMore: false },
      };
    },
  });

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

/**
 * Hook to fetch tenant configuration
 */
export function useVibeTenantConfig(): UseVibeDocumentResult<TenantConfig> {
  const client = getClient();

  const query = useQuery({
    queryKey: vibeKeys.tenant(),
    queryFn: async () => client.admin.tenant.getConfig(),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error ? VibeError.fromError(query.error) : null,
    refetch: () => query.refetch(),
  };
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { VibeError } from './error';
export type {
  ListOptions,
  Pagination,
  Role,
  CreateRole,
  UpdateRole,
  User,
  TenantConfig,
} from './types';
