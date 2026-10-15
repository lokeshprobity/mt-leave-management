import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface VerifiedSessionClaims {
  userId: number;
  username: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
}

function getSigningKey(): string {
  const key = process.env.MT_LEAVE_SESSION_HMAC_KEY?.trim();
  if (!key || key.length < 32) {
    throw new Error('MT_LEAVE_SESSION_HMAC_KEY must be configured with at least 32 characters.');
  }
  return key;
}

function sign(body: string): string {
  return createHmac('sha256', getSigningKey()).update(body).digest('base64url');
}

export function createSessionToken(user: {
  userId: number;
  username: string;
  role: string;
}): { sessionToken: string; expiresAt: number } {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;
  const claims = {
    userId: user.userId,
    username: user.username.trim(),
    role: user.role.trim().toUpperCase(),
    issuedAt,
    expiresAt,
    nonce: randomBytes(16).toString('base64url'),
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const body = `mts2.${encodedClaims}`;
  return {
    sessionToken: `${body}.${sign(body)}`,
    expiresAt,
  };
}

export function verifySessionToken(token: string | undefined | null): VerifiedSessionClaims | null {
  try {
    if (typeof token !== 'string' || !token.trim()) return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'mts2' || !parts[1] || !parts[2]) return null;

    const body = `${parts[0]}.${parts[1]}`;
    const expected = Buffer.from(sign(body), 'utf8');
    const supplied = Buffer.from(parts[2], 'utf8');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isInteger(parsed.userId) || parsed.userId <= 0) return null;
    if (typeof parsed.username !== 'string' || !parsed.username.trim()) return null;
    if (typeof parsed.role !== 'string' || !/^[A-Z0-9_]+$/.test(parsed.role)) return null;
    if (!Number.isFinite(parsed.issuedAt) || !Number.isFinite(parsed.expiresAt)) return null;
    if (parsed.issuedAt > Date.now() + 60_000 || parsed.expiresAt <= Date.now()) return null;
    if (parsed.expiresAt <= parsed.issuedAt || parsed.expiresAt - parsed.issuedAt > SESSION_TTL_MS) return null;
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length < 16) return null;

    return {
      userId: parsed.userId,
      username: parsed.username,
      role: parsed.role,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
