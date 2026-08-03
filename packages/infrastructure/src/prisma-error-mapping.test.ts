import { describe, expect, it } from 'vitest';
import { conflictTargetIncludes } from './prisma-error-mapping.js';

describe('conflictTargetIncludes', () => {
  it('matches when meta.target is an array containing the column', () => {
    expect(conflictTargetIncludes({ target: ['publicId'] }, 'publicId')).toBe(true);
  });

  it('matches when meta.target is a constraint-name string containing the column', () => {
    expect(conflictTargetIncludes({ target: 'products_publicId_key' }, 'publicId')).toBe(true);
  });

  it('does not match a different column', () => {
    expect(conflictTargetIncludes({ target: ['sku'] }, 'publicId')).toBe(false);
    expect(conflictTargetIncludes({ target: 'products_sku_key' }, 'publicId')).toBe(false);
  });

  it('returns false for undefined/missing meta or target', () => {
    expect(conflictTargetIncludes(undefined, 'publicId')).toBe(false);
    expect(conflictTargetIncludes({}, 'publicId')).toBe(false);
  });

  // Regression case: reproduces the exact meta shape a real CI run against
  // Prisma 7 + @prisma/adapter-pg produced for a P2002 on Postgres — no
  // top-level `target` at all, the underlying error nested instead. The
  // first implementation of this helper only checked `meta.target` and
  // silently fell through to SlugConflictError for every real publicId
  // collision until this was found and fixed.
  it('matches the real @prisma/adapter-pg driver-adapter error shape (meta.driverAdapterError.cause.constraint.fields)', () => {
    const realMeta = {
      driverAdapterError: {
        message: 'UniqueConstraintViolation',
        name: 'DriverAdapterError',
        cause: {
          kind: 'UniqueConstraintViolation',
          originalCode: '23505',
          originalMessage: 'duplicate key value violates unique constraint "products_publicId_key"',
          constraint: { fields: ['"publicId"'] },
        },
      },
      modelName: 'Product',
    };
    expect(conflictTargetIncludes(realMeta, 'publicId')).toBe(true);
    expect(conflictTargetIncludes(realMeta, 'sku')).toBe(false);
  });

  it('matches via the raw Postgres originalMessage when constraint.fields is absent', () => {
    const meta = {
      driverAdapterError: {
        cause: {
          originalMessage: 'duplicate key value violates unique constraint "products_sku_key"',
        },
      },
    };
    expect(conflictTargetIncludes(meta, 'sku')).toBe(true);
    expect(conflictTargetIncludes(meta, 'publicId')).toBe(false);
  });
});
