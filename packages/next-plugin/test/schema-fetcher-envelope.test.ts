import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchCollections, fetchCollectionTypes } from '../src/schema-fetcher';

/**
 * PAY-2129: schema-fetcher reads `.data` off a Core envelope
 * `{ success, data, ... }` (docs/api-response-standard.md). These rows run the
 * typed envelope path for both a wrapped and an already-unwrapped body, so the
 * unwrap behaviour that the typing replaced is pinned. The compile-time half is
 * `npm run typecheck` (tsc --noEmit), which tsup does not do.
 */
const options = {
  idpUrl: 'https://idp.test',
  clientId: 'c',
  signingKey: 'k',
  debug: false,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body)));
}

describe('schema-fetcher envelope unwrap (PAY-2129)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetchCollections unwraps { success, data: [...] }', async () => {
    stubFetch({ success: true, data: [{ name: 'products' }, 'orders'] });
    expect(await fetchCollections(options)).toEqual(['products', 'orders']);
  });

  it('fetchCollections unwraps { success, data: { collections } }', async () => {
    stubFetch({ success: true, data: { collections: [{ name: 'a' }] } });
    expect(await fetchCollections(options)).toEqual(['a']);
  });

  it('fetchCollections accepts an already-unwrapped array', async () => {
    stubFetch([{ name: 'x' }]);
    expect(await fetchCollections(options)).toEqual(['x']);
  });

  it('fetchCollectionTypes unwraps { success, data: { typescript } }', async () => {
    stubFetch({ success: true, data: { typescript: 'export interface P {}' } });
    expect(await fetchCollectionTypes('products', options)).toBe('export interface P {}');
  });

  it('fetchCollectionTypes accepts a bare string payload', async () => {
    stubFetch({ success: true, data: 'export interface Q {}' });
    expect(await fetchCollectionTypes('q', options)).toBe('export interface Q {}');
  });

  it('fetchCollectionTypes falls back to the JSON schema and unwraps { success, data: schema }', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('not found', { status: 404 }))
        .mockResolvedValueOnce(
          jsonResponse({
            success: true,
            data: { fields: [{ name: 'sku', type: 'string' }, { name: 'qty', type: 'integer', nullable: true }] },
          })
        )
    );
    const out = await fetchCollectionTypes('products', options);
    expect(out).toContain('export interface Products {');
    expect(out).toContain('sku: string;');
    expect(out).toContain('qty?: number;');
  });

  it('fetchCollectionTypes fallback accepts an already-unwrapped schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('not found', { status: 404 }))
        .mockResolvedValueOnce(jsonResponse({ fields: [{ name: 'id', type: 'integer' }] }))
    );
    expect(await fetchCollectionTypes('items', options)).toContain('id: number;');
  });
});
