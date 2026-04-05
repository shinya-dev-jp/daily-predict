"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Share2,
  Trophy,
  Users,
  CheckCircle2,
  XCircle,
  Bitcoin,
  CloudSun,
  Cpu,
  Globe,
  Clapperboard,
} from "lucide-react";
import type { Prediction, UserPrediction } from "@/lib/types";
import { CATEGORY_META } from "@/data/demo-predictions";
import { useI18n } from "@/i18n";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  bitcoin: Bitcoin,
  trophy: Trophy,
  "cloud-sun": CloudSun,
  cpu: Cpu,
  globe: Globe,
  clapperboard: Clapperboard,
};

// ============================================================
// Bar chart showing vote split
// ============================================================

function VoteBar({ percentA, labelA = "Yes", labelB = "No" }: { percentA: number; labelA?: string; labelB?: string }) {
  const percentB = 100 - percentA;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setAnimated(true), 600);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Bar */}
      <div className="flex h-2 w-full rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#06B6D4] rounded-l-full"
          initial={{ width: "50%" }}
          animate={{ width: animated ? `${percentA}%` : "50%" }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
        />
        <motion.div
          className="h-full bg-white/20 rounded-r-full"
          initial={{ width: "50%" }}
          animate={{ width: animated ? `${percentB}%` : "50%" }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[11px] font-medium">
        <span className="text-[#06B6D4]">{percentA}% {labelA}</span>
        <span className="text-white/40">{percentB}% {labelB}</span>
      </div>
    </div>
  );
}

// ============================================================
// Big reveal icon
// ============================================================

function RevealIcon({ isCorrect }: { isCorrect: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
      className={`h-10 w-10 rounded-full flex items-center justify-center ${
        isCorrect ? "bg-[#00C230]/20" : "bg-[#F2280D]/20"
      }`}
    >
      {isCorrect ? (
        <CheckCircle2 className="h-5 w-5 text-[#00C230]" />
      ) : (
        <XCircle className="h-5 w-5 text-[#F2280D]" />
      )}
    </motion.div>
  );
}

// ============================================================
// Share helper (Web Share API / fallback copy)
// ============================================================

async function shareResult(prediction: Prediction, isCorrect: boolean) {
  const percentA = prediction.option_a_percent;
  const percentCorrect = isCorrect ? percentA : 100 - percentA;
  const text = isCorrect
    ? `I was in the ${percentCorrect}% who got it right on Daily Predict!\n\n"${prediction.question_en}"\n\nPlay on World App`
    : `${percentCorrect}% of humans got today's Daily Predict right — I wasn't one of them.\n\n"${prediction.question_en}"\n\nPlay on World App`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text, title: "Daily Predict" });
      return;
    } catch {
      // fall through to clipboard
    }
  }

  await navigator.clipboard.writeText(text);
}

// ============================================================
// ResultScreen
// ============================================================

interface ResultScreenProps {
  prediction: Prediction;
  userVote: UserPrediction | null;
  /** User's streak after this result */
  streak?: number;
}

export function ResultScreen({ prediction, userVote, streak = 0 }: ResultScreenProps) {
  const { t } = useI18n();
  const [shareState, setShareState] = useState<"idle" | "shared">("idle");
  const [showDetails, setShowDetails] = useState(false);

  const resultOption = prediction.result; // "A" | "B" | null
  const isResolved = resultOption !== null;
  const isCorrect = userVote
    ? userVote.chosen_option === resultOption
    : false;
  const didVote = userVote !== null;

  const percentA = prediction.option_a_percent;
  const percentB = 100 - percentA;
  const correctPercent = resultOption === "A" ? percentA : percentB;

  const resultLabel =
    resultOption === "A" ? prediction.option_a : prediction.option_b;

  useEffect(() => {
    const id = setTimeout(() => setShowDetails(true), 900);
    return () => clearTimeout(id);
  }, []);

  async function handleShare() {
    await shareResult(prediction, isCorrect);
    setShareState("shared");
    setTimeout(() => setShareState("idle"), 2500);
  }

  // Category meta
  const catMeta = CATEGORY_META[prediction.category] ?? {
    label: prediction.category,
    color: "text-white/60",
    bg: "bg-white/10",
    iconName: "globe",
  };
  const CatIcon = CATEGORY_ICON[catMeta.iconName] ?? Globe;

  if (!isResolved) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="h-20 w-20 rounded-full bg-[#252152] flex items-center justify-center">
          <Trophy className="h-10 w-10 text-[#94A3B8]" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-white font-bold text-xl">{t("result.comingSoon")}</p>
          <p className="text-[#94A3B8] text-sm">
            {t("result.notResolved")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-5 pb-6 bg-[#1E1B4B] min-h-full">
      {/* Category badge */}
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold self-start ${catMeta.bg} ${catMeta.color}`}
      >
        <CatIcon className="h-3.5 w-3.5" />
        <span>{catMeta.label}</span>
      </span>

      {/* Result card — glassmorphism */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-xl">
        {/* Question */}
        <p className="text-[#94A3B8] text-xs font-semibold uppercase tracking-widest self-start">
          {t("result.yesterdays")}
        </p>
        <h2 className="text-white font-bold text-lg leading-snug self-start">
          {prediction.question_en}
        </h2>

        {/* Result */}
        <div className="flex items-center gap-3">
          <RevealIcon isCorrect={isCorrect} />
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <p
              className={`font-bold text-lg ${
                isCorrect ? "text-[#00C230]" : "text-[#F2280D]"
              }`}
            >
              {didVote
                ? isCorrect
                  ? t("result.gotItRight")
                  : t("result.notQuite")
                : t("result.resultIsIn")}
            </p>
            <p className="text-[#94A3B8] text-sm">
              Answer: <span className="text-white/80 font-medium">{resultLabel}</span>
            </p>
          </motion.div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10 w-full" />

        {/* Vote split */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col gap-4"
            >
              <VoteBar percentA={percentA} />

              {/* "X% got it right" line */}
              <div className="flex items-center gap-2 justify-center">
                <Users className="h-3.5 w-3.5 text-[#94A3B8]" />
                <p className="text-[#94A3B8] text-xs text-center">
                  {didVote ? (
                    isCorrect ? (
                      <>
                        You were in the{" "}
                        <span className="text-white font-semibold">
                          {correctPercent}%
                        </span>{" "}
                        who got it right
                      </>
                    ) : (
                      <>
                        <span className="text-white font-semibold">
                          {correctPercent}%
                        </span>{" "}
                        of humans got it right
                      </>
                    )
                  ) : (
                    <>
                      <span className="text-white font-semibold">
                        {correctPercent}%
                      </span>{" "}
                      of humans got it right
                    </>
                  )}
                </p>
              </div>

              {/* Streak badge after correct */}
              {didVote && isCorrect && streak > 0 && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#F59E0B]/15 self-center"
                >
                  <TrendingUp className="h-4 w-4 text-[#F59E0B]" />
                  <span className="text-xs font-semibold text-[#F59E0B]">
                    {streak}-day streak!
                  </span>
                </motion.div>
              )}

              {didVote && !isCorrect && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#252152] self-center"
                >
                  <TrendingDown className="h-4 w-4 text-[#94A3B8]" />
                  <span className="text-xs text-[#94A3B8]">
                    Streak reset — try again today
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Vote count */}
      <div className="flex items-center justify-center gap-2">
        <div className="h-2 w-2 rounded-full bg-[#00C230]" />
        <span className="text-[#94A3B8] text-xs">
          {prediction.vote_count.toLocaleString()} humans predicted
        </span>
      </div>

      {/* Share button */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleShare}
        className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#252152] border border-white/10 text-white font-semibold text-sm active:bg-[#2D2960] transition-colors"
      >
        <Share2 className="h-4 w-4 text-white/60" />
        {shareState === "shared" ? t("result.copied") : t("result.share")}
      </motion.button>
    </div>
  );
}
