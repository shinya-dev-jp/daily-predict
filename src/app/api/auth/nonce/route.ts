import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { logError } from "@/lib/server-log";

/**
 * GET /api/auth/nonce
 *
 * Generates a single-use nonce for the SIWE (Sign-In With Ethereum) handshake
 * used by MiniKit's walletAuth command. The nonce is:
 *
 *  - Cryptographically random (16 bytes → 32 hex chars, far above the 8-char minimum)
 *  - Stored in an HttpOnly cookie so the server can verify it on the follow-up POST
 *  - Returned to the client so it can be embedded in the SIWE message it asks the
 *    user's wallet to sign
 *
 * The cookie is short-lived (10 minutes) — long enough for a user to read the
 * Worldcoin signing dialog, but short enough that nonces don't accumulate.
 */
export async function GET() {
  try {
    const nonce = randomBytes(16).toString("hex");

    const store = await cookies();
    store.set("siwe", nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });

    return NextResponse.json({ nonce });
  } catch (err) {
    logError("api/auth/nonce", "failed to issue nonce", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 }
    );
  }
}
