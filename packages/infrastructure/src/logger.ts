export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
}

/**
 * Structured JSON logger (CLAUDE.md: "structured JSON logs" with trace
 * correlation, "no PII, secrets, or arbitrary URL payloads"). Callers pass
 * only named, deliberate fields (route, status, traceId, durationMs, ...) —
 * never a raw request/response body — so there is no redaction step here:
 * nothing sensitive is ever handed to it in the first place.
 */
export class JsonLogger implements Logger {
  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    const line = JSON.stringify({ level, msg: message, time: new Date().toISOString(), ...fields });
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
