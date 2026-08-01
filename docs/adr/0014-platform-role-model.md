# ADR-0014: Platform role model (`PlatformRole`)

- Status: Accepted
- Date: 2026-08-01
- Requirement source: TZ v1.3 §3.1 "Базовая RBAC-матрица" (role table + resource
  permission matrix), docs/IMPLEMENTATION_ROADMAP.md Phase 4 ("Permission model
  and server-side authorization policies") and Phase 6 ("secured CRUD for ...
  users/roles")

## Context

Phase 1 modeled only a company-scoped role (`Membership.role`:
`OWNER`/`MEMBER`) — enough for a Membership row to exist, but not the
platform-level staff roles the TZ's own RBAC matrix requires: Менеджер
(Manager), Контент-редактор (Content editor), Администратор (Administrator),
Аудитор/Support (Auditor). `Посетитель` (Visitor) is the unauthenticated state,
not a stored role. `B2B-клиент` is the default authenticated state for a user
whose only membership is company-scoped — modeled as `CUSTOMER` below rather
than a separate stored value, since every authenticated `User` row already
defaults to it and platform staff are the exception.

This is not a new business decision: the roles and the resource×role
permission matrix (Публичный каталог/Собственный профиль/Заказы своей
компании/Все доступные заказы/Публичный контент/Пользователи и роли/Аудит ×
Клиент/Менеджер/Редактор/Администратор) are already fully specified in TZ
§3.1, tables under paragraphs 130–132. Building the authorization module
(packages/application/src/authorization.ts) requires a place to store which
platform role a `User` row has; this ADR only decides the storage shape.

Product Owner role (Утверждать объём и правила) is a business/process role,
not a platform account state, and is intentionally not modeled here.

## Decision

Add `PlatformRole` enum (`CUSTOMER`, `MANAGER`, `CONTENT_EDITOR`, `ADMIN`,
`AUDITOR`) and a required `User.platformRole` column, default `CUSTOMER`
(matches every existing/new user until explicitly promoted by an
already-Administrator actor — a use case, not a migration default beyond the
column default itself). This is additive: one enum, one column with a
default, no existing column removed or retyped.

The atomic-permission list and role→permission matrix live in
`packages/application/src/authorization.ts`, generated directly from TZ §3.1
table 8 (resource × role → C/R/U/D), not invented:

| Resource                                    | Клиент (CUSTOMER) | Менеджер (MANAGER)      | Редактор (CONTENT_EDITOR) | Администратор (ADMIN) |
| ------------------------------------------- | ----------------- | ----------------------- | ------------------------- | --------------------- |
| Публичный каталог (catalog)                 | R                 | R                       | R                         | CRUD                  |
| Собственный профиль (profile)               | RU                | R                       | R                         | CRUD                  |
| Заказы своей компании (orders, own company) | CR                | R/U                     | -                         | CRUD                  |
| Все доступные заказы (orders, all)          | -                 | R/U                     | -                         | CRUD                  |
| Публичный контент (content)                 | R                 | R                       | CRUD                      | CRUD                  |
| Пользователи и роли (users)                 | -                 | -                       | -                         | CRUD                  |
| Аудит (audit)                               | -                 | R (ограниченно/limited) | -                         | R                     |

`AUDITOR` is added per TZ §3.1 table 7 ("Read-only доступ к журналам аудита и
техническим идентификаторам") as `audit.read` only, with no catalog/content/
order/user permission — table 8 does not list it because it is a support role
layered on top of the four CRUD-matrix roles, not one of its columns.

## Consequences

- Migration `packages/infrastructure/prisma/migrations/<ts>_add_platform_role/`
  adds the enum and column; generated offline via
  `prisma migrate diff --from-schema-datamodel <prior schema> --to-schema-datamodel prisma/schema.prisma --script`
  (no live database required), consistent with how the Phase 1 initial
  migration was produced.
- `packages/domain` gains `PlatformRole` and the `User.platformRole` field;
  `packages/application/src/authorization.ts` is the single place permission
  checks are computed (IAM-008: "Проверка permission выполняется на сервере
  для каждого защищённого use case" — every delivery-layer route handler
  calls it, hidden UI is never the control).
- ODS claim→role mapping (how a JWT claim becomes a `PlatformRole` at
  first-login) remains blocked on Q-01/ADR-0003 — this ADR only fixes the
  storage shape and the in-app permission matrix, not the OIDC claim contract.
  Until ADR-0003 resolves, role assignment happens only through an explicit
  admin `users.manage` action (Phase 6), never through an inferred claim.
