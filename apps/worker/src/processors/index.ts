import type { QueueName } from '@snapshare/config';
import type { JobProcessor, Logger } from '@snapshare/server-kit';
import { z } from 'zod';
import type { Mailer } from '../email/mailer.js';
import { renderEmail } from '../email/templates.js';

export interface ProcessorDeps {
  logger: Logger;
  /** Present when the notify role runs (main.ts builds it from SMTP_* env). */
  mailer?: Mailer;
}

export type ProcessorFactory = (deps: ProcessorDeps) => JobProcessor<unknown>;

const emailJob = z.object({
  template: z.enum(['verify_email', 'account_exists', 'password_reset', 'password_changed']),
  to: z.email(),
  locale: z.enum(['en', 'hi']),
  data: z.record(z.string(), z.string().max(2048)),
});

/**
 * Implemented job processors. Queues without a processor are not consumed:
 * their jobs wait safely in Redis until the phase that implements them
 * (media → Phase 3, ai → Phase 4, other notify channels → Phase 5, billing → Phase 6).
 */
export const PROCESSORS: Partial<Record<QueueName, ProcessorFactory>> = {
  // Transactional email (Phase 2A). Retries/backoff/DLQ come from the queue registry.
  'notify.email': ({ logger, mailer }) => {
    if (!mailer) throw new Error('notify.email needs a mailer (SMTP_* env)');
    return async (job) => {
      const parsed = emailJob.safeParse(job.data);
      if (!parsed.success) {
        // A malformed payload will never succeed: fail without leaking its content.
        throw new Error(`invalid email job: ${parsed.error.issues.map((i) => i.path).join(',')}`);
      }
      await mailer.send(parsed.data.to, renderEmail(parsed.data));
      // Never log the address or links (tokens): only what was sent, not to whom.
      logger.info({ jobId: job.id, template: parsed.data.template }, 'email sent');
      return { sent: true };
    };
  },

  // Test-only queue used to verify the pipeline end to end (refused in production).
  'system.ping':
    ({ logger }) =>
    async (job) => {
      logger.info({ jobId: job.id }, 'pong');
      return { pong: true };
    },
};
