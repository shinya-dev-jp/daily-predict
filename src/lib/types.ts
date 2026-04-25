// ============================================================
// TuringVote — neutral 2-choice polls for verified humans
//
// Only the types actually used by the UI + API live here. The Daily Predict
// legacy types (Prediction, UserPrediction, Badge, LeaderboardEntry,
// TodayPredictionResponse, VoteRequest/Response using prediction_id, etc.)
// were removed on 2026-04-19 as part of the Worldcoin audit cleanup — the
// app is a 2-choice poll, not a prediction game, and keeping those types
// around was an audit risk.
// ============================================================

export type QuestionCategory =
  | "lifestyle"
  | "preference"
  | "style"
  | "values"
  | "ethics";

export interface Question {
  id: number;
  category: QuestionCategory;
  ja: { prompt: string; option_a: string; option_b: string };
  en: { prompt: string; option_a: string; option_b: string };
}

export interface Tally {
  question_id: number;
  category: QuestionCategory | null;
  total_votes: number;
  votes_a: number;
  votes_b: number;
}

export type VoteChoice = "A" | "B";

// ============================================================
// User profile (minimal — TuringVote does NOT store streaks / points / badges).
// Populated by /api/auth/wallet after SIWE succeeds.
// ============================================================

export interface UserProfile {
  /** Lowercase 0x-prefixed wallet address (42 chars). */
  address: string;
  /** Friendly short handle like "#a1b2c3" derived from the address. */
  display_name: string;
  /** ISO timestamp of first wallet auth. */
  created_at: string;
  /**
   * Q1 B+ (2026-04-19): true if user has completed first-time Orb verify.
   * Persisted server-side in users.orb_verified_at. Used by /api/vote to
   * gate wallet-tier voting behind one-time human proof per wallet.
   */
  orb_verified?: boolean;
  /**
   * Q3 (2026-04-19): question_ids this wallet has already voted on.
   * Server returns the full list at /api/auth/wallet so the client can:
   *   - skip already-voted questions (excludeIds for /api/questions)
   *   - detect "all done" state when length === total pool size
   *   - automatically pick up newly-added questions on the next session
   */
  voted_question_ids?: number[];
}
