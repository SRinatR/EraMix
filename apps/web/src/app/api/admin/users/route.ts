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

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const searchParam = url.searchParams.get('search');
  const container = getContainer();
  const { items, total, limit, offset } = await container.users.listAll({
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    ...(offsetParam !== null ? { offset: Number(offsetParam) } : {}),
    ...(searchParam !== null ? { search: searchParam } : {}),
  });

  return NextResponse.json({
    items: items.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      platformRole: user.platformRole,
      status: user.status,
      version: user.version,
    })),
    total,
    limit,
    offset,
  });
});
