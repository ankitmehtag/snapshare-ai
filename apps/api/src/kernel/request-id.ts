import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const VALID_INCOMING = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Request id for logs, traces and problem responses. An upstream id (from nginx)
 * is reused when well-formed; anything else is replaced to avoid log injection.
 */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && VALID_INCOMING.test(incoming)
      ? incoming
      : `req_${randomUUID().replaceAll('-', '')}`;
  res.setHeader('X-Request-Id', id);
  return id;
}
