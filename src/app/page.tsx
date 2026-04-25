"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Globe, Loader2, ChevronRight } from "lucide-react";
import { VoteScreen } from "@/components/screens/VoteScreen";
import { SummaryDialog } from "@/components/screens/SummaryDialog";
import { AllCompletedScreen } from "@/components/screens/AllCompletedScreen";
import { AppProvider, useApp } from "@/components/providers/AppProvider";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import { MiniKit } from "@worldcoin/minikit-js";
import type { UserProfile } from "@/lib/types";

const LANGUAGES: { code: Locale; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "JA" },
];

// ============================================================
// Floating language toggle (top-right)
// ----------------------------------------------------------------
// C6: 以前は button に type 指定が無く、フォーム内ネスト時に submit になる
// 副作用があった。また メニューを開いた後にキーボード操作(Esc / 矢印 / Enter)
// で閉じる経路がなく、フォーカストラップに嵌まるとスクリーンリーダー利用者が
// 脱出不能になった。以下で対処:
//   - すべての button に type="button"
//   - メニュー open 中は document-level で Esc をフック
//   - メニュー閉じた直後にトリガー button へ focus を戻す
//   - role="menu" / role="menuitem" / aria-expanded / aria-haspopup を付与
// ============================================================
function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Esc でメニューを閉じ、トリガーに focus を戻す。overlay click でも閉じるが、
  // キーボード利用者にはそれが届かないため Esc を最優先経路にする。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        // React の state 更新より後に focus 戻しが走るよう microtask で遅延。
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

// ============================================================
// Loading skeleton
// ============================================================
function AppSkeleton() {
  return (
    <div className="mx-auto max-w-md min-h-dvh flex items-center justify-center" style={{ background: "var(--background)" }}>
      <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--terminal-prompt)" }} />
    </div>
  );
}

// ============================================================
// Wallet Auth Screen — terminal boot sequence
// ============================================================
function WalletAuthScreen({
  onAuthSuccess,
}: {
  onAuthSuccess: (address: string, user: UserProfile) => void;
}) {
  const { t } = useI18n();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setError(null);

    try {
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) {
        setError("Failed to initialize authentication");
        setIsAuthenticating(false);
        return;
      }
      const { nonce } = await nonceRes.json();

      if (!MiniKit.isInstalled()) {
        // I4: World App 外から来たユーザーに「インストールする」導線と「preview=1
        // で中身を見る」導線の両方を示す。以前は notInWorldApp 文言だけ出して
        // ユーザーを迷子にしていた。
        setError(
          `${t("verify.notInWorldApp")} ` +
            `Install: https://world.org/download · ` +
            `Or try preview mode: ${typeof window !== "undefined" ? window.location.origin : ""}?preview=1`,
        );
        setIsAuthenticating(false);
        return;
      }

      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce,
        statement: "Sign in to TuringVote",
        expirationTime: new Date(Date.now() + 1000 * 60 * 10),
      });

      if (!finalPayload || finalPayload.status !== "success") {
        const reason =
          finalPayload && "error_code" in finalPayload ? finalPayload.error_code : "cancelled";
        setError(`Sign-in cancelled (${reason})`);
        setIsAuthenticating(false);
        return;
      }

      const completeRes = await fetch("/api/auth/wallet", {
        method: "POST",
        credentials: "include", // サーバーが Set-Cookie で tv_auth を発行
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: finalPayload, nonce }),
      });

      const json = await completeRes.json();
      if (!completeRes.ok || !json.success) {
        setError(json.error ?? "Authentication failed");
        setIsAuthenticating(false);
        return;
      }

      onAuthSuccess(json.user.address, json.user as UserProfile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error: ${msg.slice(0, 120)}`);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, onAuthSuccess, t]);

  const features = [
    t("verify.feature1"),
    t("verify.feature2"),
    t("verify.feature3"),
  ];

  return (
    <div
      className="mx-auto max-w-md min-h-dvh flex flex-col relative"
      style={{ background: "var(--background)" }}
    >
      {/* faint terminal grid background */}
      <div
        aria-hidden
        className="absolute inset-0 terminal-grid opacity-40 pointer-events-none"
      />

      {/* Top wordmark */}
      <div className="absolute top-4 left-4 z-30 font-mono-feature text-[11px]"
        style={{ color: "var(--terminal-dim)" }}
      >
        <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>{" "}
        <span style={{ color: "var(--foreground)", opacity: 0.85 }}>turingvote:</span>{" "}
        boot
        <span className="terminal-caret" />
      </div>
      <div className="absolute top-4 right-4 z-30">
        <LanguageToggle />
      </div>

      <div className="flex-1 flex flex-col items-stretch justify-center px-6 gap-7 relative z-10">
        {/* Wordmark + tagline */}
        <div>
          <div
            className="font-mono-feature text-[10px] uppercase tracking-[0.3em] mb-2"
            style={{ color: "var(--terminal-prompt)" }}
          >
            // verified humans only
          </div>
          <h1
            className="text-[40px] font-bold tracking-tight leading-none"
            style={{ color: "var(--foreground)" }}
          >
            TuringVote
          </h1>
          <p
            className="text-[14px] mt-3 leading-relaxed"
            style={{
              color: "var(--muted-foreground)",
              textWrap: "balance",
              wordBreak: "keep-all",
              overflowWrap: "break-word",
            }}
          >
            {t("verify.subtitle")}
          </p>
        </div>

        {/* Features as terminal log */}
        <div
          className="rounded-md border p-4"
          style={{
            background: "color-mix(in oklch, var(--card) 90%, transparent)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="font-mono-feature text-[10px] uppercase tracking-widest mb-2.5"
            style={{ color: "var(--terminal-dim)" }}
          >
            spec
          </div>
          <ul className="flex flex-col gap-2">
            {features.map((f, i) => (
              <li
                key={i}
                className="font-mono-feature text-[12.5px] flex items-start gap-2 leading-snug"
                style={{ color: "var(--foreground)", opacity: 0.92 }}
              >
                <span
                  className="shrink-0 mt-[3px]"
                  style={{ color: "var(--terminal-prompt)" }}
                >
                  ▸
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="font-mono-feature group w-full h-12 rounded-md font-bold text-[14px] tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          {isAuthenticating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span style={{ color: "var(--primary-foreground)" }}>{">"}</span>
          )}
          <span>{isAuthenticating ? t("verify.verifying") : t("verify.button")}</span>
          {!isAuthenticating && (
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        {error && (
          <p
            className="font-mono-feature text-xs"
            style={{ color: "var(--destructive)" }}
          >
            {"> error: "}
            {error}
          </p>
        )}

        <p
          className="font-mono-feature text-[10px] text-center uppercase tracking-widest"
          style={{ color: "var(--terminal-dim)" }}
        >
          {t("verify.footer")}
        </p>

        {/* About-page link — small, centred, mono. Gives reviewers (and any
            curious user) a one-tap route to the utility/privacy explainer
            without taking away from the sign-in CTA above. */}
        <p className="text-center">
          <Link
            href="/about"
            className="font-mono-feature text-[10px] uppercase tracking-widest underline underline-offset-2"
            style={{ color: "var(--terminal-prompt)" }}
          >
            {t("app.aboutLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Main app shell — terminal-themed header
// ============================================================
function TuringVoteApp() {
  const { walletAddress, onAuthenticated, allCompleted } = useApp();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  // Showcase capture mode: hide the SAMPLE DATA banner for clean store screenshots
  // (preview demo data still active, but no overlay). Used by Playwright capture.
  const isShowcase = searchParams.get("showcase") === "1";

  const handleAuthSuccess = useCallback(
    (address: string, userProfile: UserProfile) => {
      onAuthenticated(address, userProfile);
    },
    [onAuthenticated]
  );

  if (!walletAddress && !isPreview) {
    return <WalletAuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <main
      className="mx-auto max-w-md min-h-dvh flex flex-col relative"
      style={{ background: "var(--background)" }}
    >
      {/* Faint grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 terminal-grid opacity-30 pointer-events-none"
      />

      {/* Top wordmark — always-on terminal prompt. The wordmark itself is a
          Link to /about so reviewers can reach the utility explainer with a
          single tap from anywhere in the app shell. Mobile-first: the entire
          word is the tap target (~64px wide), no separate button needed. */}
      <Link
        href="/about"
        aria-label="About TuringVote"
        className="absolute top-3 left-4 z-30 font-mono-feature text-[11px] flex items-center gap-1.5"
        style={{ color: "var(--terminal-dim)" }}
      >
        <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>
        <span style={{ color: "var(--foreground)", opacity: 0.9 }}>turingvote</span>
      </Link>
      <div className="absolute top-3 right-4 z-30">
        <LanguageToggle />
      </div>

      {/* DEMO MODE banner — preview=1 only(showcase=1 で非表示・store screenshot 用) */}
      {isPreview && !isShowcase && (
        <div
          role="status"
          aria-label="Demo mode notice"
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 font-mono-feature text-[10px] tracking-widest uppercase text-center py-1.5 px-3 rounded-full border max-w-[90vw] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{
            background: "color-mix(in oklch, var(--destructive) 22%, var(--background))",
            borderColor: "color-mix(in oklch, var(--destructive) 70%, transparent)",
            color: "var(--destructive)",
            backdropFilter: "blur(6px)",
          }}
        >
          {/* M2: "⚠ DEMO" の曖昧な警告ではなく、審査官が一目で「偽の初期データ」と
              判別できる "SAMPLE DATA (preview)" 表記に。Worldcoin 審査での fake
              engagement 誤認を防ぐ。locale 非依存のリテラルにして JA/EN 両方で
              同じメッセージを見せる。 */}
          SAMPLE DATA · preview mode
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col">
        {allCompleted ? <AllCompletedScreen /> : <VoteScreen />}
      </div>
      {/* R5 C-R5-1 fix: allCompleted 排他ガードを外す。Dialog の open 条件は
          `sessionDone && !dismissing` で制御されており、startNewSession で
          sessionAnswers=[] にリセット→sessionDone=false になるので Dialog は
          自然に閉じる。排他ガードだと Dialog 内 startNewSession が自身を
          unmount する race になり「もう5問」→AllCompletedScreen ワープの
          画面破綻を生む。 */}
      <SummaryDialog />
    </main>
  );
}

// ============================================================
// Root
// ============================================================
export default function Home() {
  return (
    <I18nProvider>
      <AppProvider>
        <Suspense fallback={<AppSkeleton />}>
          <TuringVoteApp />
        </Suspense>
      </AppProvider>
    </I18nProvider>
  );
}
