import { createHash, createHmac } from 'node:crypto';

/**
 * Node side of ai-service authentication (AI_ARCHITECTURE §10). Must stay byte-for-byte
 * compatible with apps/ai-service/app/security.py; both are pinned to
 * tooling/contracts/ai-signing-vectors.json.
 */

export type AiScope =
  | { scopeType: 'studio'; scopeId: string; eventId: string }
  | { scopeType: 'personal'; scopeId: string; personalAlbumIds: string[] };

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** JSON with recursively sorted keys and no whitespace (matches Python `sort_keys=True`). */
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k]!)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const hmacHex = (key: string, message: string) =>
  createHmac('sha256', key).update(message).digest('hex');

export function signAiRequest(
  key: string,
  req: { timestamp: string; method: string; path: string; body: string },
): string {
  const digest = createHash('sha256').update(req.body).digest('hex');
  return hmacHex(key, `${req.timestamp}\n${req.method.toUpperCase()}\n${req.path}\n${digest}`);
}

export function signAiScope(key: string, scope: AiScope): string {
  return hmacHex(key, canonicalJson(scope));
}

/** Headers for a request to ai-service. `body` must be the exact bytes sent. */
export function aiRequestHeaders(
  key: string,
  method: string,
  path: string,
  body: string,
  now: number = Date.now(),
): Record<string, string> {
  const timestamp = String(Math.floor(now / 1000));
  return {
    'x-service-timestamp': timestamp,
    'x-service-signature': signAiRequest(key, { timestamp, method, path, body }),
  };
}
