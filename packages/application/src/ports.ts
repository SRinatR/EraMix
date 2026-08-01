export interface Clock {
  now(): Date;
}

export interface UnitOfWork {
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
