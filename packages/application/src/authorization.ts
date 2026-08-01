import { AccessDeniedError, type PlatformRole } from '@eramix/domain';

/**
 * Atomic permissions (TZ §3.1: "Фактические permissions должны быть
 * атомарными (например, order.read, order.transition, catalog.publish), а
 * роли — наборами permissions."). The role→permission grants below are the
 * TZ §3.1 resource×role matrix transcribed directly (see ADR-0014), not
 * invented. IAM-008 requires every protected use case to check this
 * server-side — hidden UI is never the control.
 */
export type Permission =
  | 'catalog.read'
  | 'catalog.write'
  | 'profile.read'
  | 'profile.update'
  | 'order.create'
  | 'order.read.own'
  | 'order.read.all'
  | 'order.transition'
  | 'content.read'
  | 'content.write'
  | 'content.slug.change'
  | 'users.manage'
  | 'audit.read.limited'
  | 'audit.read.full';

const ROLE_PERMISSIONS: Readonly<Record<PlatformRole, ReadonlySet<Permission>>> = {
  // Табл. 8: Клиент — Публичный каталог R, Собственный профиль RU, Заказы
  // своей компании CR, Публичный контент R.
  CUSTOMER: new Set<Permission>([
    'catalog.read',
    'content.read',
    'profile.read',
    'profile.update',
    'order.create',
    'order.read.own',
  ]),
  // Табл. 8: Менеджер — каталог/контент R, Собственный профиль R, Заказы
  // своей компании R/U, Все доступные заказы R/U, Аудит R (ограниченно).
  MANAGER: new Set<Permission>([
    'catalog.read',
    'content.read',
    'profile.read',
    'order.read.own',
    'order.read.all',
    'order.transition',
    'audit.read.limited',
  ]),
  // Табл. 8: Редактор — Публичный контент CRUD, каталог/профиль R, без
  // доступа к ролям/заказам/аудиту.
  CONTENT_EDITOR: new Set<Permission>([
    'catalog.read',
    'content.read',
    'content.write',
    'content.slug.change',
    'profile.read',
    'profile.update',
  ]),
  // Табл. 8: Администратор — CRUD на всё в пределах утверждённой матрицы.
  ADMIN: new Set<Permission>([
    'catalog.read',
    'catalog.write',
    'content.read',
    'content.write',
    'content.slug.change',
    'profile.read',
    'profile.update',
    'order.create',
    'order.read.own',
    'order.read.all',
    'order.transition',
    'users.manage',
    'audit.read.limited',
    'audit.read.full',
  ]),
  // Табл. 7: "Read-only доступ к журналам аудита и техническим
  // идентификаторам" — no other resource.
  AUDITOR: new Set<Permission>(['audit.read.full']),
};

export function hasPermission(role: PlatformRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Throws AccessDeniedError (RFC 9457-mappable) rather than returning a boolean — IAM-008. */
export function requirePermission(role: PlatformRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AccessDeniedError(`Role "${role}" lacks permission "${permission}".`, {
      role,
      permission,
    });
  }
}

/**
 * ORD-008: "Клиент видит только разрешённые ему заказы своей компании."
 * `order.read.all` (manager/admin) bypasses the company-membership check
 * entirely; `order.read.own` still requires company membership.
 */
export function assertOrderCompanyAccess(
  role: PlatformRole,
  actorCompanyIds: readonly string[],
  orderCompanyId: string,
): void {
  if (hasPermission(role, 'order.read.all')) {
    return;
  }
  requirePermission(role, 'order.read.own');
  if (!actorCompanyIds.includes(orderCompanyId)) {
    throw new AccessDeniedError('Order does not belong to a company the actor is a member of.', {
      role,
      orderCompanyId,
    });
  }
}
