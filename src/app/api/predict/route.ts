import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { logError } from "@/lib/server-log";
import {
  verifyCloudProof,
  VerificationLevel,
  type ISuccessResult,
  type IVerifyResponse,
} from "@worldcoin/minikit-js";

// ── Worldcoin Incognito Action proof verification ──────────────────────────
// Uses the official MiniKit SDK's verifyCloudProof to validate the proof,
// which correctly handles signal hashing and payload formatting.

async function verifyIncognitoAction(
  verifyPayload: Record<string, unknown>,
  signal: string
): Promise<{ nullifier_hash: string }> {
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "daily-predict-verify";

  if (!appId) {
    throw new Error("Missing NEXT_PUBLIC_WLD_APP_ID");
  }

  // Construct the proof object expected by verifyCloudProof
  const proof: ISuccessResult = {
    merkle_root: verifyPayload.merkle_root as string,
    nullifier_hash: verifyPayload.nullifier_hash as string,
    proof: verifyPayload.proof as string,
    verification_level: (verifyPayload.verification_level as VerificationLevel) ?? VerificationLevel.Orb,
  };

  const verifyRes = (await verifyCloudProof(
    proof,
    appId as `app_${string}`,
    action,
    signal
  )) as IVerifyResponse;

  if (!verifyRes.success) {
    throw new Error(
      `World verify failed: ${JSON.stringify(verifyRes)}`
    );
  }

  const nullifier = proof.nullifier_hash;
  if (!nullifier || typeof nullifier !== "string") {
    throw new Error("nullifier_hash missing from verify payload");
  }

  return { nullifier_hash: nullifier };
}

/**
 * POST /api/predict
 *
 * Submit a prediction (option A or B) for today's question.
 * Each user (identified by nullifier_hash) can only predict once per day.
 *
 * Authentication
 *   Required. Send the auth token issued by /api/verify in the
 *   `Authorization: Bearer <token>` header. The nullifier is derived from
 *   the verified token, NOT from the request body — this prevents vote
 *   spoofing using leaked nullifier hashes.
 *
 * Request body:
 *   { prediction_id: string, chosen_option: "A" | "B", verify_payload: object }
 *
 * Response (200):
 *   { success: true, option_a_percent, vote_count, chosen_option }
 */
export async function POST(req: NextRequest) {
  try {
    // ── Authentication: derive nullifier from signed token ───────────────────
    const nullifier_hash = authenticateRequest(req);
    if (!nullifier_hash) {
      return NextResponse.json(
        { success: false, error: "Unauthorized — please re-verify with World ID" },
        { status: 401 }
      );
    }

    // ── Parse JSON body explicitly so a malformed body returns 400, not 500 ──
    let body: { prediction_id?: unknown; chosen_option?: unknown; verify_payload?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const { prediction_id, chosen_option, verify_payload } = body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!prediction_id || !chosen_option || !verify_payload) {
      return NextResponse.json(
        { success: false, error: "Missing prediction_id, chosen_option, or verify_payload" },
        { status: 400 }
      );
    }

    // ── Server-side Orb proof verification ─────────────────────────────────
    let nullifier_hash_from_orb: string;
    try {
      const verified = await verifyIncognitoAction(
        verify_payload as Record<string, unknown>,
        prediction_id as string
      );
      nullifier_hash_from_orb = verified.nullifier_hash;
    } catch (err) {
      logError("api/predict", "World ID Orb verification failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { success: false, error: "World ID verification failed" },
        { status: 400 }
      );
    }

    // Type and length guards: prediction_id is a Supabase UUID (max 36 chars).
    // Reject anything longer to keep DB queries cheap and prevent garbage input
    // from triggering expensive lookups.
    if (typeof prediction_id !== "string" || prediction_id.length === 0 || prediction_id.length > 36) {
      return NextResponse.json(
        { success: false, error: "Invalid prediction_id format" },
        { status: 400 }
      );
    }

    if (chosen_option !== "A" && chosen_option !== "B") {
      return NextResponse.json(
        { success: false, error: "chosen_option must be 'A' or 'B'" },
        { status: 400 }
      );
    }

    // ── Verify prediction exists and is still open ───────────────────────────
    const { data: prediction, error: predErr } = await supabaseAdmin
      .from("predictions")
      .select("id, status, closes_at, vote_count, option_a_votes")
      .eq("id", prediction_id)
      .single();

    if (predErr || !prediction) {
      return NextResponse.json(
        { success: false, error: "Prediction not found" },
        { status: 404 }
      );
    }

    if (prediction.status !== "open") {
      return NextResponse.json(
        { success: false, error: "This prediction is no longer open" },
        { status: 409 }
      );
    }

    if (new Date(prediction.closes_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: "Prediction window has closed" },
        { status: 409 }
      );
    }

    // (User existence guaranteed by valid auth token — no extra DB round-trip)

    // ── Insert the user_prediction row ──────────────────────────────────────
    const { error: voteErr } = await supabaseAdmin
      .from("user_predictions")
      .insert({
        user_address: nullifier_hash,
        prediction_id,
        chosen_option,
        nullifier_hash: nullifier_hash_from_orb,
      });

    if (voteErr) {
      // Unique constraint (prediction_id, nullifier_hash) — same human already predicted
      if (voteErr.code === "23505") {
        return NextResponse.json(
          { success: false, error: "You have already predicted on this question" },
          { status: 409 }
        );
      }
      logError("api/predict", "insert user_prediction failed", { code: voteErr.code });
      return NextResponse.json(
        { success: false, error: "Failed to submit prediction" },
        { status: 500 }
      );
    }

    // ── Atomic update denormalized vote counters on predictions ──────────────
    const { data: updated, error: updateErr } = await supabaseAdmin.rpc(
      "increment_vote",
      { pred_id: prediction_id, is_option_a: chosen_option === "A" }
    );

    if (updateErr || !updated) {
      logError("api/predict", "increment_vote rpc failed", { code: updateErr?.code });
      return NextResponse.json({
        success: true,
        option_a_percent: 50,
        vote_count: prediction.vote_count + 1,
        chosen_option,
      });
    }

    // ── Atomic increment user.total_predictions ──────────────────────────────
    const { error: incErr } = await supabaseAdmin.rpc("increment_user_predictions", {
      user_addr: nullifier_hash,
    });
    if (incErr) {
      logError("api/predict", "increment_user_predictions rpc failed", { code: incErr.code });
    }

    const voteCount = updated.new_vote_count ?? prediction.vote_count + 1;
    const optionAVotes = updated.new_option_a_votes ?? prediction.option_a_votes + (chosen_option === "A" ? 1 : 0);
    const option_a_percent = voteCount > 0 ? Math.round((optionAVotes / voteCount) * 100) : 50;

    return NextResponse.json({
      success: true,
      option_a_percent,
      vote_count: voteCount,
      chosen_option,
    });
  } catch (err) {
    logError("api/predict", "unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
