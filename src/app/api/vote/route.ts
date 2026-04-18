import { NextRequest, NextResponse } from "next/server";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";

type VerifyPayload = {
  verification_level?: "orb" | "device";
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
};

type VoteBody = {
  question_id: number;
  choice: "A" | "B";
  verify_payload?: VerifyPayload;
  auth_token?: string;
};

type VerifiedIdentity = {
  nullifier: string;
  tier: "orb_legacy" | "wallet_siwe";
};

/**
 * POST /api/vote
 *
 * Dual-path verification. Either path is sufficient to cast a vote:
 *
 *   Path A — Orb legacy (preferred):
 *     Client passes `verify_payload` from IDKit/MiniKit `verify` command.
 *     We forward it to developer.world.org /api/v4/verify/{app_id}.
 *     On success, the verified `nullifier_hash` is the vote identity.
 *
 *   Path B — Wallet SIWE (fallback):
 *     Client passes `auth_token` previously minted by /api/auth/wallet.
 *     We extract the wallet address from the HMAC token and use it as
 *     the identity (stored in the same nullifier_hash column).
 *
 * UNIQUE(nullifier_hash, question_id) in Supabase prevents double-voting.
 */
export async function POST(req: NextRequest) {
  let body: VoteBody;
  try {
    body = (await req.json()) as VoteBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { question_id, choice, verify_payload, auth_token } = body;

  if (typeof question_id !== "number" || !Number.isFinite(question_id)) {
    return NextResponse.json({ error: "missing or invalid question_id" }, { status: 400 });
  }
  if (choice !== "A" && choice !== "B") {
    return NextResponse.json({ error: "choice must be 'A' or 'B'" }, { status: 400 });
  }

  const identity = await resolveIdentity(question_id, verify_payload, auth_token);
  if (!identity) {
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }

  const { error } = await getSupabaseAdmin()
    .from("tc_votes")
    .insert({
      nullifier_hash: identity.nullifier,
      question_id,
      choice,
      verification_tier: identity.tier,
    });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "already_voted" }, { status: 409 });
    }
    logError("api/vote", "insert failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  logInfo("api/vote", "vote recorded", {
    question_id,
    choice,
    tier: identity.tier,
  });
  return NextResponse.json({ success: true, tier: identity.tier });
}

async function resolveIdentity(
  questionId: number,
  verifyPayload: VerifyPayload | undefined,
  authToken: string | undefined,
): Promise<VerifiedIdentity | null> {
  if (verifyPayload) {
    const ok = await verifyOrbLegacy(questionId, verifyPayload);
    if (ok) {
      return { nullifier: verifyPayload.nullifier_hash, tier: "orb_legacy" };
    }
  }

  if (authToken) {
    const address = verifyAuthToken(authToken);
    if (address) {
      return { nullifier: address, tier: "wallet_siwe" };
    }
  }

  return null;
}

async function verifyOrbLegacy(
  questionId: number,
  payload: VerifyPayload,
): Promise<boolean> {
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "turingvote-vote";
  if (!appId) {
    logError("api/vote", "NEXT_PUBLIC_WLD_APP_ID missing");
    return false;
  }

  const signalHash = hashSignal(String(questionId));
  const identifier = payload.verification_level === "device" ? "device" : "orb";

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
            identifier,
            merkle_root: payload.merkle_root,
            nullifier: payload.nullifier_hash,
            proof: payload.proof,
            signal_hash: signalHash,
          },
        ],
      }),
    });
    const json = await res.json();
    return json?.success === true;
  } catch (err) {
    logError("api/vote", "v4 verify fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
