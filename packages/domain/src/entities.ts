import type { IndicativePrice } from './indicative-price.js';
import type { LocaleCode } from './locale.js';

// Plain data shapes for Phase 1 aggregates (ADR-0001: domain entities/value
// objects only, zero framework dependency). Business-rule-bearing behaviour
// (order transitions, slug lifecycle, RBAC policy) lands in later phases;
// Phase 1 fixes the shape the schema, ports, and adapters agree on.

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type UserStatus = 'ACTIVE' | 'DISABLED';
/** See ADR-0014 (TZ §3.1 RBAC matrix). Distinct from CompanyRole. */
export type PlatformRole = 'CUSTOMER' | 'MANAGER' | 'CONTENT_EDITOR' | 'ADMIN' | 'AUDITOR';
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';
export type CompanyRole = 'OWNER' | 'MEMBER';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'REVOKED';
export type ContentType = 'ARTICLE' | 'PAGE' | 'FAQ_ITEM';
export type ContentRouteNamespace = 'ARTICLES' | 'PAGES';
export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';

/** Mirrors Prisma's OrderStatus enum (packages/infrastructure/prisma/schema.prisma). */
export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'WAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'IN_PREPARATION'
  | 'READY_FOR_PICKUP'
  | 'READY_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Versioned {
  readonly version: number;
}

export interface Timestamped {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface User extends Versioned, Timestamped {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly platformRole: PlatformRole;
}

export interface Company extends Versioned, Timestamped {
  readonly id: string;
  readonly legalName: string;
  readonly status: CompanyStatus;
  /** See docs/OPEN_QUESTIONS.md Q-09 — untyped pending a business decision. */
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface Membership extends Versioned, Timestamped {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: CompanyRole;
  readonly status: MembershipStatus;
}

export interface CategoryTranslation extends Timestamped {
  readonly id: string;
  readonly categoryId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface CategoryRoute {
  readonly id: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly slug: string;
  readonly isCanonical: boolean;
  readonly createdAt: Date;
}

export interface Category extends Versioned, Timestamped {
  readonly id: string;
  readonly parentId?: string | undefined;
  readonly status: PublicationStatus;
  readonly sortOrder: number;
}

export interface ProductTranslation extends Timestamped {
  readonly id: string;
  readonly productId: string;
  readonly locale: LocaleCode;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | undefined;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
  readonly indicativePrice?: IndicativePrice | undefined;
}

export interface Product extends Versioned, Timestamped {
  readonly id: string;
  readonly publicId: string;
  readonly sku: string;
  readonly categoryId: string;
  readonly status: PublicationStatus;
  readonly publishedAt?: Date | undefined;
}

export interface ContentTranslation extends Timestamped {
  readonly id: string;
  readonly contentId: string;
  readonly locale: LocaleCode;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly content: unknown;
  readonly seoTitle?: string | undefined;
  readonly seoDescription?: string | undefined;
}

export interface ContentRoute {
  readonly id: string;
  readonly translationId: string;
  readonly locale: LocaleCode;
  readonly namespace: ContentRouteNamespace;
  readonly slug: string;
  readonly isCanonical: boolean;
  readonly createdAt: Date;
}

export interface Content extends Versioned, Timestamped {
  readonly id: string;
  readonly type: ContentType;
  readonly status: PublicationStatus;
  readonly publishedAt?: Date | undefined;
}

export interface OrderLine {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly productNameSnapshot: string;
  readonly productSkuSnapshot: string;
  readonly quantity: number;
  readonly note?: string | undefined;
}

export interface OrderStatusHistoryEntry {
  readonly id: string;
  readonly orderId: string;
  readonly fromStatus?: OrderStatus | undefined;
  readonly toStatus: OrderStatus;
  readonly actorUserId?: string | undefined;
  readonly reason?: string | undefined;
  readonly createdAt: Date;
}

export interface Order extends Versioned, Timestamped {
  readonly id: string;
  readonly orderNumber: string;
  readonly companyId: string;
  readonly createdByUserId: string;
  readonly status: OrderStatus;
  readonly contactName?: string | undefined;
  readonly contactPhone?: string | undefined;
  readonly contactEmail?: string | undefined;
  readonly deliveryAddress?: Record<string, unknown> | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly submittedAt?: Date | undefined;
}

export interface AuditEvent {
  readonly id: string;
  readonly actorUserId?: string | undefined;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly traceId?: string | undefined;
  readonly createdAt: Date;
}

export interface OutboxMessage {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly availableAt: Date;
  readonly lastError?: string | undefined;
}
