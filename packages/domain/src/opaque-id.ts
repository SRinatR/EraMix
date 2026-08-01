// packages/domain declares no @types/node / DOM lib dependency (ADR-0001:
// platform-agnostic, not just framework-free) — this ambient declaration
// types the Web Crypto global that every target runtime (Node 24+, browsers,
// edge) already provides, without pulling in either type package.
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

// Crockford base32 alphabet: excludes 0/O, 1/I/L, and U to avoid visual
// ambiguity and accidental profanity in human-facing codes.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomAlphabetString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) {
    result += ALPHABET[byte % ALPHABET.length];
  }
  return result;
}

/**
 * Generates a cryptographically random, opaque, uppercase alphanumeric
 * identifier suitable for a public-facing column (Product.publicId,
 * Order.orderNumber) — never the internal UUID `id` (CLAUDE.md).
 */
export function generateOpaqueId(length: number): string {
  return randomAlphabetString(length);
}

export function isOpaqueId(value: string, length: number): boolean {
  if (value.length !== length) {
    return false;
  }
  for (const char of value) {
    if (!ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}
