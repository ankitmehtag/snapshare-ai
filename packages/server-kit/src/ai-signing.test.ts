import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aiRequestHeaders,
  canonicalJson,
  signAiRequest,
  signAiScope,
  type AiScope,
} from './ai-signing.js';

interface Vectors {
  requestKey: string;
  scopeKey: string;
  requests: { timestamp: string; method: string; path: string; body: string; signature: string }[];
  scopes: { scope: AiScope; canonical: string; signature: string }[];
}

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../tooling/contracts/ai-signing-vectors.json', import.meta.url),
    'utf8',
  ),
) as Vectors;

describe('ai-service signing (shared vectors with Python)', () => {
  it.each(vectors.requests)('signs $method $path like ai-service', (req) => {
    expect(signAiRequest(vectors.requestKey, req)).toBe(req.signature);
  });

  it.each(vectors.scopes)('canonicalises and signs a $scope.scopeType scope', (v) => {
    expect(canonicalJson(v.scope)).toBe(v.canonical);
    expect(signAiScope(vectors.scopeKey, v.scope)).toBe(v.signature);
  });

  it('builds headers from the current time', () => {
    const headers = aiRequestHeaders(
      vectors.requestKey,
      'GET',
      '/v1/models',
      '',
      1_763_337_600_999,
    );
    expect(headers['x-service-timestamp']).toBe('1763337600');
    expect(headers['x-service-signature']).toBe(vectors.requests[1]!.signature);
  });

  it('a widened scope does not keep the original signature', () => {
    const original = vectors.scopes[0]!;
    const widened = {
      scopeType: 'studio',
      scopeId: original.scope.scopeId,
      eventId: 'other',
    } as const;
    expect(signAiScope(vectors.scopeKey, widened)).not.toBe(original.signature);
  });
});
