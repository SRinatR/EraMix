// packages/domain declares no @types/node / DOM lib dependency (ADR-0001) —
// this ambient declaration types the Web Crypto global every target runtime
// (Node 24+, browsers, edge) already provides, matching opaque-id.ts's
// existing convention.
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * RFC 9562 UUID version 7: a 48-bit big-endian Unix-epoch-millisecond
 * timestamp followed by the fixed version/variant bits and 74 bits of
 * cryptographically random data.
 *
 * ADR-0021: this generator exists **only** for the client-side (browser)
 * analytics event `eventId` (packages/domain/src/analytics.ts) — a context
 * with no database connection available at generation time. Internal
 * PostgreSQL entity ids never use this function; they source their UUIDv7
 * value from PostgreSQL 19 Beta 2's native `uuidv7()` SQL function
 * (packages/infrastructure/src/id-generator.ts's `PostgresUuidV7IdGenerator`),
 * which ADR-0021 treats as the sole authoritative generator for persisted
 * rows specifically to avoid two independently-implemented, potentially-
 * diverging UUIDv7 layouts for the same identifier class.
 */
export function generateUuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const unixMs = BigInt(Date.now());
  bytes[0] = Number((unixMs >> 40n) & 0xffn);
  bytes[1] = Number((unixMs >> 32n) & 0xffn);
  bytes[2] = Number((unixMs >> 24n) & 0xffn);
  bytes[3] = Number((unixMs >> 16n) & 0xffn);
  bytes[4] = Number((unixMs >> 8n) & 0xffn);
  bytes[5] = Number(unixMs & 0xffn);
  // Version nibble (0111 = 7) in the high nibble of byte 6, random low nibble.
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  // Variant bits (10) in the top two bits of byte 8, random remaining bits.
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const hex = Array.from(bytes, toHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** True only for a syntactically valid UUID with version nibble 7 and RFC 4122 variant bits — a UUIDv4 (or any other version) is rejected. */
export function isValidUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}
