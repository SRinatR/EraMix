import { ValidationFailedError } from './errors.js';

/**
 * IndexNow (https://www.indexnow.org/documentation) is a P1, Bing/Yandex-
 * only notification adapter (CLAUDE.md) — it never replaces sitemap/
 * canonical correctness and is never a Google indexing mechanism. This
 * module validates a submission's shape before it is ever sent over the
 * network: the real key lives in the deployment secret store
 * (INDEXNOW_KEY), never invented or hardcoded here.
 */
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const MAX_URLS_PER_SUBMISSION = 10_000;

export interface IndexNowSubmissionInput {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: readonly string[];
}

/** Throws ValidationFailedError on any shape violation — a caller bug, never a network-layer concern. */
export function validateIndexNowSubmission(input: IndexNowSubmissionInput): void {
  if (input.host.trim().length === 0) {
    throw new ValidationFailedError('IndexNow submission requires a non-empty host.', {});
  }
  if (!KEY_PATTERN.test(input.key)) {
    throw new ValidationFailedError(
      'IndexNow key must be 8-128 alphanumeric/hyphen characters.',
      {},
    );
  }
  if (input.urlList.length === 0) {
    throw new ValidationFailedError('IndexNow submission requires at least one URL.', {});
  }
  if (input.urlList.length > MAX_URLS_PER_SUBMISSION) {
    throw new ValidationFailedError(
      `IndexNow submission exceeds the ${MAX_URLS_PER_SUBMISSION}-URL limit.`,
      { count: input.urlList.length },
    );
  }
  // No `URL` global here (packages/domain has no DOM/Node lib — same
  // convention as platform-settings.ts's HTTPS_URL_PATTERN): a same-host
  // https prefix check is sufficient and avoids an ambient lib declaration.
  const requiredPrefix = `https://${input.host}/`;
  for (const url of input.urlList) {
    if (!url.startsWith(requiredPrefix)) {
      throw new ValidationFailedError(
        `"${url}" must be an absolute https URL on the submitted host "${input.host}".`,
        { url, host: input.host },
      );
    }
  }
}
