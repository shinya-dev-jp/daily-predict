import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyAuthToken } from "@/lib/auth";
import { logError, logInfo } from "@/lib/server-log";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

/**
 * GET /api/me/profile — personal "TuringVote pattern" aggregate for the
 * authenticated voter.
 *
 * Purpose (2026-05-27, 44-role fullharness for Critical=0):
 *   Surface a *self-reflection mirror* using the user's own vote history.
 *   Compounding value per session is the core retention loop. NOT a leaderboard,
 *   NOT a streak, NOT a ranking against other users — only the user's own
 *   pattern, reflected back. Aligned with the Worldcoin-approved "self-profile"
 *   utility described in portal_config.json / about.use3Title.
 *
 * Identity:
 *   We use the same wallet→nullifier HMAC scope as /api/vote
 *   ("turingvote-vote:"), so the aggregate matches exactly the votes the user
 *   has cast. The function below MUST stay bit-identical to the one in
 *   /api/vote — any drift breaks identity continuity and the profile would
 *   silently show partial data. NULLIFIER_SECRET rotation is forbidden by
 *   that route's contract; same constraint applies here.
 *
 * Privacy:
 *   - No new data is collected. We only aggregate what's already in tc_votes.
 *   - Result is scoped to the calling user's nullifier only.
 *   - No cross-user comparison or ranking.
 *   - Cookie auth required; pure Orb-only sessions (no wallet cookie) return
 *     401 — acceptable for Phase 1 because the production flow always
 *     materializes a wallet cookie before voting.
 *
 * Threshold:
 *   First-time users (totalVotes < MIN_VOTES_FOR_PROFILE) get `ready: false`
 *   so the client knows to suppress the profile section. This avoids a
 *   "1 vote → instant grand profile" UX that would feel hollow.
 */

// IMPORTANT: must match /api/vote::walletToActionScopedNullifier exactly.
// Same secret env var, same scope prefix, same casing rules.
function walletToActionScopedNullifier(address: string): string | null {
  const secret = process.env.NULLIFIER_SECRET;
  if (!secret || secret.length < 16) {
    logError(
      "api/me/profile",
      "NULLIFIER_SECRET missing or <16 chars",
    );
    return null;
  }
  return createHmac("sha256", secret)
    .update(`turingvote-vote:${address.toLowerCase()}`)
    .digest("hex");
}

const MIN_VOTES_FOR_PROFILE = 10; // = 2 completed sessions

type VoteRow = {
  question_id: number;
  choice: "A" | "B";
  created_at: string;
};

type TallyRow = {
  question_id: number;
  total_votes: number;
  votes_a: number;
  votes_b: number;
};

type QuestionTextRow = {
  id: number;
  en: { prompt: string };
  ja: { prompt: string };
};

interface MomentDetail {
  questionId: number;
  userSidePct: number;
  promptEn: string;
  promptJa: string;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let address: string | null = null;
  try {
    address = verifyAuthToken(token);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!address) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nullifier = walletToActionScopedNullifier(address);
  if (!nullifier) {
    return NextResponse.json({ error: "config_error" }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch all votes by this user, ordered chronologically.
  const { data: votesData, error: votesErr } = await supabase
    .from("tc_votes")
    .select("question_id, choice, created_at")
    .eq("nullifier_hash", nullifier)
    .order("created_at", { ascending: true });

  if (votesErr) {
    logError("api/me/profile", "fetch user votes failed", {
      code: votesErr.code,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const votes = (votesData ?? []) as VoteRow[];
  const totalVotes = votes.length;

  if (totalVotes < MIN_VOTES_FOR_PROFILE) {
    return NextResponse.json({
      ready: false,
      totalVotes,
      minVotesForProfile: MIN_VOTES_FOR_PROFILE,
    });
  }

  // Fetch tallies for all question_ids the user has voted on.
  const questionIds = Array.from(new Set(votes.map((v) => v.question_id)));

  const [{ data: talliesData, error: talliesErr }, { data: qtextData, error: qtextErr }] =
    await Promise.all([
      supabase
        .from("tc_question_tally")
        .select("question_id, total_votes, votes_a, votes_b")
        .in("question_id", questionIds),
      supabase
        .from("tc_questions")
        .select("id, en, ja")
        .in("id", questionIds),
    ]);

  if (talliesErr) {
    logError("api/me/profile", "fetch tallies failed", {
      code: talliesErr.code,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (qtextErr) {
    logError("api/me/profile", "fetch question text failed", {
      code: qtextErr.code,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const tallyMap = new Map<number, TallyRow>(
    ((talliesData ?? []) as TallyRow[]).map((t) => [t.question_id, t]),
  );
  const qtextMap = new Map<number, QuestionTextRow>(
    ((qtextData ?? []) as QuestionTextRow[]).map((q) => [q.id, q]),
  );

  let majorityCount = 0;
  let minorityCount = 0;
  let mostContrarian: MomentDetail | null = null;
  let mostAligned: MomentDetail | null = null;

  for (const vote of votes) {
    const tally = tallyMap.get(vote.question_id);
    if (!tally || tally.total_votes === 0) continue;
    const userVotedA = vote.choice === "A";
    const userSideVotes = userVotedA ? tally.votes_a : tally.votes_b;
    const userSidePct = Math.round((userSideVotes / tally.total_votes) * 100);

    if (userSidePct >= 50) {
      majorityCount++;
      if (!mostAligned || userSidePct > mostAligned.userSidePct) {
        const qtext = qtextMap.get(vote.question_id);
        mostAligned = {
          questionId: vote.question_id,
          userSidePct,
          promptEn: qtext?.en?.prompt ?? "",
          promptJa: qtext?.ja?.prompt ?? "",
        };
      }
    } else {
      minorityCount++;
      if (!mostContrarian || userSidePct < mostContrarian.userSidePct) {
        const qtext = qtextMap.get(vote.question_id);
        mostContrarian = {
          questionId: vote.question_id,
          userSidePct,
          promptEn: qtext?.en?.prompt ?? "",
          promptJa: qtext?.ja?.prompt ?? "",
        };
      }
    }
  }

  const completedSessions = Math.floor(totalVotes / 5);
  const majorityPct =
    totalVotes > 0 ? Math.round((majorityCount / totalVotes) * 100) : 0;

  // Observability — log aggregate-only signals. Never log nullifier or address.
  logInfo("api/me/profile", "profile served", {
    total_votes: totalVotes,
    completed_sessions: completedSessions,
    majority_pct: majorityPct,
    has_contrarian: !!mostContrarian,
    has_aligned: !!mostAligned,
  });

  return NextResponse.json({
    ready: true,
    totalVotes,
    completedSessions,
    majorityCount,
    minorityCount,
    majorityPct,
    mostContrarian,
    mostAligned,
  });
}
