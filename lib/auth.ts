import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "ledger_session";
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_SECONDS = 12 * 60 * 60;
export const ABSOLUTE_SECONDS = 365 * 24 * 60 * 60;
export const RENEW_WINDOW_SECONDS = 7 * 24 * 60 * 60;

type Session = {
  username: string;
  remember: boolean;
  issuedAt: number;
  expiresAt: number;
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) return null;
  return new TextEncoder().encode(value);
}

export function authConfigured() {
  return Boolean(process.env.APP_USERNAME && process.env.APP_PASSWORD_HASH && secret());
}

export function sessionCookieOptions(remember: boolean, maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE !== "false",
    sameSite: "lax" as const,
    path: "/",
    ...(remember && maxAge ? { maxAge } : {}),
  };
}

export async function createSessionToken(username: string, remember: boolean, originalIssuedAt?: number) {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = originalIssuedAt ?? now;
  const lifetime = remember ? REMEMBER_SECONDS : SESSION_SECONDS;
  const expiresAt = Math.min(now + lifetime, issuedAt + ABSOLUTE_SECONDS);
  if (expiresAt <= now) throw new Error("Session reached its absolute lifetime");
  const token = await new SignJWT({ remember, originalIssuedAt: issuedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuer("household-ledger")
    .setAudience("household-ledger-web")
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expiresAt, issuedAt };
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  const key = secret();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: "household-ledger",
      audience: "household-ledger-web",
    });
    if (!payload.sub || !payload.exp || typeof payload.originalIssuedAt !== "number") return null;
    if (payload.originalIssuedAt + ABSOLUTE_SECONDS <= Math.floor(Date.now() / 1000)) return null;
    return {
      username: payload.sub,
      remember: payload.remember === true,
      issuedAt: payload.originalIssuedAt,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
