import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission, type CompanyListFilter } from '@eramix/application';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * TZ §3.1's RBAC matrix has no dedicated "Компании" row, but §4.2's module
 * table assigns company data to the same Identity & Access module as
 * "локальный профиль... роли" — i.e. the existing Admin-only `users.manage`
 * permission ("Пользователи и роли: CRUD"), not a new atomic permission.
 */
const createCompanySchema = z.object({
  legalName: z.string().min(1).max(255),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type CompanySort = NonNullable<CompanyListFilter['sort']>;
const SORTS: readonly CompanySort[] = [
  'createdAt_asc',
  'createdAt_desc',
  'legalName_asc',
  'legalName_desc',
];

/** DB-005: only an exact allowlist member is ever forwarded to the repository's `orderBy`. */
function parseSort(value: string | null): CompanySort | undefined {
  return value !== null && (SORTS as readonly string[]).includes(value)
    ? (value as CompanySort)
    : undefined;
}

const getHandler = withApiHandler('admin.companies.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'users.manage');

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const searchParam = url.searchParams.get('search');
  const sort = parseSort(url.searchParams.get('sort'));
  const container = getContainer();
  const { data, page } = await container.companies.listAll({
    ...(cursorParam !== null ? { cursor: cursorParam } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    ...(searchParam !== null ? { search: searchParam } : {}),
    ...(sort !== undefined ? { sort } : {}),
  });

  return NextResponse.json({
    data: data.map((company) => ({
      id: company.id,
      legalName: company.legalName,
      status: company.status,
      metadata: company.metadata,
      version: company.version,
    })),
    page,
  });
});

const postHandler = withApiHandler('admin.companies.create', async (request, traceId) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'users.manage');

  const body = createCompanySchema.parse(await request.json());
  const container = getContainer();

  const company = await container.companies.create({
    id: container.idGen.nextId(),
    legalName: body.legalName,
    status: 'ACTIVE',
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
  });

  await container.auditEvents.record({
    actorUserId: actor.userId,
    action: 'company.created',
    entityType: 'Company',
    entityId: company.id,
    metadata: { legalName: company.legalName },
    traceId,
  });

  return NextResponse.json(
    {
      id: company.id,
      legalName: company.legalName,
      status: company.status,
      metadata: company.metadata,
      version: company.version,
    },
    { status: 201 },
  );
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
  POST: postHandler,
});
