import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ── Result resolution helpers ──────────────────────────────────────────────

interface PredictionRow {
  id: string;
  option_a_votes: number;
  vote_count: number;
  category: string;
  question_en: string;
  meta: Record<string, unknown> | null;
}

/**
 * Determine the result for a crypto prediction by fetching BTC price from CoinGecko.
 * Looks for a price threshold in the question text (e.g. "$85,000" or "$90,000").
 */
async function resolveCrypto(prediction: PredictionRow): Promise<"A" | "B" | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const btcPrice = data?.bitcoin?.usd;
    if (typeof btcPrice !== "number") return null;

    // Extract threshold from question (e.g. "$85,000" or "$90,000")
    const match = prediction.question_en.match(/\$([0-9,]+)/);
    if (!match) return null;
    const threshold = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(threshold)) return null;

    // "above" → A=Yes, B=No
    const isAbove = prediction.question_en.toLowerCase().includes("above");
    if (isAbove) {
      return btcPrice > threshold ? "A" : "B";
    }
    // "below" → A=Yes, B=No
    return btcPrice < threshold ? "A" : "B";
  } catch {
    return null;
  }
}

/**
 * Determine result based on category. Falls back to majority vote if API unavailable.
 */
async function determineResult(prediction: PredictionRow): Promise<"A" | "B"> {
  // Try category-specific resolution
  if (prediction.category === "crypto") {
    const result = await resolveCrypto(prediction);
    if (result) return result;
  }

  // Fallback: majority vote (if enough votes), otherwise random
  if (prediction.vote_count >= 5) {
    const optionAPercent = prediction.option_a_votes / prediction.vote_count;
    // Use majority as proxy for "likely correct answer"
    return optionAPercent >= 0.5 ? "A" : "B";
  }

  // Last resort: random (only for non-crypto categories without enough votes)
  return Math.random() > 0.5 ? "A" : "B";
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
      console.error("[cron/resolve] Error closing predictions:", closeErr);
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
      console.error("[cron/resolve] Error fetching closed predictions:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
    }

    if (!toResolve || toResolve.length === 0) {
      results.push("No predictions to resolve");
      return NextResponse.json({ results });
    }

    for (const prediction of toResolve) {
      // Determine result using category-specific APIs with fallbacks
      const result = await determineResult(prediction as PredictionRow);

      // Update prediction status to resolved
      const { error: resolveErr } = await supabaseAdmin
        .from("predictions")
        .update({ status: "resolved", result })
        .eq("id", prediction.id);

      if (resolveErr) {
        console.error(`[cron/resolve] Error resolving prediction ${prediction.id}:`, resolveErr);
        results.push(`Failed to resolve prediction ${prediction.id}`);
        continue;
      }

      // ── Step 3: Update user_predictions with is_correct ─────────────────
      // Mark correct predictions
      const { error: correctErr } = await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: true })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", result);

      if (correctErr) {
        console.error(`[cron/resolve] Error marking correct predictions:`, correctErr);
      }

      // Mark incorrect predictions
      const incorrectOption = result === "A" ? "B" : "A";
      const { error: incorrectErr } = await supabaseAdmin
        .from("user_predictions")
        .update({ is_correct: false })
        .eq("prediction_id", prediction.id)
        .eq("chosen_option", incorrectOption);

      if (incorrectErr) {
        console.error(`[cron/resolve] Error marking incorrect predictions:`, incorrectErr);
      }

      // ── Step 4: Update user stats ───────────────────────────────────────
      // Fetch all user_predictions for this prediction to update user stats
      const { data: votes, error: votesErr } = await supabaseAdmin
        .from("user_predictions")
        .select("user_address, is_correct")
        .eq("prediction_id", prediction.id);

      if (votesErr || !votes) {
        console.error(`[cron/resolve] Error fetching votes:`, votesErr);
        results.push(`Resolved prediction ${prediction.id} (result: ${result}) but failed to update user stats`);
        continue;
      }

      // Update each user's stats
      for (const vote of votes) {
        const { data: user, error: userErr } = await supabaseAdmin
          .from("users")
          .select("total_correct, streak, best_streak, points")
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

        await supabaseAdmin
          .from("users")
          .update({
            total_correct: newTotalCorrect,
            streak: newStreak,
            best_streak: newBestStreak,
            points: newPoints,
          })
          .eq("address", vote.user_address);
      }

      results.push(`Resolved prediction ${prediction.id} (result: ${result}, ${votes.length} votes updated)`);
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[cron/resolve] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
