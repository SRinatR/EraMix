import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalFilesystemStorageProvider } from './local-storage-provider.js';

const SECRET = 'a'.repeat(32);

describe('LocalFilesystemStorageProvider', () => {
  let baseDir: string;
  let provider: LocalFilesystemStorageProvider;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'eramix-media-'));
    provider = new LocalFilesystemStorageProvider(baseDir, 'https://media.test.invalid', SECRET);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes the file to disk and returns a checksum matching the content', async () => {
    const content = new Uint8Array([1, 2, 3, 4]);
    const descriptor = await provider.put('key-1', content, 'application/octet-stream');

    expect(descriptor.sizeBytes).toBe(4);
    expect(descriptor.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    const written = await readFile(path.join(baseDir, 'key-1'));
    expect([...written]).toEqual([1, 2, 3, 4]);
  });

  it('creates a signed URL whose signature verifies, and rejects a tampered one', async () => {
    const url = await provider.createSignedDownloadUrl('key-1', 60);
    const parsed = new URL(url);
    const expires = Number(parsed.searchParams.get('expires'));
    const sig = parsed.searchParams.get('sig')!;

    expect(provider.verifySignedDownload('key-1', expires, sig)).toBe(true);
    // Flip the last hex digit to one guaranteed different from the original
    // (rather than always appending '0', which would occasionally — 1 in 16
    // — leave the signature completely unchanged and make this assertion
    // flaky).
    const lastDigit = sig.at(-1)!;
    const tamperedDigit = lastDigit === '0' ? '1' : '0';
    const tamperedSig = `${sig.slice(0, -1)}${tamperedDigit}`;
    expect(provider.verifySignedDownload('key-1', expires, tamperedSig)).toBe(false);
    expect(provider.verifySignedDownload('different-key', expires, sig)).toBe(false);
  });

  it('rejects a signed URL past its expiry', async () => {
    const url = await provider.createSignedDownloadUrl('key-1', -1);
    const parsed = new URL(url);
    const expires = Number(parsed.searchParams.get('expires'));
    const sig = parsed.searchParams.get('sig')!;

    expect(provider.verifySignedDownload('key-1', expires, sig)).toBe(false);
  });

  it('delete() removes the file and is idempotent for a missing file', async () => {
    await provider.put('key-2', new Uint8Array([9]), 'application/octet-stream');
    await provider.delete('key-2');
    await expect(readFile(path.join(baseDir, 'key-2'))).rejects.toThrow();
    await expect(provider.delete('key-2')).resolves.toBeUndefined();
  });
});
