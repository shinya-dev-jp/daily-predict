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

    const prompt = `You are generating questions for a daily prediction game where users bet their intuition. The best questions feel like exciting micro-bets — they have real stakes, concrete verifiable outcomes, and make people WANT to check back tomorrow.

Date: ${today}
Category: ${category}

## ABSOLUTE REQUIREMENTS (violating any = instant rejection)
1. Every question MUST contain at least one proper noun (team name, person name, company name, city name, etc.)
2. Every question MUST contain a concrete threshold or specific event (a number, a score, a date, or a named event)
3. The outcome MUST be objectively verifiable with a simple Google search
4. NEVER use vague terms like: "favorite", "top team", "popular", "leading candidate", "優勝候補", "有名人", "人気", "トップ", "注目の"

## Category-specific rules
- crypto: MUST include coin ticker AND price level (e.g., "BTC above $85,000")
- sports: MUST include BOTH team names or a specific athlete name AND the event name
- tech: MUST include company name AND specific product/event
- world: MUST include country/leader name AND specific policy/event
- entertainment: MUST include artist/movie name AND specific metric
- weather: MUST include city name AND temperature/condition

## Examples
BAD: "Will the Champions League favorite win this week?" (WHO is the favorite?)
GOOD: "Will Real Madrid beat Arsenal in the Champions League quarterfinal this week?"

BAD: "Will Bitcoin go up tomorrow?" (no threshold)
GOOD: "Will Bitcoin (BTC) close above $85,000 today?"

BAD: "Will a popular tech company release something new?" (which company? what product?)
GOOD: "Will Apple announce a new iPhone SE this week?"

BAD: "Will a celebrity post go viral?" (which celebrity?)
GOOD: "Will Elon Musk post on X more than 20 times today?"

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"question_en": "Will X happen by tomorrow?", "question_ja": "明日までにXは起こる？", "question_es": "¿Sucederá X mañana?", "question_ko": "내일까지 X가 일어날까요?", "question_th": "X จะเกิดขึ้นภายในพรุ่งนี้ไหม?", "question_pt": "X vai acontecer até amanhã?", "option_a": "Yes", "option_b": "No"}`;

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

  const fallbacks = [
    {
      question_en: "Will Bitcoin (BTC) close above $83,000 today?",
      question_ja: "今日、ビットコイン（BTC）は$83,000より高い価格でクロースすると思う？",
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
      question_en: "Will the S&P 500 end today in the green?",
      question_ja: "今日、S&P 500はプラスで終わると思う？",
      question_es: "¿Cerrará el S&P 500 en verde hoy?",
      question_ko: "오늘 S&P 500이 상승 마감할까요?",
      question_th: "S&P 500 จะปิดในแดนบวกวันนี้ไหม?",
      question_pt: "O S&P 500 vai fechar no verde hoje?",
      category: "world",
    },
    {
      question_en: "Will OpenAI announce a new product this week?",
      question_ja: "今週、OpenAIが新製品を発表すると思う？",
      question_es: "¿Anunciará OpenAI un nuevo producto esta semana?",
      question_ko: "이번 주 OpenAI가 새 제품을 발표할까요?",
      question_th: "OpenAI จะประกาศผลิตภัณฑ์ใหม่สัปดาห์นี้ไหม?",
      question_pt: "A OpenAI vai anunciar um novo produto esta semana?",
      category: "tech",
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
      question_en: "Will Elon Musk post more than 20 times on X today?",
      question_ja: "今日、イーロン・マスクはXに20回以上投稿すると思う？",
      question_es: "¿Publicará Elon Musk más de 20 veces en X hoy?",
      question_ko: "오늘 일론 머스크가 X에 20번 이상 게시할까요?",
      question_th: "Elon Musk จะโพสต์ X มากกว่า 20 ครั้งวันนี้ไหม?",
      question_pt: "Elon Musk vai postar mais de 20 vezes no X hoje?",
      category: "entertainment",
    },
    {
      question_en: "Will Donald Trump post more than 10 times on Truth Social today?",
      question_ja: "今日、ドナルド・トランプはTruth Socialに10回以上投稿すると思う？",
      question_es: "¿Publicará Donald Trump más de 10 veces en Truth Social hoy?",
      question_ko: "오늘 도널드 트럼프가 Truth Social에 10번 이상 게시할까요?",
      question_th: "Donald Trump จะโพสต์ Truth Social มากกว่า 10 ครั้งวันนี้ไหม?",
      question_pt: "Donald Trump vai postar mais de 10 vezes no Truth Social hoje?",
      category: "world",
    },
    {
      question_en: "Will Apple's stock (AAPL) rise by end of today's trading?",
      question_ja: "今日の取引終了時にAppleの株価（AAPL）は上昇していると思う？",
      question_es: "¿Subirá la acción de Apple (AAPL) al cierre de hoy?",
      question_ko: "오늘 거래 종료 시 애플 주식(AAPL)이 상승할까요?",
      question_th: "หุ้น Apple (AAPL) จะปิดสูงขึ้นเมื่อสิ้นสุดการซื้อขายวันนี้ไหม?",
      question_pt: "A ação da Apple (AAPL) vai subir ao final do pregão hoje?",
      category: "tech",
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
