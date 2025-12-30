/**
 * Admin Client
 *
 * Provides administrative operations for roles, users, and tenant configuration.
 * Supports both direct API access and IDP proxy mode.
 */

import type {
  VibeAdminClient,
  ListOptions,
  ListResult,
  Role,
  CreateRole,
  UpdateRole,
  User,
  TenantConfig,
} from './types';
import type { ResolvedVibeConfig } from './client';
import { httpRequest, parseResponse } from './http';
import { VibeError } from './error';

export class AdminClientImpl implements VibeAdminClient {
  private readonly config: ResolvedVibeConfig;

  constructor(config: ResolvedVibeConfig) {
    this.config = config;
  }

  /**
   * Build endpoint path based on mode (direct vs proxy)
   */
  private buildEndpoint(path: string): string {
    if (this.config.useProxy) {
      // Proxy mode: route through IDP admin endpoints
      return `/v1/admin${path}`;
    }
    // Direct mode
    return `/v1/admin${path}`;
  }

  /**
   * Role management operations
   */
  roles = {
    list: async (options: ListOptions = {}): Promise<ListResult<Role>> => {
      const { limit = 50, offset = 0 } = options;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });

      const endpoint = `${this.buildEndpoint('/roles')}?${params}`;
      const response = await httpRequest(this.config, endpoint, { method: 'GET' });
      const body = await parseResponse<{ data: Role[]; meta?: { total?: number } }>(response);

      const data = body.data || [];
      const total = body.meta?.total ?? data.length;

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + data.length < total },
      };
    },

    get: async (id: number): Promise<Role | null> => {
      try {
        const endpoint = this.buildEndpoint(`/roles/${id}`);
        const response = await httpRequest(this.config, endpoint, { method: 'GET' });
        const body = await parseResponse<{ data: Role }>(response);
        return body.data;
      } catch (error) {
        if (error instanceof VibeError && error.code === 'NOT_FOUND') {
          return null;
        }
        throw error;
      }
    },

    create: async (data: CreateRole): Promise<Role> => {
      const endpoint = this.buildEndpoint('/roles');
      const response = await httpRequest(this.config, endpoint, {
        method: 'POST',
        body: data,
      });
      const body = await parseResponse<{ data: Role }>(response);
      return body.data;
    },

    update: async (id: number, data: UpdateRole): Promise<Role> => {
      const endpoint = this.buildEndpoint(`/roles/${id}`);
      const response = await httpRequest(this.config, endpoint, {
        method: 'PATCH',
        body: data,
      });
      const body = await parseResponse<{ data: Role }>(response);
      return body.data;
    },

    delete: async (id: number): Promise<void> => {
      const endpoint = this.buildEndpoint(`/roles/${id}`);
      await httpRequest(this.config, endpoint, { method: 'DELETE' });
    },
  };

  /**
   * User management operations
   */
  users = {
    list: async (options: ListOptions = {}): Promise<ListResult<User>> => {
      const { limit = 50, offset = 0 } = options;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });

      const endpoint = `${this.buildEndpoint('/users')}?${params}`;
      const response = await httpRequest(this.config, endpoint, { method: 'GET' });
      const body = await parseResponse<{ data: User[]; meta?: { total?: number } }>(response);

      const data = body.data || [];
      const total = body.meta?.total ?? data.length;

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + data.length < total },
      };
    },

    get: async (id: string): Promise<User | null> => {
      try {
        const endpoint = this.buildEndpoint(`/users/${id}`);
        const response = await httpRequest(this.config, endpoint, { method: 'GET' });
        const body = await parseResponse<{ data: User }>(response);
        return body.data;
      } catch (error) {
        if (error instanceof VibeError && error.code === 'NOT_FOUND') {
          return null;
        }
        throw error;
      }
    },

    getRoles: async (id: string): Promise<Role[]> => {
      const endpoint = this.buildEndpoint(`/users/${id}/roles`);
      const response = await httpRequest(this.config, endpoint, { method: 'GET' });
      const body = await parseResponse<{ data: Role[] }>(response);
      return body.data || [];
    },
  };

  /**
   * Tenant configuration operations
   */
  tenant = {
    getConfig: async (): Promise<TenantConfig> => {
      const endpoint = this.buildEndpoint('/tenant');
      const response = await httpRequest(this.config, endpoint, { method: 'GET' });
      const body = await parseResponse<{ data: TenantConfig }>(response);
      return body.data;
    },
  };
}
