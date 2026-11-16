import type { QueueName } from '@snapshare/config';
import type { JobProcessor, Logger } from '@snapshare/server-kit';

export type ProcessorFactory = (deps: { logger: Logger }) => JobProcessor<unknown>;

/**
 * Implemented job processors. Queues without a processor are not consumed:
 * their jobs wait safely in Redis until the phase that implements them
 * (media → Phase 3, ai → Phase 4, notify → Phase 5, billing → Phase 6).
 */
export const PROCESSORS: Partial<Record<QueueName, ProcessorFactory>> = {
  // Test-only queue used to verify the pipeline end to end (refused in production).
  'system.ping':
    ({ logger }) =>
    async (job) => {
      logger.info({ jobId: job.id }, 'pong');
      return { pong: true };
    },
};
