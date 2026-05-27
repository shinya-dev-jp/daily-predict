import { NextRequest, NextResponse } from "next/server";
import questions from "@/data/tc_questions.json";
import { getIsoWeekId, selectWeeklyPackQuestions } from "@/lib/retention";

type Question = {
  id: number;
  category: string;
  ja: { prompt: string; option_a: string; option_b: string };
  en: { prompt: string; option_a: string; option_b: string };
};

const pool = (questions as { questions: Question[] }).questions;

// 各リクエストでランダム結果を返す動的エンドポイントなので明示的に no-store。
// CDN や proxy が同じ ?count=5 のレスポンスをキャッシュして全ユーザーに同じ
// 5問が出てしまうのを防ぐ。
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/questions                 → random single question
 * GET /api/questions?id=<n>          → question with id
 * GET /api/questions?count=<n>       → n random questions (no duplicates)
 * GET /api/questions?count=5&exclude=1,7,12
 *                                    → 5 random questions excluding the given ids
 * GET /api/questions?count=5&pack=current&exclude=1,7,12
 *                                    → current weekly pack first, then safe fallback
 *
 * The pool is the immutable question dictionary shipped in
 * src/data/tc_questions.json. No Supabase read path is needed for MVP, but
 * new IDs must be upserted to tc_questions before deploy because /api/vote
 * uses a foreign key on tc_votes.question_id.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const countParam = url.searchParams.get("count");
  const excludeParam = url.searchParams.get("exclude");
  const packParam = url.searchParams.get("pack");

  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const q = pool.find((q) => q.id === id);
    if (!q) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE_HEADERS });
    return NextResponse.json({ question: q }, { headers: NO_STORE_HEADERS });
  }

  if (countParam) {
    const count = Math.min(Math.max(Number(countParam) || 1, 1), pool.length);
    const excludeIds = new Set(
      (excludeParam ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    );

    if (packParam === "current") {
      const questionPackId = getIsoWeekId();
      const weeklyPack = selectWeeklyPackQuestions(pool, questionPackId);
      const weeklyIds = new Set(weeklyPack.map((q) => q.id));
      const weeklyAvailable = weeklyPack.filter((q) => !excludeIds.has(q.id));
      const fallback = pool.filter((q) => !excludeIds.has(q.id) && !weeklyIds.has(q.id));
      const shuffledFallback = [...fallback];
      for (let i = shuffledFallback.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledFallback[i], shuffledFallback[j]] = [shuffledFallback[j], shuffledFallback[i]];
      }

      return NextResponse.json(
        {
          questions: [...weeklyAvailable, ...shuffledFallback].slice(0, count),
          question_pack_id: questionPackId,
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const available = pool.filter((q) => !excludeIds.has(q.id));
    // Fisher-Yates partial shuffle
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return NextResponse.json({ questions: shuffled.slice(0, count) }, { headers: NO_STORE_HEADERS });
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return NextResponse.json({ question: pick }, { headers: NO_STORE_HEADERS });
}
