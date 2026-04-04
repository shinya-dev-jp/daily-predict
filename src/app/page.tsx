"use client";

import { Suspense, useState } from "react";
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
import { Target, Globe, Loader2 } from "lucide-react";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import type { TabKey, UserPrediction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Language toggle
// ---------------------------------------------------------------------------
const LANGUAGES: { code: Locale; label: string; shortLabel: string }[] = [
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "ja", label: "日本語", shortLabel: "JA" },
  { code: "es", label: "Español", shortLabel: "ES" },
];

function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[#717680] hover:bg-[#F3F4F5] transition-colors"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>{current.shortLabel}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-[#EBECEF] py-1 z-50 min-w-[120px]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLocale(lang.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  lang.code === locale
                    ? "text-[#2563EB] font-semibold bg-[#2563EB]/5"
                    : "text-[#3C424B] hover:bg-[#F9FAFB]"
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
    <div className="mx-auto max-w-md min-h-dvh flex flex-col items-center justify-center bg-white gap-4 p-8">
      <div className="w-16 h-16 rounded-2xl bg-[#F3F4F5] animate-pulse" />
      <div className="w-48 h-4 rounded bg-[#F3F4F5] animate-pulse" />
      <div className="w-32 h-3 rounded bg-[#F3F4F5] animate-pulse mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading state for question fetch
// ---------------------------------------------------------------------------
function QuestionLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Loader2 className="h-8 w-8 text-[#2563EB] animate-spin" />
      <p className="text-[#9BA3AE] text-sm">Loading today&apos;s question...</p>
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
    isLoadingQuestion,
    hasPredictedToday,
    userChoice,
    handlePredict,
    currentTab: tab,
    setCurrentTab: setTab,
  } = useApp();
  const { locale } = useI18n();

  // Use real data from API, fall back to demo data if DB is empty
  const todayPrediction = currentPrediction ?? demoToday;
  const yesterdayData = yesterdayPrediction ?? demoYesterday;
  const profile = userProfile ?? demoUserProfile;

  function handleVote(option: "A" | "B") {
    handlePredict(option).catch((err) => {
      console.error("Prediction failed:", err);
    });
  }

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-[#EBECEF]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#1E3A8A] to-[#4338CA] flex items-center justify-center">
            <Target className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-[#181818] text-sm tracking-tight">Daily Predict</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {/* World ID verified indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00C230]/10">
            <div className="h-1.5 w-1.5 rounded-full bg-[#00C230]" />
            <span className="text-xs text-[#00C230] font-semibold">Verified</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "predict" && (
          isLoadingQuestion ? (
            <QuestionLoading />
          ) : (
            <PredictScreen
              prediction={todayPrediction}
              userProfile={profile}
              locale={locale}
              alreadyVoted={userChoice ?? null}
              onVote={handleVote}
            />
          )
        )}

        {tab === "results" && (
          isLoadingQuestion ? (
            <QuestionLoading />
          ) : (
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
          )
        )}

        {tab === "leaderboard" && <LeaderboardScreen />}

        {tab === "profile" && <ProfileScreen />}
      </main>

      {/* Bottom navigation */}
      <Navigation activeTab={tab} onTabChange={setTab} />
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
