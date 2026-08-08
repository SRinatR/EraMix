/**
 * Visual-only status label — never a substitute for the underlying value,
 * which every caller still renders/reads as plain text/data elsewhere
 * (audit trails, API responses). Purely additive styling, no behavior.
 */
const TONE_BY_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | undefined> = {
  // Order statuses (packages/domain OrderStatus)
  DRAFT: undefined,
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  WAITING_CONFIRMATION: 'warning',
  CONFIRMED: 'warning',
  IN_PREPARATION: 'warning',
  READY_FOR_PICKUP: 'warning',
  READY_FOR_DELIVERY: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  // Publication statuses (packages/domain PublicationStatus)
  PUBLISHED: 'success',
  ARCHIVED: undefined,
};

export function StatusBadge({ status }: { readonly status: string }) {
  const tone = TONE_BY_STATUS[status];
  return (
    <span className="badge" data-tone={tone}>
      {status}
    </span>
  );
}
