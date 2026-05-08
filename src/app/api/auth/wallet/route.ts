import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifySiweMessage,
  type MiniAppWalletAuthSuccessPayload,
} from "@worldcoin/minikit-js";
import { supabaseAdmin } from "@/lib/supabase";
import { issueAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from "@/lib/constants";
import { createHmac } from "crypto";

/**
 * Q3 (2026-04-19): future-proof completion tracking.
 * Returns the list of question_ids this wallet has already voted on so the
 * client can persist "completion progress" across sessions and detect when
 * all available questions are exhausted (whether the pool is 30 today or
 * 60 tomorrow). Uses the same HMAC nullifier scheme as /api/vote so we can
 * look up votes by wallet without storing wallet addresses on tc_votes.
 */
function walletNullifier(address: string): string | null {
  const secret = process.env.NULLIFIER_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret)
    .update(`turingvote-vote:${address.toLowerCase()}`)
    .digest("hex");
}

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
 * This route is the **only** login surface in TuringVote. The previous
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

    // C5: TuringVote は 2択投票アプリであり、Daily Predict 時代の
    // total_predictions / total_correct / streak / best_streak / points /
    // last_correct_date は一切使わない。Worldcoin 審査で "なぜ vote app に
    // prediction schema が残っているのか" を説明できないため、アプリから
    // これらの列を参照しない。migration (supabase/migrations/20260419_tc_users_drop_prediction_columns.sql)
    // で DDL レベルでも列を DROP する予定だが、適用前後のどちらでも
    // この select が壊れないよう、最小列だけに絞っている。
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("address, display_name, orb_verified_at")
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
      .select("address, display_name, created_at, orb_verified_at")
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

    // Mint an HMAC session token bound to the wallet address. The same token
    // format powers every authenticated route (predict / profile / leaderboard /
    // events / predict-check), so no other endpoint needs to change.
    const auth_token = issueAuthToken(walletAddress);

    logInfo("api/auth/wallet", "wallet auth success", {
      addressPrefix: walletAddress.slice(0, 6),
    });

    // Q3: fetch this wallet's previously voted question_ids so the client
    // can resume completion progress across sessions / device reinstalls.
    // Looks up tc_votes by HMAC nullifier (same scheme as /api/vote).
    let votedQuestionIds: number[] = [];
    const nullifier = walletNullifier(walletAddress);
    if (nullifier) {
      const { data: voted } = await supabaseAdmin
        .from("tc_votes")
        .select("question_id")
        .eq("nullifier_hash", nullifier);
      if (voted) {
        votedQuestionIds = voted.map((row) => row.question_id);
      }
    }

    // HttpOnly Cookie でセッショントークンを発行(localStorage より XSS 耐性が高い)
    // クライアント JS からは読めず、同一オリジン API が自動で送ってくれる
    // Q1 B+: include orb_verified flag so client knows whether to trigger
    // first-time Orb verify dialog after walletAuth completes.
    // Q3: include voted_question_ids so client can detect "all done" state.
    const res = NextResponse.json({
      success: true,
      user: {
        ...user,
        orb_verified: !!user?.orb_verified_at,
        voted_question_ids: votedQuestionIds,
      },
    });
    res.cookies.set(AUTH_COOKIE_NAME, auth_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
    return res;
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

/**
 * DELETE /api/auth/wallet
 *
 * 2026-04-27 reject fix: SummaryDialog の "Exit" ボタンから呼ばれる明示的な
 * sign-out。HttpOnly cookie tv_auth を maxAge=0 で expire させ、サーバー側の
 * 認証 trail も完全に切り離す。これにより Exit 後は次の API 呼び出しで
 * 確実に未認証状態になり、reviewer の「exit したのに状態が残っている」と
 * いう疑念を排除する。
 *
 * client (AppProvider.signOut) は fire-and-forget。失敗しても client state は
 * 既にリセット済みなので exit UX としては成立する(server fall-back のみ)。
 */
export async function DELETE() {
  logInfo("api/auth/wallet", "sign-out (cookie clear)");
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
