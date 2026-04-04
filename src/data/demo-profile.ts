import type { UserProfile, Badge, UserPrediction, Prediction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
export const ALL_BADGES: Badge[] = [
  {
    id: "first_prediction",
    name: "First Prediction",
    icon: "star",
    requirement: "Make your first prediction",
    earned_at: "2026-03-01",
  },
  {
    id: "streak_3",
    name: "3-Day Streak",
    icon: "flame",
    requirement: "Get 3 correct in a row",
    earned_at: "2026-03-05",
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    icon: "zap",
    requirement: "Get 7 correct in a row",
    earned_at: "2026-03-12",
  },
  {
    id: "contrarian",
    name: "Contrarian",
    icon: "trending-up",
    requirement: "Pick the minority option correctly 5 times",
    earned_at: null,
  },
  {
    id: "consistent",
    name: "Consistent",
    icon: "check-circle",
    requirement: "70%+ accuracy over 20+ predictions",
    earned_at: null,
  },
  {
    id: "streak_30",
    name: "Month Master",
    icon: "trophy",
    requirement: "Get 30 correct in a row",
    earned_at: null,
  },
  {
    id: "early_bird",
    name: "Early Bird",
    icon: "clock",
    requirement: "Among first 100 to answer on a given day",
    earned_at: "2026-03-08",
  },
];

// ---------------------------------------------------------------------------
// Demo UserProfile
// ---------------------------------------------------------------------------
export const DEMO_USER_PROFILE: UserProfile = {
  address: "0xCURRENT_USER",
  display_name: "You",
  total_predictions: 31,
  total_correct: 23,
  accuracy: 74,
  streak: 9,
  best_streak: 12,
  points: 1480,
  badges: ALL_BADGES,
  created_at: "2026-03-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Calendar heatmap data: day number → outcome
// "correct" | "wrong" | "missed"
// ---------------------------------------------------------------------------
export type DayOutcome = "correct" | "wrong" | "missed";

// March 2026 — days 1-31, today = day 31
export const DEMO_CALENDAR: Record<number, DayOutcome> = {
  1: "correct",
  2: "correct",
  3: "wrong",
  4: "correct",
  5: "correct",
  6: "correct",
  7: "missed",
  8: "correct",
  9: "wrong",
  10: "correct",
  11: "correct",
  12: "correct",
  13: "correct",
  14: "correct",
  15: "correct",
  16: "wrong",
  17: "correct",
  18: "correct",
  19: "correct",
  20: "correct",
  21: "missed",
  22: "correct",
  23: "correct",
  24: "wrong",
  25: "correct",
  26: "correct",
  27: "correct",
  28: "correct",
  29: "correct",
  30: "correct",
  31: "correct",
};

// ---------------------------------------------------------------------------
// Recent predictions list (question + user answer + correct answer)
// ---------------------------------------------------------------------------
export interface RecentPredictionItem {
  id: string;
  question: string;
  category: string;
  user_choice: "A" | "B";
  user_choice_label: string;
  correct_choice: "A" | "B";
  correct_choice_label: string;
  is_correct: boolean;
  date: string;
}

export const DEMO_RECENT_PREDICTIONS: RecentPredictionItem[] = [
  {
    id: "p31",
    question: "Will Bitcoin close above $88,000 today?",
    category: "crypto",
    user_choice: "A",
    user_choice_label: "Yes",
    correct_choice: "A",
    correct_choice_label: "Yes",
    is_correct: true,
    date: "Mar 31",
  },
  {
    id: "p30",
    question: "Will the S&P 500 end the day in the green?",
    category: "world",
    user_choice: "B",
    user_choice_label: "No",
    correct_choice: "A",
    correct_choice_label: "Yes",
    is_correct: false,
    date: "Mar 30",
  },
  {
    id: "p29",
    question: "Will Ethereum's 24h volume exceed $15B?",
    category: "crypto",
    user_choice: "A",
    user_choice_label: "Yes",
    correct_choice: "A",
    correct_choice_label: "Yes",
    is_correct: true,
    date: "Mar 29",
  },
  {
    id: "p28",
    question: "Will OpenAI announce a new model this week?",
    category: "tech",
    user_choice: "B",
    user_choice_label: "No",
    correct_choice: "B",
    correct_choice_label: "No",
    is_correct: true,
    date: "Mar 28",
  },
  {
    id: "p27",
    question: "Will gold price stay above $3,000/oz today?",
    category: "world",
    user_choice: "A",
    user_choice_label: "Yes",
    correct_choice: "A",
    correct_choice_label: "Yes",
    is_correct: true,
    date: "Mar 27",
  },
  {
    id: "p26",
    question: "Will a major sports team trade a star player today?",
    category: "sports",
    user_choice: "A",
    user_choice_label: "Yes",
    correct_choice: "B",
    correct_choice_label: "No",
    is_correct: false,
    date: "Mar 26",
  },
  {
    id: "p25",
    question: "Will the JPY/USD rate move more than 0.5% today?",
    category: "world",
    user_choice: "B",
    user_choice_label: "No",
    correct_choice: "B",
    correct_choice_label: "No",
    is_correct: true,
    date: "Mar 25",
  },
];
