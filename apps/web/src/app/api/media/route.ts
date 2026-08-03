import { getContainer } from '@/server/container';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { requirePermission, uploadMedia } from '@eramix/application';
import { ValidationFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';

/** Media upload for catalog/content assets — TZ §3.1 "Публичный контент CRUD" (Content-editor/Admin only). */
const uploadMediaHandler = withApiHandler('media.upload', async (request, traceId) => {
  enforceRateLimit('upload', request);
  const actor = await requireActor(request);
  requirePermission(actor.platformRole, 'content.write');

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new ValidationFailedError('A "file" field is required (multipart/form-data).', {});
  }

  const content = new Uint8Array(await file.arrayBuffer());
  const container = getContainer();

  const descriptor = await uploadMedia(
    { storage: container.storage, scanner: container.scanner, idGen: container.idGen },
    { filename: file.name, contentType: file.type, content },
  );

  await container.auditEvents.record({
    actorUserId: actor.userId,
    action: 'media.uploaded',
    entityType: 'Media',
    entityId: descriptor.key,
    metadata: { contentType: descriptor.contentType, sizeBytes: descriptor.sizeBytes },
    traceId,
  });

  const downloadUrl = await container.storage.createSignedDownloadUrl(descriptor.key, 3600);
  return NextResponse.json({ ...descriptor, downloadUrl }, { status: 201 });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  POST: uploadMediaHandler,
});
