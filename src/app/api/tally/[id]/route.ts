import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/server-log";

/**
 * GET /api/tally/[id]
 *   → aggregate A/B counts for the given question_id.
 *   Used by the Reveal screen after the user casts their vote.
 *
 * Reads from the `tc_question_tally` view (defined in tc_init.sql), which
 * LEFT JOINs tc_questions + tc_votes so questions with zero votes still
 * return a row.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const questionId = Number(id);

  if (!Number.isFinite(questionId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("tc_question_tally")
    .select("question_id, category, total_votes, votes_a, votes_b")
    .eq("question_id", questionId)
    .maybeSingle();

  if (error) {
    logError("api/tally", "query failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const tally =
    data ?? {
      question_id: questionId,
      category: null,
      total_votes: 0,
      votes_a: 0,
      votes_b: 0,
    };

  return NextResponse.json({ tally });
}
