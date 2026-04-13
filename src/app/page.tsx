"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { PredictScreen } from "@/components/screens/PredictScreen";
import { ResultScreen } from "@/components/screens/ResultScreen";
import { LeaderboardScreen } from "@/components/screens/LeaderboardScreen";
import { ProfileScreen } from "@/components/screens/ProfileScreen";
import { Navigation } from "@/components/Navigation";
import { AppProvider, useApp } from "@/components/providers/AppProvider";
import {
  todayPrediction as demoToday,
  yesterdayPrediction as demoYesterday,
  demoUserProfile,
} from "@/data/demo-predictions";
import Image from "next/image";
import { Globe, Loader2, Wallet, CheckCircle, Clock, Flame } from "lucide-react";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import { MiniKit } from "@worldcoin/minikit-js";
import type { TabKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// Language toggle
// ---------------------------------------------------------------------------
const LANGUAGES: { code: Locale; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "JA" },
  { code: "es", label: "Español", shortLabel: "ES" },
  { code: "pt", label: "Português", shortLabel: "PT" },
  { code: "ko", label: "한국어", shortLabel: "KO" },
  { code: "th", label: "ไทย", shortLabel: "TH" },
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
// Loading state for question fetch
// ---------------------------------------------------------------------------
function QuestionLoading() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-5">
      {/* Category + countdown skeleton */}
      <div className="flex justify-between">
        <div className="h-6 w-20 bg-[#252152] rounded-full animate-pulse" />
        <div className="h-6 w-28 bg-[#252152] rounded-full animate-pulse" />
      </div>
      {/* Question card skeleton */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 flex flex-col gap-3">
        <div className="h-3 w-24 bg-[#252152] rounded animate-pulse" />
        <div className="h-6 w-full bg-[#252152] rounded animate-pulse" />
        <div className="h-6 w-3/4 bg-[#252152] rounded animate-pulse" />
        <div className="h-2 w-full bg-[#252152] rounded-full animate-pulse mt-2" />
      </div>
      {/* Buttons skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-14 bg-[#252152] rounded-xl animate-pulse" />
        <div className="flex-1 h-14 bg-[#252152] rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet Auth Screen — shown before user can interact
//
// Implements the SIWE (Sign-In With Ethereum) handshake required by the World
// App review team. The previous IDKit/orbLegacy login was rejected with the
// reason "use wallet auth to login"; this screen replaces it.
//
// Flow:
//   1. GET /api/auth/nonce        → server generates a nonce + sets httpOnly cookie
//   2. MiniKit.commandsAsync.walletAuth(...)  → World App asks the user to sign a SIWE message
//   3. POST /api/auth/wallet      → server verifies the signature, mints an HMAC auth_token,
//                                    upserts the users row, returns the profile
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

    const { track } = await import("@/lib/track");
    track("verify_started");

    try {
      // ── Step 1: Fetch nonce from server (sets httpOnly cookie)
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) {
        setError("Failed to initialize authentication");
        track("verify_failed", { metadata: { stage: "nonce" } });
        setIsAuthenticating(false);
        return;
      }
      const { nonce } = await nonceRes.json();
      if (!nonce) {
        setError("Authentication setup failed");
        setIsAuthenticating(false);
        return;
      }

      // ── Step 2: Ask World App to sign a SIWE message
      if (!MiniKit.isInstalled()) {
        setError(t("verify.notInWorldApp"));
        track("verify_failed", { metadata: { stage: "minikit_missing" } });
        setIsAuthenticating(false);
        return;
      }

      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce,
        statement: "Sign in to Daily Predict",
        expirationTime: new Date(Date.now() + 1000 * 60 * 10),
      });

      if (!finalPayload || finalPayload.status !== "success") {
        const reason = finalPayload && "error_code" in finalPayload
          ? finalPayload.error_code
          : "cancelled";
        setError(`Sign-in cancelled or failed (${reason})`);
        track("verify_failed", { metadata: { stage: "walletauth", error: reason } });
        setIsAuthenticating(false);
        return;
      }

      // ── Step 3: Forward signed payload to server for verification + token mint
      const completeRes = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: finalPayload, nonce }),
      });

      const json = await completeRes.json();
      if (!completeRes.ok || !json.success) {
        setError(json.error ?? "Authentication failed");
        track("verify_failed", {
          metadata: { stage: "server", error: json.error },
        });
        setIsAuthenticating(false);
        return;
      }

      onAuthSuccess(json.user.address, json.user, json.auth_token);
      track("verify_completed", { user_address: json.user.address });
    } catch (err) {
      console.error("Wallet auth error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error: ${msg.slice(0, 120)}`);
      track("verify_failed", { metadata: { stage: "exception", error: msg } });
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, onAuthSuccess, t]);

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col bg-[#1E1B4B] relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-30%] w-[500px] h-[500px] bg-[#06B6D4]/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-20%] w-[400px] h-[400px] bg-[#4338CA]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 relative z-10">
        {/* App icon — real asset */}
        <div className="relative">
          <div className="absolute inset-0 bg-[#06B6D4]/20 rounded-3xl blur-xl scale-110" />
          <Image
            src="/app-icon-small.png"
            alt="Daily Predict"
            width={88}
            height={88}
            className="rounded-2xl relative shadow-2xl shadow-[#4338CA]/30"
          />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Daily Predict</h1>
          <p className="text-[#94A3B8] text-sm leading-relaxed max-w-[280px]">
            {t("verify.subtitle")}
          </p>
        </div>

        {/* Features — glassmorphism cards */}
        <div className="w-full space-y-2.5">
          {[
            { text: t("verify.feature1") },
            { text: t("verify.feature2") },
            { text: t("verify.feature3") },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3.5">
              <div className="h-7 w-7 rounded-lg bg-[#06B6D4]/15 flex items-center justify-center shrink-0">
                <CheckCircle className="h-3.5 w-3.5 text-[#06B6D4]" />
              </div>
              <span className="text-white/80 text-[13px] font-medium">{f.text}</span>
            </div>
          ))}
        </div>

        {/* Sign-in button — prominent with glow */}
        <div className="w-full relative">
          <div className="absolute inset-0 bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] rounded-2xl blur-lg opacity-30" />
          <button
            onClick={handleSignIn}
            disabled={isAuthenticating}
            className="relative w-full py-4 rounded-2xl bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 shadow-lg"
          >
            {isAuthenticating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
            {isAuthenticating ? t("verify.verifying") : t("verify.button")}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}

        <p className="text-white/25 text-[11px] text-center">
          {t("verify.footer")}
        </p>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini App shell — uses AppProvider context with demo fallback
// ---------------------------------------------------------------------------
function DailyPredictApp() {
  const {
    currentPrediction,
    yesterdayPrediction,
    userProfile,
    walletAddress,
    isLoadingQuestion,
    hasPredictedToday,
    userChoice,
    handlePredict,
    onAuthenticated,
    currentTab: tab,
    setCurrentTab: setTab,
  } = useApp();
  const { locale, t } = useI18n();

  const [toast, setToast] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // Fire app_open exactly once per session
  useEffect(() => {
    let cancelled = false;
    import("@/lib/track").then(({ track }) => {
      if (cancelled) return;
      track("app_open", { user_address: walletAddress });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire screen_view whenever the active tab changes
  useEffect(() => {
    import("@/lib/track").then(({ track }) => {
      track("screen_view", {
        user_address: walletAddress,
        metadata: { tab },
      });
    });
  }, [tab, walletAddress]);

  // Real data from API; demo fallback only for unauthenticated preview
  const todayPrediction = currentPrediction;
  const yesterdayData = yesterdayPrediction;
  const isAuthenticated = !!walletAddress;
  // Empty placeholder profile for authenticated users awaiting API load —
  // prevents demo values (streak=7, points=1200) flashing in the header.
  const emptyProfile = {
    ...demoUserProfile,
    display_name: "",
    streak: 0,
    best_streak: 0,
    points: 0,
    total_predictions: 0,
    total_correct: 0,
    accuracy: 0,
    badges: [],
  };
  const profile = userProfile ?? (isAuthenticated ? emptyProfile : demoUserProfile);

  const handleAuthSuccess = useCallback((address: string, userProfile: unknown, authToken: string) => {
    if (userProfile) {
      onAuthenticated(address, userProfile as import("@/lib/types").UserProfile, authToken);
    }
  }, [onAuthenticated]);

  // Show wallet-auth screen if user hasn't signed in yet.
  // ?preview=1 bypasses for dev/screenshot purposes (no real voting possible)
  const isPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
  if (!walletAddress && !isPreview) {
    return <WalletAuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  async function handleVote(option: "A" | "B") {
    // Let errors propagate up to PredictScreen's try/catch
    await handlePredict(option);

    // Fire-and-forget: post-vote side effects (tracking, notification opt-in)
    import("@/lib/track").then(({ track }) => {
      track("vote", {
        user_address: walletAddress,
        metadata: {
          option,
          prediction_id: todayPrediction?.id,
          category: todayPrediction?.category,
        },
      });
    });

    // Opportunistic notification opt-in after successful vote.
    if (typeof window !== "undefined" && !sessionStorage.getItem("dp_notif_asked")) {
      sessionStorage.setItem("dp_notif_asked", "1");
      import("@/lib/share").then(({ requestNotificationPermission }) => {
        requestNotificationPermission().catch(() => {/* non-fatal */});
      });
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col bg-[#1E1B4B]">
      {/* Header — z-50 so the LanguageToggle dropdown floats above the question card */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#1E1B4B]/95 backdrop-blur-lg sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Image
            src="/app-icon-small.png"
            alt="Daily Predict"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="font-bold text-white text-sm tracking-tight">Daily Predict</span>
        </div>
        <div className="flex items-center gap-1.5">
          <LanguageToggle />
          {/* Streak */}
          {profile.streak > 0 && (
            <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
              <Flame className="h-3 w-3" />
              {profile.streak}
            </span>
          )}
          {/* Points */}
          {profile.points > 0 && (
            <span className="text-[10px] font-bold text-[#06B6D4] bg-[#06B6D4]/10 px-2 py-1 rounded-full">
              {profile.points.toLocaleString()}
            </span>
          )}
          {/* Verified */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#00C230]/10">
            <div className="h-1.5 w-1.5 rounded-full bg-[#00C230]" />
            <span className="text-[9px] text-[#00C230] font-semibold">ID</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "predict" && (
          isLoadingQuestion ? (
            <QuestionLoading />
          ) : todayPrediction && (todayPrediction.status === "open" || userChoice) ? (
            <PredictScreen
              prediction={todayPrediction}
              userProfile={profile}
              locale={locale}
              alreadyVoted={userChoice ?? null}
              onVote={handleVote}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-[#252152] flex items-center justify-center">
                <Clock className="h-8 w-8 text-[#94A3B8]" />
              </div>
              <p className="text-white font-semibold text-lg">{t("predict.noQuestion")}</p>
              <p className="text-[#94A3B8] text-sm">{t("predict.noQuestionSub")}</p>
            </div>
          )
        )}

        {tab === "results" && (
          isLoadingQuestion ? (
            <QuestionLoading />
          ) : yesterdayData ? (
            <ResultScreen
              prediction={yesterdayData}
              userVote={
                hasPredictedToday && userChoice
                  ? {
                      id: "user-vote",
                      user_address: profile.address,
                      prediction_id: yesterdayData.id,
                      chosen_option: userChoice,
                      is_correct: yesterdayData.result === userChoice,
                      created_at: yesterdayData.created_at,
                    }
                  : null
              }
              streak={profile.streak}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-[#252152] flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-[#94A3B8]" />
              </div>
              <p className="text-white font-semibold text-lg">{t("result.noResults")}</p>
              <p className="text-[#94A3B8] text-sm">{t("result.noResultsSub")}</p>
            </div>
          )
        )}

        {tab === "leaderboard" && <LeaderboardScreen />}

        {tab === "profile" && <ProfileScreen />}
      </main>

      {/* Offline banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#F59E0B] text-black text-xs font-semibold text-center py-1.5">
          {t("app.offline")}
        </div>
      )}

      {/* Error toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-500/90 text-white text-xs font-medium shadow-lg backdrop-blur-sm max-w-[300px] text-center animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}

      {/* Bottom navigation */}
      <Navigation
        activeTab={tab}
        onTabChange={setTab}
        hasNewResult={!!yesterdayPrediction?.result}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component — routes between landing and mini app
// ---------------------------------------------------------------------------
export default function Home() {
  return (
    <Suspense fallback={<AppSkeleton />}>
      <I18nProvider>
        <AppProvider>
          <DailyPredictApp />
        </AppProvider>
      </I18nProvider>
    </Suspense>
  );
}
