import { AccessDeniedError, type PlatformRole } from '@eramix/domain';
import { hasPermission } from './authorization.js';
import type { Page, PaginationInput } from './pagination.js';
import type { OrderListFilter, OrderRepository, OrderWithLines } from './repositories.js';

export interface ListOrdersForActorInput extends PaginationInput, OrderListFilter {
  readonly actorRole: PlatformRole;
  /** The actor's live `ACTIVE` membership company ids (never trust a stale cache — see apps/web/src/server/session.ts). */
  readonly actorCompanyIds: readonly string[];
  /** An explicit, actor-chosen company filter — never a silently-picked default. */
  readonly companyId?: string;
}

/**
 * ACC-003/ORD-008: the multi-company customer order list/detail
 * authorization model in one place, directly unit-testable (the previous
 * approach duplicated this narrowing logic separately in the API route and
 * the account page). A manager/admin (`order.read.all`) sees every company;
 * a customer sees every `ACTIVE` company they belong to by default — never
 * silently narrowed to one — or, if they explicitly filter by `companyId`,
 * exactly that company, but only when it is one of their own live
 * memberships. Requesting a company outside that set is
 * `AccessDeniedError`, identical to any other unauthorized resource — an
 * unauthorized company is never distinguishable from an unknown one via a
 * different error shape.
 */
export async function listOrdersForActor(
  orderRepo: Pick<OrderRepository, 'listAll'>,
  input: ListOrdersForActorInput,
): Promise<Page<OrderWithLines>> {
  const { actorRole, actorCompanyIds, companyId, ...filter } = input;

  if (hasPermission(actorRole, 'order.read.all')) {
    return orderRepo.listAll({
      ...filter,
      ...(companyId !== undefined ? { companyIds: [companyId] } : {}),
    });
  }

  if (companyId !== undefined) {
    if (!actorCompanyIds.includes(companyId)) {
      throw new AccessDeniedError(
        'The requested company is not one of the caller’s active memberships.',
        { companyId },
      );
    }
    return orderRepo.listAll({ ...filter, companyIds: [companyId] });
  }

  return orderRepo.listAll({ ...filter, companyIds: actorCompanyIds });
}
