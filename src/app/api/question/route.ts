import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/question
 *
 * Returns:
 *  - today's active (open) prediction question
 *  - yesterday's resolved question (with result), if available
 *
 * Response (200):
 *   {
 *     today: Prediction | null,
 *     yesterday: Prediction | null,
 *   }
 */
export async function GET() {
  try {
    const now = new Date();

    // ── Today's open prediction ──────────────────────────────────────────────
    // "Today" = a prediction with status='open' and closes_at in the future,
    // OR status='closed' (voting ended but not yet resolved) created today.
    // We pick the most recently created open question as the canonical one.
    const { data: todayRow, error: todayErr } = await supabaseAdmin
      .from("predictions")
      .select(
        "id, question_en, question_ja, option_a, option_b, category, status, closes_at, result, vote_count, option_a_votes, created_at"
      )
      .in("status", ["open", "closed"])
      .gte("closes_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) // within last 24 h
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayErr) {
      console.error("[api/question] Error fetching today's question:", todayErr);
      return NextResponse.json(
        { error: "Failed to fetch today's question" },
        { status: 500 }
      );
    }

    // ── Yesterday's resolved prediction ─────────────────────────────────────
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const { data: yesterdayRow, error: yesterdayErr } = await supabaseAdmin
      .from("predictions")
      .select(
        "id, question_en, question_ja, option_a, option_b, category, status, closes_at, result, vote_count, option_a_votes, created_at"
      )
      .eq("status", "resolved")
      .gte("created_at", yesterdayStart.toISOString())
      .lte("created_at", yesterdayEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (yesterdayErr) {
      console.warn("[api/question] Error fetching yesterday's question:", yesterdayErr);
      // Non-fatal — return today's question without yesterday's
    }

    // ── Shape the response ───────────────────────────────────────────────────
    const toClientPrediction = (row: typeof todayRow) => {
      if (!row) return null;
      const option_a_percent =
        row.vote_count > 0
          ? Math.round((row.option_a_votes / row.vote_count) * 100)
          : 50;
      return {
        id: row.id,
        question_en: row.question_en,
        question_ja: row.question_ja,
        option_a: row.option_a,
        option_b: row.option_b,
        category: row.category,
        status: row.status,
        closes_at: row.closes_at,
        result: row.result ?? null,
        option_a_percent,
        vote_count: row.vote_count,
        created_at: row.created_at,
      };
    };

    return NextResponse.json({
      today: toClientPrediction(todayRow),
      yesterday: toClientPrediction(yesterdayRow ?? null),
    });
  } catch (err) {
    console.error("[api/question] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
