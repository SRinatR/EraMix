import { describe, expect, it } from 'vitest';
import { generateUuidV7, isValidUuidV7 } from './uuidv7.js';

describe('generateUuidV7', () => {
  it('generates a syntactically valid UUID', () => {
    const id = generateUuidV7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sets the version nibble to 7', () => {
    const id = generateUuidV7();
    expect(id.charAt(14)).toBe('7');
  });

  it('sets the variant bits to the RFC 4122 8/9/a/b range', () => {
    const id = generateUuidV7();
    expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
  });

  it('generates distinct ids across repeated calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateUuidV7()));
    expect(ids.size).toBe(200);
  });

  it('embeds a non-decreasing timestamp prefix across calls over time', () => {
    const first = generateUuidV7();
    const second = generateUuidV7();
    const timestampOf = (id: string) => id.replaceAll('-', '').slice(0, 12);
    expect(timestampOf(second) >= timestampOf(first)).toBe(true);
  });
});

describe('isValidUuidV7', () => {
  it('accepts a value this module generated', () => {
    expect(isValidUuidV7(generateUuidV7())).toBe(true);
  });

  it('rejects a UUIDv4 (correct shape, wrong version)', () => {
    expect(isValidUuidV7('3f8e1c2a-4b5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(false);
  });

  it('rejects a malformed / non-UUID string', () => {
    expect(isValidUuidV7('not-a-uuid')).toBe(false);
    expect(isValidUuidV7('')).toBe(false);
    expect(isValidUuidV7('018f4b1a-0000-7000-8000')).toBe(false);
  });

  it('rejects a value with invalid variant bits', () => {
    expect(isValidUuidV7('018f4b1a-0000-7000-c000-000000000000')).toBe(false);
  });
});
