import { getContainer } from '@/server/container';
import { problemResponse } from '@/server/problem-response';
import { requireActor } from '@/server/session';
import { AuthRequiredError } from '@eramix/domain';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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
  } catch (error) {
    return problemResponse(error);
  }
}
