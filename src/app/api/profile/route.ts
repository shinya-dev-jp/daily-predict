import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { logError } from "@/lib/server-log";
import { jstYearMonth } from "@/lib/date-util";

/**
 * GET /api/profile
 *
 * Returns the authenticated user's full profile with prediction history for
 * the current month calendar. The wallet address is derived from the auth
 * token, never accepted as a query parameter — this prevents anyone from
 * reading another user's profile by knowing their wallet address.
 */
export async function GET(req: NextRequest) {
  try {
    const walletAddress = authenticateRequest(req);
    if (!walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("address", walletAddress)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Backfill legacy "Predictor" default to a unique anonymous handle
    if (!user.display_name || user.display_name === "Predictor") {
      const cleanAddr = walletAddress.replace(/^0x/, "");
      const newName = `#${cleanAddr.slice(0, 6)}`;
      const { data: updated } = await supabaseAdmin
        .from("users")
        .update({ display_name: newName })
        .eq("address", walletAddress)
        .select("*")
        .single();
      if (updated) {
        user.display_name = updated.display_name;
      }
    }

    // Fetch current month's predictions for calendar heatmap.
    // Use JST month boundaries so the calendar matches user expectations
    // (an Apr 1 morning user in JST should see April, not March).
    const { year, month } = jstYearMonth();
    // month is 1-indexed; build [firstDay, lastDay] in UTC for the JST month
    const firstDayJst = new Date(Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000);
    const lastDayJst = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000);
    const firstDay = firstDayJst.toISOString();
    const lastDay = lastDayJst.toISOString();

    const { data: monthPredictions } = await supabaseAdmin
      .from("user_predictions")
      .select("chosen_option, is_correct, created_at")
      .eq("user_address", walletAddress)
      .gte("created_at", firstDay)
      .lt("created_at", lastDay)
      .order("created_at", { ascending: true });

    // Build calendar data: { day: outcome }
    const calendar: Record<number, "correct" | "wrong" | "missed"> = {};
    for (const p of monthPredictions ?? []) {
      const day = new Date(p.created_at).getDate();
      if (p.is_correct === true) calendar[day] = "correct";
      else if (p.is_correct === false) calendar[day] = "wrong";
      else calendar[day] = "missed";
    }

    // Fetch recent predictions (last 5)
    const { data: recentPredictions } = await supabaseAdmin
      .from("user_predictions")
      .select(`
        id, chosen_option, is_correct, created_at,
        predictions:prediction_id (
          question_en, question_ja, option_a, option_b, result
        )
      `)
      .eq("user_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(5);

    const recent = (recentPredictions ?? []).map((p) => {
      const pred = (p as Record<string, unknown>).predictions as Record<string, string> | null;
      return {
        id: p.id,
        question: pred?.question_en ?? "Unknown question",
        question_ja: pred?.question_ja ?? "",
        user_choice_label: p.chosen_option === "A" ? (pred?.option_a ?? "Yes") : (pred?.option_b ?? "No"),
        correct_choice_label: pred?.result === "A" ? (pred?.option_a ?? "Yes") : (pred?.option_b ?? "No"),
        is_correct: p.is_correct ?? false,
        date: new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });

    const accuracy = user.total_predictions > 0
      ? Math.round((user.total_correct / user.total_predictions) * 100)
      : 0;

    // Build badge data with metadata
    const BADGE_META: Record<string, { name: string; icon: string; requirement: string }> = {
      first_prediction: { name: "First Prediction", icon: "star", requirement: "Make your first prediction" },
      streak_3: { name: "3-Day Streak", icon: "flame", requirement: "3 correct predictions in a row" },
      streak_7: { name: "Week Warrior", icon: "zap", requirement: "7 correct predictions in a row" },
      streak_30: { name: "Monthly Master", icon: "trophy", requirement: "30 correct predictions in a row" },
      consistent: { name: "Consistent", icon: "check-circle", requirement: "Get 10 predictions correct" },
      contrarian: { name: "Contrarian", icon: "trending-up", requirement: "Win when <30% agreed with you" },
      early_bird: { name: "Early Bird", icon: "clock", requirement: "Predict within 1 hour of question posting" },
    };

    const earnedBadges = (user.badges ?? []) as { id: string; earned_at: string }[];
    const earnedIds = new Set(earnedBadges.map((b: { id: string }) => b.id));

    const badges = Object.entries(BADGE_META).map(([id, meta]) => ({
      id,
      ...meta,
      earned_at: earnedBadges.find((b: { id: string }) => b.id === id)?.earned_at ?? null,
    }));

    return NextResponse.json({
      profile: {
        // Note: address (wallet address) intentionally NOT returned to the
        // client here. Anything client-facing that needs to identify the user
        // should use the auth token round-trip, not the raw address.
        display_name: user.display_name ?? "You",
        total_predictions: user.total_predictions ?? 0,
        total_correct: user.total_correct ?? 0,
        accuracy,
        streak: user.streak ?? 0,
        best_streak: user.best_streak ?? 0,
        points: user.points ?? 0,
        badges,
      },
      calendar: {
        year,
        month, // already 1-indexed (JST month)
        data: calendar,
      },
      recentPredictions: recent,
    });
  } catch (err) {
    logError("api/profile", "unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
