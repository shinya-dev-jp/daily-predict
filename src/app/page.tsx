"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { Globe, Loader2, Wallet, CheckCircle } from "lucide-react";
import { VoteScreen } from "@/components/screens/VoteScreen";
import { AppProvider, useApp } from "@/components/providers/AppProvider";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import { MiniKit } from "@worldcoin/minikit-js";

// ---------------------------------------------------------------------------
// Language toggle — MVP: EN + JA only
// ---------------------------------------------------------------------------
const LANGUAGES: { code: Locale; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "JA" },
];

function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-white/60 hover:bg-white/10 transition-colors"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{current.shortLabel}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-[#252152] rounded-xl shadow-lg border border-white/10 py-1 z-50 min-w-[120px]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLocale(lang.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  lang.code === locale
                    ? "text-[#06B6D4] font-semibold bg-[#06B6D4]/10"
                    : "text-white/70 hover:bg-white/5"
                }`}
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

// ---------------------------------------------------------------------------
// Loading skeleton shown while the app boots inside World App
// ---------------------------------------------------------------------------
function AppSkeleton() {
  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col items-center justify-center bg-[#1E1B4B] gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-[#252152] animate-pulse" />
      <div className="w-48 h-4 rounded bg-[#252152] animate-pulse" />
      <div className="w-32 h-3 rounded bg-[#252152] animate-pulse mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet Auth Screen — SIWE handshake
// ---------------------------------------------------------------------------
function WalletAuthScreen({
  onAuthSuccess,
}: {
  onAuthSuccess: (address: string, user: unknown, authToken: string) => void;
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
      if (!nonce) {
        setError("Authentication setup failed");
        setIsAuthenticating(false);
        return;
      }

      if (!MiniKit.isInstalled()) {
        setError(t("verify.notInWorldApp"));
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
        setError(`Sign-in cancelled or failed (${reason})`);
        setIsAuthenticating(false);
        return;
      }

      const completeRes = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: finalPayload, nonce }),
      });

      const json = await completeRes.json();
      if (!completeRes.ok || !json.success) {
        setError(json.error ?? "Authentication failed");
        setIsAuthenticating(false);
        return;
      }

      onAuthSuccess(json.user.address, json.user, json.auth_token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error: ${msg.slice(0, 120)}`);
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, onAuthSuccess, t]);

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col bg-[#1E1B4B] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-20%] left-[-30%] w-[500px] h-[500px] bg-[#06B6D4]/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[400px] h-[400px] bg-[#A78BFA]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 relative z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-[#06B6D4]/20 rounded-3xl blur-xl scale-110" />
          <Image
            src="/app-icon-small.png"
            alt="TuringVote"
            width={88}
            height={88}
            className="rounded-2xl relative shadow-2xl shadow-[#4338CA]/30"
          />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">TuringVote</h1>
          <p className="text-[#94A3B8] text-sm leading-relaxed max-w-[280px]">
            {t("verify.subtitle")}
          </p>
        </div>

        <div className="w-full space-y-2.5">
          {[{ text: t("verify.feature1") }, { text: t("verify.feature2") }, { text: t("verify.feature3") }].map(
            (f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3.5"
              >
                <div className="h-7 w-7 rounded-lg bg-[#06B6D4]/15 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-3.5 w-3.5 text-[#06B6D4]" />
                </div>
                <span className="text-white/80 text-[13px] font-medium">{f.text}</span>
              </div>
            )
          )}
        </div>

        <div className="w-full relative">
          <div className="absolute inset-0 bg-gradient-to-r from-[#06B6D4] to-[#A78BFA] rounded-2xl blur-lg opacity-30" />
          <button
            onClick={handleSignIn}
            disabled={isAuthenticating}
            className="relative w-full py-4 rounded-2xl bg-gradient-to-r from-[#06B6D4] to-[#A78BFA] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 shadow-lg"
          >
            {isAuthenticating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
            {isAuthenticating ? t("verify.verifying") : t("verify.button")}
          </button>
        </div>

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <p className="text-white/25 text-[11px] text-center">{t("verify.footer")}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TuringVote main shell
// ---------------------------------------------------------------------------
function TuringVoteApp() {
  const { walletAddress, onAuthenticated } = useApp();
  const { t } = useI18n();

  const isPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  const handleAuthSuccess = useCallback(
    (address: string, userProfile: unknown, authToken: string) => {
      if (userProfile) {
        onAuthenticated(
          address,
          userProfile as import("@/lib/types").UserProfile,
          authToken
        );
      }
    },
    [onAuthenticated]
  );

  if (!walletAddress && !isPreview) {
    return <WalletAuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <main className="mx-auto max-w-md min-h-dvh flex flex-col bg-[#1E1B4B]">
      <header className="flex justify-between items-center px-5 py-4">
        <div className="flex items-center gap-2">
          <Image
            src="/app-icon-small.png"
            alt="TuringVote"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="font-bold text-white text-sm tracking-tight">TuringVote</span>
        </div>
        <LanguageToggle />
      </header>

      <VoteScreen />

      <footer className="px-5 py-4 text-center text-[11px] text-white/25">
        {t("app.footer")}
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
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
