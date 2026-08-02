import { ValidationFailedError } from './errors.js';

/**
 * Neutralizes a caller-supplied filename for use inside a generated storage
 * key (CLAUDE.md: "Never use a user-supplied filename or path as a storage
 * path"). Path separators (`/`, `\`), dot-segment traversal punctuation, and
 * every other character outside a small safe allowlist all fall outside
 * `[a-zA-Z0-9._-]` and become `_` -- a lone `..` with no surviving separator
 * cannot escape a `path.join(baseDir, key)` call, so this single allowlist
 * replace is sufficient without a separate path-traversal denylist.
 */
export function sanitizeFilenameForStorage(rawFilename: string): string {
  return rawFilename.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

// eslint-disable-next-line no-control-regex -- deliberately matching C0 control characters + DEL to strip them
const CONTROL_CHARACTERS = /[\x00-\x1F\x7F]/g;

/**
 * Cleans an editorial display name (as opposed to the storage-path-safe
 * filename above): trims whitespace, strips control characters, and caps
 * length to the column width. Unlike sanitizeFilenameForStorage this keeps
 * spaces/punctuation -- it is shown to admins and site visitors, never used
 * to build a path.
 */
export function sanitizeDisplayName(rawName: string): string {
  const cleaned = rawName.trim().replaceAll(CONTROL_CHARACTERS, '');
  if (cleaned.length === 0) {
    throw new ValidationFailedError('Display name must not be empty.', { rawName });
  }
  return cleaned.slice(0, 255);
}
