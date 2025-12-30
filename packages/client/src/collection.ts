/**
 * Collection Class
 *
 * Provides typed CRUD operations for a Vibe collection.
 * Supports both direct API access and IDP proxy mode.
 */

import type { Collection, ListOptions, ListResult } from './types';
import type { ResolvedVibeConfig } from './client';
import { httpRequest, parseResponse, convertFiltersToVibeFormat } from './http';
import { VibeError } from './error';

export class CollectionImpl<T> implements Collection<T> {
  private readonly name: string;
  private readonly config: ResolvedVibeConfig;
  private readonly collectionName: string;

  constructor(name: string, config: ResolvedVibeConfig) {
    this.name = name;
    this.config = config;
    this.collectionName = config.defaultCollection;
  }

  /**
   * List documents with optional pagination and filtering
   */
  async list(options: ListOptions = {}): Promise<ListResult<T>> {
    const { limit = 20, offset = 0, orderBy, orderDir, filter } = options;

    if (this.config.useProxy) {
      // Proxy mode: use POST query endpoint with filter format
      return this.listViaQuery(options);
    }

    // Direct mode: use query string parameters
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

    const endpoint = `/v1/${this.name}?${params.toString()}`;
    const response = await httpRequest(this.config, endpoint, { method: 'GET' });
    const body = await parseResponse<{ data: T[]; meta?: { total?: number } }>(response);

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
   * List via POST query endpoint (for proxy mode)
   */
  private async listViaQuery(options: ListOptions = {}): Promise<ListResult<T>> {
    const { limit = 20, offset = 0, orderBy, orderDir, filter } = options;

    // Build query body in Vibe format
    const queryBody: {
      page: number;
      pageSize: number;
      orderBy?: string;
      orderDir?: 'asc' | 'desc';
      filter?: Array<{ field: string; operator: string; value: unknown }>;
    } = {
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };

    if (orderBy) {
      queryBody.orderBy = orderBy;
      queryBody.orderDir = orderDir || 'asc';
    }

    if (filter && Object.keys(filter).length > 0) {
      queryBody.filter = convertFiltersToVibeFormat(filter);
    }

    const endpoint = `/v1/collections/${this.collectionName}/tables/${this.name}/query`;
    const response = await httpRequest(this.config, endpoint, {
      method: 'POST',
      body: queryBody,
    });

    const body = await parseResponse<{
      data?: T[];
      items?: T[];
      documents?: T[];
      meta?: { total?: number; totalCount?: number };
      totalCount?: number;
    }>(response);

    // Handle various response formats from Vibe
    const data = this.unwrapDocuments(body.data || body.items || body.documents || []);
    const total = body.meta?.total ?? body.meta?.totalCount ?? body.totalCount ?? data.length;

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
    const endpoint = this.config.useProxy
      ? `/v1/collections/${this.collectionName}/tables/${this.name}/${id}`
      : `/v1/${this.name}/${id}`;

    try {
      const response = await httpRequest(this.config, endpoint, { method: 'GET' });
      const body = await parseResponse<{ data?: T } | T>(response);

      // Handle envelope format
      if (body && typeof body === 'object' && 'data' in body) {
        return this.unwrapDocument(body.data) ?? null;
      }

      return this.unwrapDocument(body as T);
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
    const endpoint = this.config.useProxy
      ? `/v1/collections/${this.collectionName}/tables/${this.name}`
      : `/v1/${this.name}`;

    const response = await httpRequest(this.config, endpoint, {
      method: 'POST',
      body: data,
    });

    const body = await parseResponse<{ data?: T } | T>(response);

    // Handle envelope format
    if (body && typeof body === 'object' && 'data' in body) {
      return this.unwrapDocument(body.data) as T;
    }

    return this.unwrapDocument(body as T) as T;
  }

  /**
   * Update an existing document
   */
  async update(id: string | number, data: Partial<T>): Promise<T> {
    const endpoint = this.config.useProxy
      ? `/v1/collections/${this.collectionName}/tables/${this.name}/${id}`
      : `/v1/${this.name}/${id}`;

    const response = await httpRequest(this.config, endpoint, {
      method: 'PATCH',
      body: data,
    });

    const body = await parseResponse<{ data?: T } | T>(response);

    // Handle envelope format
    if (body && typeof body === 'object' && 'data' in body) {
      return this.unwrapDocument(body.data) as T;
    }

    return this.unwrapDocument(body as T) as T;
  }

  /**
   * Delete a document
   */
  async delete(id: string | number): Promise<void> {
    const endpoint = this.config.useProxy
      ? `/v1/collections/${this.collectionName}/tables/${this.name}/${id}`
      : `/v1/${this.name}/${id}`;

    await httpRequest(this.config, endpoint, { method: 'DELETE' });
  }

  /**
   * Unwrap a Vibe document from its envelope format.
   * Vibe returns documents with metadata where data may be a JSON string.
   */
  private unwrapDocument<D>(doc: D | null): D | null {
    if (!doc) return null;

    // Check if it's a Vibe envelope with document_id and data
    if (
      typeof doc === 'object' &&
      doc !== null &&
      'document_id' in doc &&
      'data' in doc
    ) {
      const envelope = doc as { document_id: number; data: string | Record<string, unknown> };
      let parsedData: Record<string, unknown> = {};

      if (typeof envelope.data === 'string') {
        try {
          parsedData = JSON.parse(envelope.data);
        } catch {
          parsedData = {};
        }
      } else if (typeof envelope.data === 'object' && envelope.data !== null) {
        parsedData = envelope.data;
      }

      return {
        id: envelope.document_id,
        ...parsedData,
      } as D;
    }

    return doc;
  }

  /**
   * Unwrap an array of Vibe documents
   */
  private unwrapDocuments(docs: unknown[]): T[] {
    return docs.map((doc) => this.unwrapDocument(doc as T)).filter((d): d is T => d !== null);
  }
}
