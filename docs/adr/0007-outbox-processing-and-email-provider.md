# ADR-0007: Outbox processing and email provider

- Status: Blocked — pending Q-06
- Date: 2026-08-01
- Requirement source: TZ v1.1 §6.8, Appendix D (ADR-007, "До notifications"),
  §21 Q-06

## Context

§6.8 requires a transactional outbox with retry/dead-letter behavior for
order and account notifications, dispatched by `apps/worker` (ADR-0002). The
outbox pattern itself (table shape, polling vs. `LISTEN/NOTIFY`, retry
backoff) is an engineering decision independent of the provider, but the
actual email provider is a business/vendor choice not yet made (§21 Q-06).

## Decision

Not made. Blocked on the email provider choice; the outbox mechanism design
(Phase 1 schema, Phase 5 dispatch logic) can proceed once a provider is
picked, since the outbox table itself is provider-agnostic (it stores
intent + payload, not a provider-specific request).

## Consequences

Phase 5 cannot wire real delivery until a provider is chosen; the outbox
table and worker polling loop can still be built against a provider
interface (`packages/application` port) with the concrete adapter deferred to
`packages/infrastructure`.
