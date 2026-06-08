// Shared constants — single source of truth for layout/render values.

export const ASCII_BAR_WIDTH = 18;       // VoteScreen の行内タリーバー幅
export const SUMMARY_BAR_WIDTH = 14;     // SummaryDialog のサマリーバー幅(コンパクト)
export const SESSION_SIZE = 5;            // 1セッションあたりの問題数
export const AUTH_COOKIE_NAME = "tv_auth"; // ウォレット SIWE 後のセッション Cookie
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7日
export const WLD_APP_ID =
  process.env.NEXT_PUBLIC_WLD_APP_ID ?? "app_30c7b1a4127cca75b14c1abb6a024d46";
export const APP_DEEP_LINK = `https://worldcoin.org/mini-app?app_id=${WLD_APP_ID}`;
