import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { jstStartOfDay, todaysCloseAt } from "@/lib/date-util";
import { logError } from "@/lib/server-log";
import {
  getCategoryForDay,
  pickRandomAsset,
  generateQuestionTexts,
  formatPrice,
  type Asset,
  type QuestionMeta,
} from "@/lib/question-templates";
import {
  fetchCryptoPrice,
  fetchStockPrice,
  fetchWeather,
  fetchForexRate,
} from "@/lib/price-api";

/**
 * POST|GET /api/cron/generate
 *
 * Called by Vercel Cron daily to generate a prediction question.
 *
 * NEW SYSTEM (2026-04-14):
 * - No AI generation — uses templates + real-time price data
 * - Questions include reference price at voting open
 * - Resolution is a simple numeric comparison
 */

export async function GET(req: NextRequest) {
  return handleGenerate(req);
}

export async function POST(req: NextRequest) {
  return handleGenerate(req);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleGenerate(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Check duplicate ────────────────────────────────────────────────────
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

    // ── Determine category and pick asset ──────────────────────────────────
    const now = new Date();
    const category = getCategoryForDay(now);
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
    );

    // Try up to 3 assets in the category (in case API fails)
    let result: GenerateResult | null = null;
    const assets = shuffleWithSeed(
      getAssetsForCategory(category),
      dayOfYear,
    );

    for (const asset of assets.slice(0, 3)) {
      result = await generateForAsset(asset, now);
      if (result) break;
    }

    // ── Fallback: try crypto if chosen category failed ─────────────────────
    if (!result && category !== "crypto") {
      const cryptoAssets = shuffleWithSeed(
        getAssetsForCategory("crypto"),
        dayOfYear,
      );
      for (const asset of cryptoAssets.slice(0, 3)) {
        result = await generateForAsset(asset, now);
        if (result) break;
      }
    }

    // ── Ultimate fallback: static BTC question ─────────────────────────────
    if (!result) {
      result = {
        texts: {
          question_en: "Bitcoin (BTC) was at voting open. Will it be higher at voting close?",
          question_ja: "ビットコイン（BTC）は投票開始時の価格から、投票終了時に上がっている？",
          question_es: "Bitcoin (BTC) estaba al abrir. ¿Estará más alto al cierre?",
          question_ko: "비트코인(BTC)이 투표 시작 시보다 마감 시 더 높아질까요?",
          question_th: "Bitcoin (BTC) จะสูงขึ้นตอนปิดโหวตไหม?",
          question_pt: "Bitcoin (BTC) vai estar mais alto no fechamento?",
        },
        meta: {
          reference_price: 0,
          reference_time: now.toISOString(),
          asset_id: "bitcoin",
          asset_ticker: "BTC",
          asset_name: "Bitcoin",
          source: "coingecko",
          category: "crypto",
        },
        category: "crypto",
      };
    }

    // ── Insert into DB ─────────────────────────────────────────────────────
    const closesAt = todaysCloseAt();
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("predictions")
      .insert({
        question_en: result.texts.question_en,
        question_ja: result.texts.question_ja,
        question_es: result.texts.question_es ?? result.texts.question_en,
        question_ko: result.texts.question_ko ?? result.texts.question_en,
        question_th: result.texts.question_th ?? result.texts.question_en,
        question_pt: result.texts.question_pt ?? result.texts.question_en,
        option_a: "Yes",
        option_b: "No",
        category: result.category,
        status: "open",
        closes_at: closesAt.toISOString(),
        vote_count: 0,
        option_a_votes: 0,
        meta: result.meta,
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
      meta: result.meta,
    });
  } catch (err) {
    logError("cron/generate", "Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GenerateResult {
  texts: Record<string, string>;
  meta: QuestionMeta;
  category: string;
}

function getAssetsForCategory(category: string): Asset[] {
  const { ASSETS } = require("@/lib/question-templates");
  return (ASSETS as Asset[]).filter((a) => a.category === category);
}

/** Fetch price for an asset and build the question */
async function generateForAsset(
  asset: Asset,
  now: Date,
): Promise<GenerateResult | null> {
  let price: number | null = null;
  let threshold: number | undefined;
  const meta: QuestionMeta = {
    reference_price: 0,
    reference_time: now.toISOString(),
    asset_id: asset.id,
    asset_ticker: asset.ticker,
    asset_name: asset.name,
    source: asset.source,
    category: asset.category,
  };

  switch (asset.source) {
    case "coingecko":
      price = await fetchCryptoPrice(asset.id);
      break;

    case "yahoo":
      price = await fetchStockPrice(asset.id);
      break;

    case "openweathermap": {
      if (!asset.lat || !asset.lon) return null;
      const weather = await fetchWeather(asset.lat, asset.lon);
      if (!weather) return null;
      price = weather.currentTemp;
      // Set threshold slightly above forecast to make it interesting
      threshold = weather.forecastHigh;
      meta.threshold = threshold;
      meta.lat = asset.lat;
      meta.lon = asset.lon;
      break;
    }

    case "frankfurter": {
      if (!asset.base || !asset.target) return null;
      price = await fetchForexRate(asset.base, asset.target);
      meta.base = asset.base;
      meta.target = asset.target;
      break;
    }
  }

  if (price === null) return null;

  meta.reference_price = price;

  const texts = generateQuestionTexts({
    asset,
    price,
    category: asset.category,
    threshold,
  });

  return { texts, meta, category: asset.category };
}

/** Deterministic shuffle using a numeric seed */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
