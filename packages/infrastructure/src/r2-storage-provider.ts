import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, UploadedFileDescriptor } from '@eramix/application';

export interface R2StorageProviderConfig {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Cloudflare R2 (S3-compatible) StorageProvider (ADR-0006, Accepted). The
 * bucket is private with no public/custom domain: `createSignedDownloadUrl`
 * returns R2's own time-limited pre-signed GET URL, which satisfies
 * CLAUDE.md's "time-limited, controlled download URL... never a permanently
 * public object URL" requirement without this app ever proxying the bytes.
 * `apps/web/src/app/api/media/download/route.ts` is the local-dev-only
 * counterpart for LocalFilesystemStorageProvider and is never linked to when
 * this provider is active — the delivery layer must still authorize the
 * caller before minting a URL from either provider (ACC-005).
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2StorageProviderConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(
    key: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<UploadedFileDescriptor> {
    const checksumSha256 = createHash('sha256').update(content).digest('hex');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }),
    );
    return { key, contentType, sizeBytes: content.byteLength, checksumSha256 };
  }

  createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    downloadFilename?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadFilename !== undefined
          ? {
              ResponseContentDisposition: `attachment; filename="${sanitizeFilename(downloadFilename)}"`,
            }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Strips characters that would break out of the quoted Content-Disposition value. */
function sanitizeFilename(rawFilename: string): string {
  // eslint-disable-next-line no-control-regex -- stripping C0 controls + DEL, plus the quote/backslash that would break the quoted-string
  return rawFilename.replaceAll(/["\\\x00-\x1F\x7F]/g, '');
}
