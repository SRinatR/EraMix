import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@eramix/application';

export class CryptoIdGenerator implements IdGenerator {
  nextId(): string {
    return randomUUID();
  }
}
