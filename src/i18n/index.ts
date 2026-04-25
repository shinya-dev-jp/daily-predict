"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import React from "react";
import en from "./en.json";
import ja from "./ja.json";

// 2026-04-25 追加: locale を localStorage で永続化。
// 旧実装は useState 初期値が detectLocale() だけで、ページ遷移後に
// 言語切替が EN にリセットされる問題があった(World App reviewer Functional bug 判定リスク)。
const LOCALE_STORAGE_KEY = "tv.locale";

// TuringVote は UI で en / ja の 2言語のみを露出している。es / ko / pt / th の
// 古いロケールファイルは Daily Predict 時代の残滓で、vote.* / summary.* の
// キーが丸ごと欠落していた(キー名が UI に生表示される状態)。
// World App 審査で Reject される品質リスクを解消するため、UI 対応と一致する
// en / ja の 2言語に縮小した。将来多言語化する際は、vote.* / summary.* を
// 含む全キーを翻訳し終えてから SUPPORTED_LOCALES と LANGUAGES の双方を拡張する。
export type Locale = "en" | "ja";

const messages: Record<Locale, Record<string, string>> = { en, ja };

const SUPPORTED_LOCALES: Locale[] = ["en", "ja"];

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.split("-")[0];
  return SUPPORTED_LOCALES.includes(lang as Locale) ? (lang as Locale) : "en";
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR 安全のため初期値は "en" 固定 → mount 後に localStorage / detectLocale から復元
  const [locale, _setLocale] = useState<Locale>("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
        _setLocale(stored as Locale);
        return;
      }
    } catch {
      // localStorage 利用不可(privacy mode 等)はフォールバック
    }
    _setLocale(detectLocale());
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    _setLocale(newLocale);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      } catch {
        // 永続化失敗は許容(その場の状態だけ更新)
      }
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      return messages[locale]?.[key] ?? messages.en[key] ?? key;
    },
    [locale]
  );

  return React.createElement(
    I18nContext.Provider,
    { value: { locale, setLocale, t } },
    children
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
