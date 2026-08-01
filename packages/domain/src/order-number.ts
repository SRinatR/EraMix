import { generateOpaqueId, isOpaqueId } from './opaque-id.js';

const CODE_LENGTH = 10;
export const ORDER_NUMBER_PREFIX = 'ORD-';

/**
 * Public, immutable order reference used in
 * /{locale}/account/orders/{orderNumber} and customer communication
 * (never the internal UUID `id` — CLAUDE.md).
 */
export function generateOrderNumber(): string {
  return `${ORDER_NUMBER_PREFIX}${generateOpaqueId(CODE_LENGTH)}`;
}

export function isValidOrderNumber(value: string): boolean {
  return (
    value.startsWith(ORDER_NUMBER_PREFIX) &&
    isOpaqueId(value.slice(ORDER_NUMBER_PREFIX.length), CODE_LENGTH)
  );
}
