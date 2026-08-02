import {
  ResourceNotFoundError,
  ValidationFailedError,
  type CommentVisibility,
  type OrderComment,
  type PlatformRole,
} from '@eramix/domain';
import { assertOrderCompanyAccess, hasPermission, requirePermission } from './authorization.js';
import type { IdGenerator } from './ports.js';
import type {
  AuditEventRepository,
  OrderCommentRepository,
  OrderRepository,
} from './repositories.js';

export interface OrderCommentDeps {
  readonly orderRepo: OrderRepository;
  readonly commentRepo: OrderCommentRepository;
  readonly auditRepo: AuditEventRepository;
  readonly idGen: IdGenerator;
}

export interface AddOrderCommentInput {
  readonly orderId: string;
  readonly body: string;
  readonly visibility: CommentVisibility;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly actorCompanyIds: readonly string[];
  readonly traceId?: string;
}

/**
 * ORD-008 ("клиент видит... публичные комментарии менеджера") / ACC-004
 * (деталь заказа показывает комментарии) / TZ §6.6 (Менеджер: комментарии).
 * PUBLIC is visible to anyone with access to the order (customer on their
 * own company's order, manager/admin on any); INTERNAL is a manager/admin-
 * only note and requires `order.transition` — the same permission the
 * status-transition use case already gates on, so a customer can never write
 * or read one.
 */
export async function addOrderComment(
  deps: OrderCommentDeps,
  input: AddOrderCommentInput,
): Promise<OrderComment> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) {
    throw new ResourceNotFoundError(`Order ${input.orderId} not found.`, {
      orderId: input.orderId,
    });
  }
  assertOrderCompanyAccess(input.actorRole, input.actorCompanyIds, order.companyId);

  if (input.visibility === 'INTERNAL') {
    requirePermission(input.actorRole, 'order.transition');
  }

  const body = input.body.trim();
  if (body.length === 0) {
    throw new ValidationFailedError('Comment body must not be blank.', {
      orderId: input.orderId,
    });
  }

  const comment = await deps.commentRepo.create({
    id: deps.idGen.nextId(),
    orderId: input.orderId,
    authorId: input.actorUserId,
    visibility: input.visibility,
    body,
  });

  await deps.auditRepo.record({
    actorUserId: input.actorUserId,
    action: 'order.comment_added',
    entityType: 'Order',
    entityId: input.orderId,
    metadata: { commentId: comment.id, visibility: input.visibility },
    traceId: input.traceId,
  });

  return comment;
}

/** A CUSTOMER (or anyone lacking `order.transition`) never sees an INTERNAL comment — never filtered client-side, always here. */
export function visibleOrderComments(
  comments: readonly OrderComment[],
  actorRole: PlatformRole,
): readonly OrderComment[] {
  if (hasPermission(actorRole, 'order.transition')) {
    return comments;
  }
  return comments.filter((comment) => comment.visibility === 'PUBLIC');
}

export async function listOrderCommentsForActor(
  deps: Pick<OrderCommentDeps, 'orderRepo' | 'commentRepo'>,
  input: {
    readonly orderId: string;
    readonly actorRole: PlatformRole;
    readonly actorCompanyIds: readonly string[];
  },
): Promise<readonly OrderComment[]> {
  const order = await deps.orderRepo.findById(input.orderId);
  if (!order) {
    throw new ResourceNotFoundError(`Order ${input.orderId} not found.`, {
      orderId: input.orderId,
    });
  }
  assertOrderCompanyAccess(input.actorRole, input.actorCompanyIds, order.companyId);
  const comments = await deps.commentRepo.listByOrder(input.orderId);
  return visibleOrderComments(comments, input.actorRole);
}
