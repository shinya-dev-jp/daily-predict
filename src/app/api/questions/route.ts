import { NextRequest, NextResponse } from "next/server";
import questions from "@/data/tc_questions.json";

type Question = {
  id: number;
  category: string;
  ja: { prompt: string; option_a: string; option_b: string };
  en: { prompt: string; option_a: string; option_b: string };
};

const pool = (questions as { questions: Question[] }).questions;

/**
 * GET /api/questions
 *   → returns a random question from the seeded pool.
 *
 * GET /api/questions?id=<n>
 *   → returns the question with the given id.
 *
 * The pool is static JSON shipped with the app (src/data/tc_questions.json).
 * No Supabase read path is needed for MVP — the 30-question dictionary is
 * immutable for the beta and embedded at build time.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");

  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const q = pool.find((q) => q.id === id);
    if (!q) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ question: q });
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  return NextResponse.json({ question: pick });
}
