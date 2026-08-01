import { generateOpaqueId, isOpaqueId } from './opaque-id.js';

/** Matches the TZ Appendix F example format, e.g. "P8K4F2M9". */
export const PUBLIC_ID_LENGTH = 8;

export function generatePublicId(): string {
  return generateOpaqueId(PUBLIC_ID_LENGTH);
}

export function isValidPublicId(value: string): boolean {
  return isOpaqueId(value, PUBLIC_ID_LENGTH);
}
