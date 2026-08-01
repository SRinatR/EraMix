import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_SIZE_BYTES, validateUpload } from './upload-validation.js';
import { ValidationFailedError } from './errors.js';

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP_HEADER = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0,
]);

describe('validateUpload', () => {
  it('accepts a genuine PNG', () => {
    const result = validateUpload({
      filename: 'photo.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      headerBytes: PNG_HEADER,
    });
    expect(result.mimeType).toBe('image/png');
  });

  it('accepts a genuine JPEG', () => {
    expect(
      validateUpload({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        headerBytes: JPEG_HEADER,
      }).mimeType,
    ).toBe('image/jpeg');
  });

  it('accepts a genuine PDF', () => {
    expect(
      validateUpload({
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        headerBytes: PDF_HEADER,
      }).mimeType,
    ).toBe('application/pdf');
  });

  it('accepts a genuine WEBP (RIFF header + WEBP marker at offset 8)', () => {
    expect(
      validateUpload({
        filename: 'photo.webp',
        contentType: 'image/webp',
        sizeBytes: 1024,
        headerBytes: WEBP_HEADER,
      }).mimeType,
    ).toBe('image/webp');
  });

  it('rejects a content type outside the allowlist', () => {
    expect(() =>
      validateUpload({
        filename: 'script.exe',
        contentType: 'application/x-msdownload',
        sizeBytes: 1024,
        headerBytes: new Uint8Array(16),
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a mismatched extension for an otherwise-allowed content type', () => {
    expect(() =>
      validateUpload({
        filename: 'photo.pdf',
        contentType: 'image/png',
        sizeBytes: 1024,
        headerBytes: PNG_HEADER,
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects an executable renamed to .png with a spoofed Content-Type (signature mismatch)', () => {
    const exeHeader = new Uint8Array([0x4d, 0x5a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // "MZ" DOS header
    expect(() =>
      validateUpload({
        filename: 'totally-a-photo.png',
        contentType: 'image/png',
        sizeBytes: 1024,
        headerBytes: exeHeader,
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a zero-byte file', () => {
    expect(() =>
      validateUpload({
        filename: 'empty.png',
        contentType: 'image/png',
        sizeBytes: 0,
        headerBytes: PNG_HEADER,
      }),
    ).toThrow(ValidationFailedError);
  });

  it('rejects a file exceeding the maximum size', () => {
    expect(() =>
      validateUpload({
        filename: 'huge.png',
        contentType: 'image/png',
        sizeBytes: MAX_UPLOAD_SIZE_BYTES + 1,
        headerBytes: PNG_HEADER,
      }),
    ).toThrow(ValidationFailedError);
  });
});
