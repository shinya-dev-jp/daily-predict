import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/cron/generate
 *
 * Called by Vercel Cron to generate a daily prediction question.
 * Uses Claude Haiku API to create a bilingual (EN + JA) question.
 *
 * Requires CRON_SECRET header for authentication.
 */

const CATEGORIES = ["crypto", "weather", "sports", "tech", "world", "entertainment"] as const;

export async function POST(req: NextRequest) {
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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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
        console.error("[cron/generate] Insert error:", insertErr);
        return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
      }

      return NextResponse.json({
        message: "Generated fallback question (ANTHROPIC_API_KEY not configured)",
        prediction: inserted,
      });
    }

    // Call Claude API
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const today = new Date().toISOString().split("T")[0];

    const prompt = `Generate a single yes/no prediction question for a daily prediction game. The question should be about the "${category}" category and be verifiable within 24 hours (by tomorrow).

Date: ${today}

Requirements:
- The question must be answerable with "Yes" or "No"
- It should be interesting and engaging
- It should be about something that will be resolved by tomorrow
- Provide the question in both English and Japanese

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"question_en": "Will X happen by tomorrow?", "question_ja": "明日までにXは起こると思う？", "option_a": "Yes", "option_b": "No"}`;

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
      console.error("[cron/generate] Claude API error:", response.status, await response.text());
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
      console.error("[cron/generate] Failed to parse Claude response:", textContent);
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
    // closes_at = end of today in JST (23:59 JST = 14:59 UTC)
    const closesAt = new Date();
    closesAt.setUTCHours(14, 59, 0, 0); // 23:59 JST
    if (closesAt < new Date()) {
      // If already past 23:59 JST today, set to tomorrow
      closesAt.setDate(closesAt.getDate() + 1);
    }

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
      console.error("[cron/generate] Insert error:", insertErr);
      return NextResponse.json({ error: "Failed to insert prediction" }, { status: 500 });
    }

    return NextResponse.json({
      message: "Question generated successfully",
      prediction: inserted,
    });
  } catch (err) {
    console.error("[cron/generate] Unexpected error:", err);
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
  const closesAt = new Date();
  closesAt.setUTCHours(14, 59, 0, 0);
  if (closesAt < new Date()) {
    closesAt.setDate(closesAt.getDate() + 1);
  }

  const fallbacks = [
    {
      question_en: "Will Bitcoin be above $85,000 at tomorrow's close?",
      question_ja: "ビットコインは明日の終値で8万5千ドルを超えると思う？",
      category: "crypto",
    },
    {
      question_en: "Will the S&P 500 close higher today than yesterday?",
      question_ja: "S&P 500は昨日より高く引けると思う？",
      category: "world",
    },
    {
      question_en: "Will it rain in Tokyo tomorrow?",
      question_ja: "明日、東京で雨が降ると思う？",
      category: "weather",
    },
    {
      question_en: "Will any major tech company announce a new AI product today?",
      question_ja: "今日、大手テック企業がAIの新製品を発表すると思う？",
      category: "tech",
    },
  ];

  const chosen = fallbacks[Math.floor(Math.random() * fallbacks.length)];

  return {
    question_en: chosen.question_en,
    question_ja: chosen.question_ja,
    option_a: "Yes",
    option_b: "No",
    category: chosen.category,
    status: "open" as const,
    closes_at: closesAt.toISOString(),
    vote_count: 0,
    option_a_votes: 0,
  };
}
