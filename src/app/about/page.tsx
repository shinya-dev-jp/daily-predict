"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /about — Public utility page for World App reviewers and end users.
//
// This page exists primarily to answer the Worldcoin reviewer's question
// "what's the utility of this app?" within 5 seconds of arrival, then to give
// users a deeper read on what they'll get and how their data is handled.
//
// Information architecture (intentional ordering):
//   1. Headline + 1-sentence utility (above the fold)
//   2. "What you get" — three concrete user benefits, not mechanics
//   3. "How it works" — 4-step plain-language flow
//   4. "Who uses it" — three use cases (curious / researcher / creator)
//   5. Privacy & safety — explicit data minimisation
//   6. Eligibility — exactly who can vote
//   7. Contact + Legal links
//
// Why client component: we use the same I18nProvider as the home page so
// EN/JA toggle from the top-right works here too. The page is fully static
// HTML once hydrated; no API calls are made.
//
// Style: matches the terminal-themed home palette (black background, terminal
// green prompt accent, Geist Mono for headings). Reviewers landing here from
// the home page should feel they are still in the same app.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Globe, Shield, Users, Sparkles, BarChart3 } from "lucide-react";
import { I18nProvider, useI18n, type Locale } from "@/i18n";

const LANGUAGES: { code: Locale; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "JA" },
];

// Reused, slimmed copy of the home-page LanguageToggle so /about works
// stand-alone without importing client-only home internals.
function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = useCallback(
    (code: Locale) => {
      setLocale(code);
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    },
    [setLocale]
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        className="font-mono-feature flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-widest uppercase border transition"
        style={{
          backgroundColor: "color-mix(in oklch, var(--background) 70%, transparent)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Globe className="h-3 w-3" aria-hidden />
        <span>{current.shortLabel}</span>
      </button>
      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label="Select language"
            className="absolute right-0 top-full mt-2 rounded-md border py-1 z-50 min-w-[120px]"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              boxShadow: "0 12px 32px -8px rgba(0,0,0,0.5)",
            }}
          >
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                role="menuitemradio"
                aria-checked={lang.code === locale}
                onClick={() => handleSelect(lang.code)}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  lang.code === locale ? "font-bold" : ""
                }`}
                style={{
                  color: lang.code === locale ? "var(--terminal-prompt)" : "var(--muted-foreground)",
                  backgroundColor: lang.code === locale ? "var(--secondary)" : "transparent",
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Plain section helper — keeps each block visually distinct without the heavy
// shadcn Card chrome (this page is text-heavy and a card per section feels
// noisy on mobile). Headings use mono uppercase to match the home aesthetic.
function Section({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2
        className="font-mono-feature text-[11px] uppercase tracking-[0.2em] mb-3 flex items-center gap-2"
        style={{ color: "var(--terminal-prompt)" }}
      >
        {icon}
        <span>{title}</span>
      </h2>
      <div
        className="text-[14px] leading-relaxed"
        style={{ color: "var(--foreground)", opacity: 0.92 }}
      >
        {children}
      </div>
    </section>
  );
}

// Utility benefit block — title + 1-sentence explanation. Used three times.
function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-md border p-4 mb-3"
      style={{
        background: "color-mix(in oklch, var(--card) 90%, transparent)",
        borderColor: "var(--border)",
      }}
    >
      <h3
        className="font-bold text-[14px] mb-1.5"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </h3>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        {body}
      </p>
    </div>
  );
}

function AboutContent() {
  const { t } = useI18n();

  return (
    <main
      className="mx-auto max-w-2xl min-h-dvh relative px-6 py-12"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Faint terminal grid backdrop, same as home */}
      <div
        aria-hidden
        className="absolute inset-0 terminal-grid opacity-30 pointer-events-none"
      />

      {/* Top bar: prompt + language toggle */}
      <div className="absolute top-3 left-4 z-30 font-mono-feature text-[11px]"
        style={{ color: "var(--terminal-dim)" }}
      >
        <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>{" "}
        <span style={{ color: "var(--foreground)", opacity: 0.9 }}>turingvote:</span>{" "}
        about
      </div>
      <div className="absolute top-3 right-4 z-30">
        <LanguageToggle />
      </div>

      <div className="relative z-10 pt-8">
        {/* Hero — the FIRST thing a reviewer reads. Utility lives in `about.intro`. */}
        <header className="mb-10">
          <div
            className="font-mono-feature text-[10px] uppercase tracking-[0.3em] mb-2"
            style={{ color: "var(--terminal-prompt)" }}
          >
            // verified humans only
          </div>
          <h1
            className="text-[32px] sm:text-[36px] font-bold tracking-tight leading-tight mb-4"
            style={{ color: "var(--foreground)" }}
          >
            {t("about.title")}
          </h1>
          <p
            className="text-[15px] leading-relaxed"
            style={{
              color: "var(--muted-foreground)",
              textWrap: "balance",
              wordBreak: "keep-all",
              overflowWrap: "break-word",
            }}
          >
            {t("about.intro")}
          </p>

          <Link
            href="/"
            className="font-mono-feature group mt-6 inline-flex items-center gap-2 px-4 h-10 rounded-md font-bold text-[13px] tracking-wide transition-all active:scale-[0.98]"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <span>{">"}</span>
            <span>{t("about.openApp")}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </header>

        {/* 1. What the user gets out of it (3 benefits, utility-forward) */}
        <Section
          icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
          title={t("about.utilityHeading")}
        >
          <Benefit title={t("about.utility1Title")} body={t("about.utility1Desc")} />
          <Benefit title={t("about.utility2Title")} body={t("about.utility2Desc")} />
          <Benefit title={t("about.utility3Title")} body={t("about.utility3Desc")} />
        </Section>

        {/* 2. How it works (4 steps, plain language) */}
        <Section
          icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden />}
          title={t("about.howHeading")}
        >
          <ol className="space-y-2">
            {[t("about.how1"), t("about.how2"), t("about.how3"), t("about.how4")].map(
              (step, i) => (
                <li
                  key={i}
                  className="font-mono-feature text-[13px] flex gap-3 leading-relaxed"
                >
                  <span
                    className="shrink-0 font-bold tabular-nums"
                    style={{ color: "var(--terminal-prompt)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ color: "var(--foreground)", opacity: 0.92 }}>{step}</span>
                </li>
              )
            )}
          </ol>
        </Section>

        {/* 3. Who uses it (3 personas — gives the reviewer concrete use cases) */}
        <Section
          icon={<Users className="h-3.5 w-3.5" aria-hidden />}
          title={t("about.useHeading")}
        >
          <Benefit title={t("about.use1Title")} body={t("about.use1Desc")} />
          <Benefit title={t("about.use2Title")} body={t("about.use2Desc")} />
          <Benefit title={t("about.use3Title")} body={t("about.use3Desc")} />
        </Section>

        {/* 4. Privacy & safety (explicit list — also reassures reviewers about
              the no-rewards / no-gambling stance, which Worldcoin checks). */}
        <Section
          icon={<Shield className="h-3.5 w-3.5" aria-hidden />}
          title={t("about.privacyHeading")}
        >
          <ul className="space-y-2">
            {[
              t("about.privacy1"),
              t("about.privacy2"),
              t("about.privacy3"),
              t("about.privacy4"),
            ].map((line, i) => (
              <li
                key={i}
                className="font-mono-feature text-[13px] flex items-start gap-2 leading-relaxed"
              >
                <span
                  className="shrink-0 mt-[3px]"
                  style={{ color: "var(--terminal-prompt)" }}
                >
                  ▸
                </span>
                <span style={{ color: "var(--foreground)", opacity: 0.92 }}>{line}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 5. Eligibility */}
        <Section title={t("about.eligibilityHeading")}>
          <p>{t("about.eligibility")}</p>
        </Section>

        {/* 6. Contact */}
        <Section title={t("about.contactHeading")}>
          <p className="mb-2">{t("about.contactBody")}</p>
          <a
            href={`mailto:${t("about.contactEmail")}`}
            className="font-mono-feature underline underline-offset-2"
            style={{ color: "var(--terminal-prompt)" }}
          >
            {t("about.contactEmail")}
          </a>
        </Section>

        {/* 7. Legal */}
        <Section title={t("about.legalHeading")}>
          <ul className="space-y-1.5">
            <li>
              <Link
                href="/privacy"
                className="font-mono-feature underline underline-offset-2"
                style={{ color: "var(--terminal-prompt)" }}
              >
                {t("about.privacyLink")}
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="font-mono-feature underline underline-offset-2"
                style={{ color: "var(--terminal-prompt)" }}
              >
                {t("about.termsLink")}
              </Link>
            </li>
          </ul>
        </Section>

        <footer
          className="pt-6 mt-6 border-t font-mono-feature text-[10px] uppercase tracking-widest text-center"
          style={{ borderColor: "var(--border)", color: "var(--terminal-dim)" }}
        >
          {t("about.footer")}
        </footer>
      </div>
    </main>
  );
}

// Wrap in I18nProvider so the page works as a stand-alone route. The home
// page has its own provider, but Next.js renders /about as a separate tree.
export default function AboutPage() {
  return (
    <I18nProvider>
      <AboutContent />
    </I18nProvider>
  );
}
