import { AccessDeniedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { assertOrderCompanyAccess, hasPermission, requirePermission } from './authorization.js';

describe('hasPermission (TZ §3.1 RBAC matrix)', () => {
  it('grants CUSTOMER only own-scope catalog/content/profile/order permissions', () => {
    expect(hasPermission('CUSTOMER', 'catalog.read')).toBe(true);
    expect(hasPermission('CUSTOMER', 'order.create')).toBe(true);
    expect(hasPermission('CUSTOMER', 'order.read.own')).toBe(true);
    expect(hasPermission('CUSTOMER', 'order.read.all')).toBe(false);
    expect(hasPermission('CUSTOMER', 'catalog.write')).toBe(false);
    expect(hasPermission('CUSTOMER', 'users.manage')).toBe(false);
  });

  it('grants MANAGER order.read.all/order.transition but not catalog.write/users.manage', () => {
    expect(hasPermission('MANAGER', 'order.read.all')).toBe(true);
    expect(hasPermission('MANAGER', 'order.transition')).toBe(true);
    expect(hasPermission('MANAGER', 'audit.read.limited')).toBe(true);
    expect(hasPermission('MANAGER', 'catalog.write')).toBe(false);
    expect(hasPermission('MANAGER', 'users.manage')).toBe(false);
  });

  it('grants CONTENT_EDITOR content.write/content.slug.change but not catalog.write/order permissions', () => {
    expect(hasPermission('CONTENT_EDITOR', 'content.write')).toBe(true);
    expect(hasPermission('CONTENT_EDITOR', 'content.slug.change')).toBe(true);
    expect(hasPermission('CONTENT_EDITOR', 'catalog.write')).toBe(false);
    expect(hasPermission('CONTENT_EDITOR', 'order.create')).toBe(false);
  });

  it('grants ADMIN every permission in the matrix', () => {
    for (const permission of [
      'catalog.read',
      'catalog.write',
      'content.read',
      'content.write',
      'content.slug.change',
      'profile.read',
      'profile.update',
      'order.create',
      'order.read.own',
      'order.read.all',
      'order.transition',
      'users.manage',
      'audit.read.limited',
      'audit.read.full',
      'settings.manage',
    ] as const) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('grants AUDITOR only audit.read.full, per TZ table 7', () => {
    expect(hasPermission('AUDITOR', 'audit.read.full')).toBe(true);
    expect(hasPermission('AUDITOR', 'catalog.read')).toBe(false);
    expect(hasPermission('AUDITOR', 'content.read')).toBe(false);
  });

  it('grants settings.manage to ADMIN only (Product Owner/platform-administrator control plane)', () => {
    expect(hasPermission('ADMIN', 'settings.manage')).toBe(true);
    for (const role of ['CUSTOMER', 'MANAGER', 'CONTENT_EDITOR', 'AUDITOR'] as const) {
      expect(hasPermission(role, 'settings.manage')).toBe(false);
    }
  });
});

describe('requirePermission', () => {
  it('throws AccessDeniedError when the role lacks the permission (IAM-008)', () => {
    expect(() => requirePermission('CUSTOMER', 'catalog.write')).toThrow(AccessDeniedError);
  });

  it('does not throw when the role has the permission', () => {
    expect(() => requirePermission('CUSTOMER', 'catalog.read')).not.toThrow();
  });
});

describe('assertOrderCompanyAccess (ORD-008)', () => {
  it('allows a manager to access an order outside their own company (order.read.all)', () => {
    expect(() => assertOrderCompanyAccess('MANAGER', [], 'company-x')).not.toThrow();
  });

  it('allows a customer to access an order from their own company', () => {
    expect(() => assertOrderCompanyAccess('CUSTOMER', ['company-a'], 'company-a')).not.toThrow();
  });

  it('denies a customer accessing an order from a company they are not a member of', () => {
    expect(() => assertOrderCompanyAccess('CUSTOMER', ['company-a'], 'company-b')).toThrow(
      AccessDeniedError,
    );
  });

  it('denies a content editor entirely (no order.read.own/all permission)', () => {
    expect(() => assertOrderCompanyAccess('CONTENT_EDITOR', ['company-a'], 'company-a')).toThrow(
      AccessDeniedError,
    );
  });
});
