"use client";

import { useState, useEffect } from "react";
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
  Loader2,
} from "lucide-react";
import {
  DEMO_USER_PROFILE,
  DEMO_CALENDAR,
  DEMO_RECENT_PREDICTIONS,
  type DayOutcome,
} from "@/data/demo-profile";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthOffset(year: number, month: number): number {
  // month is 1-indexed. Get day of week of 1st day (0=Sun, 1=Mon...)
  const d = new Date(year, month - 1, 1).getDay();
  // Convert to Monday-first: Mon=0, Tue=1, ..., Sun=6
  return d === 0 ? 6 : d - 1;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

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
function AccuracyHero({ profile }: { profile: typeof DEMO_USER_PROFILE }) {
  const { t } = useI18n();
  const p = profile;
  const ringProgress = `${p.accuracy}%`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-[#1e3a5f]/80 to-[#2563eb]/60 backdrop-blur-sm border border-white/[0.1] p-5 mb-5 text-white shadow-xl shadow-[#2563eb]/10"
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
// Calendar Heatmap (dynamic)
// ---------------------------------------------------------------------------
function CalendarHeatmap({ year, month, calendarData }: {
  year: number;
  month: number; // 1-indexed
  calendarData: Record<number, DayOutcome>;
}) {
  const { t } = useI18n();
  const now = new Date();
  const todayDay = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;
  const offset = getMonthOffset(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <div className="rounded-2xl bg-[#252152] p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">
          {t("profile.predictionHistory")}
        </span>
        <span className="text-[11px] text-white/40">{monthLabel}</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[10px] text-white/40 font-medium">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, i) => (
          <div key={`e-${i}`} className="h-7" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const isFuture = day > todayDay && todayDay > 0;
          const isToday = day === todayDay;
          const outcome = calendarData[day] as DayOutcome | undefined;

          return (
            <div
              key={day}
              className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-semibold transition-all ${dayColor(outcome, isToday, isFuture)}`}
            >
              {day}
            </div>
          );
        })}
      </div>

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
function RecentPredictions({
  items,
}: {
  items: typeof DEMO_RECENT_PREDICTIONS;
}) {
  const { t } = useI18n();
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-5">
      <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold block mb-3">
        {t("profile.recentPredictions")}
      </span>
      <div className="space-y-2">
        {items.map((item) => (
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
function BadgesSection({
  badges,
}: {
  badges: typeof DEMO_USER_PROFILE.badges;
}) {
  const { t } = useI18n();
  if (!badges || badges.length === 0) return null;
  const earned = badges.filter((b) => b.earned_at !== null);
  const locked = badges.filter((b) => b.earned_at === null);

  return (
    <div className="mb-5">
      <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold block mb-3">
        {t("profile.badges")}
      </span>

      {/* Earned */}
      {earned.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {earned.map((badge, idx) => (
            <motion.div
              key={badge.id}
              whileHover={{ scale: 1.05 }}
              className={`flex flex-col items-center gap-1 p-3 rounded-2xl bg-[#252152]${earned.length % 2 !== 0 && idx === earned.length - 1 ? " col-span-2" : ""}`}
            >
              <div className="h-8 w-8 rounded-full bg-[rgb(0,194,48)]/15 flex items-center justify-center">
                <BadgeIcon
                  icon={badge.icon}
                  className="h-4 w-4 text-[rgb(0,194,48)]"
                />
              </div>
              <span className="text-[10px] font-semibold text-white/90 text-center leading-tight">
                {t(`badge.${badge.id}.name` as Parameters<typeof t>[0]) || badge.name}
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
          <div className="grid grid-cols-2 gap-2">
            {locked.map((badge, idx) => (
              <div
                key={badge.id}
                className={`flex flex-col items-center gap-1 p-3 rounded-2xl bg-[#252152] opacity-45${locked.length % 2 !== 0 && idx === locked.length - 1 ? " col-span-2" : ""}`}
              >
                <div className="h-8 w-8 rounded-full bg-[#3B366E] flex items-center justify-center">
                  <Lock className="h-4 w-4 text-white/30" />
                </div>
                <span className="text-[10px] font-semibold text-white/40 text-center leading-tight">
                  {t(`badge.${badge.id}.name` as Parameters<typeof t>[0]) || badge.name}
                </span>
                <span className="text-[9px] text-white/20 text-center leading-tight">
                  {t(`badge.${badge.id}.requirement` as Parameters<typeof t>[0]) || badge.requirement}
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
// Loading skeleton — shown while authenticated user's profile is being fetched
// to prevent demo-data flicker
// ---------------------------------------------------------------------------
function ProfileSkeleton() {
  return (
    <div className="px-6 pt-6 overflow-y-auto h-full pb-24" aria-busy="true" aria-label="Loading profile">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-full bg-[#252152] animate-pulse" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 bg-[#252152] rounded animate-pulse" />
          <div className="h-3 w-20 bg-[#252152] rounded animate-pulse" />
        </div>
      </div>
      {/* Hero card skeleton */}
      <div className="rounded-2xl bg-[#252152] h-32 mb-5 animate-pulse" />
      {/* Calendar skeleton */}
      <div className="rounded-2xl bg-[#252152] h-48 mb-5 animate-pulse" />
      {/* Badges skeleton */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl bg-[#252152] h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export function ProfileScreen() {
  const { t } = useI18n();
  const { walletAddress, authToken } = useApp();
  const [profileData, setProfileData] = useState<{
    profile: typeof DEMO_USER_PROFILE;
    calendar: { year: number; month: number; data: Record<number, DayOutcome> };
    recentPredictions: typeof DEMO_RECENT_PREDICTIONS;
  } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    if (!walletAddress || !authToken) {
      setIsLoadingProfile(false);
      return;
    }
    let cancelled = false;
    setIsLoadingProfile(true);

    async function fetchProfile() {
      try {
        const res = await fetch(`/api/profile`, {
          headers: { authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) {
          if (!cancelled) setIsLoadingProfile(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setProfileData(json);
          setIsLoadingProfile(false);
        }
      } catch {
        // Fall back to demo data on network error
        if (!cancelled) setIsLoadingProfile(false);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [walletAddress, authToken]);

  // Show skeleton while authenticated user's data is being fetched (prevents
  // demo-data flicker before real data arrives)
  if (walletAddress && isLoadingProfile && !profileData) {
    return <ProfileSkeleton />;
  }

  // Authenticated users: only show real API data (no demo placeholders flicker).
  // Unauthenticated/preview: fall back to demo so the screen isn't blank.
  const isAuth = !!walletAddress;
  const p = profileData?.profile ?? (isAuth
    ? { ...DEMO_USER_PROFILE, display_name: "—", points: 0, total_predictions: 0, total_correct: 0, streak: 0, best_streak: 0, accuracy: 0, badges: [] }
    : DEMO_USER_PROFILE);
  const now = new Date();
  const calYear = profileData?.calendar?.year ?? now.getFullYear();
  const calMonth = profileData?.calendar?.month ?? (now.getMonth() + 1);
  const calData = profileData?.calendar?.data ?? (isAuth ? {} : DEMO_CALENDAR);
  const recentPredictions = profileData?.recentPredictions ?? (isAuth ? [] : DEMO_RECENT_PREDICTIONS);

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
      <AccuracyHero profile={p} />

      {/* Calendar heatmap */}
      <CalendarHeatmap year={calYear} month={calMonth} calendarData={calData} />

      {/* Badges */}
      <BadgesSection badges={p.badges} />

      {/* Weekly Login Rewards — Coming Soon teaser */}
      <div className="mb-5">
        <div className="rounded-2xl bg-gradient-to-br from-[#06B6D4]/10 to-[#4338CA]/10 border border-[#06B6D4]/20 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#06B6D4] uppercase tracking-wider font-semibold">
              {t("rewards.title")}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[#F59E0B]/15 text-[#F59E0B]">
              {t("rewards.comingSoon")}
            </span>
          </div>
          <p className="text-xs text-white/70 mb-3">{t("rewards.subtitle")}</p>
          <ul className="space-y-1.5">
            {[1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-white/60">
                <span className="text-[#06B6D4] mt-[1px]">•</span>
                <span>{t(`rewards.rule${i}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Points explanation */}
      <div className="mb-5">
        <span className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold block mb-3">
          {t("profile.howPoints")}
        </span>
        <div className="rounded-2xl bg-[#252152] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/70">{t("profile.pointsCorrect")}</span>
            <span className="text-xs font-bold text-[#06B6D4]">+10 pts</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/70">{t("profile.pointsStreak")}</span>
            <span className="text-xs font-bold text-[#F59E0B]">+5 pts / day</span>
          </div>
          <div className="h-px bg-white/10" />
          <p className="text-[10px] text-white/40">{t("profile.pointsExample")}</p>
        </div>
      </div>

      {/* Recent predictions */}
      <RecentPredictions items={recentPredictions} />
    </div>
  );
}
