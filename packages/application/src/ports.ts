export interface Clock {
  now(): Date;
}

export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface IdGenerator {
  nextId(): string;
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
