import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { logError } from "@/lib/server-log";

/**
 * GET /api/predict/check?prediction_id=...
 *
 * Check whether the authenticated user has already predicted on the given
 * question. Nullifier is derived from the auth token, never accepted from the
 * URL — this prevents probing other users' votes.
 */
export async function GET(req: NextRequest) {
  try {
    const nullifier_hash = authenticateRequest(req);
    if (!nullifier_hash) {
      return NextResponse.json(
        { has_predicted: false, chosen_option: null, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const prediction_id = new URL(req.url).searchParams.get("prediction_id");
    if (!prediction_id) {
      return NextResponse.json(
        { has_predicted: false, chosen_option: null, error: "Missing prediction_id" },
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
      logError("api/predict/check", "select failed", { code: error.code });
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
    logError("api/predict/check", "unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { has_predicted: false, chosen_option: null, error: "Internal server error" },
      { status: 500 }
    );
  }
}
