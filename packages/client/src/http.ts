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

/**
 * Convert simple filter object to Vibe query filter format
 *
 * Input:  { user_id: 'abc123', status: 'active' }
 * Output: [
 *   { field: 'user_id', operator: 'eq', value: 'abc123' },
 *   { field: 'status', operator: 'eq', value: 'active' }
 * ]
 */
export function convertFiltersToVibeFormat(
  filter: Record<string, unknown>
): Array<{ field: string; operator: string; value: unknown }> {
  const filters: Array<{ field: string; operator: string; value: unknown }> = [];

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
        filters.push({
          field: key,
          operator: typedValue.operator,
          value: typedValue.value,
        });
      } else {
        // Simple equality filter
        filters.push({
          field: key,
          operator: 'eq',
          value,
        });
      }
    }
  }

  return filters;
}
