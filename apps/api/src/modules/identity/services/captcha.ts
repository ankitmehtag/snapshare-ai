import type { Logger } from '@snapshare/server-kit';

export interface CaptchaVerifier {
  verify(token: string | undefined, ip: string | undefined): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile (free). Fails CLOSED: if Cloudflare can't be reached the
 * request is refused, because the captcha is exactly what stops automated abuse.
 */
export function turnstileVerifier(
  secret: string,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): CaptchaVerifier {
  return {
    async verify(token, ip) {
      if (!token) return false;
      try {
        const body = new URLSearchParams({ secret, response: token });
        if (ip) body.set('remoteip', ip);
        const res = await fetchImpl(SITEVERIFY, {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(5_000),
        });
        const data = (await res.json()) as { success?: boolean };
        return data.success === true;
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'turnstile verification unavailable');
        return false;
      }
    },
  };
}
