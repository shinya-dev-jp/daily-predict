import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/predict/check?nullifier_hash=...&prediction_id=...
 *
 * Check whether a user has already predicted on a given prediction.
 *
 * Response (200):
 *   { has_predicted: boolean, chosen_option: "A" | "B" | null }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const nullifier_hash = searchParams.get("nullifier_hash");
    const prediction_id = searchParams.get("prediction_id");

    if (!nullifier_hash || !prediction_id) {
      return NextResponse.json(
        { has_predicted: false, chosen_option: null, error: "Missing parameters" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_predictions")
      .select("chosen_option")
      .eq("user_address", nullifier_hash)
      .eq("prediction_id", prediction_id)
      .maybeSingle();

    if (error) {
      console.error("[api/predict/check] Error:", error);
      return NextResponse.json(
        { has_predicted: false, chosen_option: null },
        { status: 500 }
      );
    }

    return NextResponse.json({
      has_predicted: !!data,
      chosen_option: data?.chosen_option ?? null,
    });
  } catch (err) {
    console.error("[api/predict/check] Unexpected error:", err);
    return NextResponse.json(
      { has_predicted: false, chosen_option: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
