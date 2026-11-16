import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Paths never written to logs (SECURITY §3.5: no secrets, PII or embeddings in logs).
 * Request bodies are not logged at all; these cover headers and structured fields.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.secret',
  '*.otp',
  '*.pin',
  '*.embedding',
  '*.vector',
];

export interface LoggerConfig {
  service: string;
  level: LoggerOptions['level'];
  pretty?: boolean;
}

export function createLogger({ service, level, pretty }: LoggerConfig): Logger {
  return pino({
    level,
    base: { service },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type { Logger };
