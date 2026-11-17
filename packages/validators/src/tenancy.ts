import { z } from 'zod';
import { email, objectId } from './primitives.js';

/** Slugs that collide with app routes or could impersonate the platform. */
export const RESERVED_SLUGS = new Set([
  'account',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'blog',
  'dashboard',
  'docs',
  'forgot',
  'g',
  'help',
  'invite',
  'legal',
  'login',
  'logout',
  'mail',
  'me',
  'new',
  'onboarding',
  'p',
  'portfolio',
  'pricing',
  'report',
  'reset',
  'root',
  'settings',
  'signup',
  'snapshare',
  'static',
  'status',
  'studio',
  'studios',
  'support',
  'system',
  'verify',
  'www',
]);

/** 3–40 chars: lowercase letters, digits and single hyphens, not at either end. */
export const studioSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .min(3, 'Use at least 3 characters')
  .max(40, 'Use at most 40 characters')
  .refine((s) => !RESERVED_SLUGS.has(s), 'This address is reserved');

export const studioName = z.string().trim().min(2, 'Enter your studio name').max(80);

export const assignableRole = z.enum(['admin', 'editor', 'uploader', 'viewer']);
export const anyRole = z.enum(['owner', 'admin', 'editor', 'uploader', 'viewer']);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #4f46e5');
const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Indian GSTIN: 2-digit state + PAN + entity + Z + checksum. */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN');

export const createStudioBody = z.object({ name: studioName, slug: studioSlug });

export const updateStudioBody = z
  .object({
    name: studioName,
    contact: z
      .object({
        email: email.optional(),
        phone: optionalText(20),
        website: z.url().max(200).optional(),
        instagram: optionalText(60),
        address: optionalText(300),
      })
      .partial(),
    branding: z.object({ primaryColor: hexColor, accentColor: hexColor }).partial(),
    billingProfile: z
      .object({
        legalName: optionalText(150),
        gstin: gstin.optional(),
        stateCode: z
          .string()
          .regex(/^\d{2}$/)
          .optional(),
        address: optionalText(300),
      })
      .partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const inviteBody = z.object({ email, roleKey: assignableRole });
export const changeRoleBody = z.object({ roleKey: anyRole });
export const reauthBody = z.object({ password: z.string().min(1).max(128) });
export const transferOwnershipBody = z.object({
  userId: objectId,
  password: z.string().min(1).max(128),
});
