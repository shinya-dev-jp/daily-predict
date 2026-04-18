/**
 * Question templates and asset definitions for the template-based question system.
 *
 * Questions follow the pattern:
 *   "{ASSET} was {PRICE} at voting open. Will it be higher at voting close?"
 *
 * No clock times in question text — times are displayed dynamically in the UI
 * using UTC + user's local timezone.
 */

import type { Locale } from "@/i18n";

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

export interface Asset {
  id: string; // API identifier (coingecko id, yahoo symbol, city name, forex pair)
  ticker: string; // Display ticker (BTC, AAPL, etc.)
  name: string; // Display name (Bitcoin, Apple, etc.)
  nameJa: string; // Japanese name
  category: "crypto" | "stocks" | "weather" | "forex";
  source: "coingecko" | "yahoo" | "openweathermap" | "frankfurter";
  // Weather-specific
  lat?: number;
  lon?: number;
  cityNames?: Record<string, string>; // locale → city name
  // Forex-specific
  base?: string; // e.g., "USD"
  target?: string; // e.g., "JPY"
}

export const ASSETS: Asset[] = [
  // ── Crypto (CoinGecko) ──────────────────────────────────────────────────
  { id: "bitcoin", ticker: "BTC", name: "Bitcoin", nameJa: "ビットコイン", category: "crypto", source: "coingecko" },
  { id: "ethereum", ticker: "ETH", name: "Ethereum", nameJa: "イーサリアム", category: "crypto", source: "coingecko" },
  { id: "solana", ticker: "SOL", name: "Solana", nameJa: "ソラナ", category: "crypto", source: "coingecko" },
  { id: "ripple", ticker: "XRP", name: "XRP", nameJa: "XRP", category: "crypto", source: "coingecko" },
  { id: "dogecoin", ticker: "DOGE", name: "Dogecoin", nameJa: "ドージコイン", category: "crypto", source: "coingecko" },
  { id: "worldcoin-wld", ticker: "WLD", name: "Worldcoin", nameJa: "ワールドコイン", category: "crypto", source: "coingecko" },

  // ── Stocks (Yahoo Finance) ──────────────────────────────────────────────
  { id: "AAPL", ticker: "AAPL", name: "Apple", nameJa: "Apple", category: "stocks", source: "yahoo" },
  { id: "NVDA", ticker: "NVDA", name: "NVIDIA", nameJa: "NVIDIA", category: "stocks", source: "yahoo" },
  { id: "TSLA", ticker: "TSLA", name: "Tesla", nameJa: "Tesla", category: "stocks", source: "yahoo" },
  { id: "%5EGSPC", ticker: "S&P500", name: "S&P 500", nameJa: "S&P 500", category: "stocks", source: "yahoo" },
  { id: "%5EN225", ticker: "N225", name: "Nikkei 225", nameJa: "日経225", category: "stocks", source: "yahoo" },

  // ── Weather (OpenWeatherMap) ────────────────────────────────────────────
  {
    id: "Tokyo", ticker: "🌡️", name: "Tokyo", nameJa: "東京", category: "weather", source: "openweathermap",
    lat: 35.6762, lon: 139.6503,
    cityNames: { en: "Tokyo", ja: "東京", es: "Tokio", ko: "도쿄", th: "โตเกียว", pt: "Tóquio" },
  },
  {
    id: "NewYork", ticker: "🌡️", name: "New York", nameJa: "ニューヨーク", category: "weather", source: "openweathermap",
    lat: 40.7128, lon: -74.0060,
    cityNames: { en: "New York", ja: "ニューヨーク", es: "Nueva York", ko: "뉴욕", th: "นิวยอร์ก", pt: "Nova York" },
  },
  {
    id: "London", ticker: "🌡️", name: "London", nameJa: "ロンドン", category: "weather", source: "openweathermap",
    lat: 51.5074, lon: -0.1278,
    cityNames: { en: "London", ja: "ロンドン", es: "Londres", ko: "런던", th: "ลอนดอน", pt: "Londres" },
  },
  {
    id: "Bangkok", ticker: "🌡️", name: "Bangkok", nameJa: "バンコク", category: "weather", source: "openweathermap",
    lat: 13.7563, lon: 100.5018,
    cityNames: { en: "Bangkok", ja: "バンコク", es: "Bangkok", ko: "방콕", th: "กรุงเทพ", pt: "Bangcoque" },
  },
  {
    id: "Seoul", ticker: "🌡️", name: "Seoul", nameJa: "ソウル", category: "weather", source: "openweathermap",
    lat: 37.5665, lon: 126.9780,
    cityNames: { en: "Seoul", ja: "ソウル", es: "Seúl", ko: "서울", th: "โซล", pt: "Seul" },
  },
  {
    id: "SaoPaulo", ticker: "🌡️", name: "São Paulo", nameJa: "サンパウロ", category: "weather", source: "openweathermap",
    lat: -23.5505, lon: -46.6333,
    cityNames: { en: "São Paulo", ja: "サンパウロ", es: "São Paulo", ko: "상파울루", th: "เซาเปาลู", pt: "São Paulo" },
  },

  // ── Forex (Frankfurter) ─────────────────────────────────────────────────
  { id: "USD-JPY", ticker: "USD/JPY", name: "USD/JPY", nameJa: "ドル円", category: "forex", source: "frankfurter", base: "USD", target: "JPY" },
  { id: "EUR-USD", ticker: "EUR/USD", name: "EUR/USD", nameJa: "ユーロドル", category: "forex", source: "frankfurter", base: "EUR", target: "USD" },
  { id: "GBP-USD", ticker: "GBP/USD", name: "GBP/USD", nameJa: "ポンドドル", category: "forex", source: "frankfurter", base: "GBP", target: "USD" },
];

// ---------------------------------------------------------------------------
// Category rotation (day-of-week based)
// ---------------------------------------------------------------------------

// 0=Sunday, 1=Monday, ...
const DAY_CATEGORY: Record<number, Asset["category"]> = {
  0: "stocks",   // Sunday
  1: "crypto",   // Monday
  2: "weather",  // Tuesday
  3: "stocks",   // Wednesday
  4: "forex",    // Thursday
  5: "crypto",   // Friday
  6: "weather",  // Saturday
};

export function getCategoryForDay(date: Date = new Date()): Asset["category"] {
  // Use JST day of week
  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const dow = jstDate.getUTCDay();
  return DAY_CATEGORY[dow];
}

export function getAssetsForCategory(category: Asset["category"]): Asset[] {
  return ASSETS.filter((a) => a.category === category);
}

export function pickRandomAsset(category: Asset["category"], seed?: number): Asset {
  const assets = getAssetsForCategory(category);
  const idx = seed !== undefined
    ? Math.abs(seed) % assets.length
    : Math.floor(Math.random() * assets.length);
  return assets[idx];
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

export function formatPrice(price: number, category: Asset["category"]): string {
  if (category === "weather") {
    return `${Math.round(price)}°C`;
  }
  if (category === "forex") {
    // Forex: show 2-3 decimal places depending on magnitude
    return price >= 100 ? price.toFixed(2) : price.toFixed(4);
  }
  // Crypto & stocks
  if (price >= 1000) {
    return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (price >= 1) {
    return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  // Small prices like DOGE
  return price.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

// ---------------------------------------------------------------------------
// Question text generation (6 languages)
// ---------------------------------------------------------------------------

interface QuestionParams {
  asset: Asset;
  price: number;
  category: Asset["category"];
  threshold?: number; // weather only: forecast high threshold
}

/**
 * Generate question text for all 6 supported locales.
 * No clock times in text — times are shown dynamically in the UI.
 */
export function generateQuestionTexts(params: QuestionParams): Record<string, string> {
  const { asset, price, category, threshold } = params;
  const fp = formatPrice(price, category);

  if (category === "weather" && threshold !== undefined) {
    const ft = `${threshold}°C`;
    const city = asset.cityNames ?? { en: asset.name, ja: asset.nameJa };
    return {
      question_en: `It was ${fp} in ${city.en ?? asset.name} at voting open. Will the high today exceed ${ft}?`,
      question_ja: `${city.ja ?? asset.nameJa}は投票開始時に${fp}でした。今日の最高気温は${ft}を超える？`,
      question_es: `Hacía ${fp} en ${city.es ?? asset.name} al abrir la votación. ¿La máxima de hoy superará los ${ft}?`,
      question_ko: `${city.ko ?? asset.name}은 투표 시작 시 ${fp}였습니다. 오늘 최고기온이 ${ft}를 넘을까요?`,
      question_th: `${city.th ?? asset.name} อยู่ที่ ${fp} ตอนเปิดโหวต สูงสุดวันนี้จะเกิน ${ft} ไหม?`,
      question_pt: `Estava ${fp} em ${city.pt ?? asset.name} na abertura. A máxima de hoje vai passar de ${ft}?`,
    };
  }

  // Crypto / Stocks / Forex
  const prefix = category === "forex" ? "" : "$";
  const displayName = (locale: string) => {
    if (locale === "ja") return `${asset.nameJa}（${asset.ticker}）`;
    return `${asset.name} (${asset.ticker})`;
  };

  return {
    question_en: `${displayName("en")} was ${prefix}${fp} at voting open. Will it be higher at voting close?`,
    question_ja: `${displayName("ja")}は投票開始時に${prefix}${fp}でした。投票終了時に上がっている？`,
    question_es: `${displayName("es")} estaba en ${prefix}${fp} al abrir. ¿Estará más alto al cierre?`,
    question_ko: `${displayName("ko")}은 투표 시작 시 ${prefix}${fp}이었습니다. 마감 시 더 높아질까요?`,
    question_th: `${displayName("th")} อยู่ที่ ${prefix}${fp} ตอนเปิดโหวต จะสูงขึ้นตอนปิดไหม?`,
    question_pt: `${displayName("pt")} estava em ${prefix}${fp} na abertura. Vai estar mais alto no fechamento?`,
  };
}

// ---------------------------------------------------------------------------
// Meta data shape (stored in predictions.meta JSONB)
// ---------------------------------------------------------------------------

export interface QuestionMeta {
  reference_price: number;
  reference_time: string; // ISO 8601 UTC
  asset_id: string;
  asset_ticker: string;
  asset_name: string;
  source: string;
  category: string;
  threshold?: number; // weather only
  // Weather-specific
  lat?: number;
  lon?: number;
  // Forex-specific
  base?: string;
  target?: string;
}
