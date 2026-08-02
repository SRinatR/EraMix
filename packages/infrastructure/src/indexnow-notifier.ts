import { validateIndexNowSubmission } from '@eramix/domain';
import type {
  IndexNowNotifier,
  IndexNowSubmissionInput,
  IndexNowSubmissionResult,
} from '@eramix/application';

/**
 * IndexNow (CLAUDE.md: P1, Bing/Yandex-only, never a Google indexing
 * mechanism). Submits the same payload to both participating engines'
 * endpoints in parallel — the protocol only requires one, but submitting to
 * both is cheap and avoids depending on cross-engine propagation. Each
 * engine gets its own bounded retry (never unbounded, never blocking the
 * caller past `maxAttempts * backoff`); a failure on one engine never
 * throws, so a caller iterating outbox messages can log per-engine
 * observability without it affecting outbox retry/dead-letter state.
 */
const ENGINES = [
  { name: 'bing', endpoint: 'https://www.bing.com/indexnow' },
  { name: 'yandex', endpoint: 'https://yandex.com/indexnow' },
] as const;

const BASE_BACKOFF_MS = 500;

export interface HttpIndexNowNotifierOptions {
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly maxAttemptsPerEngine?: number;
}

export class HttpIndexNowNotifier implements IndexNowNotifier {
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly maxAttemptsPerEngine: number;

  constructor(options: HttpIndexNowNotifierOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttemptsPerEngine = options.maxAttemptsPerEngine ?? 3;
  }

  async submit(input: IndexNowSubmissionInput): Promise<readonly IndexNowSubmissionResult[]> {
    validateIndexNowSubmission(input);
    const body = JSON.stringify({
      host: input.host,
      key: input.key,
      keyLocation: input.keyLocation,
      urlList: input.urlList,
    });
    return Promise.all(ENGINES.map((engine) => this.submitToEngine(engine, body)));
  }

  private async submitToEngine(
    engine: (typeof ENGINES)[number],
    body: string,
  ): Promise<IndexNowSubmissionResult> {
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    for (let attempt = 1; attempt <= this.maxAttemptsPerEngine; attempt += 1) {
      try {
        const response = await this.fetchImpl(engine.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body,
        });
        if (response.ok || response.status === 202) {
          return { engine: engine.name, succeeded: true, statusCode: response.status };
        }
        lastStatusCode = response.status;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < this.maxAttemptsPerEngine) {
        await this.sleepImpl(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }

    return {
      engine: engine.name,
      succeeded: false,
      ...(lastStatusCode !== undefined ? { statusCode: lastStatusCode } : {}),
      ...(lastError !== undefined ? { error: lastError } : {}),
    };
  }
}
