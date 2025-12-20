/**
 * Admin Client
 *
 * Provides administrative operations for roles, users, and tenant configuration.
 */

import type {
  VibeAdminClient,
  VibeClientConfig,
  ListOptions,
  ListResult,
  Role,
  CreateRole,
  UpdateRole,
  User,
  TenantConfig,
} from './types';
import { VibeError } from './error';

export class AdminClientImpl implements VibeAdminClient {
  private readonly apiUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly debug: boolean;
  private readonly timeout: number;

  constructor(config: Required<VibeClientConfig>) {
    this.apiUrl = config.apiUrl;
    this.getAccessToken = config.getAccessToken;
    this.debug = config.debug;
    this.timeout = config.timeout;
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

      const response = await this.fetch(`${this.apiUrl}/v1/admin/roles?${params}`, {
        method: 'GET',
      });

      const body = await this.parseResponse<{ data: Role[]; meta?: { total?: number } }>(response);
      const data = body.data || [];
      const total = body.meta?.total ?? data.length;

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + data.length < total },
      };
    },

    get: async (id: number): Promise<Role | null> => {
      try {
        const response = await this.fetch(`${this.apiUrl}/v1/admin/roles/${id}`, {
          method: 'GET',
        });
        const body = await this.parseResponse<{ data: Role }>(response);
        return body.data;
      } catch (error) {
        if (error instanceof VibeError && error.code === 'NOT_FOUND') {
          return null;
        }
        throw error;
      }
    },

    create: async (data: CreateRole): Promise<Role> => {
      const response = await this.fetch(`${this.apiUrl}/v1/admin/roles`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const body = await this.parseResponse<{ data: Role }>(response);
      return body.data;
    },

    update: async (id: number, data: UpdateRole): Promise<Role> => {
      const response = await this.fetch(`${this.apiUrl}/v1/admin/roles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      const body = await this.parseResponse<{ data: Role }>(response);
      return body.data;
    },

    delete: async (id: number): Promise<void> => {
      await this.fetch(`${this.apiUrl}/v1/admin/roles/${id}`, {
        method: 'DELETE',
      });
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

      const response = await this.fetch(`${this.apiUrl}/v1/admin/users?${params}`, {
        method: 'GET',
      });

      const body = await this.parseResponse<{ data: User[]; meta?: { total?: number } }>(response);
      const data = body.data || [];
      const total = body.meta?.total ?? data.length;

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + data.length < total },
      };
    },

    get: async (id: string): Promise<User | null> => {
      try {
        const response = await this.fetch(`${this.apiUrl}/v1/admin/users/${id}`, {
          method: 'GET',
        });
        const body = await this.parseResponse<{ data: User }>(response);
        return body.data;
      } catch (error) {
        if (error instanceof VibeError && error.code === 'NOT_FOUND') {
          return null;
        }
        throw error;
      }
    },

    getRoles: async (id: string): Promise<Role[]> => {
      const response = await this.fetch(`${this.apiUrl}/v1/admin/users/${id}/roles`, {
        method: 'GET',
      });
      const body = await this.parseResponse<{ data: Role[] }>(response);
      return body.data || [];
    },
  };

  /**
   * Tenant configuration operations
   */
  tenant = {
    getConfig: async (): Promise<TenantConfig> => {
      const response = await this.fetch(`${this.apiUrl}/v1/admin/tenant`, {
        method: 'GET',
      });
      const body = await this.parseResponse<{ data: TenantConfig }>(response);
      return body.data;
    },
  };

  /**
   * Internal fetch wrapper with auth and error handling
   */
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = await this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      if (this.debug) {
        console.log(`[vibe:admin] ${options.method} ${url}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (this.debug) {
        console.log(`[vibe:admin] ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw await VibeError.fromResponse(response);
      }

      return response;
    } catch (error) {
      throw VibeError.fromError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse JSON response
   */
  private async parseResponse<R>(response: Response): Promise<R> {
    try {
      const text = await response.text();
      if (!text) {
        return {} as R;
      }
      return JSON.parse(text);
    } catch {
      throw new VibeError({
        code: 'SERVER_ERROR',
        message: 'Invalid JSON response from server',
        status: response.status,
      });
    }
  }
}
