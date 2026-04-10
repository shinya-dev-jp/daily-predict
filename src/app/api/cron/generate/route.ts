import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jstStartOfDay, todaysCloseAt, jstDateString } from "@/lib/date-util";
import { logError } from "@/lib/server-log";

/**
 * POST /api/cron/generate
 *
 * Called by Vercel Cron to generate a daily prediction question.
 * Uses Claude Haiku API to create a bilingual (EN + JA) question.
 *
 * Requires CRON_SECRET header for authentication.
 */

const CATEGORIES = ["crypto", "weather", "sports", "tech", "world", "entertainment"] as const;

/**
 * Vercel Cron sends GET requests. Accept both GET and POST.
 */
export async function GET(req: NextRequest) {
  return handleGenerate(req);
}

export async function POST(req: NextRequest) {
  return handleGenerate(req);
}

async function handleGenerate(req: NextRequest) {
  try {
    // ── Verify cron secret ──────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // ── Check if today's question already exists ────────────────────────────
    // "Today" = current JST day. Without this, the cron would create
    // duplicate questions if it runs across the JST midnight boundary.
    const todayStart = jstStartOfDay();

    const { data: existing } = await supabaseAdmin
      .from("predictions")
      .select("id")
      .gte("created_at", todayStart.toISOString())
      .in("status", ["open", "closed"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        message: "Today's question already exists",
        prediction_id: existing.id,
      });
    }

    // ── Generate question with Claude Haiku ─────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey || apiKey === "sk-ant-placeholder" || apiKey.startsWith("sk-ant-xxx")) {
      // API key not configured — use fallback question
      const fallback = generateFallbackQuestion();
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("predictions")
        .insert(fallback)
        .select("id, question_en, question_ja, category")
        .single();

      if (insertErr) {
        logError("cron/generate", "Insert error", { error: String(insertErr) });
        return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
      }

      return NextResponse.json({
        message: "Generated fallback question (ANTHROPIC_API_KEY not configured)",
        prediction: inserted,
      });
    }

    // Call Claude API
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const today = jstDateString();

    const prompt = `Generate a single yes/no prediction question for a daily prediction game. The question should be about the "${category}" category and be verifiable within 24 hours (by tomorrow).

Date: ${today}

Requirements:
- The question must be answerable with "Yes" or "No"
- It should be interesting and engaging
- It should be about something that will be resolved by tomorrow
- Provide the question in English, Japanese, and Spanish

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"question_en": "Will X happen by tomorrow?", "question_ja": "明日までにXは起こると思う？", "question_es": "¿Sucederá X mañana?", "option_a": "Yes", "option_b": "No"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      logError("cron/generate", "Claude API error", { status: response.status, body: errBody.slice(0, 500) });
      // Fall back to static question
      const fallback = generateFallbackQuestion();
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("predictions")
        .insert(fallback)
        .select("id, question_en, question_ja, category")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
      }

      return NextResponse.json({
        message: "Generated fallback question (Claude API call failed)",
        prediction: inserted,
      });
    }

    const claudeResponse = await response.json();
    const textContent = claudeResponse.content?.[0]?.text ?? "";

    let parsed: { question_en: string; question_ja: string; option_a: string; option_b: string };
    try {
      parsed = JSON.parse(textContent);
    } catch {
      logError("cron/generate", "Failed to parse Claude response", { error: String(textContent) });
      const fallback = generateFallbackQuestion();
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("predictions")
        .insert(fallback)
        .select("id, question_en, question_ja, category")
        .single();

      if (insertErr) {
        return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
      }

      return NextResponse.json({
        message: "Generated fallback question (Claude response parse error)",
        prediction: inserted,
      });
    }

    // ── Insert into database ────────────────────────────────────────────────
    // closes_at = end of today in JST (23:59 JST). todaysCloseAt() handles
    // the "already past today's close → tomorrow" rollover safely.
    const closesAt = todaysCloseAt();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("predictions")
      .insert({
        question_en: parsed.question_en,
        question_ja: parsed.question_ja,
        option_a: parsed.option_a,
        option_b: parsed.option_b,
        category,
        status: "open",
        closes_at: closesAt.toISOString(),
        vote_count: 0,
        option_a_votes: 0,
      })
      .select("id, question_en, question_ja, category")
      .single();

    if (insertErr) {
      logError("cron/generate", "Insert error", { error: String(insertErr) });
      return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Question generated successfully",
      prediction: inserted,
    });
  } catch (err) {
    logError("cron/generate", "Unexpected error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Generate a fallback question when Claude API is unavailable.
 */
function generateFallbackQuestion() {
  const closesAt = todaysCloseAt();

  const fallbacks = [
    {
      question_en: "Will Bitcoin go up tomorrow?",
      question_ja: "明日、ビットコインの価格は上がると思う？",
      question_es: "¿Subirá el precio de Bitcoin mañana?",
      category: "crypto",
    },
    {
      question_en: "Will the US stock market go up today?",
      question_ja: "今日、アメリカの株式市場は上がると思う？",
      question_es: "¿Subirá la bolsa de EE.UU. hoy?",
      category: "world",
    },
    {
      question_en: "Will it rain in Tokyo tomorrow?",
      question_ja: "明日、東京で雨は降ると思う？",
      question_es: "¿Lloverá en Tokio mañana?",
      category: "weather",
    },
    {
      question_en: "Will a big tech company make AI news today?",
      question_ja: "今日、大手テック企業からAI関連のニュースが出ると思う？",
      question_es: "¿Alguna gran empresa tech dará noticias de IA hoy?",
      category: "tech",
    },
    {
      question_en: "Will the Champions League favorite win this week?",
      question_ja: "今週、チャンピオンズリーグの優勝候補は勝つと思う？",
      question_es: "¿Ganará el favorito de la Champions League esta semana?",
      category: "sports",
    },
    {
      question_en: "Will this week's #1 movie stay at the top next week?",
      question_ja: "今週の映画ランキング1位は、来週も1位をキープすると思う？",
      question_es: "¿La película #1 de esta semana seguirá en el primer lugar la próxima?",
      category: "entertainment",
    },
  ];

  // Use day of year for deterministic daily rotation
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const chosen = fallbacks[dayOfYear % fallbacks.length];

  return {
    question_en: chosen.question_en,
    question_ja: chosen.question_ja,
    question_es: (chosen as Record<string, string>).question_es ?? chosen.question_en,
    option_a: "Yes",
    option_b: "No",
    category: chosen.category,
    status: "open" as const,
    closes_at: closesAt.toISOString(),
    vote_count: 0,
    option_a_votes: 0,
  };
}
