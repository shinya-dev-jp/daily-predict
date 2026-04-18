"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/i18n";
import type { VoteChoice } from "@/lib/types";

// ============================================================
// QuestionCard
// ============================================================
function QuestionCard({
  promptJa,
  promptEn,
}: {
  promptJa: string;
  promptEn: string;
}) {
  const { locale } = useI18n();
  const prompt = locale === "ja" ? promptJa : promptEn;
  return (
    <div className="rounded-2xl bg-[#252152] border border-white/10 px-6 py-8 shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
      <h1 className="text-2xl font-bold text-white leading-[1.4] text-center">
        {prompt}
      </h1>
    </div>
  );
}

// ============================================================
// VoteButton (one of two)
// ============================================================
function VoteButton({
  label,
  accentHex,
  glowStyle,
  state,
  onClick,
  disabled,
}: {
  label: string;
  accentHex: string;
  glowStyle: string;
  state: "default" | "chosen" | "other";
  onClick: () => void;
  disabled?: boolean;
}) {
  const baseCls =
    "relative w-full py-5 rounded-xl text-lg font-semibold transition-all duration-150 active:scale-[0.98]";
  if (state === "chosen") {
    return (
      <button
        type="button"
        disabled
        className={baseCls}
        style={{
          background: accentHex,
          color: "#FFFFFF",
          boxShadow: glowStyle,
        }}
      >
        {label}
      </button>
    );
  }
  if (state === "other") {
    return (
      <button
        type="button"
        disabled
        className={`${baseCls} opacity-50 bg-[#252152] text-white/60 border border-white/10`}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseCls} bg-[#252152] text-white border border-white/10 hover:border-white/30 hover:bg-[#2D2960] disabled:opacity-50`}
      style={{
        // Subtle ring on hover using the accent color
        ["--tw-ring-color" as string]: accentHex,
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// RevealPanel (shown post-vote)
// ============================================================
function RevealPanel({
  votesA,
  votesB,
  total,
  userVote,
  labelA,
  labelB,
  youLabel,
  totalLabel,
}: {
  votesA: number;
  votesB: number;
  total: number;
  userVote: VoteChoice;
  labelA: string;
  labelB: string;
  youLabel: string;
  totalLabel: string;
}) {
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 0;
  const pctB = total > 0 ? 100 - pctA : 0;
  return (
    <div className="rounded-2xl bg-[#252152] border border-white/10 p-5 flex flex-col gap-4">
      {/* Option A row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/90 font-medium">
            {labelA}
            {userVote === "A" && (
              <span className="ml-2 text-[#06B6D4] text-xs font-semibold">
                {youLabel}
              </span>
            )}
          </span>
          <span className="text-white/70 tabular-nums">
            {votesA} <span className="text-white/40">({pctA}%)</span>
          </span>
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#06B6D4] rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pctA}%` }}
          />
        </div>
      </div>

      {/* Option B row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/90 font-medium">
            {labelB}
            {userVote === "B" && (
              <span className="ml-2 text-[#A78BFA] text-xs font-semibold">
                {youLabel}
              </span>
            )}
          </span>
          <span className="text-white/70 tabular-nums">
            {votesB} <span className="text-white/40">({pctB}%)</span>
          </span>
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#A78BFA] rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pctB}%` }}
          />
        </div>
      </div>

      {/* Meta */}
      <p className="text-center text-xs text-white/40 pt-1">
        {totalLabel.replace("{n}", String(total))}
      </p>
    </div>
  );
}

// ============================================================
// Main screen
// ============================================================
export function VoteScreen() {
  const { currentQuestion, tally, userVote, isLoadingQuestion, handleVote, loadNextQuestion } =
    useApp();
  const { locale, t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  const onVote = useCallback(
    async (choice: VoteChoice) => {
      setError(null);
      try {
        await handleVote(choice);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg.slice(0, 140));
      }
    },
    [handleVote]
  );

  if (isLoadingQuestion || !currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">{t("vote.loading")}</span>
      </div>
    );
  }

  const q = locale === "ja" ? currentQuestion.ja : currentQuestion.en;
  const labelA = q.option_a;
  const labelB = q.option_b;

  const stateA: "default" | "chosen" | "other" = userVote === null ? "default" : userVote === "A" ? "chosen" : "other";
  const stateB: "default" | "chosen" | "other" = userVote === null ? "default" : userVote === "B" ? "chosen" : "other";

  return (
    <section className="flex-1 flex flex-col justify-center px-5 gap-6 pb-8">
      <QuestionCard promptJa={currentQuestion.ja.prompt} promptEn={currentQuestion.en.prompt} />

      <div className="flex flex-col gap-3">
        <VoteButton
          label={labelA}
          accentHex="#06B6D4"
          glowStyle="0 0 24px rgba(6,182,212,0.35)"
          state={stateA}
          onClick={() => onVote("A")}
        />
        <VoteButton
          label={labelB}
          accentHex="#A78BFA"
          glowStyle="0 0 24px rgba(167,139,250,0.35)"
          state={stateB}
          onClick={() => onVote("B")}
        />
      </div>

      {error && (
        <p className="text-red-400 text-xs text-center -mt-2">{error}</p>
      )}

      {userVote && tally && (
        <>
          <RevealPanel
            votesA={tally.votes_a}
            votesB={tally.votes_b}
            total={tally.total_votes}
            userVote={userVote}
            labelA={labelA}
            labelB={labelB}
            youLabel={t("vote.you")}
            totalLabel={t("vote.totalVoters")}
          />
          <button
            type="button"
            onClick={() => {
              setError(null);
              loadNextQuestion();
            }}
            className="mx-auto text-sm text-[#06B6D4] hover:text-[#22D3EE] font-semibold"
          >
            {t("vote.next")} →
          </button>
        </>
      )}
    </section>
  );
}
