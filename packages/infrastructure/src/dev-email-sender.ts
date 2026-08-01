import type { EmailMessage, EmailSender } from '@eramix/application';
import type { Logger } from './logger.js';

/**
 * Console/log-based EmailSender — the real provider is blocked on
 * Q-06/ADR-0007 (hosting/email decision not yet made). This adapter lets
 * the outbox worker's dispatch loop be implemented and tested now; it must
 * never be used in a real production deployment (it does not actually
 * deliver mail). Logs only the recipient/subject, never the message body,
 * consistent with "never log ... unnecessary PII".
 */
export class DevEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  send(message: EmailMessage): Promise<void> {
    this.logger.log('info', 'dev_email_sender_dispatch', {
      to: message.to,
      subject: message.subject,
    });
    return Promise.resolve();
  }
}
