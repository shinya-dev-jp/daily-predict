"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import React from "react";
import en from "./en.json";
import ja from "./ja.json";
import es from "./es.json";
import th from "./th.json";
import ko from "./ko.json";
import pt from "./pt.json";

export type Locale = "en" | "ja" | "es" | "th" | "ko" | "pt";

const messages: Record<Locale, Record<string, string>> = { en, ja, es, th, ko, pt };

const SUPPORTED_LOCALES: Locale[] = ["en", "ja", "es", "th", "ko", "pt"];

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
  const [locale, setLocale] = useState<Locale>(detectLocale);

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
