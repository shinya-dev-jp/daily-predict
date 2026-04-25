import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/server-log";
import questionsData from "@/data/tc_questions.json";

// C2 / Evaluator Round 2 — vote route と同じ "存在する ID のみ" チェックを
// tally route にも適用。これまでは Number.isFinite だけで通していたため、
// 存在しない ID や小数を投げ込むと 0/0/0 の tally が返り、UI に架空の質問の
// 投票結果が表示されるリスクがあった。
const VALID_QUESTION_IDS = new Set<number>(
  (questionsData as { questions: { id: number }[] }).questions.map((q) => q.id),
);

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

  if (
    !Number.isInteger(questionId) ||
    questionId <= 0 ||
    !VALID_QUESTION_IDS.has(questionId)
  ) {
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
