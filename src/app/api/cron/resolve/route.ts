import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/server-log";
import {
  fetchCryptoPrice,
  fetchStockPrice,
  fetchActualMaxTemp,
  fetchForexRate,
} from "@/lib/price-api";
import type { QuestionMeta } from "@/lib/question-templates";

/**
 * GET|POST /api/cron/resolve
 *
 * Called by Vercel Cron to:
 * 1. Close any open predictions whose closes_at has passed
 * 2. Resolve closed predictions by comparing current price to meta.reference_price
 * 3. Update user stats (total_correct, streak, points, badges)
 *
 * NEW SYSTEM (2026-04-14):
 * - No text parsing — uses meta.reference_price for numeric comparison
 * - Supports crypto, stocks, weather, forex via unified interface
 */

export async function GET(req: NextRequest) {
  return handleResolve(req);
}

export async function POST(req: NextRequest) {
  return handleResolve(req);
}

// ---------------------------------------------------------------------------
// Resolution logic — uses meta.reference_price, no text parsing
// ---------------------------------------------------------------------------

interface PredictionRow {
  id: string;
  option_a_votes: number;
  vote_count: number;
  category: string;
  question_en: string;
  meta: QuestionMeta | null;
}

/**
 * Determine result by comparing current value to meta.reference_price.
 * - crypto/stocks/forex: current price > reference_price → A (Yes)
 * - weather: actual max temp > threshold → A (Yes)
 *
 * Falls back to legacy text-parsing for old questions without meta.
 */
async function determineResult(prediction: PredictionRow): Promise<"A" | "B" | null> {
  const meta = prediction.meta;

  // ── New system: meta-based resolution ────────────────────────────────────
  if (meta?.reference_price != null && meta?.asset_id && meta?.source) {
    return resolveByMeta(meta);
  }

  // ── Legacy fallback: old questions without meta ──────────────────────────
  if (prediction.category === "crypto") {
    return resolveCryptoLegacy(prediction);
  }
  if (prediction.category === "stocks") {
    return resolveStocksLegacy(prediction);
  }

  return null;
}

/**
 * New resolution: simple numeric comparison using meta data.
 */
async function resolveByMeta(meta: QuestionMeta): Promise<"A" | "B" | null> {
  let currentValue: number | null = null;

  switch (meta.source) {
    case "coingecko":
      currentValue = await fetchCryptoPrice(meta.asset_id);
      break;
    case "yahoo":
      currentValue = await fetchStockPrice(meta.asset_id);
      break;
    case "openweathermap":
      if (meta.lat != null && meta.lon != null) {
        currentValue = await fetchActualMaxTemp(meta.lat, meta.lon);
      }
      break;
    case "frankfurter":
      if (meta.base && meta.target) {
        currentValue = await fetchForexRate(meta.base, meta.target);
      }
      break;
  }

  if (currentValue === null) return null;

  // Weather uses threshold comparison; everything else uses reference_price
  const compareValue = meta.category === "weather" && meta.threshold != null
    ? meta.threshold
    : meta.reference_price;

  return currentValue > compareValue ? "A" : "B";
}

// ---------------------------------------------------------------------------
// Legacy resolution (for old questions created before the template system)
// ---------------------------------------------------------------------------

const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple",
  BNB: "binancecoin", DOGE: "dogecoin", WLD: "worldcoin-wld",
};

async function resolveCryptoLegacy(prediction: PredictionRow): Promise<"A" | "B" | null> {
  try {
    const match = prediction.question_en.match(/\(([A-Z]{2,6})\)/);
    const ticker = match ? match[1] : null;
    const coinId = ticker ? COIN_IDS[ticker] : "bitcoin";
    if (!coinId) return null;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coinData = data?.[coinId];
    if (!coinData) return null;

    const price = coinData.usd;
    const change24h = coinData.usd_24h_change;

    // Threshold pattern
    const thresholdMatch = prediction.question_en.match(/\$([0-9,]+)/);
    if (thresholdMatch) {
      const threshold = parseFloat(thresholdMatch[1].replace(/,/g, ""));
      if (isNaN(threshold) || typeof price !== "number") return null;
      return price > threshold ? "A" : "B";
    }

    // 24h pattern
    if (prediction.question_en.toLowerCase().includes("24 hour") && typeof change24h === "number") {
      return change24h > 0 ? "A" : "B";
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveStocksLegacy(prediction: PredictionRow): Promise<"A" | "B" | null> {
  try {
    const tickerMatch = prediction.question_en.match(/\(([A-Z]{1,5})\)/);
    const isSP500 = prediction.question_en.includes("S&P 500");
    const symbol = tickerMatch ? tickerMatch[1] : isSP500 ? "%5EGSPC" : null;
    if (!symbol) return null;

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes) || closes.length < 2) return null;

    const previousClose = closes[closes.length - 2];
    const currentClose = closes[closes.length - 1];
    if (typeof previousClose !== "number" || typeof currentClose !== "number") return null;

    return currentClose > previousClose ? "A" : "B";
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleResolve(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const results: string[] = [];

    // ── Step 1: Close expired open predictions ─────────────────────────────
    const { data: expiredOpen, error: closeErr } = await supabaseAdmin
      .from("predictions")
      .update({ status: "closed" })
      .eq("status", "open")
      .lt("closes_at", now.toISOString())
      .select("id");

    if (closeErr) {
      logError("cron/resolve", "Error closing predictions", { error: String(closeErr) });
    } else if (expiredOpen && expiredOpen.length > 0) {
      results.push(`Closed ${expiredOpen.length} expired prediction(s)`);
    }

    // ── Step 2: Resolve closed predictions ──────────────────────────────────
    const { data: toResolve, error: fetchErr } = await supabaseAdmin
      .from("predictions")
      .select("id, option_a_votes, vote_count, category, question_en, meta")
      .eq("status", "closed")
      .order("closes_at", { ascending: true })
      .limit(10);

    if (fetchErr) {
      logError("cron/resolve", "Error fetching closed predictions", { error: String(fetchErr) });
      return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
    }

    if (!toResolve || toResolve.length === 0) {
      results.push("No predictions to resolve");
      return NextResponse.json({ results });
    }

    for (const prediction of toResolve) {
      const result = await determineResult(prediction as PredictionRow);

      if (result === null) {
        await supabaseAdmin
          .from("predictions")
          .update({ status: "resolved", result: null })
          .eq("id", prediction.id);
        results.push(`Prediction ${prediction.id} resolved as inconclusive`);
        continue;
      }

      // Update prediction status
      const { error: resolveErr } = await supabaseAdmin
        .from("predictions")
        .update({ status: "resolved", result })
        .eq("id", prediction.id);

      if (resolveErr) {
        logError("cron/resolve", "Error resolving", { id: prediction.id, error: String(resolveErr) });
        results.push(`Failed to resolve ${prediction.id}`);
        continue;
      }

      // ── Idempotency: only process votes with is_correct IS NULL ────────
      const { data: pendingVotes, error: pendingErr } = await supabaseAdmin
        .from("user_predictions")
        .select("user_address, chosen_option")
        .eq("prediction_id", prediction.id)
        .is("is_correct", null);

      if (pendingErr) {
        logError("cron/resolve", "Error fetching pending votes", { error: String(pendingErr) });
        continue;
      }

      if (!pendingVotes || pendingVotes.length === 0) {
        results.push(`Prediction ${prediction.id} already processed`);
        continue;
      }

      // ── Mark is_correct ────────────────────────────────────────────────
      await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: true })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", result)
        .is("is_correct", null);

      const incorrectOption = result === "A" ? "B" : "A";
      await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: false })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", incorrectOption)
        .is("is_correct", null);

      // ── Update user stats ──────────────────────────────────────────────
      for (const vote of pendingVotes) {
        const { data: user, error: userErr } = await supabaseAdmin
          .from("users")
          .select("total_correct, streak, best_streak, points, badges, total_predictions")
          .eq("address", vote.user_address)
          .single();

        if (userErr || !user) continue;

        const isCorrect = vote.chosen_option === result;
        const newTotalCorrect = (user.total_correct ?? 0) + (isCorrect ? 1 : 0);
        const newStreak = isCorrect ? (user.streak ?? 0) + 1 : 0;
        const newBestStreak = Math.max(newStreak, user.best_streak ?? 0);
        const pointsEarned = isCorrect ? 10 + (newStreak * 5) : 0;
        const newPoints = (user.points ?? 0) + pointsEarned;

        // Badge awards
        const existingBadges: { id: string; earned_at: string }[] = user.badges ?? [];
        const earnedIds = new Set(existingBadges.map((b) => b.id));
        const newBadges = [...existingBadges];
        const today = new Date().toISOString().slice(0, 10);

        if (!earnedIds.has("first_prediction") && (user.total_predictions ?? 0) >= 1) {
          newBadges.push({ id: "first_prediction", earned_at: today });
        }
        if (!earnedIds.has("streak_3") && newStreak >= 3) {
          newBadges.push({ id: "streak_3", earned_at: today });
        }
        if (!earnedIds.has("streak_7") && newStreak >= 7) {
          newBadges.push({ id: "streak_7", earned_at: today });
        }
        if (!earnedIds.has("streak_30") && newStreak >= 30) {
          newBadges.push({ id: "streak_30", earned_at: today });
        }
        if (!earnedIds.has("consistent") && newTotalCorrect >= 10) {
          newBadges.push({ id: "consistent", earned_at: today });
        }

        await supabaseAdmin
          .from("users")
          .update({
            total_correct: newTotalCorrect,
            streak: newStreak,
            best_streak: newBestStreak,
            points: newPoints,
            badges: newBadges,
          })
          .eq("address", vote.user_address);
      }

      results.push(`Resolved ${prediction.id} (result: ${result}, ${pendingVotes.length} votes)`);
    }

    return NextResponse.json({ results });
  } catch (err) {
    logError("cron/resolve", "Unexpected error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
