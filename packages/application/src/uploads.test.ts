import { UnsupportedMediaTypeError, ValidationFailedError } from '@eramix/domain';
import { describe, expect, it } from 'vitest';
import type { MalwareScanner, StorageProvider } from './ports.js';
import { uploadMedia } from './uploads.js';

const PNG_CONTENT = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(20).fill(0)]);

function fakeIdGen(id = 'id-1') {
  return { nextId: () => Promise.resolve(id) };
}

function fakeStorage(): StorageProvider & { puts: unknown[] } {
  const puts: unknown[] = [];
  return {
    puts,
    put: (key, content, contentType) => {
      puts.push({ key, contentType });
      return Promise.resolve({
        key,
        contentType,
        sizeBytes: content.byteLength,
        checksumSha256: 'fake-checksum',
      });
    },
    createSignedDownloadUrl: () => Promise.resolve('https://example.test/signed'),
    delete: () => Promise.resolve(),
  };
}

function cleanScanner(): MalwareScanner {
  return { scan: () => Promise.resolve({ clean: true }) };
}

function infectedScanner(): MalwareScanner {
  return { scan: () => Promise.resolve({ clean: false, signature: 'EICAR-TEST' }) };
}

describe('uploadMedia', () => {
  it('stores a valid, clean file under a generated key (never the raw filename)', async () => {
    const storage = fakeStorage();
    const descriptor = await uploadMedia(
      { storage, scanner: cleanScanner(), idGen: fakeIdGen('generated-id') },
      { filename: 'photo.png', contentType: 'image/png', content: PNG_CONTENT },
    );

    expect(descriptor.key).toBe('generated-id-photo.png');
    expect(storage.puts).toEqual([{ key: 'generated-id-photo.png', contentType: 'image/png' }]);
  });

  it('rejects a file that fails malware scanning before ever calling storage.put', async () => {
    const storage = fakeStorage();
    await expect(
      uploadMedia(
        { storage, scanner: infectedScanner(), idGen: fakeIdGen() },
        { filename: 'photo.png', contentType: 'image/png', content: PNG_CONTENT },
      ),
    ).rejects.toThrow(ValidationFailedError);
    expect(storage.puts).toHaveLength(0);
  });

  it('rejects a file that fails validation before ever calling the scanner or storage', async () => {
    const storage = fakeStorage();
    let scannerCalled = false;
    const scanner: MalwareScanner = {
      scan: () => {
        scannerCalled = true;
        return Promise.resolve({ clean: true });
      },
    };

    await expect(
      uploadMedia(
        { storage, scanner, idGen: fakeIdGen() },
        { filename: 'script.exe', contentType: 'application/x-msdownload', content: PNG_CONTENT },
      ),
    ).rejects.toThrow(UnsupportedMediaTypeError);
    expect(scannerCalled).toBe(false);
    expect(storage.puts).toHaveLength(0);
  });

  it('strips path separators from an unsafe filename (path traversal attempt), leaving a flat key', async () => {
    const storage = fakeStorage();
    const descriptor = await uploadMedia(
      { storage, scanner: cleanScanner(), idGen: fakeIdGen('id-2') },
      { filename: '../../etc/passwd.png', contentType: 'image/png', content: PNG_CONTENT },
    );
    // No "/" or "\" survives sanitization, so the key can never escape the
    // storage adapter's base directory when joined as a single path segment
    // (path.join(baseDir, key)) — a bare ".." substring with no separators
    // is not itself a traversal risk.
    expect(descriptor.key).not.toContain('/');
    expect(descriptor.key).not.toContain('\\');
  });
});
