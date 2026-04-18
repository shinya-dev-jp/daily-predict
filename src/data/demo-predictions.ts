import type { Prediction, UserProfile } from "@/lib/types";

// ============================================================
// Demo prediction for today (open)
// ============================================================

const tomorrow = new Date();
tomorrow.setHours(23, 59, 59, 0);

export const todayPrediction: Prediction = {
  id: "demo-2026-03-31",
  question_en: "Bitcoin (BTC) was $84,500 at voting open. Will it be higher at voting close?",
  question_ja: "ビットコイン（BTC）は投票開始時に$84,500でした。投票終了時に上がっている？",
  question_es: "Bitcoin (BTC) estaba en $84,500 al abrir. ¿Estará más alto al cierre?",
  question_ko: "비트코인(BTC)은 투표 시작 시 $84,500이었습니다. 마감 시 더 높아질까요?",
  question_th: "Bitcoin (BTC) อยู่ที่ $84,500 ตอนเปิดโหวต จะสูงขึ้นตอนปิดไหม?",
  question_pt: "Bitcoin (BTC) estava em $84,500 na abertura. Vai estar mais alto no fechamento?",
  option_a: "Yes",
  option_b: "No",
  category: "crypto",
  status: "open",
  closes_at: tomorrow.toISOString(),
  result: null,
  option_a_percent: 58,
  vote_count: 2847,
  created_at: new Date().toISOString(),
  meta: {
    reference_price: 84500,
    reference_time: new Date().toISOString(),
    asset_id: "bitcoin",
    asset_ticker: "BTC",
    asset_name: "Bitcoin",
    source: "coingecko",
    category: "crypto",
  },
};

// ============================================================
// Demo prediction for yesterday (resolved)
// ============================================================

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
yesterday.setHours(23, 59, 59, 0);

export const yesterdayPrediction: Prediction = {
  id: "demo-2026-03-30",
  question_en: "Ethereum (ETH) was $1,620 at voting open. Will it be higher at voting close?",
  question_ja: "イーサリアム（ETH）は投票開始時に$1,620でした。投票終了時に上がっている？",
  question_es: "Ethereum (ETH) estaba en $1,620 al abrir. ¿Estará más alto al cierre?",
  question_ko: "이더리움(ETH)은 투표 시작 시 $1,620이었습니다. 마감 시 더 높아질까요?",
  question_th: "Ethereum (ETH) อยู่ที่ $1,620 ตอนเปิดโหวต จะสูงขึ้นตอนปิดไหม?",
  question_pt: "Ethereum (ETH) estava em $1,620 na abertura. Vai estar mais alto no fechamento?",
  option_a: "Yes",
  option_b: "No",
  category: "crypto",
  status: "resolved",
  closes_at: yesterday.toISOString(),
  result: "A",
  option_a_percent: 62,
  vote_count: 3104,
  created_at: yesterday.toISOString(),
  meta: {
    reference_price: 1620,
    reference_time: yesterday.toISOString(),
    asset_id: "ethereum",
    asset_ticker: "ETH",
    asset_name: "Ethereum",
    source: "coingecko",
    category: "crypto",
  },
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
  stocks:        { label: "Stocks",          color: "text-[#06B6D4]",   bg: "bg-[#06B6D4]/15",   iconName: "trending-up" },
  weather:       { label: "Weather",         color: "text-[#38BDF8]",   bg: "bg-[#38BDF8]/15",   iconName: "cloud-sun" },
  forex:         { label: "Forex",           color: "text-[#10B981]",   bg: "bg-[#10B981]/15",   iconName: "globe" },
  sports:        { label: "Sports",          color: "text-[#00C230]",   bg: "bg-[#00C230]/15",   iconName: "trophy" },
  tech:          { label: "Tech",            color: "text-[#A78BFA]",   bg: "bg-[#A78BFA]/15",   iconName: "cpu" },
  world:         { label: "World",           color: "text-[#FB923C]",   bg: "bg-[#FB923C]/15",   iconName: "globe" },
  entertainment: { label: "Entertainment",   color: "text-[#F472B6]",   bg: "bg-[#F472B6]/15",   iconName: "clapperboard" },
};
