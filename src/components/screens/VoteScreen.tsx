"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { useApp, SESSION_SIZE } from "@/components/providers/AppProvider";
import { useI18n } from "@/i18n";
import { ASCII_BAR_WIDTH } from "@/lib/constants";
import type { VoteChoice, Tally } from "@/lib/types";

/**
 * 2026-05-27 UX update — verdict variants based on % magnitude.
 * Returns the i18n key for the verdict text given the user's side percentage.
 * Keeps the old vote.verdictMajority / vote.verdictMinority keys as fallback
 * but they are unused by VoteScreen now (kept in i18n for backwards safety).
 *
 * Magnitude tiers — agreed in 36-role fullharness (2026-05-27, Critical=0):
 *   90%+        → overwhelming
 *   60-89%      → clear majority
 *   50-59%      → slim majority
 *   40-49%      → slim minority
 *   25-39%      → against the crowd
 *   10-24%      → rare take
 *   <10%        → outlier
 *
 * No "streak / fastest / unique" gamification language — Worldcoin
 * anti-engagement-farming compliance maintained.
 */
function pickVerdictKey(userPct: number): string {
  if (userPct >= 90) return "vote.verdictOverwhelming";
  if (userPct >= 60) return "vote.verdictClear";
  if (userPct >= 50) return "vote.verdictSlimMajority";
  if (userPct >= 40) return "vote.verdictSlimMinority";
  if (userPct >= 25) return "vote.verdictAgainstCrowd";
  if (userPct >= 10) return "vote.verdictRare";
  return "vote.verdictOutlier";
}

const FIRST_TIME_HINT_FLAG = "turingvote_seen_intro";

/**
 * 2026-05-29 — Error UX (案2 fullharness).
 * Classify a caught vote error into a localized, human-friendly i18n key.
 * SECURITY: this stops raw internal error strings (e.g. "db_error",
 * "forbidden_origin", "HTTP 500") from being shown to the user. Anything
 * unrecognized falls through to a safe generic message.
 */
type VoteErrorKey =
  | "error.network"
  | "error.auth"
  | "error.verification"
  | "error.generic";

function classifyVoteError(err: unknown): VoteErrorKey {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    /http 5\d\d/.test(msg)
  ) {
    return "error.network";
  }
  if (msg.includes("orb verification") || msg.includes("needs_orb")) {
    return "error.verification";
  }
  if (
    msg.includes("not authenticated") ||
    msg.includes("verification_failed") ||
    msg.includes("http 401") ||
    msg.includes("forbidden")
  ) {
    return "error.auth";
  }
  return "error.generic";
}

// ============================================================
// "Human Pulse Terminal" — Card-centered terminal-themed vote screen
// ----------------------------------------------------------------
// - One question per card. Two big tappable A/B options.
// - After vote: ASCII bar + percentage + majority/minority verdict.
// - Terminal-style header: `> turingvote/$ ask N/5 [category]`
// ============================================================

function asciiBar(pct: number): string {
  const filled = Math.round((pct / 100) * ASCII_BAR_WIDTH);
  return "█".repeat(filled) + "░".repeat(ASCII_BAR_WIDTH - filled);
}

function ratioA(tally: Tally | null): number {
  if (!tally || tally.total_votes === 0) return 50;
  return Math.round((tally.votes_a / tally.total_votes) * 100);
}

interface OptionRowProps {
  letter: "A" | "B";
  label: string;
  picked: boolean;
  voted: boolean;
  /** tally が server から返った後だけ bar / % を表示する。optimistic UI の間は false */
  tallyReady: boolean;
  pct: number;
  isUserChoice: boolean;
  /** R3 Minor fix: aria-label を i18n 化したラベル文字列を親から渡す */
  ariaRecordingLabel: string;
  onClick: () => void;
}

function OptionRow({ letter, label, picked, voted, tallyReady, pct, isUserChoice, ariaRecordingLabel, onClick }: OptionRowProps) {
  const isA = letter === "A";
  const accent = isA ? "var(--option-a)" : "var(--option-b)";
  const accentBg = isA ? "var(--option-a-bg)" : "var(--option-b-bg)";
  const accentGlow = isA ? "var(--option-a-glow)" : "var(--option-b-glow)";

  // I5: 2択投票は意味論的に radio group。screen reader に選択/未選択の
  // 状態を伝えるため role="radio" + aria-checked を明示する。投票後は
  // disabled + aria-disabled で「もう変えられない」ことを通知。
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isUserChoice}
      aria-disabled={voted || undefined}
      aria-label={`Option ${letter}: ${label}${voted && tallyReady ? ` (${pct}% of voters)` : ""}`}
      onClick={onClick}
      disabled={voted}
      className="group relative w-full text-left rounded-md border transition-all overflow-hidden"
      style={{
        borderColor: isUserChoice ? accent : "var(--border)",
        backgroundColor: voted ? accentBg : "transparent",
        boxShadow: isUserChoice ? `0 0 0 1px ${accent}, 0 6px 28px -12px ${accentGlow}` : "none",
        cursor: voted ? "default" : "pointer",
      }}
    >
      {/* row 1: letter prefix, label, % (if voted) */}
      <div className="flex items-center gap-3 px-4 py-4">
        <span
          className="font-mono-feature text-[11px] font-bold tracking-widest shrink-0 w-6 text-center rounded border"
          style={{
            color: voted ? accent : "var(--terminal-dim)",
            borderColor: voted ? accent : "var(--border)",
            padding: "2px 0",
          }}
        >
          {letter}
        </span>
        <span
          className="text-base sm:text-lg font-semibold leading-tight flex-1 truncate"
          style={{ color: "var(--foreground)" }}
        >
          {label}
        </span>
        {/* R2 C2 fix: optimistic UI の視認性強化。
            voted=true & tallyReady=false の窓(=サーバ応答待ち・典型 300-500ms)
            で、選択側に Loader2 を瞬時に出す。Shinya 実機「改善してない」
            の原因は "瞬時反映された視覚変化を知覚できなかった" と推定。
            選択した option に明示的に spinner を出して "記録中" を知らせる。
            R3 I-R3-4 fix: a11y — aria-label + role="status" で screen reader
            に投票記録中の状態を通知(Worldcoin 審査 a11y 基準対応)。*/}
        {voted && !tallyReady && isUserChoice && (
          <Loader2
            className="h-4 w-4 animate-spin shrink-0"
            style={{ color: accent }}
            role="status"
            aria-label={ariaRecordingLabel}
          />
        )}
        {voted && tallyReady && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-mono-feature text-base font-bold tabular-nums shrink-0"
            style={{ color: accent }}
          >
            {pct}%
          </motion.span>
        )}
      </div>

      {/* row 2: ASCII bar revealed only after tally arrives (optimistic UI fix) */}
      <AnimatePresence>
        {voted && tallyReady && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="px-4 pb-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className="tally-bar text-[14px] truncate"
                style={{ color: accent, opacity: 0.95 }}
              >
                {asciiBar(pct)}
              </span>
              {isUserChoice && (
                <span
                  className="font-mono-feature text-[10px] font-bold tracking-widest uppercase shrink-0"
                  style={{ color: accent }}
                >
                  ← you
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* hover halo on idle state */}
      {!voted && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
          style={{ background: `linear-gradient(90deg, transparent, ${accentBg})` }}
        />
      )}

      {picked && voted && !isUserChoice && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ background: accentBg }}
        />
      )}
    </button>
  );
}

export function VoteScreen() {
  const {
    currentQuestion,
    currentTally,
    userVote,
    isLoadingSession,
    isSubmitting,
    sessionIndex,
    sessionQuestions,
    questionPackId,
    handleVote,
    advanceToNext,
  } = useApp();
  const { locale, t } = useI18n();
  const [errorKey, setErrorKey] = useState<VoteErrorKey | null>(null);

  // 2026-05-29 — offline indicator (案2 fullharness).
  // Init true to avoid SSR hydration mismatch (navigator is undefined on the
  // server); the effect corrects it on the client and listens for changes.
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // 2026-05-27 UX update — first-time intro hint.
  // Shows the value-prop one-liner above question #1 once per device, then
  // never again. Uses localStorage; gracefully no-ops if storage is blocked
  // (private browsing / Safari restricted) — flag read failure means we just
  // show the hint, which is acceptable.
  const [showIntroHint, setShowIntroHint] = useState(false);
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(FIRST_TIME_HINT_FLAG);
      if (!seen) {
        setShowIntroHint(true);
        window.localStorage.setItem(FIRST_TIME_HINT_FLAG, "1");
      }
    } catch {
      // Storage unavailable — show the hint this session, no persistence.
      setShowIntroHint(true);
    }
  }, []);

  // R4 C-R4-1 defensive guard: error path で setUserVote(null) 巻き戻し後に
  //   submittingRef が false になり、ユーザーが即別 option を連打すると二重
  //   POST の恐れを Round 4 Evaluator が指摘。実際には closure ガード + disabled
  //   属性 + submittingRef で三重防御されているが、iOS Safari scheduler で
  //   closure 再評価タイミングが不定のリスクを許容できないため、error 直後
  //   500ms は onVote 呼び出し自体を早期 return で抑止する cooldown を追加。
  const errorCooldownRef = useRef(0);
  // 2026-05-29 — remember the last attempted choice so the retry button can
  // re-submit it without the user re-tapping the option.
  const lastChoiceRef = useRef<VoteChoice | null>(null);
  const onVote = useCallback(
    async (choice: VoteChoice) => {
      if (Date.now() < errorCooldownRef.current) return;
      setErrorKey(null);
      lastChoiceRef.current = choice;
      try {
        await handleVote(choice);
      } catch (err) {
        // Show a localized, human-friendly message — never the raw error.
        setErrorKey(classifyVoteError(err));
        errorCooldownRef.current = Date.now() + 500;
      }
    },
    [handleVote]
  );

  // 2026-05-29 — explicit retry affordance. Bypasses the 500ms cooldown
  // (the cooldown exists to debounce rapid double-taps, not deliberate retry).
  const onRetry = useCallback(() => {
    const choice = lastChoiceRef.current;
    if (!choice) return;
    errorCooldownRef.current = 0;
    void onVote(choice);
  }, [onVote]);

  if (isLoadingSession || !currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--terminal-prompt)" }} />
        <span
          className="font-mono-feature text-xs"
          style={{ color: "var(--terminal-dim)" }}
        >
          {t("vote.loading")}
        </span>
      </div>
    );
  }

  const q = locale === "ja" ? currentQuestion.ja : currentQuestion.en;
  const aPct = ratioA(currentTally);
  const bPct = 100 - aPct;
  const totalQuestions = Math.max(sessionQuestions.length, SESSION_SIZE);
  const questionNum = sessionIndex + 1;

  // Verdict: which % tier does the user's side land in?
  // 2026-05-27 update — replaced binary majority/minority with 7-tier variants
  // (see pickVerdictKey above). Verdict text now includes the % itself via {n}.
  const userSidePct = userVote
    ? userVote === "A"
      ? aPct
      : bPct
    : null;
  const verdictKey = userSidePct === null ? null : pickVerdictKey(userSidePct);

  return (
    <div className="flex-1 flex flex-col px-4 pt-16 pb-6 overflow-y-auto">
      {/* ─── Terminal header ────────────────────────────────────── */}
      <div
        className="font-mono-feature text-[11px] tracking-tight mb-3 flex items-center gap-2"
        style={{ color: "var(--terminal-dim)" }}
      >
        <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>
        <span style={{ color: "var(--foreground)", opacity: 0.85 }}>turingvote:</span>
        <span>ask</span>
        <span
          className="font-bold tabular-nums"
          style={{ color: "var(--foreground)" }}
        >
          {String(questionNum).padStart(2, "0")}/{String(totalQuestions).padStart(2, "0")}
        </span>
        <span className="opacity-60">·</span>
        <span className="uppercase tracking-widest text-[10px] opacity-80">
          {t(`category.${currentQuestion.category}`)}
        </span>
        {questionPackId && (
          <>
            <span className="opacity-60">·</span>
            <span className="uppercase tracking-widest text-[10px] opacity-80">
              {t("pack.weekly")}
            </span>
          </>
        )}
        {userVote && (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] tracking-widest uppercase"
            style={{ color: "var(--terminal-prompt)" }}
          >
            <Check className="h-3 w-3" />
            voted
          </span>
        )}
      </div>

      {/* dim hairline */}
      <div
        className="h-px w-full mb-6"
        style={{ background: "var(--border)" }}
      />

      {/* 2026-05-29 — offline indicator (案2 fullharness). role=status so it is
          announced politely. Only rendered when the device reports offline. */}
      {!isOnline && (
        <div
          role="status"
          className="font-mono-feature text-[11px] mb-5 px-3 py-2 rounded-md border flex items-center gap-2"
          style={{
            color: "var(--destructive)",
            borderColor: "var(--destructive)",
            background: "color-mix(in oklch, var(--destructive) 8%, transparent)",
          }}
        >
          <span style={{ color: "var(--destructive)" }}>{"!"}</span>
          {t("app.offline")}
        </div>
      )}

      {/* ─── First-time intro hint (shown only on question #1 of first ever session) ─── */}
      {/* 2026-05-27 UX update — localStorage-gated. Auto-dismisses on subsequent
          sessions. Plain text only, no interaction needed. */}
      {showIntroHint && questionNum === 1 && !userVote && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-mono-feature text-[11px] mb-5 px-3 py-2 rounded-md border"
          style={{
            color: "var(--terminal-dim)",
            borderColor: "var(--border)",
            background: "color-mix(in oklch, var(--terminal-prompt) 5%, transparent)",
          }}
        >
          <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>{" "}
          {t("vote.firstTimeHint")}
        </motion.div>
      )}

      {/* ─── Question card ──────────────────────────────────────── */}
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8"
      >
        <h1
          className="text-[26px] sm:text-[30px] font-bold leading-[1.15] tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          {q.prompt}
        </h1>
      </motion.div>

      {/* ─── Two options ────────────────────────────────────────── */}
      {/* I5: radiogroup + aria-labelledby で「2つのボタンから1つを選ぶ」意図を
          支援技術に明示。aria-live は投票後の結果露出(%とverdict)を読み上げる */}
      <div
        role="radiogroup"
        aria-label={q.prompt}
        className="flex flex-col gap-3 mb-6"
      >
        <OptionRow
          letter="A"
          label={q.option_a}
          picked={userVote === "A"}
          voted={!!userVote}
          tallyReady={!!currentTally}
          pct={aPct}
          isUserChoice={userVote === "A"}
          ariaRecordingLabel={t("vote.recording")}
          onClick={() => !userVote && onVote("A")}
        />
        <OptionRow
          letter="B"
          label={q.option_b}
          picked={userVote === "B"}
          voted={!!userVote}
          tallyReady={!!currentTally}
          pct={bPct}
          isUserChoice={userVote === "B"}
          ariaRecordingLabel={t("vote.recording")}
          onClick={() => !userVote && onVote("B")}
        />
      </div>

      {/* ─── Footer / verdict ───────────────────────────────────── */}
      <div className="mt-auto">
        <div
          className="h-px w-full mb-3"
          style={{ background: "var(--border)" }}
        />

        {/* R3 fix: AnimatePresence mode="wait" + React 19 + framer-motion v12 で、
            hint → reveal の key 切替時に exit 完了後に reveal が mount されない
            不具合を Vercel 本番で観測(ユーザー操作不能になる)。mode="wait" を
            外すと両方が短時間 coexist するが、reveal の enter は確実に走る。
            hint の exit はフェードだけなのでクロスフェードでも違和感ない。*/}
        <AnimatePresence>
          {!userVote ? (
            <motion.div
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between"
            >
              <span
                className="font-mono-feature text-[11px]"
                style={{ color: "var(--terminal-dim)" }}
              >
                <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>{" "}
                {t("vote.tapHint")}
                <span className="terminal-caret" />
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="reveal"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.05, duration: 0.25 }}
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-3"
            >
              <div
                className="font-mono-feature text-[11px] flex-1 leading-snug"
                style={{ color: "var(--terminal-dim)" }}
              >
                {currentTally && verdictKey && userSidePct !== null && (
                  <div
                    className="font-semibold mb-0.5"
                    style={{ color: "var(--foreground)" }}
                  >
                    {t(verdictKey).replace("{n}", String(userSidePct))}
                  </div>
                )}
                {currentTally
                  ? t("vote.totalVoters").replace(
                      "{n}",
                      currentTally.total_votes.toLocaleString()
                    )
                  : t("vote.recording")}
              </div>
              <button
                type="button"
                onClick={advanceToNext}
                disabled={isSubmitting}
                className="font-mono-feature inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md text-[13px] font-bold tracking-wide hover:opacity-90 active:scale-95 transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {questionNum >= totalQuestions ? t("vote.finish") : t("vote.next")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2026-05-29 — localized error + explicit retry (案2 fullharness).
            role=alert + aria-live so screen readers announce it. */}
        {errorKey && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-3 flex items-center justify-between gap-3"
          >
            <span
              className="text-xs font-mono-feature leading-snug"
              style={{ color: "var(--destructive)" }}
            >
              {"> "}
              {t(errorKey)}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="font-mono-feature shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-bold tracking-wide active:scale-95 transition-transform"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--destructive)",
                color: "var(--destructive)",
              }}
            >
              {t("error.retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
