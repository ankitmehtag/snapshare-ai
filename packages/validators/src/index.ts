import { z } from 'zod';

/** 24-char lowercase hex MongoDB ObjectId. */
export const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

/** Lowercased, trimmed email. */
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** E.164 phone number, e.g. +919876543210. */
export const phoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format');

/** Public share codes: random base62, 10–32 chars (DATABASE_SCHEMA §8). */
export const shareCode = z.string().regex(/^[A-Za-z0-9]{10,32}$/, 'Invalid code');

export const limitParam = (max = 200, defaultValue = 50) =>
  z.coerce.number().int().min(1).max(max).default(defaultValue);

export const paginationQuery = z.object({
  limit: limitParam(),
  cursor: z.string().max(512).optional(),
});
