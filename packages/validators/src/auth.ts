import { z } from 'zod';
import { email } from './primitives.js';

/**
 * Request bodies for the auth endpoints (API_SPEC §2.1). Shared by the API
 * (validation) and the web forms (React Hook Form), so both enforce the same rules.
 */

/**
 * NIST SP 800-63B: length over composition rules. The upper bound caps argon2 work
 * per request (a 1 MB "password" must not cost a CPU-second to hash).
 */
export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const personName = z.string().trim().min(1, 'Enter your name').max(100);

export const locale = z.enum(['en', 'hi']);

/** Cloudflare Turnstile response token (opaque, up to 2 KB). */
export const turnstileToken = z.string().min(1).max(2048);

/** Opaque one-time tokens from emailed links (base64url, 43 chars for 32 bytes). */
export const linkToken = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Invalid link');

export const signupBody = z.object({
  name: personName,
  email,
  password,
  locale: locale.default('en'),
  turnstileToken,
});

export const loginBody = z.object({
  email,
  // Login never applies the length rule: old or imported passwords must still verify.
  password: z.string().min(1).max(128),
  turnstileToken: turnstileToken.optional(),
});

export const emailOnlyBody = z.object({ email, turnstileToken: turnstileToken.optional() });

export const forgotPasswordBody = z.object({ email, turnstileToken });

export const verifyEmailBody = z.object({ token: linkToken });

export const resetPasswordBody = z.object({ token: linkToken, password });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const updateMeBody = z
  .object({
    name: personName,
    locale,
    timezone: z.string().min(1).max(64),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
