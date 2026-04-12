import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { logError } from "@/lib/server-log";

// ── Result resolution helpers ──────────────────────────────────────────────

interface PredictionRow {
  id: string;
  option_a_votes: number;
  vote_count: number;
  category: string;
  question_en: string;
  meta: Record<string, unknown> | null;
}

// ── Coin ticker → CoinGecko ID mapping ────────────────────────────────────
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple",
  BNB: "binancecoin", ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot",
  AVAX: "avalanche-2", MATIC: "matic-network", WLD: "worldcoin-wld",
};

/**
 * Extract coin ticker from question text (e.g. "Bitcoin (BTC)" → "BTC").
 */
function extractCoinTicker(questionEn: string): string | null {
  const match = questionEn.match(/\(([A-Z]{2,6})\)/);
  return match ? match[1] : null;
}

/**
 * Resolve a crypto prediction using CoinGecko API.
 * Supports two question patterns:
 * 1. Threshold: "Will X be above $Y?" → check current price vs threshold
 * 2. 24h comparison: "Will X be higher than 24 hours ago?" → check 24h % change
 */
async function resolveCrypto(prediction: PredictionRow): Promise<"A" | "B" | null> {
  try {
    const ticker = extractCoinTicker(prediction.question_en);
    const coinId = ticker ? COIN_IDS[ticker] : "bitcoin";
    if (!coinId) return null;

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coinData = data?.[coinId];
    if (!coinData) return null;

    const price = coinData.usd;
    const change24h = coinData.usd_24h_change;

    // Pattern 1: Threshold comparison ("above $85,000")
    const thresholdMatch = prediction.question_en.match(/\$([0-9,]+)/);
    if (thresholdMatch) {
      const threshold = parseFloat(thresholdMatch[1].replace(/,/g, ""));
      if (isNaN(threshold) || typeof price !== "number") return null;
      const isAbove = prediction.question_en.toLowerCase().includes("above");
      return isAbove ? (price > threshold ? "A" : "B") : (price < threshold ? "A" : "B");
    }

    // Pattern 2: 24h comparison ("higher than 24 hours ago")
    if (prediction.question_en.toLowerCase().includes("24 hour") && typeof change24h === "number") {
      return change24h > 0 ? "A" : "B";
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a stocks prediction by checking if current price > previous close.
 * Uses Yahoo Finance v8 API (unofficial, free, no key required).
 */
async function resolveStocks(prediction: PredictionRow): Promise<"A" | "B" | null> {
  try {
    // Extract ticker symbol from question (e.g. "Apple (AAPL)" → "AAPL")
    const tickerMatch = prediction.question_en.match(/\(([A-Z]{1,5})\)/);
    // For S&P 500, look for the index name
    const isSP500 = prediction.question_en.includes("S&P 500");
    const symbol = tickerMatch ? tickerMatch[1] : isSP500 ? "%5EGSPC" : null;
    if (!symbol) return null;

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes) || closes.length < 2) return null;

    const previousClose = closes[closes.length - 2];
    const currentClose = closes[closes.length - 1];
    if (typeof previousClose !== "number" || typeof currentClose !== "number") return null;

    // "higher than previous close" → A=Yes, B=No
    return currentClose > previousClose ? "A" : "B";
  } catch {
    return null;
  }
}

/**
 * Determine result based on category. Falls back to null if API unavailable.
 * Sports questions are left unresolved (manual resolution needed until sports API is added).
 */
async function determineResult(prediction: PredictionRow): Promise<"A" | "B" | null> {
  if (prediction.category === "crypto") {
    const result = await resolveCrypto(prediction);
    if (result) return result;
  }

  if (prediction.category === "stocks") {
    const result = await resolveStocks(prediction);
    if (result) return result;
  }

  // Sports: no auto-resolution yet — leave as null (inconclusive)
  // Majority-vote fallback removed: results must be objectively verifiable
  return null;
}

/**
 * POST /api/cron/resolve
 *
 * Called by Vercel Cron to:
 * 1. Close any open predictions whose closes_at has passed
 * 2. Resolve yesterday's closed prediction with a result
 * 3. Update user stats (total_correct, streak, points)
 *
 * Requires CRON_SECRET header for authentication.
 */
/**
 * Vercel Cron sends GET requests. Accept both GET and POST.
 */
export async function GET(req: NextRequest) {
  return handleResolve(req);
}

export async function POST(req: NextRequest) {
  return handleResolve(req);
}

async function handleResolve(req: NextRequest) {
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

    const now = new Date();
    const results: string[] = [];

    // ── Step 1: Close expired open predictions ──────────────────────────────
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
    // Find predictions with status='closed' that haven't been resolved yet
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
      // Determine result using category-specific APIs with fallbacks
      const result = await determineResult(prediction as PredictionRow);

      if (result === null) {
        // Cannot determine result — mark as resolved with no winner (refund scenario)
        await supabaseAdmin
          .from("predictions")
          .update({ status: "resolved", result: null })
          .eq("id", prediction.id);
        results.push(`Prediction ${prediction.id} resolved as inconclusive (no objective result)`);
        continue;
      }

      // Update prediction status to resolved
      const { error: resolveErr } = await supabaseAdmin
        .from("predictions")
        .update({ status: "resolved", result })
        .eq("id", prediction.id);

      if (resolveErr) {
        logError("cron/resolve", "error resolving prediction", { id: prediction.id, error: String(resolveErr) });
        results.push(`Failed to resolve prediction ${prediction.id}`);
        continue;
      }

      // ── Idempotency guard ────────────────────────────────────────────────
      // Only operate on user_predictions whose is_correct is still NULL.
      // If a previous cron run already processed this prediction, those rows
      // already have is_correct set and we skip them — preventing double
      // points/streak credit on retry.
      const { data: pendingVotes, error: pendingErr } = await supabaseAdmin
        .from("user_predictions")
        .select("user_address, chosen_option")
        .eq("prediction_id", prediction.id)
        .is("is_correct", null);

      if (pendingErr) {
        logError("cron/resolve", "Error fetching pending votes", { error: String(pendingErr) });
        results.push(`Failed to fetch pending votes for ${prediction.id}`);
        continue;
      }

      if (!pendingVotes || pendingVotes.length === 0) {
        results.push(`Prediction ${prediction.id} already processed (no pending votes)`);
        continue;
      }

      // ── Step 3: Mark is_correct on the pending rows only ─────────────────
      const { error: correctErr } = await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: true })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", result)
        .is("is_correct", null);

      if (correctErr) {
        logError("cron/resolve", "Error marking correct predictions", { error: String(correctErr) });
      }

      const incorrectOption = result === "A" ? "B" : "A";
      const { error: incorrectErr } = await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: false })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", incorrectOption)
        .is("is_correct", null);

      if (incorrectErr) {
        logError("cron/resolve", "Error marking incorrect predictions", { error: String(incorrectErr) });
      }

      // ── Step 4: Update user stats only for the pending votes we processed
      const votes = pendingVotes.map((v) => ({
        user_address: v.user_address,
        is_correct: v.chosen_option === result,
      }));

      // Update each user's stats. Single SELECT per user (was N+1 with two
      // round-trips before; consolidated into one).
      for (const vote of votes) {
        const { data: user, error: userErr } = await supabaseAdmin
          .from("users")
          .select("total_correct, streak, best_streak, points, badges, total_predictions")
          .eq("address", vote.user_address)
          .single();

        if (userErr || !user) continue;

        const isCorrect = vote.is_correct === true;
        const newTotalCorrect = (user.total_correct ?? 0) + (isCorrect ? 1 : 0);
        const newStreak = isCorrect ? (user.streak ?? 0) + 1 : 0;
        const newBestStreak = Math.max(newStreak, user.best_streak ?? 0);
        // Points: +10 for correct, +5 bonus per streak day
        const pointsEarned = isCorrect ? 10 + (newStreak * 5) : 0;
        const newPoints = (user.points ?? 0) + pointsEarned;

        // Check for badge awards (uses already-fetched user data)
        const existingBadges: { id: string; earned_at: string }[] = user.badges ?? [];
        const earnedIds = new Set(existingBadges.map((b) => b.id));
        const newBadges = [...existingBadges];
        const now = new Date().toISOString().slice(0, 10);

        // Badge: first_prediction
        if (!earnedIds.has("first_prediction") && (user.total_predictions ?? 0) >= 1) {
          newBadges.push({ id: "first_prediction", earned_at: now });
        }
        // Badge: streak_3
        if (!earnedIds.has("streak_3") && newStreak >= 3) {
          newBadges.push({ id: "streak_3", earned_at: now });
        }
        // Badge: streak_7
        if (!earnedIds.has("streak_7") && newStreak >= 7) {
          newBadges.push({ id: "streak_7", earned_at: now });
        }
        // Badge: streak_30
        if (!earnedIds.has("streak_30") && newStreak >= 30) {
          newBadges.push({ id: "streak_30", earned_at: now });
        }
        // Badge: consistent (10+ correct)
        if (!earnedIds.has("consistent") && newTotalCorrect >= 10) {
          newBadges.push({ id: "consistent", earned_at: now });
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

      results.push(`Resolved prediction ${prediction.id} (result: ${result}, ${votes.length} votes updated)`);
    }

    return NextResponse.json({ results });
  } catch (err) {
    logError("cron/resolve", "Unexpected error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
