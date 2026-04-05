"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Medal, Globe, Flame, Trophy } from "lucide-react";
import { DEMO_LEADERBOARD } from "@/data/demo-leaderboard";
import { useI18n } from "@/i18n";
import type { LeaderboardEntry, LeaderboardPeriod } from "@/lib/types";

// ---------------------------------------------------------------------------
// Period tab config
// ---------------------------------------------------------------------------
const PERIOD_TABS: { key: LeaderboardPeriod; labelKey: string }[] = [
  { key: "weekly", labelKey: "leaderboard.weekly" },
  { key: "monthly", labelKey: "leaderboard.monthly" },
  { key: "allTime", labelKey: "leaderboard.allTime" },
];

// ---------------------------------------------------------------------------
// Medal colors for top 3
// ---------------------------------------------------------------------------
const MEDAL_COLOR: Record<number, string> = {
  1: "text-[rgb(255,174,0)]",   // gold
  2: "text-[#9BA3AE]",          // silver
  3: "text-[#CD7F32]",          // bronze
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function RankCell({ entry }: { entry: LeaderboardEntry }) {
  if (entry.rank <= 3) {
    return (
      <div className={`w-8 flex justify-center ${MEDAL_COLOR[entry.rank]}`}>
        <Medal className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div
      className={`w-8 text-center text-sm font-bold ${
        entry.is_current_user ? "text-white" : "text-[#94A3B8]"
      }`}
    >
      #{entry.rank}
    </div>
  );
}

function AccuracyBadge({ accuracy, isCurrentUser }: { accuracy: number; isCurrentUser: boolean }) {
  return (
    <div className="text-right shrink-0">
      <div
        className={`text-sm font-bold ${
          isCurrentUser ? "text-white" : "text-white/90"
        }`}
      >
        {accuracy}% correct
      </div>
      <div
        className={`text-[11px] ${
          isCurrentUser ? "text-[#94A3B8]" : "text-[#94A3B8]"
        }`}
      >
        {/* total predictions derived from points proxy; shown as stat label */}
        Top predictor
      </div>
    </div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const isCurrent = entry.is_current_user;

  return (
    <motion.div
      key={entry.rank}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
        isCurrent
          ? "bg-[#06B6D4]/20 text-white border border-[#06B6D4]/30"
          : "bg-[#252152] hover:bg-[#2D2960]"
      }`}
    >
      {/* Rank / Medal */}
      <RankCell entry={entry} />

      {/* Avatar */}
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isCurrent ? "bg-[#06B6D4]/20" : "bg-[#3B366E]"
        }`}
      >
        <Globe
          className={`h-4 w-4 ${isCurrent ? "text-white" : "text-[#717680]"}`}
        />
      </div>

      {/* Name + streak */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-sm font-semibold truncate ${
              isCurrent ? "text-white" : "text-white/90"
            }`}
          >
            {entry.display_name}
          </span>
          {isCurrent && (
            <span className="text-[10px] bg-[rgb(0,194,48)] text-white px-1.5 py-0.5 rounded-full font-semibold uppercase shrink-0">
              You
            </span>
          )}
        </div>
        {entry.streak > 0 && (
          <div
            className={`flex items-center gap-1 text-[11px] mt-0.5 ${
              isCurrent ? "text-[#94A3B8]" : "text-white/40"
            }`}
          >
            <Flame className="h-3 w-3" />
            <span>{entry.streak}-day streak</span>
            <span className="mx-1 opacity-40">·</span>
            <span>{entry.total_correct} correct</span>
          </div>
        )}
      </div>

      {/* Accuracy */}
      <AccuracyBadge accuracy={entry.accuracy} isCurrentUser={isCurrent} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Current user highlight card
// ---------------------------------------------------------------------------
function CurrentUserCard({ entry }: { entry: LeaderboardEntry }) {
  const percentile = Math.round((entry.rank / 20) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-r from-[#252152] to-[#2D2960] border border-[#06B6D4]/20 p-4 mb-6 text-white"
    >
      <div className="text-[11px] text-[#06B6D4] uppercase tracking-wider font-semibold mb-2">
        Your Ranking
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Rank badge */}
          <div className="h-10 w-10 rounded-full bg-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center text-sm font-bold shrink-0">
            #{entry.rank}
          </div>
          <div>
            <div className="font-semibold text-sm">{entry.display_name}</div>
            <div className="flex items-center gap-1 text-[11px] text-[#717680] mt-0.5">
              <Flame className="h-3 w-3" />
              <span>{entry.streak}-day streak</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{entry.total_correct} correct</span>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-[rgb(0,194,48)]">
            {entry.accuracy}%
          </div>
          <div className="text-[11px] text-[#717680]">Top {percentile}%</div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function LeaderboardScreen() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const entries = DEMO_LEADERBOARD[period];
  const currentUserEntry = entries.find((e) => e.is_current_user);

  return (
    <div className="px-6 pt-6 overflow-y-auto h-full pb-24">
      {/* Title */}
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="h-5 w-5 text-[rgb(255,174,0)]" />
        <span className="text-[11px] text-[#717680] uppercase tracking-wider font-semibold">
          {t("leaderboard.title")}
        </span>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2 mb-6">
        {PERIOD_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
              period === key
                ? "bg-[#181818] text-white"
                : "bg-[#F3F4F5] text-[#717680]"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Current user highlight */}
      {currentUserEntry && <CurrentUserCard entry={currentUserEntry} />}

      {/* Top 3 podium summary */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {entries.slice(0, 3).map((entry) => (
          <div
            key={entry.rank}
            className={`rounded-2xl p-3 text-center ${
              entry.rank === 1
                ? "bg-[rgb(255,174,0)]/10"
                : entry.rank === 2
                  ? "bg-[#9BA3AE]/10"
                  : "bg-[#CD7F32]/10"
            }`}
          >
            <Medal
              className={`h-6 w-6 mx-auto mb-1 ${MEDAL_COLOR[entry.rank]}`}
            />
            <div className="text-[11px] font-bold text-[#3C424B] truncate">
              {entry.display_name}
            </div>
            <div className="text-[10px] text-[#717680]">
              {entry.accuracy}%
            </div>
          </div>
        ))}
      </div>

      {/* Full list */}
      <div className="text-[11px] text-[#717680] uppercase tracking-wider font-semibold mb-3">
        {t("leaderboard.rankings")}
      </div>
      <div className="space-y-1.5">
        {entries.map((entry, i) => (
          <LeaderboardRow key={`${period}-${entry.rank}`} entry={entry} index={i} />
        ))}
      </div>
    </div>
  );
}
