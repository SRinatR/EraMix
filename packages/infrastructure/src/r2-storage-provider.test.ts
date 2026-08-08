import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  class FakeS3Client {
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  return {
    ...actual,
    S3Client: FakeS3Client,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } =
  await import('@aws-sdk/client-s3');
const { R2StorageProvider } = await import('./r2-storage-provider.js');

const CONFIG = {
  accountId: 'acct-123',
  bucket: 'eramix-media-prod',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'secret-test',
};

describe('R2StorageProvider', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
  });

  it('put() uploads the object and returns a checksum matching the content', async () => {
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider(CONFIG);
    const content = new Uint8Array([1, 2, 3, 4]);

    const descriptor = await provider.put('key-1', content, 'application/octet-stream');

    expect(descriptor).toEqual({
      key: 'key-1',
      contentType: 'application/octet-stream',
      sizeBytes: 4,
      checksumSha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown as string,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as InstanceType<typeof PutObjectCommand>;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'eramix-media-prod',
      Key: 'key-1',
      ContentType: 'application/octet-stream',
    });
  });

  it('createSignedDownloadUrl() returns a pre-signed GetObject URL with the requested expiry', async () => {
    getSignedUrlMock.mockResolvedValue('https://acct-123.r2.cloudflarestorage.com/signed?x=1');
    const provider = new R2StorageProvider(CONFIG);

    const url = await provider.createSignedDownloadUrl('key-1', 3600);

    expect(url).toBe('https://acct-123.r2.cloudflarestorage.com/signed?x=1');
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [, command, options] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      InstanceType<typeof GetObjectCommand>,
      { expiresIn: number },
    ];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'eramix-media-prod', Key: 'key-1' });
    expect(command.input.ResponseContentDisposition).toBeUndefined();
    expect(options).toEqual({ expiresIn: 3600 });
  });

  it('createSignedDownloadUrl() sets a sanitized Content-Disposition when a filename is given', async () => {
    getSignedUrlMock.mockResolvedValue('https://acct-123.r2.cloudflarestorage.com/signed?x=2');
    const provider = new R2StorageProvider(CONFIG);

    await provider.createSignedDownloadUrl('key-1', 60, 'Data"sheet\x00.pdf');

    const command = getSignedUrlMock.mock.calls[0]?.[1] as InstanceType<typeof GetObjectCommand>;
    expect(command.input.ResponseContentDisposition).toBe('attachment; filename="Datasheet.pdf"');
  });

  it('delete() removes the object', async () => {
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider(CONFIG);

    await provider.delete('key-1');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as InstanceType<typeof DeleteObjectCommand>;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'eramix-media-prod', Key: 'key-1' });
  });
});
