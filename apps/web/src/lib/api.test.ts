import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, pageQuery } from './api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  document.cookie = 'csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('apiFetch', () => {
  it('sends cookies and adds the CSRF header only on state-changing requests', async () => {
    document.cookie = 'csrf=tok%3D123';
    fetchMock.mockImplementation(async () => json(200, { ok: true }));

    await apiFetch('/things');
    const [url, getInit] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/things');
    expect(getInit.credentials).toBe('include');
    expect(new Headers(getInit.headers).has('X-CSRF-Token')).toBe(false);

    await apiFetch('/things', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const [, postInit] = fetchMock.mock.calls[1]!;
    const headers = new Headers(postInit.headers);
    expect(headers.get('X-CSRF-Token')).toBe('tok=123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('turns problem+json into ApiError', async () => {
    fetchMock.mockResolvedValue(
      json(
        422,
        { title: 'Storage full', status: 422, code: 'QUOTA_EXCEEDED', requestId: 'req_1' },
        'application/problem+json',
      ),
    );
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('QUOTA_EXCEEDED');
    expect((err as ApiError).problem.requestId).toBe('req_1');
  });

  it('reports network failures as an offline error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await apiFetch('/x').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/offline/);
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/x', { method: 'DELETE' })).toBeUndefined();
  });
});

describe('pageQuery', () => {
  it('builds cursor pagination params', () => {
    expect(pageQuery(null, 20)).toBe('?limit=20');
    expect(pageQuery('abc.def', 50)).toBe('?limit=50&cursor=abc.def');
  });
});
