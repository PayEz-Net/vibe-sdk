/**
 * HTTP Layer
 *
 * Shared request handling for direct and IDP proxy modes.
 * Includes HMAC signing for proxy authentication.
 */

import type { ResolvedVibeConfig } from './client';
import { VibeError } from './error';

/**
 * Generate HMAC-SHA256 signature for proxy authentication
 */
async function generateHmacSignature(
  signingKey: string,
  timestamp: number,
  method: string,
  endpoint: string
): Promise<string> {
  const stringToSign = `${timestamp}|${method}|${endpoint}`;

  // Use Web Crypto API (works in both Node.js 18+ and browsers)
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const keyData = Uint8Array.from(atob(signingKey), (c) => c.charCodeAt(0));
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(stringToSign)
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  // Fallback for Node.js without Web Crypto
  try {
    const crypto = await import('crypto');
    const signature = crypto
      .createHmac('sha256', Buffer.from(signingKey, 'base64'))
      .update(stringToSign)
      .digest('base64');
    return signature;
  } catch {
    throw new VibeError({
      code: 'SERVER_ERROR',
      message: 'HMAC signing not available - missing crypto support',
    });
  }
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip authorization header (for public endpoints) */
  skipAuth?: boolean;
}

/**
 * Make an HTTP request using the configured mode (direct or proxy)
 */
export async function httpRequest(
  config: ResolvedVibeConfig,
  endpoint: string,
  options: HttpRequestOptions
): Promise<Response> {
  const { method, body, skipAuth } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth token if available and not skipped
  if (!skipAuth) {
    const token = await config.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    let response: Response;

    if (config.useProxy) {
      // IDP Proxy mode - all requests go through proxy endpoint
      response = await makeProxyRequest(config, endpoint, method, body, headers, controller.signal);
    } else {
      // Direct mode - hit Vibe API directly
      response = await makeDirectRequest(config, endpoint, method, body, headers, controller.signal);
    }

    if (config.debug) {
      console.log(`[vibe] ${method} ${endpoint} -> ${response.status}`);
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
 * Make a direct request to Vibe API
 */
async function makeDirectRequest(
  config: ResolvedVibeConfig,
  endpoint: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const url = `${config.apiUrl}${endpoint}`;

  if (config.debug) {
    console.log(`[vibe:direct] ${method} ${url}`);
  }

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
}

/**
 * Make a request through IDP proxy
 */
async function makeProxyRequest(
  config: ResolvedVibeConfig,
  endpoint: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const proxyUrl = `${config.idpUrl}/api/vibe/proxy`;
  const timestamp = Math.floor(Date.now() / 1000);

  // Add proxy-specific headers
  headers['X-Vibe-Client-Id'] = config.clientId;

  // Add HMAC signature if signing key is configured
  if (config.signingKey) {
    const signature = await generateHmacSignature(config.signingKey, timestamp, method, endpoint);
    headers['X-Vibe-Timestamp'] = String(timestamp);
    headers['X-Vibe-Signature'] = signature;
  }

  // Proxy body format: { endpoint, method, data }
  const proxyBody = {
    endpoint,
    method,
    data: body ?? null,
  };

  if (config.debug) {
    console.log(`[vibe:proxy] POST ${proxyUrl}`, { endpoint, method, hasBody: !!body });
  }

  return fetch(proxyUrl, {
    method: 'POST', // Proxy always uses POST
    headers,
    body: JSON.stringify(proxyBody),
    signal,
  });
}

/**
 * Parse JSON response with error handling
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  try {
    const text = await response.text();
    if (!text) {
      return {} as T;
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

/** A single leaf condition, Core's FLAT filter shape. */
export interface VibeFilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * The filter value the query endpoint binds: one flat condition, or Core's
 * COMPOUND group wrapping several flat conditions. `undefined` means "no
 * condition survived" - the caller must OMIT the `filter` key rather than send
 * an empty one.
 */
export type VibeFilter =
  | VibeFilterCondition
  | { operator: 'and' | 'or'; filters: VibeFilterCondition[] };

/**
 * Convert a simple filter object to Core's query filter format (PAY-2125).
 *
 * Core binds THREE filter shapes (VibeQueryBuilder.cs:156-190): the FLAT
 * condition `{ field, operator, value }` (IsFlatFilterFormat), the COMPOUND
 * group `{ operator: 'and'|'or', filters: [ <flat>, ... ] }`
 * (IsCompoundFilterFormat), and the STANDARD `{ <field>: { <op>: value } }`.
 * An ARRAY of flat conditions does NOT bind - System.Text.Json rejects it as a
 * VibeFilterNode (400). This function therefore emits a SINGLE flat object for
 * one condition, and the COMPOUND shape for several; it never emits an array.
 *
 * Field names are passed through BARE. Core maps a bare unknown name to the
 * JSONB `data->>'name'` (GetSqlFieldExpression), exactly as it maps
 * `data.name`, while a document column (document_id, client_id, ...) must stay
 * bare - so a `data.` prefix is both redundant for data fields and wrong for
 * document columns.
 *
 * Input:  { user_id: 'abc123' }
 * Output: { field: 'user_id', operator: 'eq', value: 'abc123' }
 *
 * Input:  { user_id: 'abc123', status: 'active' }
 * Output: { operator: 'and', filters: [
 *   { field: 'user_id', operator: 'eq', value: 'abc123' },
 *   { field: 'status', operator: 'eq', value: 'active' },
 * ] }
 *
 * Input:  {} (or every value undefined/null)
 * Output: undefined  (caller omits `filter`)
 */
export function convertFiltersToVibeFormat(filter: Record<string, unknown>): VibeFilter | undefined {
  const conditions: VibeFilterCondition[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null) {
      // Check if value is already in Vibe format { operator, value }
      if (
        typeof value === 'object' &&
        value !== null &&
        'operator' in value &&
        'value' in value
      ) {
        const typedValue = value as { operator: string; value: unknown };
        conditions.push({
          field: key,
          operator: typedValue.operator,
          value: typedValue.value,
        });
      } else {
        // Simple equality filter
        conditions.push({
          field: key,
          operator: 'eq',
          value,
        });
      }
    }
  }

  // No condition survived: return undefined so the caller OMITS the key. An
  // empty compound would be an unfiltered query wearing a filter's clothes.
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return { operator: 'and', filters: conditions };
}
