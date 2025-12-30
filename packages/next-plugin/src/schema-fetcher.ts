/**
 * Schema Fetcher
 *
 * Fetches collection schemas from the Vibe API via IDP Proxy for type generation.
 * Uses HMAC-SHA256 signing for authentication.
 */

import { createHmac } from 'crypto';
import type { CollectionSchema, VibePluginOptions } from './types';

interface FetchOptions {
  idpUrl: string;
  clientId: string;
  signingKey: string;
  debug: boolean;
  // Legacy direct API (deprecated)
  apiUrl?: string;
  clientSecret?: string;
}

/**
 * Generate HMAC-SHA256 signature for request authentication
 */
function generateHmacSignature(
  signingKey: string,
  timestamp: number,
  method: string,
  endpoint: string
): string {
  const stringToSign = `${timestamp}|${method}|${endpoint}`;
  const signature = createHmac('sha256', Buffer.from(signingKey, 'base64'))
    .update(stringToSign)
    .digest('base64');
  return signature;
}

/**
 * Make a request through the IDP Vibe Proxy
 */
async function proxyRequest(
  endpoint: string,
  method: 'GET' | 'POST',
  options: FetchOptions
): Promise<Response> {
  const { idpUrl, clientId, signingKey, debug } = options;

  const proxyUrl = `${idpUrl}/api/vibe/proxy`;
  const timestamp = Math.floor(Date.now() / 1000);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Vibe-Client-Id': clientId,
  };

  // Add HMAC signature if signing key is configured
  if (signingKey) {
    const signature = generateHmacSignature(signingKey, timestamp, method, endpoint);
    headers['X-Vibe-Timestamp'] = String(timestamp);
    headers['X-Vibe-Signature'] = signature;
  }

  const body = {
    endpoint,
    method,
    data: null,
  };

  if (debug) {
    console.log(`[vibe-plugin] Proxy request: ${method} ${endpoint}`);
  }

  return fetch(proxyUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Legacy: Make a direct request to Vibe API (deprecated, use proxy instead)
 */
async function directRequest(
  url: string,
  options: FetchOptions
): Promise<Response> {
  const { clientId, clientSecret, debug } = options;

  if (debug) {
    console.log(`[vibe-plugin] Direct request (deprecated): GET ${url}`);
  }

  return fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Vibe-Client-Id': clientId,
      'X-Vibe-Client-Secret': clientSecret || '',
    },
  });
}

/**
 * Fetch all available collections from the Vibe API
 */
export async function fetchCollections(options: FetchOptions): Promise<string[]> {
  const { idpUrl, apiUrl, debug } = options;

  const endpoint = '/v1/collections';

  try {
    let response: Response;

    // Use IDP proxy if configured, otherwise fall back to direct API
    if (idpUrl) {
      response = await proxyRequest(endpoint, 'GET', options);
    } else if (apiUrl) {
      if (debug) {
        console.warn('[vibe-plugin] Using deprecated direct API. Configure idpUrl for IDP proxy.');
      }
      response = await directRequest(`${apiUrl}${endpoint}`, options);
    } else {
      throw new Error('No API configuration. Set IDP_URL or VIBE_API_URL.');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch collections: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();

    // Handle various response formats (proxy wraps response)
    const data = body?.data ?? body;

    if (Array.isArray(data)) {
      return data.map((c: any) => c.name || c);
    }

    if (data?.collections) {
      return data.collections.map((c: any) => c.name || c);
    }

    if (debug) {
      console.log(`[vibe-plugin] Unexpected collections response format:`, body);
    }

    return [];
  } catch (error) {
    if (debug) {
      console.error(`[vibe-plugin] Error fetching collections:`, error);
    }
    throw error;
  }
}

/**
 * Fetch TypeScript type definitions for a collection
 *
 * Calls the /v1/schemas/{collection}/typescript endpoint which returns
 * pre-generated .d.ts content from the Vibe API.
 */
export async function fetchCollectionTypes(
  collection: string,
  options: FetchOptions
): Promise<string> {
  const { idpUrl, apiUrl, debug } = options;

  const endpoint = `/v1/schemas/${collection}/typescript`;

  try {
    let response: Response;

    // Use IDP proxy if configured, otherwise fall back to direct API
    if (idpUrl) {
      response = await proxyRequest(endpoint, 'GET', options);
    } else if (apiUrl) {
      if (debug) {
        console.warn('[vibe-plugin] Using deprecated direct API. Configure idpUrl for IDP proxy.');
      }
      response = await directRequest(`${apiUrl}${endpoint}`, options);
    } else {
      throw new Error('No API configuration. Set IDP_URL or VIBE_API_URL.');
    }

    if (!response.ok) {
      // If typescript endpoint doesn't exist, try to get JSON schema and convert
      if (response.status === 404) {
        return await fetchAndConvertSchema(collection, options);
      }
      throw new Error(
        `Failed to fetch types for ${collection}: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // If response is plain text (.d.ts content), return directly
    if (contentType.includes('text/plain') || contentType.includes('text/typescript')) {
      return response.text();
    }

    // If JSON, extract the typescript content (proxy wraps response)
    const body = await response.json();
    const data = body?.data ?? body;

    if (typeof data === 'string') {
      return data;
    }

    if (data?.typescript) {
      return data.typescript;
    }

    throw new Error(`Unexpected response format for ${collection} types`);
  } catch (error) {
    if (debug) {
      console.error(`[vibe-plugin] Error fetching types for ${collection}:`, error);
    }
    throw error;
  }
}

/**
 * Fallback: Fetch JSON schema and convert to TypeScript
 */
async function fetchAndConvertSchema(
  collection: string,
  options: FetchOptions
): Promise<string> {
  const { idpUrl, apiUrl, debug } = options;

  const endpoint = `/v1/schemas/${collection}`;

  if (debug) {
    console.log(`[vibe-plugin] Falling back to JSON schema for ${collection}`);
  }

  let response: Response;

  if (idpUrl) {
    response = await proxyRequest(endpoint, 'GET', options);
  } else if (apiUrl) {
    response = await directRequest(`${apiUrl}${endpoint}`, options);
  } else {
    throw new Error('No API configuration. Set IDP_URL or VIBE_API_URL.');
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch schema for ${collection}: ${response.status} ${response.statusText}`
    );
  }

  const body = await response.json();
  const schema = body?.data ?? body;

  return schemaToTypeScript(collection, schema);
}

/**
 * Convert a JSON schema to TypeScript interface
 */
function schemaToTypeScript(collection: string, schema: any): string {
  const interfaceName = pascalCase(collection);
  const fields = schema.fields || schema.properties || [];

  let output = `/**
 * Auto-generated types for collection: ${collection}
 * Generated by @vibe/next-plugin
 */

`;

  // Generate main interface
  output += `export interface ${interfaceName} {\n`;

  if (Array.isArray(fields)) {
    for (const field of fields) {
      const tsType = jsonTypeToTs(field.type);
      const optional = field.nullable ? '?' : '';
      const description = field.description ? `  /** ${field.description} */\n` : '';
      output += `${description}  ${field.name}${optional}: ${tsType};\n`;
    }
  } else if (typeof fields === 'object') {
    // Handle JSON Schema format
    for (const [name, def] of Object.entries(fields)) {
      const fieldDef = def as any;
      const tsType = jsonTypeToTs(fieldDef.type);
      const optional = !schema.required?.includes(name) ? '?' : '';
      const description = fieldDef.description ? `  /** ${fieldDef.description} */\n` : '';
      output += `${description}  ${name}${optional}: ${tsType};\n`;
    }
  }

  output += `}\n\n`;

  // Generate Create type (omit auto-generated fields)
  const autoFields = findAutoFields(fields);
  if (autoFields.length > 0) {
    output += `export type ${interfaceName}Create = Omit<${interfaceName}, ${autoFields.map((f) => `'${f}'`).join(' | ')}>;\n\n`;
  } else {
    output += `export type ${interfaceName}Create = ${interfaceName};\n\n`;
  }

  // Generate Update type
  output += `export type ${interfaceName}Update = Partial<${interfaceName}Create>;\n`;

  return output;
}

/**
 * Convert JSON schema type to TypeScript type
 */
function jsonTypeToTs(type: string | string[]): string {
  if (Array.isArray(type)) {
    return type.map(jsonTypeToTs).join(' | ');
  }

  switch (type?.toLowerCase()) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Record<string, unknown>';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

/**
 * Find auto-generated fields that should be omitted from Create type
 */
function findAutoFields(fields: any): string[] {
  const autoFields: string[] = [];

  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (
        field['x-vibe-pk'] ||
        field['x-vibe-auto-increment'] ||
        field.name === 'created_at' ||
        field.name === 'updated_at' ||
        field.name === 'id'
      ) {
        autoFields.push(field.name);
      }
    }
  }

  return autoFields;
}

/**
 * Convert string to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
