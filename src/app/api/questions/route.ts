import { NextRequest, NextResponse } from "next/server";
import questions from "@/data/tc_questions.json";

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
 *
 * The pool is the immutable 30-question dictionary shipped in
 * src/data/tc_questions.json. No Supabase read path is needed for MVP.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const countParam = url.searchParams.get("count");
  const excludeParam = url.searchParams.get("exclude");

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
