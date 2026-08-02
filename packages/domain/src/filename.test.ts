import { describe, expect, it } from 'vitest';
import { ValidationFailedError } from './errors.js';
import { sanitizeDisplayName, sanitizeFilenameForStorage } from './filename.js';

const BACKSLASH = String.fromCharCode(92);

describe('sanitizeFilenameForStorage', () => {
  it('leaves an already-safe filename unchanged', () => {
    expect(sanitizeFilenameForStorage('datasheet-v2.pdf')).toBe('datasheet-v2.pdf');
  });

  it('neutralizes path separators from a Unix-style traversal attempt', () => {
    const result = sanitizeFilenameForStorage('../../etc/passwd.png');
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it('neutralizes path separators from a Windows-style traversal attempt', () => {
    const input = ['..', '..', 'Windows', 'System32', 'evil.exe'].join(BACKSLASH);
    const result = sanitizeFilenameForStorage(input);
    expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(result.includes(BACKSLASH)).toBe(false);
  });

  it('strips spaces and other unsafe characters', () => {
    expect(sanitizeFilenameForStorage('my photo (final)!.png')).toBe('my_photo__final__.png');
  });
});

describe('sanitizeDisplayName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeDisplayName('  Front panel diagram  ')).toBe('Front panel diagram');
  });

  it('strips control characters but keeps normal punctuation', () => {
    const input = `Front${String.fromCharCode(0)}panel${String.fromCharCode(7)} diagram`;
    expect(sanitizeDisplayName(input)).toBe('Frontpanel diagram');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(() => sanitizeDisplayName('')).toThrow(ValidationFailedError);
    expect(() => sanitizeDisplayName('   ')).toThrow(ValidationFailedError);
  });

  it('caps length at 255 characters', () => {
    const longName = 'x'.repeat(300);
    expect(sanitizeDisplayName(longName)).toHaveLength(255);
  });
});
