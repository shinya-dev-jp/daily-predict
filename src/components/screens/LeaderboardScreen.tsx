"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Medal, Globe, Flame, Trophy, Loader2 } from "lucide-react";
import { DEMO_LEADERBOARD } from "@/data/demo-leaderboard";
import { useApp } from "@/components/providers/AppProvider";
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
  const { t } = useI18n();
  return (
    <div className="text-right shrink-0">
      <div
        className={`text-sm font-bold ${
          isCurrentUser ? "text-white" : "text-white/90"
        }`}
      >
        {accuracy}% {t("leaderboard.correct")}
      </div>
      <div
        className={`text-[11px] ${
          isCurrentUser ? "text-[#94A3B8]" : "text-[#94A3B8]"
        }`}
      >
        {t("leaderboard.topPredictor")}
      </div>
    </div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const { t } = useI18n();
  const isCurrent = entry.is_current_user;

  return (
    <motion.div
      key={entry.rank}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
        isCurrent
          ? "bg-[#06B6D4]/10 text-white border border-[#06B6D4]/25 backdrop-blur-sm"
          : "bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07]"
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
          className={`h-4 w-4 ${isCurrent ? "text-[#06B6D4]" : "text-[#94A3B8]"}`}
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
              {t("leaderboard.you")}
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
            <span>{t("leaderboard.dayStreak").replace("{n}", String(entry.streak))}</span>
            <span className="mx-1 opacity-40">·</span>
            <span>{entry.total_correct} {t("leaderboard.correct")}</span>
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
  const { t } = useI18n();
  const percentile = Math.round((entry.rank / 20) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.07] backdrop-blur-md border border-[#06B6D4]/20 p-4 mb-6 text-white shadow-lg shadow-[#06B6D4]/5"
    >
      <div className="text-[11px] text-[#06B6D4] uppercase tracking-wider font-semibold mb-2">
        {t("leaderboard.yourRanking")}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Rank badge */}
          <div className="h-10 w-10 rounded-full bg-[#06B6D4]/20 text-[#06B6D4] flex items-center justify-center text-sm font-bold shrink-0">
            #{entry.rank}
          </div>
          <div>
            <div className="font-semibold text-sm">{entry.display_name}</div>
            <div className="flex items-center gap-1 text-[11px] text-[#94A3B8] mt-0.5">
              <Flame className="h-3 w-3" />
              <span>{t("leaderboard.dayStreak").replace("{n}", String(entry.streak))}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>{entry.total_correct} {t("leaderboard.correct")}</span>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-[#06B6D4]">
            {entry.accuracy}%
          </div>
          <div className="text-[11px] text-[#94A3B8]">{t("leaderboard.top").replace("{n}", String(percentile))}</div>
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
  const { walletAddress, authToken } = useApp();
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const [apiEntries, setApiEntries] = useState<LeaderboardEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchLeaderboard() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ period });
        const headers: Record<string, string> = {};
        if (authToken) headers.authorization = `Bearer ${authToken}`;
        const res = await fetch(`/api/leaderboard?${params}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.entries?.length > 0) {
          setApiEntries(json.entries);
        }
      } catch {
        // Fall back to demo data
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchLeaderboard();
    return () => { cancelled = true; };
  }, [period, walletAddress, authToken]);

  // Authenticated users: show only API data (no demo placeholders).
  // Unauthenticated/preview: fall back to demo data so the screen isn't empty.
  const entries = apiEntries ?? (walletAddress ? [] : DEMO_LEADERBOARD[period]);
  const currentUserEntry = entries.find((e) => e.is_current_user);

  return (
    <div className="px-6 pt-6 overflow-y-auto h-full pb-24">
      {/* Title */}
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="h-5 w-5 text-[rgb(255,174,0)]" />
        <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">
          {t("leaderboard.title")}
        </span>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2 mb-6">
        {PERIOD_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-95 ${
              period === key
                ? "bg-[#06B6D4]/20 text-[#06B6D4] border border-[#06B6D4]/30"
                : "bg-white/[0.04] text-[#94A3B8] border border-white/[0.06]"
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
            className={`rounded-2xl p-3 text-center backdrop-blur-sm border ${
              entry.rank === 1
                ? "bg-[rgb(255,174,0)]/[0.08] border-[rgb(255,174,0)]/20"
                : entry.rank === 2
                  ? "bg-[#9BA3AE]/[0.08] border-[#9BA3AE]/15"
                  : "bg-[#CD7F32]/[0.08] border-[#CD7F32]/15"
            }`}
          >
            <Medal
              className={`h-5 w-5 mx-auto mb-1.5 ${MEDAL_COLOR[entry.rank]}`}
            />
            <div className="text-[11px] font-bold text-white/90 truncate">
              {entry.display_name}
            </div>
            <div className="text-[10px] text-[#94A3B8] font-medium">
              {entry.accuracy}%
            </div>
          </div>
        ))}
      </div>

      {/* Full list */}
      <div className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold mb-3">
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
