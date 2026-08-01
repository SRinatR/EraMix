export interface ErrorCatalogueEntry {
  readonly code: string;
  readonly status: readonly number[];
  readonly meaning: string;
}

export const ERROR_CATALOGUE = [
  { code: 'AUTH_REQUIRED', status: [401], meaning: 'Отсутствует действительная сессия' },
  { code: 'AUTH_CALLBACK_FAILED', status: [401], meaning: 'OIDC callback не прошёл проверку' },
  { code: 'ACCESS_DENIED', status: [403], meaning: 'Недостаточно permission' },
  {
    code: 'COMPANY_REQUIRED',
    status: [403, 409],
    meaning: 'Нет активной компании для B2B-действия',
  },
  {
    code: 'RESOURCE_NOT_FOUND',
    status: [404],
    meaning: 'Ресурс не найден либо скрыт политикой доступа',
  },
  { code: 'VALIDATION_FAILED', status: [422], meaning: 'Невалидные поля запроса' },
  {
    code: 'ORDER_STATE_CONFLICT',
    status: [409],
    meaning: 'Переход невозможен из текущего статуса',
  },
  {
    code: 'CONCURRENCY_CONFLICT',
    status: [409, 412],
    meaning: 'Ресурс изменён другой операцией',
  },
  {
    code: 'IDEMPOTENCY_CONFLICT',
    status: [409],
    meaning: 'Ключ повторно использован с другим payload',
  },
  {
    code: 'RATE_LIMITED',
    status: [429],
    meaning: 'Превышен лимит; Retry-After при возможности',
  },
  {
    code: 'DEPENDENCY_UNAVAILABLE',
    status: [503],
    meaning: 'Критическая зависимость временно недоступна',
  },
  { code: 'INTERNAL_ERROR', status: [500], meaning: 'Непредвиденная безопасно скрытая ошибка' },
  {
    code: 'SLUG_CONFLICT',
    status: [409],
    meaning: 'Slug уже занят текущим или историческим route в этой locale/type',
  },
  {
    code: 'LOCALE_NOT_SUPPORTED',
    status: [404, 422],
    meaning: 'Locale отсутствует в allowlist маршрута или входного контракта',
  },
  {
    code: 'CANONICAL_ROUTE_MISSING',
    status: [500],
    meaning: 'Нарушен внутренний инвариант опубликованного перевода; наружу безопасная ошибка',
  },
] as const satisfies readonly ErrorCatalogueEntry[];

export type ErrorCode = (typeof ERROR_CATALOGUE)[number]['code'];
