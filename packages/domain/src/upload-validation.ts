import { ValidationFailedError } from './errors.js';

export interface AllowedFileType {
  readonly mimeType: string;
  readonly extensions: readonly string[];
  /** One or more possible magic-byte signatures at the start of the file; any match is accepted. */
  readonly signatures: readonly (readonly number[])[];
  /**
   * Single source of truth for "is this an image or a document" (used by
   * product-asset uploads to categorize a file without trusting a
   * client-supplied type field) — kept next to the MIME/extension/signature
   * triple it is derived from rather than re-derived elsewhere.
   */
  readonly assetCategory: 'IMAGE' | 'DOCUMENT';
}

/**
 * Allowlisted MIME/extension/signature triples for catalog/content media
 * uploads (CLAUDE.md: "Upload validation: allowlisted MIME/extensions,
 * size/signature checks"). Deliberately small and image/document-only;
 * extending it is a product decision, not something to infer.
 */
export const ALLOWED_UPLOAD_TYPES: readonly AllowedFileType[] = [
  {
    mimeType: 'image/jpeg',
    extensions: ['jpg', 'jpeg'],
    signatures: [[0xff, 0xd8, 0xff]],
    assetCategory: 'IMAGE',
  },
  {
    mimeType: 'image/png',
    extensions: ['png'],
    signatures: [[0x89, 0x50, 0x4e, 0x47]],
    assetCategory: 'IMAGE',
  },
  // WEBP: RIFF container ("RIFF....WEBP"); the WEBP marker sits at byte
  // offset 8, so this signature is checked against headerBytes[8..11] by
  // validateUpload's isWebp special case below, not the generic prefix match.
  {
    mimeType: 'image/webp',
    extensions: ['webp'],
    signatures: [[0x52, 0x49, 0x46, 0x46]],
    assetCategory: 'IMAGE',
  },
  {
    mimeType: 'application/pdf',
    extensions: ['pdf'],
    signatures: [[0x25, 0x50, 0x44, 0x46]],
    assetCategory: 'DOCUMENT',
  },
];

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export interface UploadCandidate {
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** At least the first 16 bytes of the file, for the magic-byte signature check. */
  readonly headerBytes: Uint8Array;
}

function matchesSignature(headerBytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => headerBytes[index] === byte);
}

const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8 of a RIFF container.

/**
 * Validates size, MIME allowlist, extension/MIME agreement, and a
 * magic-byte signature check (so a renamed `.exe` claiming
 * `image/png` is rejected even if the extension and declared Content-Type
 * both lie). Returns the matched allowlist entry; throws
 * ValidationFailedError on any failure.
 */
export function validateUpload(candidate: UploadCandidate): AllowedFileType {
  if (candidate.sizeBytes <= 0 || candidate.sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new ValidationFailedError(
      `File size ${candidate.sizeBytes} bytes is outside the allowed range (1..${MAX_UPLOAD_SIZE_BYTES}).`,
      { sizeBytes: candidate.sizeBytes },
    );
  }

  const allowed = ALLOWED_UPLOAD_TYPES.find((type) => type.mimeType === candidate.contentType);
  if (!allowed) {
    throw new ValidationFailedError(
      `Content type "${candidate.contentType}" is not in the upload allowlist.`,
      { contentType: candidate.contentType },
    );
  }

  const extension = candidate.filename.split('.').pop()?.toLowerCase();
  if (!extension || !allowed.extensions.includes(extension)) {
    throw new ValidationFailedError(
      `File extension does not match content type "${candidate.contentType}".`,
      { filename: candidate.filename, contentType: candidate.contentType },
    );
  }

  const signatureOk =
    allowed.mimeType === 'image/webp'
      ? matchesSignature(candidate.headerBytes, allowed.signatures[0]!) &&
        matchesSignature(candidate.headerBytes.slice(8), WEBP_MARKER)
      : allowed.signatures.some((signature) => matchesSignature(candidate.headerBytes, signature));

  if (!signatureOk) {
    throw new ValidationFailedError(
      'File content does not match its declared type (signature mismatch).',
      { contentType: candidate.contentType },
    );
  }

  return allowed;
}
