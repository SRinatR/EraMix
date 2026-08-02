import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, UploadedFileDescriptor } from '@eramix/application';

/**
 * Dev-only local-disk StorageProvider — the real S3-compatible provider is
 * blocked on Q-06/ADR-0006. Never use in production: no durability, no
 * replication, and `createSignedDownloadUrl`'s HMAC only proves the URL
 * hasn't been tampered with and hasn't expired — it does not itself enforce
 * per-user authorization (the delivery layer's download route must still
 * check the caller's permission, per CLAUDE.md's "controlled download
 * URLs" / ACC-005).
 */
export class LocalFilesystemStorageProvider implements StorageProvider {
  constructor(
    private readonly baseDir: string,
    private readonly publicBaseUrl: string,
    private readonly signingSecret: string,
  ) {}

  async put(
    key: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<UploadedFileDescriptor> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(path.join(this.baseDir, key), content);
    const checksumSha256 = createHash('sha256').update(content).digest('hex');
    return { key, contentType, sizeBytes: content.byteLength, checksumSha256 };
  }

  /**
   * `publicBaseUrl` is the fixed download *route* (e.g.
   * `/api/media/download`), not a per-file path — the key travels as a
   * query parameter so the route itself can stay a static path with no
   * dynamic segment. `downloadFilename`, when given, is signed alongside the
   * key/expiry so the download route can set a Content-Disposition filename
   * that was never exposed to the client as free-form input.
   */
  createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    downloadFilename?: string,
  ): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = this.sign(key, expiresAt, downloadFilename ?? '');
    const url = new URL(this.publicBaseUrl);
    url.searchParams.set('key', key);
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('sig', signature);
    if (downloadFilename) {
      url.searchParams.set('filename', downloadFilename);
    }
    return Promise.resolve(url.toString());
  }

  async delete(key: string): Promise<void> {
    await unlink(path.join(this.baseDir, key)).catch(() => undefined);
  }

  private sign(key: string, expiresAt: number, downloadFilename = ''): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${key}:${expiresAt}:${downloadFilename}`)
      .digest('hex');
  }

  /** Verifies a URL produced by createSignedDownloadUrl — used by the download route handler. */
  verifySignedDownload(
    key: string,
    expiresAt: number,
    signature: string,
    downloadFilename = '',
  ): boolean {
    if (Date.now() > expiresAt) {
      return false;
    }
    const expected = Buffer.from(this.sign(key, expiresAt, downloadFilename), 'hex');
    const actual = Buffer.from(signature, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
