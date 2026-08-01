import { describe, expect, it } from 'vitest';
import { generateOrderNumber, isValidOrderNumber, ORDER_NUMBER_PREFIX } from './order-number.js';

describe('orderNumber', () => {
  it('generates a prefixed, opaque order number', () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber.startsWith(ORDER_NUMBER_PREFIX)).toBe(true);
    expect(isValidOrderNumber(orderNumber)).toBe(true);
  });

  it('generates distinct order numbers across repeated calls', () => {
    const values = new Set(Array.from({ length: 50 }, () => generateOrderNumber()));
    expect(values.size).toBe(50);
  });

  it('rejects a value missing the prefix or with a malformed code', () => {
    expect(isValidOrderNumber('7F3K9QXTZM')).toBe(false);
    expect(isValidOrderNumber(`${ORDER_NUMBER_PREFIX}short`)).toBe(false);
  });
});
