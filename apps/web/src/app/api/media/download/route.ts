import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { AccessDeniedError, ValidationFailedError } from '@eramix/domain';
import { NextResponse } from 'next/server';

/**
 * Serves a file previously stored via LocalFilesystemStorageProvider,
 * verifying the HMAC signature and expiry embedded in the URL (dev-only —
 * a real S3-compatible provider issues its own pre-signed URLs and this
 * route would not exist in that world; see ADR-0006). This is the
 * "controlled download URL" enforcement point (CLAUDE.md / ACC-005): the
 * signature alone proves the URL wasn't tampered with, it is not itself a
 * substitute for the caller having been authorized when the URL was minted.
 */
/** Strips characters that would break or inject into a quoted Content-Disposition header value. */
function sanitizeContentDispositionFilename(rawFilename: string): string {
  // eslint-disable-next-line no-control-regex -- stripping C0 controls + DEL, plus the quote/backslash that would break the quoted-string
  return rawFilename.replaceAll(/["\\\x00-\x1F\x7F]/g, '');
}

export const GET = withApiHandler('media.download', async (request) => {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expiresParam = url.searchParams.get('expires');
  const signature = url.searchParams.get('sig');
  // Present only for URLs minted with a downloadFilename (e.g. product
  // assets) — absent for the generic media-upload flow, which falls back to
  // the key itself (CLAUDE.md doesn't name that surface's filename policy).
  const downloadFilename = url.searchParams.get('filename') ?? undefined;
  if (!key || !expiresParam || !signature) {
    throw new ValidationFailedError('key, expires, and sig query parameters are all required.', {});
  }

  const container = getContainer();
  const expires = Number(expiresParam);
  if (!container.storage.verifySignedDownload(key, expires, signature, downloadFilename ?? '')) {
    throw new AccessDeniedError('This download URL is invalid, tampered with, or has expired.', {});
  }

  const filePath = path.join(path.resolve(container.env.MEDIA_STORAGE_DIR), key);
  const buffer = await readFile(filePath);
  const safeFilename = sanitizeContentDispositionFilename(downloadFilename ?? key);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { 'content-disposition': `attachment; filename="${safeFilename}"` },
  });
});
