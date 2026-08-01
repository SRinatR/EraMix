import { ValidationFailedError } from './errors.js';

/** OrderLine.quantity must be a positive integer (CHECK constraint mirrored here). */
export function parseQuantity(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationFailedError(`Quantity must be a positive integer, got ${value}.`, {
      value,
    });
  }
  return value;
}
