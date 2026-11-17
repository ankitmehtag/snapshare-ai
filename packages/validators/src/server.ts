import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { objectId } from './primitives.js';

/**
 * Opaque, tamper-proof cursors (API_SPEC §1.4): base64url(JSON) + "." + HMAC.
 * The secret comes from config; never from the client.
 */
export interface CursorPayload {
  s: string | number;
  id: string;
}

export function encodeCursor(payload: CursorPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function decodeCursor(cursor: string, secret: string): CursorPayload | null {
  const [body, sig] = cursor.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const result = z
      .object({ s: z.union([z.string(), z.number()]), id: objectId })
      .safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
