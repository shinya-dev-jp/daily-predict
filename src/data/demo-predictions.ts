import type { Prediction, UserProfile } from "@/lib/types";

// ============================================================
// Demo prediction for today (open)
// ============================================================

const tomorrow = new Date();
tomorrow.setHours(23, 59, 59, 0);

export const todayPrediction: Prediction = {
  id: "demo-2026-03-31",
  question_en: "Will Bitcoin go up tomorrow?",
  question_ja: "明日、ビットコインの価格は上がると思う？",
  option_a: "Yes",
  option_b: "No",
  category: "crypto",
  status: "open",
  closes_at: tomorrow.toISOString(),
  result: null,
  option_a_percent: 58,
  vote_count: 2847,
  created_at: new Date().toISOString(),
};

// ============================================================
// Demo prediction for yesterday (resolved)
// ============================================================

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(23, 59, 59, 0);

export const yesterdayPrediction: Prediction = {
  id: "demo-2026-03-30",
  question_en: "Will the Japanese stock market go up today?",
  question_ja: "今日、日本の株式市場は上がると思う？",
  option_a: "Yes",
  option_b: "No",
  category: "world",
  status: "resolved",
  closes_at: yesterday.toISOString(),
  result: "A",
  option_a_percent: 62,
  vote_count: 3104,
  created_at: yesterday.toISOString(),
};

// ============================================================
// Demo user profile
// ============================================================

export const demoUserProfile: UserProfile = {
  address: "0xdemo000000000000000000000000000000000001",
  display_name: "Predictor",
  total_predictions: 14,
  total_correct: 10,
  accuracy: 71,
  streak: 5,
  best_streak: 8,
  points: 1240,
  badges: [
    {
      id: "first_prediction",
      name: "First Prediction",
      icon: "target",
      requirement: "Make your first prediction",
      earned_at: new Date().toISOString(),
    },
    {
      id: "streak_3",
      name: "On Fire",
      icon: "flame",
      requirement: "3-day correct streak",
      earned_at: new Date().toISOString(),
    },
  ],
  created_at: new Date().toISOString(),
};

// ============================================================
// Category color/label mapping
// ============================================================

export const CATEGORY_META: Record<
  string,
  { label: string; color: string; bg: string; iconName: string }
> = {
  crypto:        { label: "Crypto",         color: "text-[#F7931A]",   bg: "bg-[#F7931A]/15",   iconName: "bitcoin" },
  sports:        { label: "Sports",          color: "text-[#00C230]",   bg: "bg-[#00C230]/15",   iconName: "trophy" },
  weather:       { label: "Weather",         color: "text-[#38BDF8]",   bg: "bg-[#38BDF8]/15",   iconName: "cloud-sun" },
  tech:          { label: "Tech",            color: "text-[#A78BFA]",   bg: "bg-[#A78BFA]/15",   iconName: "cpu" },
  world:         { label: "World",           color: "text-[#FB923C]",   bg: "bg-[#FB923C]/15",   iconName: "globe" },
  entertainment: { label: "Entertainment",   color: "text-[#F472B6]",   bg: "bg-[#F472B6]/15",   iconName: "clapperboard" },
};
