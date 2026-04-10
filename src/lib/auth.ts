import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Lightweight HMAC-based session token for Daily Predict.
 *
 * Why this exists
 * ───────────────
 * The /api/verify endpoint validates a World ID proof and learns the caller's
 * nullifier_hash. Subsequent requests (vote, profile, leaderboard "is me?")
 * need to know which user is calling. The naive approach — letting the client
 * send the nullifier in every request — lets anyone spoof another user, since
 * nullifier hashes leak through public surfaces (e.g. leaderboard rows).
 *
 * Instead, /api/verify mints a short-lived HMAC token bound to the nullifier
 * and an expiry. The client stores it in localStorage and forwards it in an
 * `Authorization: Bearer dp.<nullifier>.<expSec>.<sig>` header (or as
 * `auth_token` in the request body for sendBeacon-friendly POSTs).
 *
 * Server endpoints call `authenticate(req)` to recover a verified nullifier.
 *
 * Security properties
 * ───────────────────
 *  - Server-only secret (DP_AUTH_SECRET). Cannot be forged by clients.
 *  - Constant-time signature comparison (timingSafeEqual).
 *  - Built-in expiry (default 30 days, configurable via TTL_SECONDS).
 *  - Stateless: no DB lookup, scales to any serverless instance.
 *  - Token format is opaque to clients — they just round-trip it.
 *
 * Rotation
 * ────────
 * To invalidate all existing tokens, rotate DP_AUTH_SECRET. Users will be
 * re-prompted to verify with World ID on their next request.
 */

const TOKEN_PREFIX = "dp1";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  // DP_AUTH_SECRET is the dedicated key. CRON_SECRET is a safe fallback so
  // local dev / preview deploys keep working before the new env var is set.
  const secret = process.env.DP_AUTH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("DP_AUTH_SECRET (or fallback CRON_SECRET) not configured");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/**
 * Mint a token for a verified nullifier_hash. Call this from /api/verify
 * after the World ID proof is confirmed.
 */
export function issueAuthToken(nullifierHash: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${TOKEN_PREFIX}.${nullifierHash}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a token and return the embedded nullifier_hash, or null on any
 * failure (invalid format, bad signature, expired). Constant-time comparison.
 */
export function verifyAuthToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [prefix, nullifier, expStr, sig] = parts;
  if (prefix !== TOKEN_PREFIX) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;

  const expectedSig = sign(`${prefix}.${nullifier}.${exp}`);

  // Constant-time compare
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "hex");
    expBuf = Buffer.from(expectedSig, "hex");
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  return nullifier;
}

/**
 * Extract and verify the auth token from a NextRequest.
 *
 * Looks in (in order):
 *  1. Authorization: Bearer <token>
 *  2. x-dp-auth header
 *
 * For POST endpoints that accept token in the body, callers should pass it
 * to verifyAuthToken() directly after parsing the body.
 *
 * Returns the verified nullifier_hash, or null.
 */
export function authenticateRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyAuthToken(authHeader.slice("Bearer ".length).trim());
  }
  const xAuth = req.headers.get("x-dp-auth");
  if (xAuth) {
    return verifyAuthToken(xAuth);
  }
  return null;
}
