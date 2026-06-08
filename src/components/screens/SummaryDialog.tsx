"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, Share2, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/i18n";
import { shareText } from "@/lib/share";
import { track } from "@/lib/track";
import { SUMMARY_BAR_WIDTH } from "@/lib/constants";

// ============================================================
// Summary Dialog — terminal "report" view shown after 5 questions.
// Classifies the user as majority-leaning / minority-leaning / split.
// ============================================================

function classify(majorityHits: number, total: number): "majority" | "minority" | "split" {
  if (total === 0) return "split";
  if (majorityHits >= 4) return "majority";
  if (majorityHits <= 1) return "minority";
  return "split";
}

function asciiBar(filled: number, total: number): string {
  if (total === 0) return "░".repeat(SUMMARY_BAR_WIDTH);
  const fillCount = Math.round((filled / total) * SUMMARY_BAR_WIDTH);
  return "█".repeat(fillCount) + "░".repeat(SUMMARY_BAR_WIDTH - fillCount);
}

/**
 * Shape of the /api/me/profile response when the user has crossed the
 * MIN_VOTES_FOR_PROFILE threshold (10 votes / ~2 sessions).
 */
interface ProfileMoment {
  questionId: number;
  userSidePct: number;
  promptEn: string;
  promptJa: string;
}

interface ProfileReady {
  ready: true;
  totalVotes: number;
  completedSessions: number;
  majorityCount: number;
  minorityCount: number;
  majorityPct: number;
  mostContrarian: ProfileMoment | null;
  mostAligned: ProfileMoment | null;
}

interface ProfileNotReady {
  ready: false;
  totalVotes: number;
  minVotesForProfile: number;
}

type ProfileResponse = ProfileReady | ProfileNotReady;

export function SummaryDialog() {
  const { sessionDone, sessionAnswers, sessionQuestions, questionPackId, startNewSession, dismissSummaryToLastQ, dismissing, signOut } = useApp();
  const { t, locale } = useI18n();
  const summaryViewTrackedRef = useRef("");

  // 2026-05-27 — "Your TuringVote pattern so far" self-mirror.
  // Fetched once per dialog open (sessionDone transitions to true). Failure
  // (network / 401 / 500) silently hides the section — no error UI, no retry,
  // no notification. The aggregate is a nice-to-have, never blocks the core
  // summary flow.
  // (Named `userPattern` to avoid shadowing the existing `profile`
  //  local for majority/minority/balanced classification below.)
  const [userPattern, setUserPattern] = useState<ProfileResponse | null>(null);
  useEffect(() => {
    if (!sessionDone) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/profile", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as ProfileResponse;
        if (!cancelled) setUserPattern(data);
      } catch {
        // Silently ignore — pattern section is optional UX.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionDone]);

  const stats = useMemo(() => {
    let majorityHits = 0;
    let counted = 0;
    for (const a of sessionAnswers) {
      if (!a.tally || a.tally.total_votes === 0) continue;
      counted++;
      const aPct = a.tally.votes_a / a.tally.total_votes;
      const userPctSide = a.choice === "A" ? aPct : 1 - aPct;
      if (userPctSide >= 0.5) majorityHits++;
    }
    return { majorityHits, total: counted, minorityHits: counted - majorityHits };
  }, [sessionAnswers]);

  const profile = classify(stats.majorityHits, stats.total);
  const profileLabel =
    profile === "majority"
      ? t("summary.profileMajority")
      : profile === "minority"
      ? t("summary.profileMinority")
      : t("summary.profileSplit");
  const profileDesc =
    profile === "majority"
      ? t("summary.profileMajorityDesc")
      : profile === "minority"
      ? t("summary.profileMinorityDesc")
      : t("summary.profileSplitDesc");

  const accent =
    profile === "majority"
      ? "var(--option-a)"
      : profile === "minority"
      ? "var(--option-b)"
      : "var(--foreground)";

  const handleShare = async () => {
    track("share_tap", {
      metadata: {
        surface: "summary",
        profile,
        answered_count: sessionAnswers.length,
        question_pack_id: questionPackId,
      },
    });
    // 2026-05-27 UX update — add profile emoji for visual differentiation
    // in share dialogs (majority=🟦, minority=🟧, balanced=⚪).
    const profileEmoji =
      profile === "majority" ? "🟦" : profile === "minority" ? "🟧" : "⚪";
    const text =
      locale === "ja"
        ? `🧠 ${profileEmoji} TuringVoteの5問ミラーで、私は${profileLabel}でした。\n\n5つの二択で、多数派か少数派か見てみて →`
        : `🧠 ${profileEmoji} My 5-question TuringVote mirror: ${profileLabel}.\n\nTake 5 this-or-that questions and see if you land majority or minority →`;
    await shareText(text);
  };

  const profileTagSlug =
    profile === "majority" ? "majority" : profile === "minority" ? "minority" : "balanced";

  // 2026-05-27 — "conversation seed" (E in 36/44-role fullharness): pick the
  // session's most evenly-split question to suggest as a topic to discuss
  // with a friend. Computed from sessionAnswers (this session only) — no
  // server roundtrip. Empty when no tally data is available.
  // Question text is resolved from sessionQuestions via question_id lookup.
  const conversationSeed = useMemo(() => {
    const questionById = new Map(sessionQuestions.map((q) => [q.id, q]));
    let closest: { questionId: number; gap: number; promptEn: string; promptJa: string } | null = null;
    for (const a of sessionAnswers) {
      if (!a.tally || a.tally.total_votes === 0) continue;
      const q = questionById.get(a.question_id);
      if (!q) continue;
      const aPct = (a.tally.votes_a / a.tally.total_votes) * 100;
      const gap = Math.abs(aPct - 50); // 0 = perfectly split, 50 = unanimous
      if (!closest || gap < closest.gap) {
        closest = {
          questionId: a.question_id,
          gap,
          promptEn: q.en?.prompt ?? "",
          promptJa: q.ja?.prompt ?? "",
        };
      }
    }
    return closest;
  }, [sessionAnswers, sessionQuestions]);

  // Q3-dismiss (2026-04-19 Shinya 実機 2nd feedback):
  //   ✕/ESC で dialog を閉じるだけでなく、sessionIndex を最後の回答済み Q に
  //   戻して verdict 画面に帰す。以前は dismissed=true にしても sessionIndex は
  //   5 のまま → currentQuestion=undefined → VoteScreen が loading spinner に
  //   落ちる(=「質問を準備中」永久ループ)bug があった。
  //   dismissSummaryToLastQ が sessionIndex を戻すので sessionDone も false に
  //   落ち、dialog 表示条件(sessionDone && !dismissed)で自動的に閉じる。
  //   dismissed flag は不要になったので削除。
  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      dismissSummaryToLastQ();
    }
  };

  // R3: Radix Dialog の ESC は onOpenChange 経由で閉じる建前だが、
  // 実機検証(Chrome MCP)で発火しないケースを観測。document-level keydown
  // fallback を張って確実に閉じる(handleClose と冪等なので二重発火 OK)。
  // R3 I-R3-1 fix: deps に dismissSummaryToLastQ(毎render新reference)を
  //   入れると listener が頻繁に add/remove されるため、最新 callback を
  //   ref に退避して listener は sessionDone の変化のみで再登録する。
  const dismissRef = useRef(dismissSummaryToLastQ);
  useEffect(() => {
    dismissRef.current = dismissSummaryToLastQ;
  }, [dismissSummaryToLastQ]);
  useEffect(() => {
    if (!sessionDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sessionDone]);

  useEffect(() => {
    if (!sessionDone || dismissing) return;
    const signature = `${questionPackId ?? "none"}:${sessionAnswers
      .map((a) => a.question_id)
      .join(",")}`;
    if (summaryViewTrackedRef.current === signature) return;
    summaryViewTrackedRef.current = signature;
    track("summary_view", {
      metadata: {
        profile,
        answered_count: sessionAnswers.length,
        question_pack_id: questionPackId,
      },
    });
  }, [sessionDone, dismissing, sessionAnswers, profile, questionPackId]);

  return (
    <Dialog open={sessionDone && !dismissing} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-sm rounded-md border p-0 overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
        showCloseButton={true}
      >
        {/* Terminal title bar */}
        <div
          className="font-mono-feature text-[11px] px-4 py-2.5 flex items-center justify-between border-b"
          style={{
            color: "var(--terminal-dim)",
            borderColor: "var(--border)",
            background: "color-mix(in oklch, var(--background) 60%, transparent)",
          }}
        >
          <span>
            <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>{" "}
            <span style={{ color: "var(--foreground)", opacity: 0.85 }}>turingvote:</span> report
          </span>
          <span className="uppercase tracking-widest text-[10px] opacity-70">[{profileTagSlug}]</span>
        </div>

        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle
            asChild
          >
            <motion.h2
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-2xl font-bold tracking-tight leading-tight"
              style={{ color: "var(--foreground)" }}
            >
              {t("summary.title")}
            </motion.h2>
          </DialogTitle>
          <DialogDescription
            className="text-[13px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("summary.subtitle")}
          </DialogDescription>
        </DialogHeader>

        {/* Profile pill */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="px-5 pb-3"
        >
          <div
            className="font-mono-feature text-[10px] uppercase tracking-widest mb-1.5"
            style={{ color: "var(--terminal-dim)" }}
          >
            profile
          </div>
          <div
            className="text-xl font-bold leading-none"
            style={{ color: accent }}
          >
            {profileLabel}
          </div>
          <p
            className="text-[13px] mt-2 leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            {profileDesc}
          </p>
          <p
            className="text-[12px] mt-2 leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("summary.meaningLine")}
          </p>
          <p
            className="text-[12px] mt-3 leading-relaxed font-mono-feature"
            style={{ color: "var(--terminal-dim)" }}
          >
            {t("summary.returnCue")}
          </p>
        </motion.div>

        {/* Stats — terminal table */}
        <div className="px-5 py-4 border-t border-b" style={{ borderColor: "var(--border)" }}>
          <div className="font-mono-feature text-[10px] uppercase tracking-widest mb-2.5"
            style={{ color: "var(--terminal-dim)" }}
          >
            tally
          </div>
          <StatRow
            label={t("summary.majorityCount")}
            value={stats.majorityHits}
            total={stats.total}
            color="var(--option-a)"
          />
          <div className="h-2" />
          <StatRow
            label={t("summary.minorityCount")}
            value={stats.minorityHits}
            total={stats.total}
            color="var(--option-b)"
          />
        </div>

        {/* 2026-05-27 — "Your TuringVote pattern so far" self-mirror.
            Only shown when user has ≥10 votes (≥2 sessions). Self-only data:
            no leaderboard, no comparison to other users, no streak counters.
            Worldcoin-policy compliant per portal_config.json "self-profile"
            utility framing. */}
        {userPattern && userPattern.ready && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="font-mono-feature text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--terminal-dim)" }}
            >
              {t("summary.patternHeader")}
            </div>
            <p
              className="text-[13px] leading-relaxed mb-3"
              style={{ color: "var(--foreground)" }}
            >
              {t("summary.patternLine")
                .replace("{sessions}", String(userPattern.completedSessions))
                .replace("{majorityPct}", String(userPattern.majorityPct))}
            </p>
            {userPattern.mostContrarian && (
              <div className="mb-2">
                <div
                  className="font-mono-feature text-[10px] uppercase tracking-widest mb-0.5"
                  style={{ color: "var(--option-b)" }}
                >
                  {t("summary.contrarianHeader")}
                </div>
                <p
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  &ldquo;{locale === "ja" ? userPattern.mostContrarian.promptJa : userPattern.mostContrarian.promptEn}&rdquo;
                  <br />
                  {t("summary.contrarianStat").replace("{pct}", String(userPattern.mostContrarian.userSidePct))}
                </p>
              </div>
            )}
            {userPattern.mostAligned && (
              <div>
                <div
                  className="font-mono-feature text-[10px] uppercase tracking-widest mb-0.5"
                  style={{ color: "var(--option-a)" }}
                >
                  {t("summary.alignedHeader")}
                </div>
                <p
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  &ldquo;{locale === "ja" ? userPattern.mostAligned.promptJa : userPattern.mostAligned.promptEn}&rdquo;
                  <br />
                  {t("summary.alignedStat").replace("{pct}", String(userPattern.mostAligned.userSidePct))}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* 2026-05-27 — Conversation seed (E): suggest this session's
            most-evenly-split question as a topic to discuss with a friend.
            Pure copy — no action required. */}
        {conversationSeed && conversationSeed.gap < 25 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="px-5 py-3 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="font-mono-feature text-[10px] uppercase tracking-widest mb-1"
              style={{ color: "var(--terminal-dim)" }}
            >
              {t("summary.discussHeader")}
            </div>
            <p
              className="text-[12px] leading-snug"
              style={{ color: "var(--muted-foreground)" }}
            >
              &ldquo;{locale === "ja" ? conversationSeed.promptJa : conversationSeed.promptEn}&rdquo;
              <br />
              <span className="font-mono-feature text-[11px]" style={{ color: "var(--terminal-dim)" }}>
                {t("summary.discussSubtext")}
              </span>
            </p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5 pt-4 pb-5">
          <Button
            onClick={() => startNewSession()}
            className="w-full h-11 text-sm font-bold font-mono-feature tracking-wide rounded-md"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            {t("summary.playAgain")}
          </Button>
          <p
            className="text-[12px] leading-relaxed text-center px-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("summary.sharePrompt")}
          </p>
          <Button
            onClick={handleShare}
            variant="outline"
            className="w-full h-11 text-sm font-medium rounded-md"
            style={{ borderColor: "var(--border)" }}
          >
            <Share2 className="h-3.5 w-3.5 mr-2" />
            {t("summary.share")}
          </Button>
          {/*
            2026-04-27 reject fix:
            reviewer "can't exit once finishing the 5 q's" → 明示的な Exit ボタンを追加。
            押下で signOut() → walletAddress=null → WalletAuthScreen に戻る
            (= Mini App から「離脱した」状態を reviewer に明示)。
          */}
          <Button
            onClick={signOut}
            variant="outline"
            className="w-full h-11 text-sm font-medium rounded-md"
            style={{ borderColor: "var(--border)" }}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            {t("summary.exit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StatRowProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function StatRow({ label, value, total, color }: StatRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono-feature text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          {label}
        </span>
        <span className="font-mono-feature text-sm font-bold tabular-nums" style={{ color }}>
          {value}/{total}
        </span>
      </div>
      <div
        className="tally-bar text-[14px] truncate"
        style={{ color, opacity: 0.95 }}
      >
        {asciiBar(value, total)}
      </div>
    </div>
  );
}
