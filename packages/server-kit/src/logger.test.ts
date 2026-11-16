import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logger.js';

describe('logger redaction', () => {
  it('never writes secrets, credentials or embeddings', () => {
    let out = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        out += chunk.toString();
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink);
    log.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'at=jwt', 'x-csrf-token': 'csrf' } },
        user: { password: 'hunter2', otp: '123456' },
        face: { embedding: [0.1, 0.2] },
      },
      'hello',
    );
    for (const leaked of ['Bearer abc', 'at=jwt', 'csrf"', 'hunter2', '123456', '0.1']) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[redacted]');
  });
});
