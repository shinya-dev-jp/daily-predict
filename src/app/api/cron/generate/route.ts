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

// Only categories whose outcomes are auto-resolvable via price APIs
// Sports removed: no sports results API → questions stay unresolved indefinitely
const CATEGORIES = ["crypto", "stocks"] as const;

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

    const prompt = `You are generating questions for a daily prediction game. The best questions create an "aha! I was right!" moment — users should be able to check the result themselves without any research, just by glancing at a price chart or a scoreboard.

Date: ${today}
Category: ${category}

## CORE PRINCIPLE
The result must be self-evident. A user who checks tomorrow should immediately know if they were right — no counting, no searching, no interpretation needed.

## ABSOLUTE REQUIREMENTS (violating any = instant rejection)
1. Every question MUST name a specific entity: exact coin ticker, exact team names, or exact stock ticker
2. Every question MUST have a single binary outcome with a concrete threshold (a price level, or a win/loss)
3. The result MUST be verifiable by anyone within 24 hours by checking a public source (exchange chart, official scoreboard)
4. NEVER use: "celebrity", "famous person", "popular", "a team", "someone", "有名人", "著名人", "人気の", "誰か", "あるチーム"

## Category-specific rules
- crypto: coin ticker + comparison to 24h-ago price OR a round-number threshold (e.g., "BTC higher than 24h ago", "BTC above $85,000")
- stocks: stock ticker + comparison to previous close (e.g., "AAPL closes higher than previous close") — avoid "today/yesterday" since market timezones differ
## Timezone rule
NEVER rely on "today" or "yesterday". Use:
- "higher than 24 hours ago" (crypto — timezone-neutral)
- "higher than previous close" (stocks — exchange-neutral)

## Examples
BAD: "Will crypto go up today?" → which one? "today" is ambiguous across timezones
BAD: "Will a celebrity get 1M likes?" → who? 1 post or total?
GOOD: "Will Bitcoin (BTC) be higher than 24 hours ago at this time tomorrow?"
GOOD: "Will Apple (AAPL) close higher than its previous closing price?"

Respond ONLY with valid JSON (no markdown, no explanation):
{"question_en": "Will X happen?", "question_ja": "Xは起こる？", "question_es": "¿Sucederá X?", "question_ko": "X가 일어날까요?", "question_th": "X จะเกิดขึ้นไหม?", "question_pt": "X vai acontecer?", "option_a": "Yes", "option_b": "No"}`;

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

    let parsed: { question_en: string; question_ja: string; question_es?: string; question_ko?: string; question_th?: string; question_pt?: string; option_a: string; option_b: string };
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

    // ── Validate question quality (reject vague questions) ──────────────────
    const vagueReason = detectVagueQuestion(parsed.question_en, parsed.question_ja);
    if (vagueReason) {
      logError("cron/generate", "Rejected vague question", { question_en: parsed.question_en, reason: vagueReason });
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
        message: `Rejected vague AI question (${vagueReason}), used fallback`,
        rejected_question: parsed.question_en,
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
        question_es: parsed.question_es ?? parsed.question_en,
        question_ko: parsed.question_ko ?? parsed.question_en,
        question_th: parsed.question_th ?? parsed.question_en,
        question_pt: parsed.question_pt ?? parsed.question_en,
        option_a: parsed.option_a,
        option_b: parsed.option_b,
        category,
        status: "open",
        closes_at: closesAt.toISOString(),
        vote_count: 0,
        option_a_votes: 0,
      })
      .select("id, question_en, question_ja, question_es, question_ko, question_th, question_pt, category")
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
 * Detect vague/ambiguous questions that lack proper nouns or specificity.
 * Returns a rejection reason string if vague, or null if acceptable.
 */
function detectVagueQuestion(questionEn: string, questionJa: string): string | null {
  const enLower = questionEn.toLowerCase();
  const jaText = questionJa;

  // English vague terms that indicate missing specificity — subject must be a named entity
  const vagueTermsEn = [
    "the favorite", "a favorite", "the top team", "a top team",
    "a popular", "the popular", "leading candidate", "the frontrunner",
    "a major", "the major company", "a celebrity", "the celebrity",
    "a famous", "someone famous", "a top player", "the best team",
    "a big company", "the industry leader", "a well-known", "a prominent",
    "a prominent figure", "an influential", "a public figure",
    "a viral post", "go viral", "some famous",
  ];

  // Japanese vague terms — subjects must be concrete proper nouns
  const vagueTermsJa = [
    "優勝候補", "有名人", "著名人", "人気のある人", "有名な人",
    "人気の", "トップの", "注目の", "人気アーティスト", "人気俳優",
    "有力候補", "大手企業", "某", "ある企業", "ある選手",
    "有名な", "人気チーム", "強豪", "誰か", "ある人",
  ];

  for (const term of vagueTermsEn) {
    if (enLower.includes(term)) {
      return `EN vague term: "${term}"`;
    }
  }

  for (const term of vagueTermsJa) {
    if (jaText.includes(term)) {
      return `JA vague term: "${term}"`;
    }
  }

  // Check that question contains at least one capitalized proper noun (2+ chars)
  // Simple heuristic: at least one word starting with uppercase that's not the first word
  const words = questionEn.split(/\s+/).slice(1); // skip "Will"
  const hasProperNoun = words.some(
    (w) => /^[A-Z][a-zA-Z'']{1,}/.test(w) && !["The", "This", "That", "Today", "Tomorrow", "Yes", "No", "Any", "Some"].includes(w)
  );

  if (!hasProperNoun) {
    return "No proper noun detected in English question";
  }

  return null;
}

/**
 * Generate a fallback question when Claude API is unavailable.
 */
function generateFallbackQuestion() {
  const closesAt = todaysCloseAt();

  // All fallbacks are crypto/stocks — auto-resolvable via price APIs
  const fallbacks = [
    {
      question_en: "Will Bitcoin (BTC) be higher than 24 hours ago?",
      question_ja: "ビットコイン（BTC）は24時間前より高い価格になっていると思う？",
      question_es: "¿Estará Bitcoin (BTC) más alto que hace 24 horas?",
      question_ko: "비트코인(BTC)이 24시간 전보다 높아질까요?",
      question_th: "Bitcoin (BTC) จะสูงกว่า 24 ชั่วโมงที่แล้วไหม?",
      question_pt: "O Bitcoin (BTC) vai estar mais alto do que há 24 horas?",
      category: "crypto",
    },
    {
      question_en: "Will Ethereum (ETH) be higher than 24 hours ago?",
      question_ja: "イーサリアム（ETH）は24時間前より高い価格になっていると思う？",
      question_es: "¿Estará Ethereum (ETH) más alto que hace 24 horas?",
      question_ko: "이더리움(ETH)이 24시간 전보다 높아질까요?",
      question_th: "Ethereum (ETH) จะสูงกว่า 24 ชั่วโมงที่แล้วไหม?",
      question_pt: "O Ethereum (ETH) vai estar mais alto do que há 24 horas?",
      category: "crypto",
    },
    {
      question_en: "Will Solana (SOL) be higher than 24 hours ago?",
      question_ja: "ソラナ（SOL）は24時間前より高い価格になっていると思う？",
      question_es: "¿Estará Solana (SOL) más alto que hace 24 horas?",
      question_ko: "솔라나(SOL)가 24시간 전보다 높아질까요?",
      question_th: "Solana (SOL) จะสูงกว่า 24 ชั่วโมงที่แล้วไหม?",
      question_pt: "O Solana (SOL) vai estar mais alto do que há 24 horas?",
      category: "crypto",
    },
    {
      question_en: "Will the S&P 500 close higher than its previous close?",
      question_ja: "S&P 500は前回の終値より高くクローズすると思う？",
      question_es: "¿Cerrará el S&P 500 más alto que su cierre anterior?",
      question_ko: "S&P 500이 이전 종가보다 높게 마감될까요?",
      question_th: "S&P 500 จะปิดสูงกว่าราคาปิดครั้งก่อนไหม?",
      question_pt: "O S&P 500 vai fechar mais alto do que o fechamento anterior?",
      category: "stocks",
    },
    {
      question_en: "Will Apple (AAPL) close higher than its previous close?",
      question_ja: "Apple（AAPL）は前回の終値より高くクローズすると思う？",
      question_es: "¿Cerrará Apple (AAPL) más alto que su cierre anterior?",
      question_ko: "애플(AAPL)이 이전 종가보다 높게 마감될까요?",
      question_th: "Apple (AAPL) จะปิดสูงกว่าราคาปิดครั้งก่อนไหม?",
      question_pt: "A Apple (AAPL) vai fechar mais alta do que o fechamento anterior?",
      category: "stocks",
    },
    {
      question_en: "Will NVIDIA (NVDA) close higher than its previous close?",
      question_ja: "NVIDIA（NVDA）は前回の終値より高くクローズすると思う？",
      question_es: "¿Cerrará NVIDIA (NVDA) más alto que su cierre anterior?",
      question_ko: "엔비디아(NVDA)가 이전 종가보다 높게 마감될까요?",
      question_th: "NVIDIA (NVDA) จะปิดสูงกว่าราคาปิดครั้งก่อนไหม?",
      question_pt: "A NVIDIA (NVDA) vai fechar mais alta do que o fechamento anterior?",
      category: "stocks",
    },
  ];

  // Use day of year for deterministic daily rotation
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const chosen = fallbacks[dayOfYear % fallbacks.length];

  return {
    question_en: chosen.question_en,
    question_ja: chosen.question_ja,
    question_es: chosen.question_es,
    question_ko: chosen.question_ko,
    question_th: chosen.question_th,
    question_pt: chosen.question_pt,
    option_a: "Yes",
    option_b: "No",
    category: chosen.category,
    status: "open" as const,
    closes_at: closesAt.toISOString(),
    vote_count: 0,
    option_a_votes: 0,
  };
}
