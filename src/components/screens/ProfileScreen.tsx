"use client";

import { motion } from "framer-motion";
import {
  Globe,
  Flame,
  Trophy,
  Star,
  Zap,
  TrendingUp,
  CheckCircle,
  Clock,
  Lock,
  Target,
  ChevronRight,
} from "lucide-react";
import {
  DEMO_USER_PROFILE,
  DEMO_CALENDAR,
  DEMO_RECENT_PREDICTIONS,
  type DayOutcome,
} from "@/data/demo-profile";
import { useI18n } from "@/i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// March 2026 starts on Sunday → Mon offset = 6
const MARCH_2026_FIRST_WEEKDAY_OFFSET = 6;

// Map badge icon string → Lucide component
function BadgeIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const cls = className ?? "h-6 w-6";
  switch (icon) {
    case "star":        return <Star className={cls} />;
    case "flame":       return <Flame className={cls} />;
    case "zap":         return <Zap className={cls} />;
    case "trending-up": return <TrendingUp className={cls} />;
    case "check-circle":return <CheckCircle className={cls} />;
    case "trophy":      return <Trophy className={cls} />;
    case "clock":       return <Clock className={cls} />;
    default:            return <Star className={cls} />;
  }
}

// Day cell color
function dayColor(outcome: DayOutcome | undefined, isToday: boolean, isFuture: boolean): string {
  if (isFuture) return "bg-[#252152] text-white/20";
  if (isToday)  return "ring-2 ring-[#06B6D4] bg-[#2D2960] text-white";
  if (!outcome) return "bg-[#1E1B4B] text-white/20 border border-white/10";
  if (outcome === "correct") return "bg-[rgb(0,194,48)] text-white";
  if (outcome === "wrong")   return "bg-[rgb(255,80,80)] text-white";
  return "bg-[#3B366E] text-white/50"; // missed
}

// ---------------------------------------------------------------------------
// Accuracy Hero Card
// ---------------------------------------------------------------------------
function AccuracyHero() {
  const { t } = useI18n();
  const p = DEMO_USER_PROFILE;
  const ringProgress = `${p.accuracy}%`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] p-5 mb-5 text-white"
    >
      <div className="flex items-center justify-between">
        {/* Left: accuracy ring placeholder */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-20 w-20">
            {/* Simple arc using conic gradient */}
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(rgb(0,194,48) 0% ${ringProgress}, rgba(255,255,255,0.2) ${ringProgress} 100%)`,
              }}
            >
              <div className="h-14 w-14 rounded-full bg-[#1e3a5f] flex items-center justify-center flex-col">
                <span className="text-xl font-bold leading-none">{p.accuracy}%</span>
                <span className="text-[9px] text-white/60 mt-0.5">Accuracy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: stat pills */}
        <div className="flex flex-col gap-2 flex-1 ml-5">
          <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-white/70" />
              <span className="text-xs text-white/70">{t("profile.predictions")}</span>
            </div>
            <span className="text-sm font-bold">{p.total_predictions}</span>
          </div>
          <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[rgb(0,194,48)]" />
              <span className="text-xs text-white/70">{t("profile.correct")}</span>
            </div>
            <span className="text-sm font-bold">{p.total_correct}</span>
          </div>
          <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[rgb(255,174,0)]" />
              <span className="text-xs text-white/70">{t("profile.streak")}</span>
            </div>
            <span className="text-sm font-bold">{p.streak} {t("profile.days")}</span>
          </div>
        </div>
      </div>

      {/* Best streak note */}
      <div className="mt-3 text-[11px] text-white/50 text-center">
        {t("profile.bestStreak").replace("{n}", String(p.best_streak))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Calendar Heatmap
// ---------------------------------------------------------------------------
function CalendarHeatmap() {
  const { t } = useI18n();
  const today = 31; // March 31, 2026

  return (
    <div className="rounded-2xl bg-[#252152] p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">
          {t("profile.predictionHistory")}
        </span>
        <span className="text-[11px] text-white/40">March 2026</span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[10px] text-white/40 font-medium">
            {d}
          </span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty offset cells */}
        {Array.from({ length: MARCH_2026_FIRST_WEEKDAY_OFFSET }, (_, i) => (
          <div key={`e-${i}`} className="h-7" />
        ))}

        {Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          const isFuture = day > today;
          const isToday = day === today;
          const outcome = DEMO_CALENDAR[day] as DayOutcome | undefined;

          return (
            <div
              key={day}
              className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold transition-all ${dayColor(
                outcome,
                isToday,
                isFuture
              )}`}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          { color: "bg-[rgb(0,194,48)]", labelKey: "profile.legendCorrect" },
          { color: "bg-[rgb(255,80,80)]", labelKey: "profile.legendWrong" },
          { color: "bg-[#3B366E]", labelKey: "profile.legendMissed" },
        ].map(({ color, labelKey }) => (
          <span key={labelKey} className="flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded ${color}`} />
            <span className="text-[10px] text-white/40">{t(labelKey)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Predictions List
// ---------------------------------------------------------------------------
function RecentPredictions() {
  const { t } = useI18n();
  return (
    <div className="mb-5">
      <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold block mb-3">
        {t("profile.recentPredictions")}
      </span>
      <div className="space-y-2">
        {DEMO_RECENT_PREDICTIONS.map((item) => (
          <div
            key={item.id}
            className="rounded-xl bg-[#252152] p-3 flex items-start gap-3"
          >
            {/* Outcome indicator */}
            <div
              className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                item.is_correct
                  ? "bg-[rgb(0,194,48)]/15"
                  : "bg-[rgb(255,80,80)]/15"
              }`}
            >
              <CheckCircle
                className={`h-3 w-3 ${
                  item.is_correct
                    ? "text-[rgb(0,194,48)]"
                    : "text-[rgb(255,80,80)]"
                }`}
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white/90 leading-snug mb-1.5 line-clamp-2">
                {item.question}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] text-white/40">
                  Your answer:{" "}
                  <span
                    className={`font-semibold ${
                      item.is_correct
                        ? "text-[rgb(0,194,48)]"
                        : "text-[rgb(255,80,80)]"
                    }`}
                  >
                    {item.user_choice_label}
                  </span>
                </span>
                {!item.is_correct && (
                  <span className="text-[10px] text-white/40">
                    Correct:{" "}
                    <span className="font-semibold text-[rgb(0,194,48)]">
                      {item.correct_choice_label}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="text-[10px] text-white/30 shrink-0">{item.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges Section
// ---------------------------------------------------------------------------
function BadgesSection() {
  const { t } = useI18n();
  const badges = DEMO_USER_PROFILE.badges;
  const earned = badges.filter((b) => b.earned_at !== null);
  const locked = badges.filter((b) => b.earned_at === null);

  return (
    <div className="mb-5">
      <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold block mb-3">
        {t("profile.badges")}
      </span>

      {/* Earned */}
      {earned.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-3">
          {earned.map((badge) => (
            <motion.div
              key={badge.id}
              whileHover={{ scale: 1.05 }}
              className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-[#252152] min-w-[76px]"
            >
              <div className="h-8 w-8 rounded-full bg-[rgb(0,194,48)]/15 flex items-center justify-center">
                <BadgeIcon
                  icon={badge.icon}
                  className="h-4 w-4 text-[rgb(0,194,48)]"
                />
              </div>
              <span className="text-[10px] font-semibold text-white/90 text-center leading-tight">
                {badge.name}
              </span>
              {badge.earned_at && (
                <span className="text-[9px] text-white/30">
                  {badge.earned_at.slice(5)}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <>
          <span className="text-[11px] text-white/30 uppercase tracking-wider font-semibold block mb-2">
            {t("profile.locked")}
          </span>
          <div className="flex gap-2 flex-wrap">
            {locked.map((badge) => (
              <div
                key={badge.id}
                className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-[#252152] min-w-[76px] opacity-45"
              >
                <div className="h-8 w-8 rounded-full bg-[#3B366E] flex items-center justify-center">
                  <Lock className="h-4 w-4 text-white/30" />
                </div>
                <span className="text-[10px] font-semibold text-white/40 text-center leading-tight">
                  {badge.name}
                </span>
                <span className="text-[9px] text-white/20 text-center leading-tight">
                  {badge.requirement}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function ProfileScreen() {
  const { t } = useI18n();
  const p = DEMO_USER_PROFILE;

  return (
    <div className="px-6 pt-6 overflow-y-auto h-full pb-24">
      {/* Profile header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-full bg-[#252152] flex items-center justify-center shrink-0">
          <Globe className="h-5 w-5 text-[#94A3B8]" />
        </div>
        <div>
          <div className="font-semibold text-white">{p.display_name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <CheckCircle className="h-3.5 w-3.5 text-[rgb(0,194,48)]" />
            <span className="text-[11px] text-[rgb(0,194,48)] font-medium">
              {t("profile.worldIdVerified")}
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[#94A3B8]">
          <span className="text-xs">{p.points.toLocaleString()} {t("profile.pts")}</span>
        </div>
      </div>

      {/* Accuracy hero */}
      <AccuracyHero />

      {/* Calendar heatmap */}
      <CalendarHeatmap />

      {/* Badges */}
      <BadgesSection />

      {/* Recent predictions */}
      <RecentPredictions />
    </div>
  );
}
