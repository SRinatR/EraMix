import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { requireActor } from '@/server/session';
import { AuthRequiredError } from '@eramix/domain';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('auth.session', async (request) => {
  const actor = await requireActor(request);
  const container = getContainer();
  const user = await container.users.findById(actor.userId);
  if (!user) {
    throw new AuthRequiredError('The session user no longer exists.');
  }
  return NextResponse.json({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    platformRole: user.platformRole,
    companyIds: actor.companyIds,
  });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
