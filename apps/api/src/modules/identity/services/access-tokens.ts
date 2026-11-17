import type { PlatformRole } from '@snapshare/types';
import {
  SignJWT,
  errors,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type CryptoKey,
  type JWTPayload,
} from 'jose';
import { TokenExpiredError, type AccessClaims } from '../../../kernel/auth.js';

export const ACCESS_TTL_SECONDS = 10 * 60;
const ALG = 'EdDSA';
const ISSUER = 'snapshare-api';
const AUDIENCE = 'snapshare-web';

export interface AccessTokens {
  sign(claims: AccessClaims): Promise<string>;
  verify(token: string): Promise<AccessClaims | null>;
}

export interface AccessTokenKeys {
  /** PKCS#8 PEM. When absent an ephemeral key is generated (dev/test only; env enforces). */
  privateKeyPem?: string;
  kid: string;
  /** Retired keys still accepted while their tokens can be alive (≤ 10 minutes). */
  previous?: Record<string, string>;
}

const decode = (b64?: string) => (b64 ? Buffer.from(b64, 'base64').toString('utf8') : undefined);

/** Reads the env representation: base64 PEM and base64 JSON of {kid: spkiPem}. */
export function keysFromEnv(env: {
  AUTH_JWT_PRIVATE_KEY?: string | undefined;
  AUTH_JWT_KEY_ID: string;
  AUTH_JWT_PREVIOUS_KEYS?: string | undefined;
}): AccessTokenKeys {
  const previousJson = decode(env.AUTH_JWT_PREVIOUS_KEYS);
  const privateKeyPem = decode(env.AUTH_JWT_PRIVATE_KEY);
  return {
    kid: env.AUTH_JWT_KEY_ID,
    ...(privateKeyPem ? { privateKeyPem } : {}),
    ...(previousJson ? { previous: JSON.parse(previousJson) as Record<string, string> } : {}),
  };
}

/**
 * Short-lived access JWTs (API_SPEC §1.2): Ed25519, `kid` header for rotation,
 * 10-minute expiry. Revocation is checked separately on every request.
 */
export async function createAccessTokens(keys: AccessTokenKeys): Promise<AccessTokens> {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  if (keys.privateKeyPem) {
    privateKey = await importPKCS8(keys.privateKeyPem, ALG, { extractable: true });
    // Derive the public half through a JWK round trip (Ed25519 public = `x`).
    const jwk = await crypto.subtle.exportKey('jwk', privateKey);
    publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
      { name: 'Ed25519' },
      true,
      ['verify'],
    );
  } else {
    ({ privateKey, publicKey } = await generateKeyPair(ALG, { crv: 'Ed25519' }));
  }

  const verifyKeys = new Map<string, CryptoKey>([[keys.kid, publicKey]]);
  for (const [kid, pem] of Object.entries(keys.previous ?? {})) {
    verifyKeys.set(kid, await importSPKI(pem, ALG));
  }

  return {
    sign(claims) {
      return new SignJWT({ sid: claims.sessionId, prole: claims.platformRole })
        .setProtectedHeader({ alg: ALG, kid: keys.kid })
        .setSubject(claims.userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
        .sign(privateKey);
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify<JWTPayload & { sid?: string; prole?: string }>(
          token,
          (header) => {
            const key = header.kid ? verifyKeys.get(header.kid) : undefined;
            if (!key) throw new errors.JWKSNoMatchingKey();
            return key;
          },
          { issuer: ISSUER, audience: AUDIENCE, algorithms: [ALG] },
        );
        if (!payload.sub || !payload.sid) return null;
        return {
          userId: payload.sub,
          sessionId: payload.sid,
          platformRole: (payload.prole as PlatformRole | undefined) ?? 'none',
        };
      } catch (err) {
        if (err instanceof errors.JWTExpired) throw new TokenExpiredError();
        return null;
      }
    },
  };
}

/** Used by tooling/docs: prints the env value pair for a new key. */
export async function newKeyPairPem(): Promise<{ privatePem: string; publicPem: string }> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, {
    crv: 'Ed25519',
    extractable: true,
  });
  return { privatePem: await exportPKCS8(privateKey), publicPem: await exportSPKI(publicKey) };
}
