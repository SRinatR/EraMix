import { getContainer } from '@/server/container';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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
  } catch (error) {
    return problemResponse(error);
  }
}
