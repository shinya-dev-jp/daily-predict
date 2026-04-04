import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/predict
 *
 * Submit a prediction (option A or B) for today's question.
 * Each user (identified by nullifier_hash) can only predict once per day.
 *
 * Request body:
 *   {
 *     prediction_id: string,   // UUID of the prediction
 *     chosen_option: "A" | "B",
 *     nullifier_hash: string,  // World ID nullifier hash
 *   }
 *
 * Response (200):
 *   {
 *     success: true,
 *     option_a_percent: number,
 *     vote_count: number,
 *     chosen_option: "A" | "B",
 *   }
 *
 * Response (400 / 409 / 500):
 *   { success: false, error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { prediction_id, chosen_option, nullifier_hash } = await req.json();

    // ── Input validation ────────────────────────────────────────────────────
    if (!prediction_id || !chosen_option || !nullifier_hash) {
      return NextResponse.json(
        { success: false, error: "Missing prediction_id, chosen_option, or nullifier_hash" },
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

    // ── Ensure user exists (should already be created via /api/verify) ───────
    const { error: userCheckErr } = await supabaseAdmin
      .from("users")
      .select("address")
      .eq("address", nullifier_hash)
      .single();

    if (userCheckErr) {
      // Auto-create if missing (edge case: user skipped verify step)
      const { error: insertErr } = await supabaseAdmin
        .from("users")
        .insert({ address: nullifier_hash });

      if (insertErr && insertErr.code !== "23505") {
        console.error("[api/predict] Failed to create user:", insertErr);
        return NextResponse.json(
          { success: false, error: "User not found. Please verify with World ID first." },
          { status: 403 }
        );
      }
    }

    // ── Insert the user_prediction row ──────────────────────────────────────
    const { error: voteErr } = await supabaseAdmin
      .from("user_predictions")
      .insert({
        user_address: nullifier_hash,
        prediction_id,
        chosen_option,
      });

    if (voteErr) {
      // Unique constraint (user_address, prediction_id) — already predicted
      if (voteErr.code === "23505") {
        return NextResponse.json(
          { success: false, error: "You have already predicted on this question" },
          { status: 409 }
        );
      }
      console.error("[api/predict] Insert user_prediction error:", voteErr);
      return NextResponse.json(
        { success: false, error: "Failed to submit prediction" },
        { status: 500 }
      );
    }

    // ── Update denormalized vote counters on predictions ─────────────────────
    const newVoteCount = prediction.vote_count + 1;
    const newOptionAVotes =
      prediction.option_a_votes + (chosen_option === "A" ? 1 : 0);

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("predictions")
      .update({
        vote_count: newVoteCount,
        option_a_votes: newOptionAVotes,
      })
      .eq("id", prediction_id)
      .select("vote_count, option_a_votes")
      .single();

    if (updateErr || !updated) {
      console.error("[api/predict] Failed to update vote counts:", updateErr);
      // Prediction was recorded — return best-effort counts
      const option_a_percent =
        newVoteCount > 0 ? Math.round((newOptionAVotes / newVoteCount) * 100) : 50;
      return NextResponse.json({
        success: true,
        option_a_percent,
        vote_count: newVoteCount,
        chosen_option,
      });
    }

    // ── Increment user.total_predictions (fire-and-forget) ──────────────────
    // Read-modify-write is acceptable at this scale; a DB trigger is the
    // production-grade solution but is out of scope for the initial migration.
    supabaseAdmin
      .from("users")
      .select("total_predictions")
      .eq("address", nullifier_hash)
      .single()
      .then(({ data }) => {
        if (data) {
          supabaseAdmin
            .from("users")
            .update({ total_predictions: (data.total_predictions ?? 0) + 1 })
            .eq("address", nullifier_hash)
            .then(() => {});
        }
      });

    const option_a_percent =
      updated.vote_count > 0
        ? Math.round((updated.option_a_votes / updated.vote_count) * 100)
        : 50;

    return NextResponse.json({
      success: true,
      option_a_percent,
      vote_count: updated.vote_count,
      chosen_option,
    });
  } catch (err) {
    console.error("[api/predict] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
