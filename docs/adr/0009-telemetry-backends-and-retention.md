# ADR-0009: Telemetry backends and retention

- Status: Blocked — pending Q-05, Q-06
- Date: 2026-08-01
- Requirement source: TZ v1.1 §10, Appendix D (ADR-009, "До staging"), §21
  Q-05, Q-06

## Context

§10 requires OpenTelemetry traces/metrics/structured logs exported via an
OTLP Collector, with dashboards, alerts, and health checks. The Collector's
downstream backend (hosted vendor vs. self-hosted stack) is a hosting-adjacent
decision (Q-06), and log/trace retention must respect the not-yet-approved
legal/privacy retention policy (Q-05) since telemetry can carry
actor/target identifiers.

## Decision

Not made. Blocked pending:

- Hosting decision for the OTLP Collector's backend (Q-06).
- Legal/privacy retention approval, which bounds how long traces/logs
  containing actor/target identifiers may be kept (Q-05).

## Consequences

The OpenTelemetry SDK/OTLP Collector wiring itself (instrumentation code,
W3C Trace Context propagation) is provider-agnostic and can be built in
earlier phases; only the Collector's export destination and retention
configuration are blocked, which is a Phase 7 concern.
