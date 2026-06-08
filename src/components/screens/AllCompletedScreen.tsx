"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/i18n";
import { shareText } from "@/lib/share";
import { track } from "@/lib/track";

/**
 * Q3 (2026-04-19) — closure screen shown when the wallet has voted on every
 * question currently in the pool. By design TuringVote does NOT loop the user
 * back into the same questions ("anti-engagement-farming" — aligns with the
 * "no leaderboard, no streaks, no rewards" tag line). When the question pool
 * grows server-side, the next session automatically picks up the new ones,
 * so this screen quietly disappears for that user without any client update.
 */
export function AllCompletedScreen() {
  const { sessionAnswers, userProfile } = useApp();
  const { t, locale } = useI18n();

  const totalAnswered =
    userProfile?.voted_question_ids?.length ?? sessionAnswers.length;

  const onShare = async () => {
    const text =
      locale === "ja"
        ? `🧠 TuringVoteで全${totalAnswered}問に回答しました。\n\nまずは5つの二択で、自分が多数派か少数派か見てみて →`
        : `🧠 I've answered all ${totalAnswered} TuringVote questions.\n\nStart with 5 this-or-that choices and see if you land majority or minority →`;
    track("share_tap", { metadata: { surface: "all_completed", total_answered: totalAnswered } });
    await shareText(text);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
      {/* Terminal-style header */}
      <div
        className="font-mono-feature text-[11px] tracking-tight mb-8 flex items-center gap-2"
        style={{ color: "var(--terminal-dim)" }}
      >
        <span style={{ color: "var(--terminal-prompt)" }}>{">"}</span>
        <span style={{ color: "var(--foreground)", opacity: 0.85 }}>
          turingvote:
        </span>
        <span>status</span>
        <span className="opacity-60">·</span>
        <span
          className="uppercase tracking-widest text-[10px]"
          style={{ color: "var(--terminal-prompt)" }}
        >
          [ALL DONE]
        </span>
      </div>

      {/* Big checkmark / completion glyph */}
      <div
        className="mb-6 w-20 h-20 rounded-full border-2 flex items-center justify-center text-3xl"
        style={{
          borderColor: "var(--terminal-prompt)",
          color: "var(--terminal-prompt)",
        }}
        aria-hidden
      >
        ✓
      </div>

      {/* Title */}
      <h1
        className="text-2xl font-bold mb-3"
        style={{ color: "var(--foreground)" }}
      >
        {locale === "ja" ? "全問完了" : "All caught up"}
      </h1>

      {/* Subtitle */}
      <p
        className="text-sm mb-2"
        style={{ color: "var(--foreground)", opacity: 0.7 }}
      >
        {locale === "ja"
          ? `${totalAnswered}問すべての2択にあなたの選択を残しました。`
          : `You've answered all ${totalAnswered} TuringVote polls.`}
      </p>

      {/* Brand reinforcement */}
      {/* 2026-05-27 UX update — weekly cadence return anchor.
          2026-05-29 honesty fix: the weekly pack ROTATES a different 5 from the
          existing pool each ISO week; it does NOT add new questions. Wording
          corrected from "new questions added" to "a different set rotates in"
          to avoid overclaiming. */}
      <p
        className="text-xs mb-10"
        style={{ color: "var(--foreground)", opacity: 0.5 }}
      >
        {locale === "ja"
          ? "出題の5問は毎週月曜(UTC)に切り替わります。"
          : "A different set of 5 every Monday (UTC)."}
      </p>

      {/* Share */}
      <Button
        onClick={onShare}
        className="w-full max-w-[260px] h-11 text-sm font-bold font-mono-feature tracking-wide rounded-md"
        style={{
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
        }}
      >
        <Share2 className="h-4 w-4 mr-2" />
        {t("summary.share")}
      </Button>

      {/* Footer hint */}
      <div
        className="font-mono-feature text-[10px] mt-12 opacity-50"
        style={{ color: "var(--foreground)" }}
      >
        {locale === "ja"
          ? "// 検証済み人間 100% の声を、ありがとう。"
          : "// thank you for casting your verified-human vote."}
      </div>
    </div>
  );
}
