import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission, type MembershipListFilter } from '@eramix/application';
import { ResourceNotFoundError } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createMembershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['OWNER', 'MEMBER']),
});

type MembershipSort = NonNullable<MembershipListFilter['sort']>;
const SORTS: readonly MembershipSort[] = ['createdAt_asc', 'createdAt_desc'];

/** DB-005: only an exact allowlist member is ever forwarded to the repository's `orderBy`. */
function parseSort(value: string | null): MembershipSort | undefined {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as MembershipSort)
    : undefined;
}

const getHandler = withApiHandler<{ companyId: string }>(
  'admin.companies.memberships.list',
  async (request, _traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { companyId } = await params;
    const url = new URL(request.url);
    const cursorParam = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');
    const sort = parseSort(url.searchParams.get('sort'));
    const container = getContainer();
    const { data, page } = await container.memberships.listByCompany(companyId, {
      ...(cursorParam !== null ? { cursor: cursorParam } : {}),
      ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
      ...(sort !== undefined ? { sort } : {}),
    });

    return NextResponse.json({ data, page });
  },
);

const postHandler = withApiHandler<{ companyId: string }>(
  'admin.companies.memberships.create',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    requirePermission(actor.platformRole, 'users.manage');

    const { companyId } = await params;
    const body = createMembershipSchema.parse(await request.json());
    const container = getContainer();

    const company = await container.companies.findById(companyId);
    if (!company) {
      throw new ResourceNotFoundError(`Company ${companyId} not found.`, { companyId });
    }
    const user = await container.users.findById(body.userId);
    if (!user) {
      throw new ResourceNotFoundError(`User ${body.userId} not found.`, { userId: body.userId });
    }

    const membership = await container.memberships.create({
      id: await container.idGen.nextId(),
      userId: body.userId,
      companyId,
      role: body.role,
      status: 'ACTIVE',
    });

    await container.auditEvents.record({
      actorUserId: actor.userId,
      action: 'membership.created',
      entityType: 'Membership',
      entityId: membership.id,
      metadata: { companyId, userId: body.userId, role: body.role },
      traceId,
    });

    return NextResponse.json(membership, { status: 201 });
  },
);

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers<{
  companyId: string;
}>({
  GET: getHandler,
  POST: postHandler,
});
