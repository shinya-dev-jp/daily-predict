import { NextRequest, NextResponse } from "next/server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

/**
 * POST /api/auth/verify-orb
 *
 * One-time Orb verification gate (B+ implementation, 2026-04-19 Q1).
 *
 * Flow:
 *   1. Client (after walletAuth) calls MiniKit.commandsAsync.verify({
 *        action: NEXT_PUBLIC_WLD_ACTION,
 *        signal: walletAddress,
 *        verification_level: VerificationLevel.Orb,
 *      })
 *   2. Client POSTs the resulting verify_payload here.
 *   3. We forward to developer.world.org /api/v4/verify/{app_id} with
 *      signal=walletAddress (so each wallet gets exactly one nullifier
 *      from the same Orb-verified human).
 *   4. On success, set users.orb_verified_at = NOW() for the wallet.
 *
 * Why this exists:
 *   - walletAuth alone proves "I control this wallet" (★1 Sybil — wallets
 *     can be created infinitely).
 *   - This endpoint requires one-time Orb proof per wallet, lifting Sybil
 *     resistance to ★3 (one Orb-verified human per wallet) without paying
 *     the per-vote auth dialog tax.
 *   - Subsequent vote requests succeed via cookie alone because /api/vote
 *     checks users.orb_verified_at IS NOT NULL.
 *
 * Re-verification:
 *   - Idempotent. Calling this endpoint with a fresh proof simply refreshes
 *     orb_verified_at. Useful if Worldcoin ever invalidates the original
 *     proof or the user wants to re-prove humanity on a new device.
 */
type VerifyPayload = {
  verification_level?: "orb" | "device";
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
};

export async function POST(req: NextRequest) {
  // Origin check is intentionally lighter here than /api/vote because the
  // worst-case attack is "force a user to verify humanity" which costs
  // nothing — no value to steal. We still require a valid auth cookie.
  const authToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!authToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  const walletAddress = verifyAuthToken(authToken);
  if (!walletAddress) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  let body: { verify_payload?: VerifyPayload };
  try {
    body = (await req.json()) as { verify_payload?: VerifyPayload };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = body.verify_payload;
  if (!payload || !payload.merkle_root || !payload.nullifier_hash || !payload.proof) {
    return NextResponse.json({ error: "missing verify_payload" }, { status: 400 });
  }

  // Worldcoin requires Orb-level verification for "Verified Humans Only" apps
  if (payload.verification_level !== "orb") {
    return NextResponse.json(
      { error: "orb verification required" },
      { status: 400 },
    );
  }

  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "turingvote-vote";
  if (!appId) {
    logError("api/auth/verify-orb", "NEXT_PUBLIC_WLD_APP_ID missing");
    return NextResponse.json({ error: "server_misconfig" }, { status: 500 });
  }

  // signal = walletAddress so the same Orb-verified human always produces the
  // same nullifier_hash for THIS wallet. If they re-verify with a different
  // wallet, they get a different nullifier_hash — that's intentional (each
  // wallet must independently prove humanity).
  const signalHash = hashSignal(walletAddress);

  try {
    const res = await fetch(`https://developer.world.org/api/v4/verify/${appId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol_version: "3.0",
        nonce: signalHash,
        action,
        responses: [
          {
            identifier: "orb",
            merkle_root: payload.merkle_root,
            nullifier: payload.nullifier_hash,
            proof: payload.proof,
            signal_hash: signalHash,
          },
        ],
      }),
    });
    const json = await res.json();
    if (json?.success !== true) {
      logError("api/auth/verify-orb", "v4 verify rejected", {
        addressPrefix: walletAddress.slice(0, 6),
        code: json?.code,
      });
      return NextResponse.json(
        { error: "verification_failed", reason: json?.code ?? "unknown" },
        { status: 400 },
      );
    }
  } catch (err) {
    logError("api/auth/verify-orb", "v4 verify fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "verification_unreachable" }, { status: 502 });
  }

  // Persist orb_verified_at on the user row
  const { error: updateErr } = await supabaseAdmin
    .from("users")
    .update({ orb_verified_at: new Date().toISOString() })
    .eq("address", walletAddress);

  if (updateErr) {
    logError("api/auth/verify-orb", "users update failed", {
      code: updateErr.code,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  logInfo("api/auth/verify-orb", "orb verified", {
    addressPrefix: walletAddress.slice(0, 6),
  });
  return NextResponse.json({ success: true, orb_verified: true });
}
