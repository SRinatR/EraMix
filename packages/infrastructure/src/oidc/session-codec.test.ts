import { describe, expect, it } from 'vitest';
import { SessionCodec } from './session-codec.js';

const SECRET = 'a'.repeat(32);

describe('SessionCodec', () => {
  it('round-trips userId/platformRole/companyIds through an encoded token', async () => {
    const codec = new SessionCodec(SECRET);
    const token = await codec.encode({
      userId: 'user-1',
      platformRole: 'MANAGER',
      companyIds: ['company-a', 'company-b'],
    });
    const decoded = await codec.decode(token);
    expect(decoded).toEqual({
      userId: 'user-1',
      platformRole: 'MANAGER',
      companyIds: ['company-a', 'company-b'],
    });
  });

  it('returns undefined for a token signed with a different secret (tampering)', async () => {
    const codec = new SessionCodec(SECRET);
    const otherCodec = new SessionCodec('b'.repeat(32));
    const token = await otherCodec.encode({
      userId: 'user-1',
      platformRole: 'CUSTOMER',
      companyIds: [],
    });
    expect(await codec.decode(token)).toBeUndefined();
  });

  it('returns undefined for an expired token', async () => {
    const codec = new SessionCodec(SECRET, -1);
    const token = await codec.encode({
      userId: 'user-1',
      platformRole: 'CUSTOMER',
      companyIds: [],
    });
    expect(await codec.decode(token)).toBeUndefined();
  });

  it('returns undefined for garbage input', async () => {
    const codec = new SessionCodec(SECRET);
    expect(await codec.decode('not-a-jwt')).toBeUndefined();
  });
});
