/** Prisma's nullable Json columns come back as `JsonValue | null`; domain entities use `Record<string, unknown> | undefined`. */
export function nullableJsonToRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}
