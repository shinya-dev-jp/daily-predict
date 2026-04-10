import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/types";

// Deterministic fake data — no Math.random() so SSR is stable
const NAMES = [
  "CryptoSage",
  "PredictorX",
  "FutureSight",
  "OraclePro",
  "TrendHawk",
  "DataWizard",
  "MarketMind",
  "AlphaBrain",
  "PulseReader",
  "SignalStar",
  "NovaSeer",
  "ZenAnalyst",
  "RatioKing",
  "EdgeFinder",
  "QuickSense",
  "DeepBet",
  "WaveRider",
  "ClockWork",
  "PatternBot",
  "LuckLess",
];

function makeEntries(
  seed: number,
  currentUserRank: number,
  count = 20
): LeaderboardEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const rank = i + 1;
    const isCurrentUser = rank === currentUserRank;
    // Accuracy declines gently as rank increases
    const accuracy = Math.max(95 - (rank - 1) * 1.8 - (seed % 3), 40);
    const totalPredictions = Math.max(180 - (rank - 1) * 4 - (seed % 5), 15);
    const totalCorrect = Math.round((accuracy / 100) * totalPredictions);
    const streak = Math.max(30 - (rank - 1) * 1.2 - (seed % 4), 0);
    const points = Math.round(accuracy * 10 + streak * 50);

    return {
      rank,
      opaque_id: isCurrentUser ? "currentuser" : `fake${seed}r${rank}`,
      display_name: isCurrentUser
        ? "You"
        : NAMES[(rank + seed - 1) % NAMES.length],
      total_correct: totalCorrect,
      accuracy: Math.round(accuracy),
      streak: Math.round(streak),
      points,
      is_current_user: isCurrentUser,
    };
  });
}

export const DEMO_LEADERBOARD: Record<LeaderboardPeriod, LeaderboardEntry[]> = {
  weekly: makeEntries(0, 8),
  monthly: makeEntries(1, 5),
  allTime: makeEntries(2, 12),
};
