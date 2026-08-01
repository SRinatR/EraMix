import { ValidationFailedError, validateUpload } from '@eramix/domain';
import type {
  IdGenerator,
  MalwareScanner,
  StorageProvider,
  UploadedFileDescriptor,
} from './ports.js';

export interface UploadMediaInput {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
}

export interface UploadMediaDeps {
  readonly storage: StorageProvider;
  readonly scanner: MalwareScanner;
  readonly idGen: IdGenerator;
}

/**
 * Validates (allowlist/extension/signature/size — packages/domain's
 * validateUpload), requires a clean malware-scan result, then stores the
 * file under a generated key (never the caller-supplied filename alone, to
 * avoid path traversal / collision). Storage is only ever reached after
 * both checks pass — a failed scan never gets to `storage.put`.
 */
export async function uploadMedia(
  deps: UploadMediaDeps,
  input: UploadMediaInput,
): Promise<UploadedFileDescriptor> {
  validateUpload({
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.content.byteLength,
    headerBytes: input.content.slice(0, 16),
  });

  const scanResult = await deps.scanner.scan(input.content);
  if (!scanResult.clean) {
    throw new ValidationFailedError('Upload failed malware scanning.', {
      filename: input.filename,
      signature: scanResult.signature,
    });
  }

  const sanitizedFilename = input.filename.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${deps.idGen.nextId()}-${sanitizedFilename}`;
  return deps.storage.put(key, input.content, input.contentType);
}
