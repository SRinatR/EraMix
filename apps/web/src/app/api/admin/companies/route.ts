import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
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

export const GET = withApiHandler('admin.companies.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'users.manage');

  const container = getContainer();
  const companies = await container.companies.listAll();

  return NextResponse.json({
    items: companies.map((company) => ({
      id: company.id,
      legalName: company.legalName,
      status: company.status,
      metadata: company.metadata,
      version: company.version,
    })),
  });
});

export const POST = withApiHandler('admin.companies.create', async (request, traceId) => {
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
