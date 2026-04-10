import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jstStartOfDayDelta } from "@/lib/date-util";
import { logError, logWarn } from "@/lib/server-log";

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
        "id, question_en, question_ja, question_es, question_ko, question_th, question_pt, option_a, option_b, category, status, closes_at, result, vote_count, option_a_votes, created_at"
      )
      .in("status", ["open", "closed"])
      .gte("closes_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()) // within last 24 h
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todayErr) {
      logError("api/question", "today fetch failed", { code: todayErr.code });
      return NextResponse.json(
        { error: "Failed to fetch today's question" },
        { status: 500 }
      );
    }

    // ── Yesterday's resolved prediction ─────────────────────────────────────
    // Use JST day boundaries so the question lifecycle aligns with the cron
    // generator (which schedules closes_at = 23:59 JST).
    const yesterdayStart = jstStartOfDayDelta(-1, now);
    const yesterdayEnd = jstStartOfDayDelta(0, now);

    const { data: yesterdayRow, error: yesterdayErr } = await supabaseAdmin
      .from("predictions")
      .select(
        "id, question_en, question_ja, question_es, question_ko, question_th, question_pt, option_a, option_b, category, status, closes_at, result, vote_count, option_a_votes, created_at"
      )
      .eq("status", "resolved")
      .gte("created_at", yesterdayStart.toISOString())
      .lt("created_at", yesterdayEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (yesterdayErr) {
      logWarn("api/question", "yesterday fetch failed", { code: yesterdayErr.code });
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
        question_es: (row as Record<string, unknown>).question_es ?? null,
        question_ko: (row as Record<string, unknown>).question_ko ?? null,
        question_th: (row as Record<string, unknown>).question_th ?? null,
        question_pt: (row as Record<string, unknown>).question_pt ?? null,
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

    const response = NextResponse.json({
      today: toClientPrediction(todayRow),
      yesterday: toClientPrediction(yesterdayRow ?? null),
    });
    // Cache for 30 seconds to reduce DB hits on page refreshes
    response.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return response;
  } catch (err) {
    logError("api/question", "unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
