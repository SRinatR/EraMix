import type { Membership } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import { activeCompanyIds } from './session';

function makeMembership(companyId: string, status: Membership['status']): Membership {
  return {
    id: `membership-${companyId}`,
    userId: 'user-1',
    companyId,
    role: 'MEMBER',
    status,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('activeCompanyIds', () => {
  it('includes an ACTIVE membership', () => {
    expect(activeCompanyIds([makeMembership('company-a', 'ACTIVE')])).toEqual(['company-a']);
  });

  it('excludes a REVOKED membership (the revoked-membership scenario)', () => {
    expect(activeCompanyIds([makeMembership('company-a', 'REVOKED')])).toEqual([]);
  });

  it('excludes an INVITED (not yet accepted) membership', () => {
    expect(activeCompanyIds([makeMembership('company-a', 'INVITED')])).toEqual([]);
  });

  it('returns only the ACTIVE subset for a multi-company user', () => {
    const memberships = [
      makeMembership('company-a', 'ACTIVE'),
      makeMembership('company-b', 'REVOKED'),
      makeMembership('company-c', 'ACTIVE'),
    ];
    expect(activeCompanyIds(memberships)).toEqual(['company-a', 'company-c']);
  });

  it('returns an empty array for a user with no memberships', () => {
    expect(activeCompanyIds([])).toEqual([]);
  });
});
