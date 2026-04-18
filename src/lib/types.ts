// ============================================================
// Core prediction types
// ============================================================

export type PredictionCategory =
  | "crypto"
  | "stocks"
  | "weather"
  | "forex"
  | "sports"
  | "tech"
  | "world"
  | "entertainment";

export type PredictionResult = "A" | "B" | null;

export type PredictionStatus = "open" | "closed" | "resolved";

export interface Prediction {
  id: string;
  /** English question text */
  question_en: string;
  /** Japanese question text */
  question_ja: string;
  /** Spanish question text */
  question_es?: string;
  /** Korean question text */
  question_ko?: string;
  /** Thai question text */
  question_th?: string;
  /** Portuguese question text */
  question_pt?: string;
  /** English label for option A */
  option_a: string;
  /** English label for option B */
  option_b: string;
  category: PredictionCategory;
  status: PredictionStatus;
  /** ISO timestamp when voting closes */
  closes_at: string;
  /** Resolved result: "A", "B", or null if unresolved */
  result: PredictionResult;
  /** Percentage of users who chose A (0-100) */
  option_a_percent: number;
  /** Total number of votes cast */
  vote_count: number;
  created_at: string;
  /** Metadata for template-based questions (reference price, asset, etc.) */
  meta?: Record<string, unknown> | null;
}

// ============================================================
// User prediction (a single vote by a user)
// ============================================================

export interface UserPrediction {
  id: string;
  /** World ID nullifier hash */
  user_address: string;
  prediction_id: string;
  chosen_option: "A" | "B";
  /** Whether the user's choice matched the resolved result */
  is_correct: boolean | null;
  created_at: string;
}

// ============================================================
// User profile & gamification
// ============================================================

export interface UserProfile {
  /** World ID nullifier hash (primary key) */
  address: string;
  display_name: string;
  total_predictions: number;
  total_correct: number;
  /** Accuracy percentage 0-100 */
  accuracy: number;
  /** Current consecutive correct streak */
  streak: number;
  /** Best ever consecutive streak */
  best_streak: number;
  /** Prediction points (gamification currency) */
  points: number;
  badges: Badge[];
  created_at: string;
}

// ============================================================
// Gamification
// ============================================================

export interface Badge {
  id: string;
  name: string;
  icon: string;
  /** Description of how to earn this badge */
  requirement: string;
  earned_at: string | null;
}

export type BadgeId =
  | "first_prediction"    // made first prediction
  | "streak_3"            // 3-day correct streak
  | "streak_7"            // 7-day correct streak
  | "streak_30"           // 30-day correct streak
  | "contrarian"          // correctly picked minority option 5 times
  | "consistent"          // 70%+ accuracy over 20+ predictions
  | "early_bird";         // among first 100 to answer on a given day

// ============================================================
// Leaderboard
// ============================================================

export interface LeaderboardEntry {
  rank: number;
  /** Opaque per-user identifier (first 12 hex chars of nullifier).
   *  Stable for React keys; intentionally NOT the raw nullifier hash. */
  opaque_id: string;
  display_name: string;
  total_correct: number;
  accuracy: number;
  streak: number;
  points: number;
  is_current_user: boolean;
}

export type LeaderboardPeriod = "weekly" | "monthly" | "allTime";

// ============================================================
// API response shapes
// ============================================================

export interface TodayPredictionResponse {
  prediction: Prediction;
  /** The authenticated user's vote for today's prediction, if cast */
  user_vote: UserPrediction | null;
}

export interface VoteRequest {
  prediction_id: string;
  chosen_option: "A" | "B";
  /** World ID proof payload */
  proof: {
    nullifier_hash: string;
    merkle_root: string;
    proof: string;
    verification_level: string;
  };
}

export interface VoteResponse {
  success: boolean;
  /** Updated vote counts */
  option_a_percent: number;
  vote_count: number;
  error?: string;
}

// ============================================================
// Navigation
// ============================================================

export type TabKey = "predict" | "results" | "leaderboard" | "profile";
