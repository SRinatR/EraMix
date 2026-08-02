import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission, type UserListFilter } from '@eramix/application';
import { NextResponse } from 'next/server';

type UserSort = NonNullable<UserListFilter['sort']>;
const SORTS: readonly UserSort[] = [
  'createdAt_asc',
  'createdAt_desc',
  'displayName_asc',
  'displayName_desc',
];

/** DB-005: only an exact allowlist member is ever forwarded to the repository's `orderBy`. */
function parseSort(value: string | null): UserSort | undefined {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as UserSort)
    : undefined;
}

export const GET = withApiHandler('admin.users.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'users.manage');

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const searchParam = url.searchParams.get('search');
  const sort = parseSort(url.searchParams.get('sort'));
  const container = getContainer();
  const { data, page } = await container.users.listAll({
    ...(cursorParam !== null ? { cursor: cursorParam } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    ...(searchParam !== null ? { search: searchParam } : {}),
    ...(sort !== undefined ? { sort } : {}),
  });

  return NextResponse.json({
    data: data.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      platformRole: user.platformRole,
      status: user.status,
      version: user.version,
    })),
    page,
  });
});
