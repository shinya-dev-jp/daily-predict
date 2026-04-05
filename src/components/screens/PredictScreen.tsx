"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Users,
  Flame,
  Lock,
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
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}
    >
      <IconComp className="h-3.5 w-3.5" />
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

  return (
    <motion.div
      key="locked"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="flex flex-col items-center gap-6 px-6 py-10 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
        className="h-20 w-20 rounded-full bg-[#2563eb]/20 flex items-center justify-center"
      >
        <CheckCircle2 className="h-10 w-10 text-[#60a5fa]" />
      </motion.div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex flex-col gap-2"
      >
        <p className="text-white font-bold text-2xl">{t("locked.title")}</p>
        <p className="text-[#94A3B8] text-sm">{t("locked.subtitle")}</p>
      </motion.div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.38 }}
        className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-sm ${
          isA
            ? "bg-[#00C230]/15 text-[#00C230] border border-[#00C230]/30"
            : "bg-[#F2280D]/15 text-[#F2280D] border border-[#F2280D]/30"
        }`}
      >
        {isA ? (
          <TrendingUp className="h-4 w-4" />
        ) : (
          <TrendingDown className="h-4 w-4" />
        )}
        <span>{t("locked.youSaid").replace("{label}", label)}</span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
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
    effectiveLocale === "ja" ? prediction.question_ja : prediction.question_en;
  const isClosed = prediction.status !== "open";

  function handleVote(option: "A" | "B") {
    if (chosen || isClosed) return;
    setChosen(option);
    onVote?.(option);
  }

  return (
    <div className="flex flex-col min-h-full bg-[#1E1B4B] pb-4">
      {/* Top bar: category + countdown + streak */}
      <div className="flex items-center justify-between px-5 pt-5 pb-1">
        <CategoryBadge category={prediction.category} />
        <CountdownDisplay closesAt={prediction.closes_at} />
      </div>
      {userProfile && userProfile.streak >= 1 && (
        <div className="flex items-center gap-2 px-5 py-2">
          <Flame className="h-3.5 w-3.5 text-[#F59E0B]" />
          <span className="text-xs font-semibold text-[#F59E0B]">
            {t("predict.streak").replace("{n}", String(userProfile.streak))}
          </span>
        </div>
      )}

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

            {/* Verified Humans Only pill */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/20 text-[10px] font-medium text-white/50 uppercase tracking-wider">
                <Users className="h-3 w-3" />
                Verified Humans Only
              </span>
            </div>

            {/* Question card — glassmorphism */}
            <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-5 flex flex-col gap-3 relative z-10">
              <p className="text-white/60 text-[11px] font-medium uppercase tracking-[0.15em]">
                {t("predict.todaysQuestion")}
              </p>
              <h2 className="text-white font-bold text-[22px] leading-[1.25] tracking-tight">
                {question}
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="h-1.5 w-1.5 rounded-full bg-white/50" />
                <span className="text-white/50 text-xs">
                  <span className="text-white/80 font-medium">{prediction.vote_count.toLocaleString()}</span> {t("predict.predicted")}
                </span>
              </div>

              {/* Vote split bar */}
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex h-2 w-full rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#06B6D4] rounded-l-full transition-all duration-700"
                    style={{ width: `${prediction.option_a_percent}%` }}
                  />
                  <div
                    className="h-full bg-white/20 rounded-r-full transition-all duration-700"
                    style={{ width: `${100 - prediction.option_a_percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-medium">
                  <span className="text-[#06B6D4]">{prediction.option_a_percent}% {prediction.option_a}</span>
                  <span className="text-white/40">{100 - prediction.option_a_percent}% {prediction.option_b}</span>
                </div>
              </div>
            </div>

            {/* Vote buttons — compact, side by side */}
            <VoteButtons
              prediction={prediction}
              onVote={handleVote}
              disabled={isClosed}
            />

            {/* Fine print */}
            <p className="text-white/30 text-[11px] mt-1">
              <Lock className="inline h-3 w-3 mr-1 -mt-0.5" />
              {t("predict.lockedAfterTapping")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
