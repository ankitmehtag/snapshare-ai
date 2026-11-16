import { describe, expect, it } from 'vitest';
import { email, objectId, phoneE164, shareCode } from './index.js';
import { decodeCursor, encodeCursor } from './server.js';

const SECRET = 'test-secret-at-least-32-characters-long';
const ID = '665f1c2e9b1e8a0012345678';

describe('primitives', () => {
  it('validates object ids', () => {
    expect(objectId.safeParse(ID).success).toBe(true);
    expect(objectId.safeParse('665F1C2E9B1E8A0012345678').success).toBe(false);
    expect(objectId.safeParse('123').success).toBe(false);
  });

  it('normalizes email', () => {
    expect(email.parse('  Rohan@LensStory.IN ')).toBe('rohan@lensstory.in');
    expect(email.safeParse('not-an-email').success).toBe(false);
  });

  it('validates E.164 phones and share codes', () => {
    expect(phoneE164.safeParse('+919876543210').success).toBe(true);
    expect(phoneE164.safeParse('9876543210').success).toBe(false);
    expect(shareCode.safeParse('aB3dE5fG7h').success).toBe(true);
    expect(shareCode.safeParse('short').success).toBe(false);
  });
});

describe('cursor', () => {
  it('round-trips a signed cursor', () => {
    const c = encodeCursor({ s: '2026-12-12T06:30:00.000Z', id: ID }, SECRET);
    expect(decodeCursor(c, SECRET)).toEqual({ s: '2026-12-12T06:30:00.000Z', id: ID });
  });

  it('rejects tampered or foreign cursors', () => {
    const c = encodeCursor({ s: 1, id: ID }, SECRET);
    const [body, sig] = c.split('.');
    const forged = Buffer.from(JSON.stringify({ s: 1, id: 'ffffffffffffffffffffffff' })).toString(
      'base64url',
    );
    expect(decodeCursor(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(decodeCursor(`${body}.${sig}`, 'another-secret-another-secret-xx')).toBeNull();
    expect(decodeCursor('garbage', SECRET)).toBeNull();
  });
});
