/**
 * Collection Class
 *
 * Provides typed CRUD operations for a Vibe collection.
 */

import type { Collection, ListOptions, ListResult, VibeClientConfig } from './types';
import { VibeError } from './error';

export class CollectionImpl<T> implements Collection<T> {
  private readonly name: string;
  private readonly apiUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly debug: boolean;
  private readonly timeout: number;

  constructor(name: string, config: Required<VibeClientConfig>) {
    this.name = name;
    this.apiUrl = config.apiUrl;
    this.getAccessToken = config.getAccessToken;
    this.debug = config.debug;
    this.timeout = config.timeout;
  }

  /**
   * List documents with optional pagination and filtering
   */
  async list(options: ListOptions = {}): Promise<ListResult<T>> {
    const { limit = 20, offset = 0, orderBy, orderDir, filter } = options;

    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    if (orderBy) {
      params.set('orderBy', orderBy);
      params.set('orderDir', orderDir || 'asc');
    }

    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          params.set(`filter[${key}]`, String(value));
        }
      }
    }

    const url = `${this.apiUrl}/v1/${this.name}?${params.toString()}`;
    const response = await this.fetch(url, { method: 'GET' });
    const body = await this.parseResponse<{ data: T[]; meta?: { total?: number } }>(response);

    // Handle various response formats
    const data = Array.isArray(body) ? body : (body.data || []);
    const total = body.meta?.total ?? data.length;

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
      },
    };
  }

  /**
   * Get a single document by ID
   */
  async get(id: string | number): Promise<T | null> {
    const url = `${this.apiUrl}/v1/${this.name}/${id}`;

    try {
      const response = await this.fetch(url, { method: 'GET' });
      const body = await this.parseResponse<{ data?: T } | T>(response);

      // Handle envelope format
      if (body && typeof body === 'object' && 'data' in body) {
        return body.data ?? null;
      }

      return body as T;
    } catch (error) {
      if (error instanceof VibeError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new document
   */
  async create(data: Partial<T>): Promise<T> {
    const url = `${this.apiUrl}/v1/${this.name}`;
    const response = await this.fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    const body = await this.parseResponse<{ data?: T } | T>(response);

    // Handle envelope format
    if (body && typeof body === 'object' && 'data' in body) {
      return body.data as T;
    }

    return body as T;
  }

  /**
   * Update an existing document
   */
  async update(id: string | number, data: Partial<T>): Promise<T> {
    const url = `${this.apiUrl}/v1/${this.name}/${id}`;
    const response = await this.fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });

    const body = await this.parseResponse<{ data?: T } | T>(response);

    // Handle envelope format
    if (body && typeof body === 'object' && 'data' in body) {
      return body.data as T;
    }

    return body as T;
  }

  /**
   * Delete a document
   */
  async delete(id: string | number): Promise<void> {
    const url = `${this.apiUrl}/v1/${this.name}/${id}`;
    await this.fetch(url, { method: 'DELETE' });
  }

  /**
   * Internal fetch wrapper with auth and error handling
   */
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if available
    const token = await this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      if (this.debug) {
        console.log(`[vibe] ${options.method} ${url}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (this.debug) {
        console.log(`[vibe] ${response.status} ${response.statusText}`);
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
   * Parse JSON response with error handling
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
