import { describe, it, expect } from 'vitest';
import { convertFiltersToVibeFormat } from '../src/http';

/**
 * PAY-2125: the filter value this SDK sends to the query endpoint must bind
 * Core's `QueryRequest.Filter` (a `VibeFilterNode`). Core accepts the FLAT
 * condition and the COMPOUND group (VibeQueryBuilder.cs:156-190) but NOT a
 * bare array - an array is a 400. These rows pin the emitted shapes.
 */
describe('convertFiltersToVibeFormat - Core query filter shape (PAY-2125)', () => {
  it('one filter -> the exact flat object', () => {
    expect(convertFiltersToVibeFormat({ user_id: 'abc123' })).toEqual({
      field: 'user_id',
      operator: 'eq',
      value: 'abc123',
    });
  });

  it('two filters -> the exact compound group (operator: and)', () => {
    expect(convertFiltersToVibeFormat({ user_id: 'abc123', status: 'active' })).toEqual({
      operator: 'and',
      filters: [
        { field: 'user_id', operator: 'eq', value: 'abc123' },
        { field: 'status', operator: 'eq', value: 'active' },
      ],
    });
  });

  it('honours an explicit { operator, value } leaf', () => {
    expect(convertFiltersToVibeFormat({ score: { operator: 'gt', value: 5 } })).toEqual({
      field: 'score',
      operator: 'gt',
      value: 5,
    });
  });

  it('zero filters -> undefined, so the caller omits the key', () => {
    expect(convertFiltersToVibeFormat({})).toBeUndefined();
    expect(convertFiltersToVibeFormat({ a: null, b: undefined })).toBeUndefined();
  });

  it('field names are passed through BARE - no data. prefix is added', () => {
    const out = convertFiltersToVibeFormat({ user_id: 'x' });
    expect(out).toEqual({ field: 'user_id', operator: 'eq', value: 'x' });
    expect((out as { field: string }).field.startsWith('data.')).toBe(false);
  });

  it('never emits an array (an array does not bind - 400)', () => {
    expect(Array.isArray(convertFiltersToVibeFormat({ a: 1 }))).toBe(false);
    expect(Array.isArray(convertFiltersToVibeFormat({ a: 1, b: 2 }))).toBe(false);
  });
});
