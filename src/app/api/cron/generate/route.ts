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

// Only categories whose outcomes are self-evidently verifiable (price charts, scoreboard)
const CATEGORIES = ["crypto", "stocks", "sports"] as const;

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
- crypto: MUST include coin ticker (BTC/ETH/SOL etc.) AND exact price threshold (e.g., "BTC closes above $85,000 today")
- stocks: MUST include stock ticker (AAPL/NVDA/TSLA etc.) AND specific comparison (e.g., "AAPL closes higher than yesterday")
- sports: MUST include BOTH team names AND the specific match/event (e.g., "Real Madrid vs Arsenal in the UCL quarterfinal")

## Examples
BAD: "Will a famous player score today?" → who? can't verify instantly
BAD: "Will crypto go up?" → which one? no threshold
BAD: "Will a celebrity get 1M likes?" → who? 1 post or total?
GOOD: "Will Bitcoin (BTC) close above $85,000 today?"
GOOD: "Will Apple (AAPL) close higher than yesterday's price?"
GOOD: "Will Real Madrid beat Arsenal in the Champions League quarterfinal?"

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

  // All fallbacks use only crypto/stocks/sports — outcomes verifiable by price chart or scoreboard
  const fallbacks = [
    {
      question_en: "Will Bitcoin (BTC) close above $83,000 today?",
      question_ja: "今日、ビットコイン（BTC）は$83,000超えでクローズすると思う？",
      question_es: "¿Cerrará Bitcoin (BTC) por encima de $83,000 hoy?",
      question_ko: "오늘 비트코인(BTC)이 $83,000 이상으로 마감될까요?",
      question_th: "Bitcoin (BTC) จะปิดเหนือ $83,000 วันนี้ไหม?",
      question_pt: "O Bitcoin (BTC) vai fechar acima de $83.000 hoje?",
      category: "crypto",
    },
    {
      question_en: "Will Ethereum (ETH) rise more than 3% today?",
      question_ja: "今日、イーサリアム（ETH）は3%以上上昇すると思う？",
      question_es: "¿Subirá Ethereum (ETH) más del 3% hoy?",
      question_ko: "오늘 이더리움(ETH)이 3% 이상 상승할까요?",
      question_th: "Ethereum (ETH) จะขึ้นมากกว่า 3% วันนี้ไหม?",
      question_pt: "O Ethereum (ETH) vai subir mais de 3% hoje?",
      category: "crypto",
    },
    {
      question_en: "Will Solana (SOL) close higher than yesterday?",
      question_ja: "今日、ソラナ（SOL）は昨日より高い価格でクローズすると思う？",
      question_es: "¿Cerrará Solana (SOL) más alto que ayer?",
      question_ko: "오늘 솔라나(SOL)가 어제보다 높게 마감될까요?",
      question_th: "Solana (SOL) จะปิดสูงกว่าเมื่อวานนี้ไหม?",
      question_pt: "O Solana (SOL) vai fechar mais alto do que ontem?",
      category: "crypto",
    },
    {
      question_en: "Will the S&P 500 close in the green today?",
      question_ja: "今日、S&P 500はプラスで終わると思う？",
      question_es: "¿Cerrará el S&P 500 en verde hoy?",
      question_ko: "오늘 S&P 500이 상승 마감할까요?",
      question_th: "S&P 500 จะปิดในแดนบวกวันนี้ไหม?",
      question_pt: "O S&P 500 vai fechar no verde hoje?",
      category: "stocks",
    },
    {
      question_en: "Will Apple (AAPL) close higher than yesterday?",
      question_ja: "今日の終値、Apple（AAPL）は昨日より上がると思う？",
      question_es: "¿Cerrará Apple (AAPL) más alto que ayer?",
      question_ko: "오늘 애플(AAPL)이 어제보다 높게 마감될까요?",
      question_th: "Apple (AAPL) จะปิดสูงกว่าเมื่อวานนี้ไหม?",
      question_pt: "A Apple (AAPL) vai fechar mais alta do que ontem?",
      category: "stocks",
    },
    {
      question_en: "Will NVIDIA (NVDA) close higher than yesterday?",
      question_ja: "今日の終値、NVIDIA（NVDA）は昨日より上がると思う？",
      question_es: "¿Cerrará NVIDIA (NVDA) más alto que ayer?",
      question_ko: "오늘 엔비디아(NVDA)가 어제보다 높게 마감될까요?",
      question_th: "NVIDIA (NVDA) จะปิดสูงกว่าเมื่อวานนี้ไหม?",
      question_pt: "A NVIDIA (NVDA) vai fechar mais alta do que ontem?",
      category: "stocks",
    },
    {
      question_en: "Will Real Madrid win their next Champions League match?",
      question_ja: "レアル・マドリードは次のチャンピオンズリーグの試合に勝つと思う？",
      question_es: "¿Ganará el Real Madrid su próximo partido de Champions League?",
      question_ko: "레알 마드리드가 다음 챔피언스리그 경기에서 이길까요?",
      question_th: "Real Madrid จะชนะเกมถัดไปใน Champions League ไหม?",
      question_pt: "O Real Madrid vai vencer seu próximo jogo na Champions League?",
      category: "sports",
    },
    {
      question_en: "Will the NBA game tonight end with a margin of 10+ points?",
      question_ja: "今夜のNBAの試合は10点差以上の結果になると思う？",
      question_es: "¿El partido de NBA de esta noche terminará con una diferencia de 10+ puntos?",
      question_ko: "오늘 밤 NBA 경기가 10점 이상 차이로 끝날까요?",
      question_th: "เกม NBA คืนนี้จะจบด้วยคะแนนห่างกัน 10+ แต้มไหม?",
      question_pt: "O jogo de NBA de hoje à noite vai terminar com uma diferença de 10+ pontos?",
      category: "sports",
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
