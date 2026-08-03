export interface Clock {
  now(): Date;
}

export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Generates a new internal entity id. ADR-0021: for every persistent
 * PostgreSQL entity whose id an application use case must know before
 * insert, PostgreSQL 19 Beta 2's native `uuidv7()` SQL function is the
 * authoritative source — hence `Promise<string>`, not a synchronous value.
 */
export interface IdGenerator {
  nextId(): Promise<string>;
}

/**
 * Generic OIDC identity claims after token validation (signature, issuer,
 * audience, expiry, nonce already checked by the adapter). Claim *names* are
 * intentionally the standard OIDC Core ones (`sub`, `email`, `name`) — ODS's
 * actual issuer/endpoint/claim contract is blocked on Q-01/ADR-0003. This
 * port lets the generic RFC 9700 + OIDC Core PKCE flow (packages/
 * infrastructure) be implemented and tested now against a documented test
 * IdP double, and pointed at the real ODS issuer later without changing any
 * call site.
 */
export interface OidcClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
}

export interface PkceChallenge {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: 'S256';
}

export interface AuthorizationRequest {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly nonce: string;
  readonly pkce: PkceChallenge;
}

/**
 * Adapter boundary for the OIDC Authorization Code + PKCE flow. A concrete
 * adapter (packages/infrastructure) wraps a standard OIDC client library
 * against a configured issuer; a test double implements this same port
 * against an in-memory/test IdP. No ODS-specific endpoint/claim assumption
 * belongs on this interface.
 */
export interface IdentityProvider {
  buildAuthorizationRequest(redirectUri: string): Promise<AuthorizationRequest>;
  /**
   * Exchanges the callback `code` for validated claims. Implementations must
   * verify state, nonce, PKCE verifier, issuer, audience, signature (via
   * JWKS), and expiration before returning — never return claims from an
   * unverified token.
   */
  handleCallback(input: {
    readonly code: string;
    readonly state: string;
    readonly expectedState: string;
    readonly expectedNonce: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<OidcClaims>;
}

export interface UploadedFileDescriptor {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
}

/**
 * Object-storage adapter boundary. The concrete provider (S3-compatible vs.
 * something else) is blocked on Q-06/ADR-0006; this port lets upload
 * validation (packages/application/src/uploads.ts) and controlled download
 * URL issuance be implemented and tested against a local/dev adapter now.
 */
export interface StorageProvider {
  put(key: string, content: Uint8Array, contentType: string): Promise<UploadedFileDescriptor>;
  /**
   * Time-limited, controlled download URL — never a permanently public
   * object URL. `downloadFilename`, when given, is the editorial name the
   * browser should save the file as (Content-Disposition), signed alongside
   * the key so it can't be swapped independently — callers use this instead
   * of ever exposing the internal storage key as the visible filename.
   */
  createSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
    downloadFilename?: string,
  ): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
}

/**
 * Notification adapter boundary. The concrete provider is blocked on
 * Q-06/ADR-0007; outbox dispatch (apps/worker) calls this port, never an
 * email SDK directly, so the provider can be swapped without touching
 * use-case code.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface MalwareScanResult {
  readonly clean: boolean;
  readonly signature?: string;
}

/**
 * Malware-scanning integration point (CLAUDE.md: "malware scanning
 * integration point"). The concrete scanner (hosted service or self-hosted
 * ClamAV-equivalent) is blocked on Q-06/ADR-0006; this port lets upload
 * validation require a scan result before a file is ever stored, without
 * deciding the provider now.
 */
export interface MalwareScanner {
  scan(content: Uint8Array): Promise<MalwareScanResult>;
}

export interface IndexNowSubmissionInput {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: readonly string[];
}

export interface IndexNowSubmissionResult {
  readonly engine: string;
  readonly succeeded: boolean;
  readonly statusCode?: number;
  readonly error?: string;
}

/**
 * IndexNow (CLAUDE.md: "P1, secret-managed notification adapter for Bing/
 * Yandex only... never a Google indexing mechanism"). `submit` never throws
 * for a single engine's failure — each engine's outcome (including a
 * bounded number of internal retries) is reported in the returned array, so
 * the caller (apps/worker) can log per-engine observability without that
 * failure affecting the outbox message's own SENT/FAILED/DEAD_LETTER state.
 */
export interface IndexNowNotifier {
  submit(input: IndexNowSubmissionInput): Promise<readonly IndexNowSubmissionResult[]>;
}

export interface AnalyticsDispatchResult {
  readonly sink: string;
  readonly succeeded: boolean;
  /** True when the sink was never even called — consent or admin enablement was absent, not a delivery failure. */
  readonly skipped?: boolean;
  readonly error?: string;
}

/**
 * A GA4/Yandex Metrica destination (docs/runbooks/search-visibility.md:
 * "one semantic event to Rust analytics, GA4 and Yandex Metrica adapters").
 * `dispatch` never throws — a network/API failure is reported in the
 * returned result, so a flaky provider can never block the caller or the
 * outbox message's own retry state (same "never throw for a single
 * destination's failure" convention as IndexNowNotifier). Consent/
 * enablement gating happens one layer up (packages/application/src/
 * analytics.ts's dispatchAnalyticsEvent) — a sink only ever sees an event
 * it has already been cleared to receive.
 */
/**
 * The live, site-wide facts a sink may need — never re-derived or
 * hardcoded inside a sink itself. `ga4MeasurementId`/`yandexMetricaCounterId`
 * are PlatformSettings' existing non-secret columns, read fresh on every
 * dispatch (not cached at worker startup) so an admin changing them in
 * /admin/settings takes effect on the very next event, matching every
 * other settings-driven behavior in this codebase — a sink receiving
 * `undefined` for its own ID must decline rather than dispatch with an
 * empty/placeholder value.
 */
export interface AnalyticsDispatchContext {
  readonly canonicalOrigin: string;
  readonly ga4MeasurementId?: string;
  readonly yandexMetricaCounterId?: string;
}

export interface AnalyticsEventSink {
  readonly name: string;
  readonly requiredConsent: 'analytics' | 'advertising';
  dispatch(
    event: AnalyticsEventLike,
    context: AnalyticsDispatchContext,
  ): Promise<AnalyticsDispatchResult>;
}

/**
 * Structural alias so ports.ts doesn't need a hard dependency on
 * packages/domain/src/analytics.ts's full discriminated union — every
 * field a sink could plausibly need is already on the shared base shape.
 */
export interface AnalyticsEventLike {
  readonly eventId: string;
  readonly schemaVersion: number;
  readonly eventName: string;
  readonly occurredAt: string;
  readonly sessionId: string;
  readonly locale: string;
  /** Every event carries the page context it fired from (schema v2) — no longer page_view-only. */
  readonly pageType: string;
  readonly canonicalPath: string;
  readonly consent: { readonly analytics: boolean; readonly advertising: boolean };
}
