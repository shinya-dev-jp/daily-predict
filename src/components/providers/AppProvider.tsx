"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { Question, Tally, UserProfile, VoteChoice } from "@/lib/types";
// Q1 B+ (2026-04-19): walletAuth + ONE-TIME Orb verify per wallet.
// MiniKit.verify is called exactly once at first session after walletAuth,
// then users.orb_verified_at is persisted server-side. Subsequent votes
// require zero auth dialogs (cookie + DB flag).
import { MiniKit, VerificationLevel } from "@worldcoin/minikit-js";
import { SESSION_SIZE } from "@/lib/constants";
import { track } from "@/lib/track";

// ============================================================
// Utility
// ============================================================

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

// ============================================================
// Demo data for ?preview=1 mode
// ============================================================

// M4: DEMO question id は 10000+ に分離して、万が一 DEMO と本番 tc_questions.json
// の id 空間が混ざっても(例: 誤って本番 API に流れても)絶対に衝突しないようにする。
// 将来 tc_questions.json を 1000 件まで増やしても安全なマージンを取る。
const DEMO_QUESTIONS: Question[] = [
  {
    id: 10001,
    category: "lifestyle",
    ja: { prompt: "あなたはどっち派？", option_a: "朝型", option_b: "夜型" },
    en: { prompt: "Which are you?", option_a: "Morning person", option_b: "Night owl" },
  },
  {
    id: 10002,
    category: "preference",
    ja: { prompt: "休日を過ごすなら？", option_a: "山", option_b: "海" },
    en: { prompt: "How would you spend a day off?", option_a: "Mountains", option_b: "Ocean" },
  },
  {
    id: 10003,
    category: "preference",
    ja: { prompt: "ペットを飼うなら？", option_a: "犬", option_b: "猫" },
    en: { prompt: "If you got a pet?", option_a: "Dog", option_b: "Cat" },
  },
  {
    id: 10004,
    category: "values",
    ja: { prompt: "大事にしているのは？", option_a: "プロセス", option_b: "結果" },
    en: { prompt: "What matters more?", option_a: "The process", option_b: "The result" },
  },
  {
    id: 10005,
    category: "style",
    ja: { prompt: "決断する時は？", option_a: "論理で考える", option_b: "直感を信じる" },
    en: { prompt: "When deciding?", option_a: "Logic", option_b: "Intuition" },
  },
];
const DEMO_TALLIES: Tally[] = [
  { question_id: 10001, category: "lifestyle", total_votes: 128, votes_a: 76, votes_b: 52 },
  { question_id: 10002, category: "preference", total_votes: 96, votes_a: 34, votes_b: 62 },
  { question_id: 10003, category: "preference", total_votes: 211, votes_a: 98, votes_b: 113 },
  { question_id: 10004, category: "values", total_votes: 144, votes_a: 61, votes_b: 83 },
  { question_id: 10005, category: "style", total_votes: 178, votes_a: 90, votes_b: 88 },
];

// ============================================================
// Context shape
// ============================================================

export interface SessionAnswer {
  question_id: number;
  choice: VoteChoice;
  tally: Tally | null;
}

interface AppState {
  /** Questions loaded for the current 5-question session */
  sessionQuestions: Question[];
  /** Weekly cohort id returned by /api/questions?pack=current */
  questionPackId: string | null;
  /** 0-indexed position within the current session */
  sessionIndex: number;
  /** User's answer + resulting tally for each question so far */
  sessionAnswers: SessionAnswer[];
  /** True once all SESSION_SIZE questions are answered */
  sessionDone: boolean;

  /** The question the user is currently looking at (sessionQuestions[sessionIndex]) */
  currentQuestion: Question | null;
  /** User's vote on the current question (null before they tap) */
  userVote: VoteChoice | null;
  /** Tally revealed after voting on the current question */
  currentTally: Tally | null;

  /** Wallet / auth state */
  walletAddress: string | null;
  userProfile: UserProfile | null;

  /** Flags */
  isLoadingSession: boolean;
  isSubmitting: boolean;
  /** True if /api/questions failed and we have no questions to show */
  loadError: string | null;
  /**
   * Q3 (2026-04-19) — true when the wallet has voted on every question
   * currently in the pool. Server-driven (when /api/questions returns empty
   * array, we know there's nothing left to ask). Future question additions
   * automatically become available again — pool grows server-side, the
   * filtered query returns fresh rows, allCompleted flips back to false on
   * next auth refresh.
   */
  allCompleted: boolean;

  /** Actions */
  onAuthenticated: (address: string, profile: UserProfile) => void;
  handleVote: (choice: VoteChoice) => Promise<void>;
  /** Move to the next question in the session (after Reveal is shown) */
  advanceToNext: () => void;
  /** Start a brand new 5-question session */
  startNewSession: () => Promise<void>;
  /**
   * Q3-dismiss (2026-04-19): Summary ✕ タップで呼ばれる。
   * sessionIndex を最後の回答済み Q に戻して verdict 画面に帰す。
   * sessionDone が一時的に false になるので Dialog も閉じる。
   */
  dismissSummaryToLastQ: () => void;
  /**
   * R2 C-R2-1: dismiss 直後 300ms は Dialog の再 open を抑止する。
   * Radix Dialog close animation とユーザー高速連打の競合を防ぐ。
   */
  dismissing: boolean;
  /**
   * 2026-04-27 reject fix (reviewer: "can't exit once finishing the 5 q's"):
   * SummaryDialog 上の「Exit」ボタンから呼ばれる明示的な離脱アクション。
   * client state を全リセット → walletAddress=null → WalletAuthScreen に戻る。
   * Cookie の DELETE は best-effort(エンドポイント未実装でも client state は離脱状態に)。
   */
  signOut: () => void;
}

const AppContext = createContext<AppState | null>(null);

// I2: RetryContext を Provider の外に切り出し、@ts-expect-error を消す。
// (以前は AppContext.Provider の children に RetryContext.Provider を直接
// ネストしていたため、Context.Provider の value 型と retryLoadSession の
// 型が噛み合わず ts-expect-error で握り潰していた。)
const RetryContext = createContext<() => void>(() => {});
export function useRetryLoadSession() {
  return useContext(RetryContext);
}

// I3: walletAddress を localStorage に永続化するのをやめる。
// C1 で HttpOnly Cookie(tv_auth)に寄せた理由は「wallet を JS から
// 読めなくする」ことだったのに、localStorage に同じ値を残していたら
// XSS 一発で全部抜かれる。Cookie 側の有効期限内は、ページリロード時
// にサーバー側エンドポイント(/api/profile の authenticateRequest 等)から
// address を取り直す前提とする。初回ロード時に walletAddress が null でも
// Cookie が有効ならログイン状態を維持する判定は WalletAuthScreen 側で
// ハンドルする(将来 /api/auth/whoami を追加して自動復元する予定)。
const LS_ADDRESS_KEY_LEGACY = "tv_wallet_address";

// ============================================================
// Provider
// ============================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const preview = isPreviewMode();

  // ── 環境変数の不一致を起動時に1回だけ警告(C2)。
  // クライアントとサーバーで NEXT_PUBLIC_WLD_ACTION が食い違うと Orb verify が
  // 静かに失敗してウォレット tier に落ちる(=Verified Human の保証が消える)。
  useEffect(() => {
    if (!preview && !process.env.NEXT_PUBLIC_WLD_ACTION) {
      console.error(
        "[TuringVote] NEXT_PUBLIC_WLD_ACTION が未設定です。Orb verify がサーバーと噛み合わず、ウォレット tier に静かにフォールバックします。Vercel の Production env に設定してください。"
      );
    }
  }, [preview]);

  // Session state
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(() =>
    preview ? DEMO_QUESTIONS : []
  );
  const [questionPackId, setQuestionPackId] = useState<string | null>(() =>
    preview ? "preview" : null
  );
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<SessionAnswer[]>([]);

  // Per-question transient state
  const [userVote, setUserVote] = useState<VoteChoice | null>(null);
  const [currentTally, setCurrentTally] = useState<Tally | null>(null);

  // Wallet state — Cookie ベースに移行したため authToken は context に持たない。
  // I3: walletAddress も localStorage に保存しない。古い環境に残っていた
  // 値は一度だけ掃除する(XSS 窓口を閉じるため)。
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    // M1: preview wallet address を正規 EVM 形式(0x + 40 hex)に統一。
    // 以前の "0xpreview..." は 'p' 'r' 'v' 'w' が非 hex だったため、下流の
    // isAddress() / slice(2,8) が不正な値で動く可能性があった。
    // 下の 40 桁は完全な 0 パディング + 末尾 "c0ffee" で「明らかにダミー」と
    // 認識できる決定的リテラル。
    if (preview) return "0x0000000000000000000000000000000000c0ffee";
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LS_ADDRESS_KEY_LEGACY);
      } catch {
        // Safari private mode 等で localStorage が触れないのは致命的ではない
      }
    }
    return null;
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Flags
  const [isLoadingSession, setIsLoadingSession] = useState(() => !preview);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allCompleted, setAllCompleted] = useState(false);

  // Q3 (2026-04-19): persist the question_ids this wallet has already voted on.
  // Initialized from /api/auth/wallet on auth, kept in sync after every successful
  // vote. Used as exclude list for /api/questions so users never see the same
  // question twice across sessions / device reinstalls / app re-opens.
  const [votedQuestionIds, setVotedQuestionIds] = useState<Set<number>>(
    () => new Set()
  );

  const submittingRef = useRef(false);
  const appOpenTrackedRef = useRef(false);
  const sessionStartTrackedRef = useRef("");
  // 直前 fetch の cancel 用 trigger(loadSession を再利用するため)
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (appOpenTrackedRef.current) return;
    appOpenTrackedRef.current = true;
    track("app_open", { metadata: { preview } });
  }, [preview]);

  // ── Load a new session on mount (non-preview) ────────────────────────────
  // CRITICAL FIX (2026-04-19 Shinya 実機 bug): votedQuestionIds is intentionally
  // NOT in the dependency array. Putting it there caused the effect to re-fire
  // after every successful vote (because handleVote calls setVotedQuestionIds),
  // which reset the entire session mid-vote — symptoms: question silently
  // swapped between tap and result render, and post-✕-dismiss the screen
  // got stuck on "質問を準備中…" because the new fetch was in-flight.
  //
  // Instead: this effect captures `votedQuestionIds` via closure at the time
  // it runs (which happens once walletAddress is populated). After votes, the
  // running session's questions stay stable. New sessions explicitly call
  // startNewSession() which re-reads the latest votedQuestionIds.
  useEffect(() => {
    if (preview) return;
    // Wait for walletAuth to populate votedQuestionIds from the user profile.
    // Without this, we'd fetch with empty exclude and risk surfacing a
    // question the user already voted on — they'd hit 409 already_voted.
    if (!walletAddress) return;
    let cancelled = false;
    // R4 I-R4-4 fix: fetch に 10s timeout を追加。Vercel cold start + iOS
    //   ネット不安定で永久 loading spinner になるリスクを排除(Worldcoin
    //   審査「永久 loading」指摘防止)。AbortController + signal で unmount
    //   時のキャンセルも明示化。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    (async () => {
      setIsLoadingSession(true);
      setLoadError(null);
      try {
        const excludeCsv = Array.from(votedQuestionIds).join(",");
        const qs = excludeCsv
          ? `?count=${SESSION_SIZE}&pack=current&exclude=${excludeCsv}`
          : `?count=${SESSION_SIZE}&pack=current`;
        const res = await fetch(`/api/questions${qs}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && Array.isArray(json.questions)) {
          setSessionQuestions(json.questions as Question[]);
          setQuestionPackId(
            typeof json.question_pack_id === "string" ? json.question_pack_id : null
          );
          setAllCompleted(json.questions.length === 0);
        }
      } catch (err) {
        console.warn("[AppProvider] Failed to fetch session questions:", err);
        if (!cancelled) setLoadError("question_load_failed");
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setIsLoadingSession(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, reloadTick, walletAddress]);

  // ── Sync per-question state when index changes ──────────────────────────
  // Q3-dismiss fix (2026-04-19 Shinya 実機 feedback 2 回目):
  //   以前は sessionIndex 変化で必ず null にリセットしていた。その結果、
  //   Summary ✕ で sessionIndex を過去 Q に戻しても verdict が消えて
  //   「質問を準備中…」loading に落ちる UX bug になっていた。
  //   代わりに、sessionAnswers[sessionIndex] に既存回答があればそこから
  //   復元し、なければ null にする(= 新規 Q に進んだ時の従来挙動)。
  //
  // R2 I1 guard: handleVote 内で既に setUserVote/setCurrentTally した直後に、
  //   setSessionAnswers で配列を更新すると、この effect が再発火して
  //   同じ値(もしくは stale なタイミングで null)を再設定してチラつく可能性。
  //   「既に現 sessionIndex に対する answer と現 state が一致している」場合は
  //   setter を呼ばないことで、余計な re-render を防ぐ(React 内部 dedupe も
  //   あるが StrictMode / iOS Safari scheduler での揺れを明示的に抑える)。
  useEffect(() => {
    const existing = sessionAnswers[sessionIndex];
    const nextVote = existing?.choice ?? null;
    const nextTally = existing?.tally ?? null;
    setUserVote((prev) => (prev === nextVote ? prev : nextVote));
    setCurrentTally((prev) => (prev === nextTally ? prev : nextTally));
  }, [sessionIndex, sessionAnswers]);

  // ── onAuthenticated ───────────────────────────────────────────────────────
  // Cookie 化に伴い token 引数を撤去。サーバー側で Set-Cookie 済み。
  // I3: walletAddress を localStorage へ書かない(XSS 対策)。
  // Q3: hydrate voted_question_ids from server so the user resumes their
  //     completion progress across sessions.
  const onAuthenticated = useCallback(
    (address: string, profile: UserProfile) => {
      setWalletAddress(address);
      setUserProfile(profile);
      track("auth_success");
      try {
        const now = new Date().toISOString();
        const previous = window.localStorage.getItem("tv.last_auth_seen_at");
        if (previous) {
          track("return_visit", {
            metadata: {
              previous_seen_at: previous,
            },
          });
        }
        window.localStorage.setItem("tv.last_auth_seen_at", now);
      } catch {
        // localStorage availability is not required for retention analytics.
      }
      if (profile.voted_question_ids && profile.voted_question_ids.length > 0) {
        setVotedQuestionIds(new Set(profile.voted_question_ids));
      }
    },
    []
  );

  // Q1 B+ (2026-04-19) — one-time Orb verify per wallet.
  // Triggered lazily (on the first vote attempt that the server rejects with
  // 403 needs_orb_verify) rather than eagerly at auth, so users who have
  // already verified in a previous session never see the dialog again. The
  // server-side flag (users.orb_verified_at) is the source of truth.
  const ensureOrbVerified = useCallback(
    async (address: string): Promise<boolean> => {
      try {
        const verifyResult = await MiniKit.commandsAsync.verify({
          action: process.env.NEXT_PUBLIC_WLD_ACTION ?? "turingvote-vote",
          signal: address,
          verification_level: VerificationLevel.Orb,
        });
        if (verifyResult.finalPayload?.status !== "success") {
          console.warn("[ensureOrbVerified] verify cancelled / failed");
          return false;
        }
        const persistRes = await fetch("/api/auth/verify-orb", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verify_payload: verifyResult.finalPayload }),
        });
        if (!persistRes.ok) {
          console.warn(
            "[ensureOrbVerified] /api/auth/verify-orb rejected",
            persistRes.status
          );
          return false;
        }
        // Mirror to local profile so subsequent UI knows we're verified
        setUserProfile((prev) =>
          prev ? { ...prev, orb_verified: true } : prev
        );
        return true;
      } catch (err) {
        console.warn("[ensureOrbVerified] threw:", err);
        return false;
      }
    },
    []
  );

  // ── Cast vote on the current question ─────────────────────────────────────
  const handleVote = useCallback(
    async (choice: VoteChoice) => {
      const currentQ = sessionQuestions[sessionIndex];
      if (submittingRef.current || !currentQ) return;
      submittingRef.current = true;
      setIsSubmitting(true);

      // Optimistic UI (Shinya 2026-04-19 実機 2nd feedback「ラグ改善してない」):
      //   タップ直後に userVote だけ先行反映 → OptionRow の border/bg が
      //   瞬時にハイライト。currentTally は null のまま(bar と % は後から
      //   fade-in)。サーバ response が返るまでの 200-500ms の "何も起きてない
      //   感" を消す。orb verify が必要な場合は下で 403 retry の際に
      //   userVote を巻き戻すので冪等。
      setUserVote(choice);

      try {
        // ── Preview branch: skip network, reveal demo tally immediately
        if (isPreviewMode()) {
          const demoTally =
            DEMO_TALLIES.find((t) => t.question_id === currentQ.id) ?? null;
          setCurrentTally(demoTally);
          setSessionAnswers((prev) => [
            ...prev,
            { question_id: currentQ.id, choice, tally: demoTally },
          ]);
          return;
        }

        // ── Q1 B+ (2026-04-19) — walletAuth + ONE-TIME Orb verify
        //    Path:
        //    1. Cookie + (already orb_verified) → vote inserts immediately
        //    2. Cookie + (not yet orb_verified) → server returns 403
        //       needs_orb_verify → client triggers MiniKit verify(Orb) →
        //       posts /api/auth/verify-orb → retries this vote ONCE
        //
        //    Latency: /api/vote returns the tally in the same response, so
        //    we no longer issue a second GET /api/tally request after a
        //    successful vote (Shinya 実機 feedback 2026-04-19 「反応が遅い」)
        const postVote = async () => {
          const res = await fetch("/api/vote", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question_id: currentQ.id, choice }),
          });
          const json = await res.json();
          return { res, json };
        };

        let { res, json } = await postVote();

        // 403 needs_orb_verify → trigger one-time Orb verify, then retry
        if (res.status === 403 && json.error === "needs_orb_verify") {
          if (!walletAddress) {
            throw new Error("Wallet not authenticated yet");
          }
          const verified = await ensureOrbVerified(walletAddress);
          if (!verified) {
            throw new Error("Orb verification required to vote");
          }
          ({ res, json } = await postVote());
        }

        const tally: Tally | null = (json.tally as Tally) ?? null;

        if (res.status === 409) {
          // Already voted — server still returned the current tally.
          // userVote は optimistic で既にセット済み。
        } else if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Vote failed");
        }
        // userVote は optimistic で既にセット済み。tally 反映のみここで行う。

        setCurrentTally(tally);
        const nextAnswerCount = sessionAnswers.length + 1;
        track("vote", {
          metadata: {
            position: nextAnswerCount,
            question_id: currentQ.id,
            question_pack_id: questionPackId,
          },
        });
        if (nextAnswerCount === 1) {
          track("first_vote", {
            metadata: { question_pack_id: questionPackId },
          });
        }
        if (nextAnswerCount >= Math.min(sessionQuestions.length, SESSION_SIZE)) {
          track("fifth_vote", {
            metadata: {
              answered_count: nextAnswerCount,
              question_pack_id: questionPackId,
            },
          });
        }
        setSessionAnswers((prev) => [
          ...prev,
          { question_id: currentQ.id, choice, tally },
        ]);
        // Q3: track every voted question_id so future sessions exclude them
        // (cross-session de-duplication, future-proof for added questions).
        setVotedQuestionIds((prev) => {
          const next = new Set(prev);
          next.add(currentQ.id);
          return next;
        });
      } catch (err) {
        // Optimistic UI でセット済みの userVote を巻き戻す(エラーで再投票可能に)。
        setUserVote(null);
        setCurrentTally(null);
        console.error("[AppProvider] handleVote error:", err);
        throw err;
      } finally {
        setIsSubmitting(false);
        // R3 C-R3-2 再検討: queueMicrotask で submittingRef の解除を遅延する
        //   設計は overkill と判定。OptionRow の onClick は closure 経由で
        //   `!userVote` をガードしており、setUserVote(null) の commit 前は
        //   closure の userVote は前 render の値(="A")のまま → `!userVote` が
        //   false で onVote は呼ばれない。結局 closure ガードで十分なので
        //   microtask 遅延を外して素直に解除する。
        submittingRef.current = false;
      }
    },
    [sessionQuestions, sessionIndex, sessionAnswers.length, questionPackId, walletAddress, ensureOrbVerified]
  );

  // ── Advance to next question in the session ──────────────────────────────
  const advanceToNext = useCallback(() => {
    setSessionIndex((i) => i + 1);
  }, []);

  // ── Dismiss Summary and return to last Q verdict (Q3-dismiss 2026-04-19) ─
  // Shinya 2 回目実機 feedback: ✕ タップ後「質問を準備中」loading が永久ループ。
  // 原因: dismissed=true で dialog は閉じるが sessionIndex=5 のまま →
  //   currentQuestion=undefined → VoteScreen が loading spinner を返す。
  // 解決: 最後に回答した Q(sessionAnswers.length - 1)に sessionIndex を戻す。
  //   sync useEffect が既存回答から userVote / currentTally を復元するので
  //   verdict 画面がそのまま再現される。
  //
  // R2 C-R2-1 guard: sessionIndex を戻した直後にユーザーが即「完了」ボタンで
  //   advanceToNext → sessionIndex=5 に復帰するレースで、Radix Dialog の close
  //   animation 中に open=true に再反転し、unmount/mount 競合で画面凍結する
  //   可能性を Evaluator Round 2 で指摘。dismissing フラグを 300ms 保持して
  //   その間 Dialog の再 open を抑止する。
  // R3 C-R3-1 fix: setTimeout の cleanup 未実装で unmount 中 fire → setState
  //   leak 警告の恐れ+Radix 内部 ESC と document-level fallback が二重発火
  //   すると timer が 2 本走り cleanup 漏れ。
  //   → useRef で timer id を保持し、多重コール時は先行 timer を clear、
  //     unmount useEffect で必ず clear する。
  const [dismissing, setDismissing] = useState(false);
  const dismissingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissSummaryToLastQ = useCallback(() => {
    if (sessionAnswers.length === 0) return;
    setDismissing(true);
    setSessionIndex(sessionAnswers.length - 1);
    if (dismissingTimerRef.current) {
      clearTimeout(dismissingTimerRef.current);
    }
    dismissingTimerRef.current = setTimeout(() => {
      setDismissing(false);
      dismissingTimerRef.current = null;
    }, 300);
  }, [sessionAnswers.length]);

  // Unmount cleanup for dismissing timer (R3 C-R3-1)
  useEffect(() => {
    return () => {
      if (dismissingTimerRef.current) {
        clearTimeout(dismissingTimerRef.current);
        dismissingTimerRef.current = null;
      }
    };
  }, []);

  // ── signOut (2026-04-27 reject fix) ──────────────────────────────────────
  // reviewer: "can't exit once finishing the 5 q's" → Summary 画面に明示的な
  // Exit ボタンを追加。押下で client state を全リセット → walletAddress=null
  // → WalletAuthScreen が再表示される(= Mini App 内で「最初に戻った」状態)。
  // server cookie の DELETE は best-effort(エンドポイントが未実装でも、
  // client state を null にすれば WalletAuthScreen で再 walletAuth を要求するので
  // exit 体験としては成立する)。
  const signOut = useCallback(() => {
    // Best-effort cookie clear (fire-and-forget・log only on failure)
    // R1 I4 fix: silent catch を console.warn に変更し、debug trail を残す。
    fetch("/api/auth/wallet", {
      method: "DELETE",
      credentials: "include",
    }).catch((err) => {
      console.warn("[signOut] cookie clear failed (non-fatal):", err);
    });

    // Stop any pending dismiss timer to avoid late re-open of dialog
    if (dismissingTimerRef.current) {
      clearTimeout(dismissingTimerRef.current);
      dismissingTimerRef.current = null;
    }

    // Reset all client state (defense in depth: include in-flight flags too)
    // R1 I1 fix: isSubmitting / submittingRef も reset(将来の race を予防)。
    setWalletAddress(null);
    setUserProfile(null);
    setSessionQuestions([]);
    setQuestionPackId(null);
    setSessionIndex(0);
    setSessionAnswers([]);
    setUserVote(null);
    setCurrentTally(null);
    setVotedQuestionIds(new Set());
    setAllCompleted(false);
    setIsLoadingSession(false);
    setIsSubmitting(false);
    submittingRef.current = false;
    setLoadError(null);
    setDismissing(false);
  }, []);

  // ── Start a fresh 5-question session ─────────────────────────────────────
  // C3: excludeIds は state リセットの「前」に必ず取得する。
  // Q3 (2026-04-19): exclude list = votedQuestionIds(全セッション横断・
  //   永続)+ sessionAnswers(直前セッション内・念のため重複防御)。
  //   返ってきた questions が空なら allCompleted=true で完了画面に遷移。
  const startNewSession = useCallback(async () => {
    // R5 C-R5-2 fix: 旧セッションの dismissing timer が残存していると、
    //   新セッション開始後(sessionAnswers=[])に 300ms 後 setDismissing(false)
    //   が遅延発火して Dialog の open 条件が瞬時に flip する race あり。
    //   新セッション開始=dismissing lifecycle を決定的にリセット。
    if (dismissingTimerRef.current) {
      clearTimeout(dismissingTimerRef.current);
      dismissingTimerRef.current = null;
    }
    setDismissing(false);

    const allExcluded = new Set<number>(votedQuestionIds);
    sessionAnswers.forEach((a) => allExcluded.add(a.question_id));
    const excludeIdsCsv = Array.from(allExcluded).join(",");

    setSessionAnswers([]);
    setSessionIndex(0);
    setUserVote(null);
    setCurrentTally(null);
    setIsLoadingSession(true);
    setLoadError(null);

    if (isPreviewMode()) {
      setSessionQuestions(DEMO_QUESTIONS);
      setQuestionPackId("preview");
      setIsLoadingSession(false);
      return;
    }

    try {
      const qs = excludeIdsCsv
        ? `?count=${SESSION_SIZE}&pack=current&exclude=${excludeIdsCsv}`
        : `?count=${SESSION_SIZE}&pack=current`;
      const res = await fetch(`/api/questions${qs}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.questions)) {
          setSessionQuestions(json.questions as Question[]);
          setQuestionPackId(
            typeof json.question_pack_id === "string" ? json.question_pack_id : null
          );
          setAllCompleted(json.questions.length === 0);
        }
      } else {
        setLoadError("question_load_failed");
      }
    } catch {
      setLoadError("question_load_failed");
    } finally {
      setIsLoadingSession(false);
    }
  }, [sessionAnswers, votedQuestionIds]);

  /** Empty state からの「再読込」アクション。effect の再実行をトリガーするだけ。 */
  const retryLoadSession = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const currentQuestion = sessionQuestions[sessionIndex] ?? null;

  useEffect(() => {
    if (!walletAddress || isLoadingSession || sessionQuestions.length === 0) return;
    const signature = `${walletAddress}:${questionPackId ?? "none"}:${sessionQuestions
      .map((q) => q.id)
      .join(",")}`;
    if (sessionStartTrackedRef.current === signature) return;
    sessionStartTrackedRef.current = signature;
    track("session_start", {
      metadata: {
        question_pack_id: questionPackId,
        question_count: sessionQuestions.length,
      },
    });
    track("question_pack_view", {
      metadata: {
        question_pack_id: questionPackId,
        question_count: sessionQuestions.length,
      },
    });
  }, [walletAddress, isLoadingSession, sessionQuestions, questionPackId]);

  // I8: tc_questions.json の件数や ?exclude=... の関係で 5問未満しか
  // 返ってこないケース(= 既にほぼ全問回答済 or 設定ミス)でも、
  // summary に到達できるようにしておく。基準は常に「現在の
  // sessionQuestions の長さ」。空のセッション(0問)は summary を出さない。
  const effectiveSessionSize =
    sessionQuestions.length > 0
      ? Math.min(sessionQuestions.length, SESSION_SIZE)
      : SESSION_SIZE;
  const sessionDone =
    effectiveSessionSize > 0 &&
    sessionAnswers.length >= effectiveSessionSize &&
    sessionIndex >= effectiveSessionSize;

  // I1: provider value を useMemo で安定化(consumer の不要な re-render を抑制)
  const value = useMemo<AppState>(
    () => ({
      sessionQuestions,
      questionPackId,
      sessionIndex,
      sessionAnswers,
      sessionDone,
      currentQuestion,
      userVote,
      currentTally,
      walletAddress,
      userProfile,
      isLoadingSession,
      isSubmitting,
      loadError,
      allCompleted,
      onAuthenticated,
      handleVote,
      advanceToNext,
      startNewSession,
      dismissSummaryToLastQ,
      dismissing,
      signOut,
    }),
    [
      sessionQuestions,
      questionPackId,
      sessionIndex,
      sessionAnswers,
      sessionDone,
      currentQuestion,
      userVote,
      currentTally,
      walletAddress,
      userProfile,
      isLoadingSession,
      isSubmitting,
      loadError,
      allCompleted,
      onAuthenticated,
      handleVote,
      advanceToNext,
      startNewSession,
      dismissSummaryToLastQ,
      dismissing,
      signOut,
    ]
  );

  return (
    <AppContext.Provider value={value}>
      <RetryContext.Provider value={retryLoadSession}>{children}</RetryContext.Provider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

export { SESSION_SIZE };
