import { NextRequest, NextResponse } from "next/server";
import {
  verifyCloudProof,
  IVerifyResponse,
  ISuccessResult,
} from "@worldcoin/minikit-js";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/verify
 *
 * Verifies a World ID proof and upserts the user in Supabase.
 *
 * Request body:
 *   { payload: ISuccessResult, signal?: string }
 *
 * Response (200):
 *   { success: true, user: UserProfile }
 *
 * Response (400):
 *   { success: false, error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { payload, signal } = await req.json();

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Missing payload" },
        { status: 400 }
      );
    }

    const app_id = process.env.NEXT_PUBLIC_WLD_APP_ID as `app_${string}`;
    // Server-side enforced action — never trust client-supplied value
    const action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "predict-daily";

    const verifyRes = (await verifyCloudProof(
      payload as ISuccessResult,
      app_id,
      action,
      signal
    )) as IVerifyResponse;

    if (!verifyRes.success) {
      return NextResponse.json(
        { success: false, error: "World ID verification failed" },
        { status: 400 }
      );
    }

    const nullifier_hash = (payload as ISuccessResult).nullifier_hash;

    // Upsert user — insert if new, update updated_at if existing
    const { data: user, error: upsertErr } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          address: nullifier_hash,
          // display_name keeps its existing value on conflict (not overwritten)
        },
        {
          onConflict: "address",
          ignoreDuplicates: false,
        }
      )
      .select(
        "address, display_name, total_predictions, total_correct, streak, best_streak, points, created_at"
      )
      .single();

    if (upsertErr) {
      console.error("[api/verify] Supabase upsert error:", upsertErr);
      return NextResponse.json(
        { success: false, error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    // Derive accuracy from counters
    const accuracy =
      user.total_predictions > 0
        ? Math.round((user.total_correct / user.total_predictions) * 100)
        : 0;

    return NextResponse.json({
      success: true,
      user: {
        ...user,
        accuracy,
        badges: [], // badges fetched separately when needed
      },
    });
  } catch (err) {
    console.error("[api/verify] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
