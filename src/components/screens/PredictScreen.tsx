"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Users,
  Flame,
  Lock,
  Shield,
  Share2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Bitcoin,
  Trophy,
  CloudSun,
  Cpu,
  Globe,
  Clapperboard,
} from "lucide-react";
import type { Prediction, UserProfile } from "@/lib/types";
import { CATEGORY_META } from "@/data/demo-predictions";
import { useI18n } from "@/i18n";
import { shareText, buildPredictionShareText } from "@/lib/share";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  bitcoin: Bitcoin,
  trophy: Trophy,
  "cloud-sun": CloudSun,
  cpu: Cpu,
  globe: Globe,
  clapperboard: Clapperboard,
};

// ============================================================
// Helper: format countdown
// ============================================================

function useCountdown(closesAt: string) {
  const getRemaining = () => {
    const diff = new Date(closesAt).getTime() - Date.now();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
    const totalSeconds = Math.floor(diff / 1000);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      expired: false,
    };
  };

  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closesAt]);

  return remaining;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ============================================================
// Sub-components
// ============================================================

function CategoryBadge({ category }: { category: string }) {
  const { t } = useI18n();
  const meta = CATEGORY_META[category] ?? {
    label: category,
    color: "text-[#717680]",
    bg: "bg-white/10",
    iconName: "globe",
  };
  const IconComp = CATEGORY_ICON[meta.iconName] ?? Globe;
  const translated = t(`category.${category}`);
  const label = translated !== `category.${category}` ? translated : meta.label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold backdrop-blur-sm border border-white/[0.08] ${meta.bg} ${meta.color}`}
    >
      <IconComp className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
}

function CountdownDisplay({ closesAt }: { closesAt: string }) {
  const { hours, minutes, seconds, expired } = useCountdown(closesAt);
  const { t } = useI18n();

  if (expired) {
    return (
      <div className="flex items-center gap-1.5 text-white/40 text-xs">
        <Lock className="h-3.5 w-3.5" />
        <span>{t("predict.votingClosed")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-white/50 text-xs">
      <Clock className="h-3.5 w-3.5 text-white/40" />
      <span>{t("predict.closesIn")}&nbsp;</span>
      <span className="font-mono font-semibold text-white/80 tabular-nums">
        {hours > 0 && <>{pad(hours)}h </>}
        {pad(minutes)}m {pad(seconds)}s
      </span>
    </div>
  );
}

// ============================================================
// Prediction locked confirmation
// ============================================================

function LockedState({
  chosen,
  prediction,
}: {
  chosen: "A" | "B";
  prediction: Prediction;
}) {
  const { t } = useI18n();
  const label = chosen === "A" ? prediction.option_a : prediction.option_b;
  const isA = chosen === "A";
  const yourPercent = isA ? prediction.option_a_percent : 100 - prediction.option_a_percent;

  return (
    <motion.div
      key="locked"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="flex flex-col items-center gap-5 px-6 py-8 text-center"
    >
      {/* Animated check with pulse ring */}
      <div className="relative">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.3, 1] }}
          transition={{ duration: 0.5, times: [0, 0.6, 1] }}
          className="absolute inset-0 h-16 w-16 rounded-full bg-[#06B6D4]/10"
        />
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="h-16 w-16 rounded-full bg-[#06B6D4]/20 flex items-center justify-center relative"
        >
          <CheckCircle2 className="h-8 w-8 text-[#06B6D4]" />
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex flex-col gap-1"
      >
        <p className="text-white font-bold text-xl">{t("locked.title")}</p>
        <p className="text-[#94A3B8] text-sm">{t("locked.subtitle")}</p>
      </motion.div>

      {/* Your choice badge */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-sm ${
          isA
            ? "bg-[#00C230]/15 text-[#00C230] border border-[#00C230]/30"
            : "bg-white/10 text-white/70 border border-white/20"
        }`}
      >
        {isA ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        <span>{t("locked.youSaid").replace("{label}", label)}</span>
      </motion.div>

      {/* Live vote split */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="w-full bg-white/5 rounded-2xl p-4 border border-white/10"
      >
        <div className="flex justify-between text-[11px] mb-2">
          <span className="text-[#06B6D4] font-semibold">{prediction.option_a_percent}% {prediction.option_a}</span>
          <span className="text-white/40">{100 - prediction.option_a_percent}% {prediction.option_b}</span>
        </div>
        <div className="flex h-2.5 w-full rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#06B6D4] rounded-l-full"
            initial={{ width: "50%" }}
            animate={{ width: `${prediction.option_a_percent}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
          />
          <motion.div
            className="h-full bg-white/15 rounded-r-full"
            initial={{ width: "50%" }}
            animate={{ width: `${100 - prediction.option_a_percent}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.5 }}
          />
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="flex items-center justify-center gap-2 mt-3"
        >
          <Users className="h-3 w-3 text-[#94A3B8]" />
          <span className="text-[#94A3B8] text-[11px]">
            {yourPercent}% {t("locked.agreeWithYou")} · {prediction.vote_count.toLocaleString()} {t("predict.predicted")}
          </span>
        </motion.div>
      </motion.div>

      {/* Share button */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        onClick={async () => {
          const text = buildPredictionShareText(
            prediction.question_en,
            label,
            yourPercent
          );
          await shareText(text);
        }}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-sm font-medium active:bg-white/[0.1] transition-colors"
      >
        <Share2 className="h-4 w-4" />
        {t("locked.share")}
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="text-[#94A3B8] text-xs"
      >
        {t("locked.comeBack")}
      </motion.p>
    </motion.div>
  );
}

// ============================================================
// Vote buttons
// ============================================================

function VoteButtons({
  prediction,
  onVote,
  disabled,
}: {
  prediction: Prediction;
  onVote: (option: "A" | "B") => void;
  disabled: boolean;
}) {
  return (
    <div className={`flex gap-3 w-full ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => onVote("A")}
        className="flex-1 py-4 rounded-xl bg-[#00C230] text-white font-bold text-sm active:bg-[#00A82A] transition-colors cursor-pointer shadow-sm"
      >
        {prediction.option_a}
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => onVote("B")}
        className="flex-1 py-4 rounded-xl bg-[#374151] text-white/70 font-bold text-sm active:bg-[#4B5563] transition-colors cursor-pointer"
      >
        {prediction.option_b}
      </motion.button>
    </div>
  );
}

// ============================================================
// Main PredictScreen
// ============================================================

interface PredictScreenProps {
  prediction: Prediction;
  userProfile?: UserProfile | null;
  /** Locale for question text */
  locale?: string;
  /** Already voted? Pass the chosen option */
  alreadyVoted?: "A" | "B" | null;
  onVote?: (option: "A" | "B") => void;
}

export function PredictScreen({
  prediction,
  userProfile,
  locale = "en",
  alreadyVoted = null,
  onVote,
}: PredictScreenProps) {
  const [chosen, setChosen] = useState<"A" | "B" | null>(alreadyVoted);
  const { t, locale: i18nLocale } = useI18n();

  const effectiveLocale = locale ?? i18nLocale;
  const question =
    effectiveLocale === "ja" ? prediction.question_ja
    : effectiveLocale === "es" ? ((prediction as unknown as Record<string, string>).question_es ?? prediction.question_en)
    : prediction.question_en;
  const isClosed = prediction.status !== "open";

  function handleVote(option: "A" | "B") {
    if (chosen || isClosed) return;
    setChosen(option);
    onVote?.(option);
  }

  return (
    <div className="flex flex-col min-h-full bg-[#1E1B4B] pb-4">
      {/* Top bar: category + countdown + streak */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <CategoryBadge category={prediction.category} />
          {userProfile && userProfile.streak >= 1 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#F59E0B]/10 text-[10px] font-semibold text-[#F59E0B]">
              <Flame className="h-3 w-3" />
              {userProfile.streak}
            </span>
          )}
        </div>
        <CountdownDisplay closesAt={prediction.closes_at} />
      </div>

      <AnimatePresence mode="wait">
        {chosen ? (
          <LockedState key="locked" chosen={chosen} prediction={prediction} />
        ) : (
          <motion.div
            key="vote"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-5 px-5 flex-1 relative"
          >
            {/* Radial glow behind card */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[#06B6D4]/5 rounded-full blur-[100px] pointer-events-none" />

            {/* Verified Humans Only pill — glassmorphism */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.1] text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                <Shield className="h-3 w-3 text-[#06B6D4]" />
                Verified Humans Only
              </span>
            </div>

            {/* Question card — glassmorphism with glow */}
            <div className="rounded-2xl bg-white/[0.07] backdrop-blur-md border border-white/[0.12] p-5 flex flex-col gap-3 relative z-10 shadow-xl shadow-black/10">
              <p className="text-[#06B6D4] text-[11px] font-semibold uppercase tracking-[0.15em]">
                {t("predict.todaysQuestion")}
              </p>

              <h2 className="text-white font-bold text-[22px] leading-[1.25] tracking-tight">
                {question}
              </h2>

              {/* Vote split bar */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-[#06B6D4] to-[#06B6D4]/70 rounded-l-full transition-all duration-700"
                    style={{ width: `${prediction.option_a_percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-semibold">
                  <span className="text-[#06B6D4]">{prediction.option_a_percent}% {prediction.option_a}</span>
                  <span className="text-white/35">{100 - prediction.option_a_percent}% {prediction.option_b}</span>
                </div>
              </div>

              {/* Crowd sentiment */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-white/30" />
                  <span className="text-[10px] text-white/40">{prediction.vote_count.toLocaleString()} {t("predict.predicted")}</span>
                </div>
                <span className={`text-[10px] font-semibold ${
                  prediction.option_a_percent >= 65 ? "text-[#06B6D4]"
                  : prediction.option_a_percent <= 35 ? "text-[#F59E0B]"
                  : "text-white/40"
                }`}>
                  {prediction.option_a_percent >= 65 ? t("predict.strongYes")
                   : prediction.option_a_percent <= 35 ? t("predict.strongNo")
                   : t("predict.divided")}
                </span>
              </div>
            </div>

            {/* Vote buttons — both cyan glass, no bias */}
            <div
              className={`flex gap-3 w-full ${isClosed ? "opacity-40 pointer-events-none" : ""}`}
              role="group"
              aria-label="Vote on today's question"
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleVote("A")}
                aria-label={`Vote ${prediction.option_a}`}
                disabled={isClosed}
                className="flex-1 py-4 rounded-2xl bg-[#06B6D4]/15 border border-[#06B6D4]/30 text-[#06B6D4] font-bold text-sm active:bg-[#06B6D4]/25 transition-colors cursor-pointer backdrop-blur-sm disabled:cursor-not-allowed"
              >
                {prediction.option_a}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleVote("B")}
                aria-label={`Vote ${prediction.option_b}`}
                disabled={isClosed}
                className="flex-1 py-4 rounded-2xl bg-[#06B6D4]/15 border border-[#06B6D4]/30 text-[#06B6D4] font-bold text-sm active:bg-[#06B6D4]/25 transition-colors cursor-pointer backdrop-blur-sm disabled:cursor-not-allowed"
              >
                {prediction.option_b}
              </motion.button>
            </div>

            {/* Fine print */}
            <p className="text-white/25 text-[11px] mt-0.5 text-center">
              <Lock className="inline h-3 w-3 mr-1 -mt-0.5" />
              {t("predict.lockedAfterTapping")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
