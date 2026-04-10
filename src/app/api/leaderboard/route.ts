import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { logError } from "@/lib/server-log";

/**
 * GET /api/leaderboard?period=weekly|monthly|allTime
 *
 * Returns the top 20 users by points + the current user's rank if they are
 * outside the top 20. Authentication is OPTIONAL — unauthenticated callers
 * just don't get an `is_current_user` flag.
 *
 * Privacy: raw nullifier hashes are NEVER returned. Only display names and
 * non-identifying stats. The "is_current_user" flag is computed server-side
 * by comparing the verified token nullifier against each row internally.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "weekly";

    // Auth is optional here — leaderboard is public, but auth lets us mark
    // the requesting user's row.
    const callerNullifier = authenticateRequest(req);

    // For now, rank all users by points. Period filtering would later use
    // date ranges on user_predictions.
    void period;
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("address, display_name, total_predictions, total_correct, streak, best_streak, points")
      .gt("total_predictions", 0)
      .order("points", { ascending: false })
      .limit(20);

    if (error) {
      logError("api/leaderboard", "select failed", { code: error.code });
      return NextResponse.json({ entries: [], currentUser: null }, { status: 500 });
    }

    const anonHandle = (addr: string) => `#${addr.replace(/^0x/, "").slice(0, 6)}`;
    // Stable per-row id derived from the nullifier so the client can match
    // current_user without exposing the raw hash. Same scheme as anonHandle
    // but kept opaque to readers ("opaque_id").
    const opaqueId = (addr: string) => addr.replace(/^0x/, "").slice(0, 12);

    const entries = (users ?? []).map((u, i) => ({
      rank: i + 1,
      // address is intentionally REMOVED from the response.
      opaque_id: opaqueId(u.address),
      display_name:
        !u.display_name || u.display_name === "Predictor"
          ? anonHandle(u.address)
          : u.display_name,
      total_correct: u.total_correct ?? 0,
      accuracy:
        u.total_predictions > 0
          ? Math.round(((u.total_correct ?? 0) / u.total_predictions) * 100)
          : 0,
      streak: u.streak ?? 0,
      points: u.points ?? 0,
      is_current_user: callerNullifier === u.address,
    }));

    // Find current user; if not in top 20, fetch separately
    let currentUser = entries.find((e) => e.is_current_user) ?? null;
    if (!currentUser && callerNullifier) {
      const { data: me } = await supabaseAdmin
        .from("users")
        .select("address, display_name, total_predictions, total_correct, streak, best_streak, points")
        .eq("address", callerNullifier)
        .single();

      if (me && me.total_predictions > 0) {
        const { count } = await supabaseAdmin
          .from("users")
          .select("address", { count: "exact", head: true })
          .gt("points", me.points ?? 0);

        currentUser = {
          rank: (count ?? 0) + 1,
          opaque_id: opaqueId(me.address),
          display_name:
            !me.display_name || me.display_name === "Predictor"
              ? anonHandle(me.address)
              : me.display_name,
          total_correct: me.total_correct ?? 0,
          accuracy:
            me.total_predictions > 0
              ? Math.round(((me.total_correct ?? 0) / me.total_predictions) * 100)
              : 0,
          streak: me.streak ?? 0,
          points: me.points ?? 0,
          is_current_user: true,
        };
      }
    }

    return NextResponse.json({ entries, currentUser });
  } catch (err) {
    logError("api/leaderboard", "unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ entries: [], currentUser: null }, { status: 500 });
  }
}
