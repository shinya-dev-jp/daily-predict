import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySiweMessage,
  type MiniAppWalletAuthSuccessPayload,
} from "@worldcoin/minikit-js";
import { supabaseAdmin } from "@/lib/supabase";
import { issueAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";

/**
 * POST /api/auth/wallet
 *
 * Completes the SIWE handshake started by /api/auth/nonce. The client sends:
 *
 *   { payload: MiniAppWalletAuthSuccessPayload, nonce: string }
 *
 * We verify:
 *  1. The nonce matches the cookie set during /api/auth/nonce (replay protection)
 *  2. The signature in `payload` is a valid SIWE signature for `payload.address`,
 *     produced by the user's wallet via MiniKit.walletAuth
 *
 * On success we upsert a `users` row keyed by the wallet address and mint the
 * same HMAC session token (`auth_token`) that the rest of the app already
 * understands — so all downstream endpoints (predict / profile / leaderboard /
 * predict-check / events) keep working without changes.
 *
 * This route is the **only** login surface in Daily Predict. The previous
 * IDKit-based /api/verify route was rejected by the World App review team
 * ("use wallet auth to login"); this is its replacement.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { payload?: MiniAppWalletAuthSuccessPayload; nonce?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { payload, nonce } = body;
    if (!payload || typeof payload !== "object" || !nonce) {
      return NextResponse.json(
        { success: false, error: "Missing payload or nonce" },
        { status: 400 }
      );
    }

    // ── Replay protection: nonce must match the one we stored in the cookie
    const store = await cookies();
    const cookieNonce = store.get("siwe")?.value;
    if (!cookieNonce || cookieNonce !== nonce) {
      logInfo("api/auth/wallet", "nonce mismatch");
      return NextResponse.json(
        { success: false, error: "Invalid or expired nonce" },
        { status: 400 }
      );
    }

    // ── Verify SIWE signature using MiniKit's helper
    let verification: { isValid: boolean };
    try {
      verification = await verifySiweMessage(payload, nonce);
    } catch (err) {
      logError("api/auth/wallet", "verifySiweMessage threw", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { success: false, error: "Signature verification failed" },
        { status: 400 }
      );
    }

    if (!verification.isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid signature" },
        { status: 400 }
      );
    }

    // ── Normalize wallet address (lowercase, must start with 0x and be 42 chars)
    const rawAddress = payload.address;
    if (
      typeof rawAddress !== "string" ||
      !/^0x[a-fA-F0-9]{40}$/.test(rawAddress)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address" },
        { status: 400 }
      );
    }
    const walletAddress = rawAddress.toLowerCase();

    // ── Burn the nonce so it cannot be replayed
    store.delete("siwe");

    // ── Derive a friendly default display name from the address
    const defaultName = `#${walletAddress.slice(2, 8)}`;

    // First check if the user already exists so we don't clobber a custom display_name
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("address, display_name")
      .eq("address", walletAddress)
      .maybeSingle();

    const upsertPayload: { address: string; display_name?: string } = {
      address: walletAddress,
    };
    if (!existing || !existing.display_name || existing.display_name === "Predictor") {
      upsertPayload.display_name = defaultName;
    }

    const { data: user, error: upsertErr } = await supabaseAdmin
      .from("users")
      .upsert(upsertPayload, { onConflict: "address", ignoreDuplicates: false })
      .select(
        "address, display_name, total_predictions, total_correct, streak, best_streak, points, created_at"
      )
      .single();

    if (upsertErr) {
      logError("api/auth/wallet", "supabase upsert failed", {
        code: upsertErr.code,
      });
      return NextResponse.json(
        { success: false, error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    const accuracy =
      user.total_predictions > 0
        ? Math.round((user.total_correct / user.total_predictions) * 100)
        : 0;

    // Mint an HMAC session token bound to the wallet address. The same token
    // format powers every authenticated route (predict / profile / leaderboard /
    // events / predict-check), so no other endpoint needs to change.
    const auth_token = issueAuthToken(walletAddress);

    logInfo("api/auth/wallet", "wallet auth success", {
      addressPrefix: walletAddress.slice(0, 6),
    });

    return NextResponse.json({
      success: true,
      auth_token,
      user: { ...user, accuracy, badges: [] },
    });
  } catch (err) {
    logError("api/auth/wallet", "unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
