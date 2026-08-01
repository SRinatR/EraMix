import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse } from 'next/server';

export const GET = withApiHandler('admin.users.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'users.manage');

  const container = getContainer();
  const users = await container.users.listAll();

  return NextResponse.json({
    items: users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      platformRole: user.platformRole,
      status: user.status,
      version: user.version,
    })),
  });
});
