"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { Question, Tally, UserProfile, VoteChoice } from "@/lib/types";
import { MiniKit, VerificationLevel } from "@worldcoin/minikit-js";

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

// ============================================================
// TuringVote context shape
// ============================================================

interface AppState {
  currentQuestion: Question | null;
  tally: Tally | null;
  userVote: VoteChoice | null;
  walletAddress: string | null;
  authToken: string | null;
  userProfile: UserProfile | null;
  isLoadingQuestion: boolean;
  isSubmitting: boolean;
  onAuthenticated: (address: string, profile: UserProfile, authToken?: string) => void;
  handleVote: (choice: VoteChoice) => Promise<void>;
  loadNextQuestion: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// localStorage keys distinct from Daily Predict so no legacy nullifier leaks in.
const LS_ADDRESS_KEY = "tv_wallet_address";
const LS_TOKEN_KEY = "tv_wallet_token";

// ============================================================
// Demo data for ?preview=1 mode (no auth required)
// ============================================================

const DEMO_QUESTION: Question = {
  id: 1,
  category: "lifestyle",
  ja: { prompt: "あなたはどっち派？", option_a: "朝型", option_b: "夜型" },
  en: { prompt: "Which are you?", option_a: "Morning person", option_b: "Night owl" },
};
const DEMO_TALLY: Tally = {
  question_id: 1,
  category: "lifestyle",
  total_votes: 128,
  votes_a: 76,
  votes_b: 52,
};

// ============================================================
// Provider
// ============================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const preview = isPreviewMode();

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
    () => (preview ? DEMO_QUESTION : null)
  );
  // Preview mode still needs to start with NO vote selected — the user should
  // tap A/B themselves to experience the flow. Tally becomes visible only
  // after a tap (see handleVote's preview branch below).
  const [tally, setTally] = useState<Tally | null>(null);
  const [userVote, setUserVote] = useState<VoteChoice | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    if (preview) return "0xpreview0000000000000000000000000000preview";
    if (typeof window !== "undefined") return localStorage.getItem(LS_ADDRESS_KEY);
    return null;
  });
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (preview) return "preview-token";
    if (typeof window !== "undefined") return localStorage.getItem(LS_TOKEN_KEY);
    return null;
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(() => !preview);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submittingRef = useRef(false);

  // ── SSR hydration fix for preview mode ────────────────────────────────────
  useEffect(() => {
    if (!isPreviewMode()) return;
    setCurrentQuestion(DEMO_QUESTION);
    setIsLoadingQuestion(false);
    // Intentionally leave userVote/tally null — user must tap to reveal.
  }, []);

  // ── Fetch a random question on mount ──────────────────────────────────────
  useEffect(() => {
    if (preview) return;
    let cancelled = false;

    async function fetchQuestion() {
      setIsLoadingQuestion(true);
      try {
        const res = await fetch("/api/questions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.question) {
          setCurrentQuestion(json.question as Question);
        }
      } catch (err) {
        console.warn("[AppProvider] Failed to fetch question:", err);
      } finally {
        if (!cancelled) setIsLoadingQuestion(false);
      }
    }

    fetchQuestion();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  // ── After successful Wallet Auth ──────────────────────────────────────────
  const onAuthenticated = useCallback(
    (address: string, profile: UserProfile, token?: string) => {
      setWalletAddress(address);
      setUserProfile(profile);
      if (token) setAuthToken(token);
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_ADDRESS_KEY, address);
        if (token) localStorage.setItem(LS_TOKEN_KEY, token);
      }
    },
    []
  );

  // ── Cast a vote: Orb verify (Path A) → fallback wallet SIWE token (Path B)
  const handleVote = useCallback(
    async (choice: VoteChoice) => {
      if (submittingRef.current || !currentQuestion) return;
      submittingRef.current = true;
      setIsSubmitting(true);

      // ── Preview mode: skip network + MiniKit, just reveal demo tally ────
      if (isPreviewMode()) {
        setUserVote(choice);
        setTally(DEMO_TALLY);
        setIsSubmitting(false);
        submittingRef.current = false;
        return;
      }

      try {
        let verify_payload: unknown = undefined;
        if (MiniKit.isInstalled()) {
          try {
            const verifyResult = await MiniKit.commandsAsync.verify({
              action: process.env.NEXT_PUBLIC_WLD_ACTION ?? "turingvote-vote",
              signal: String(currentQuestion.id),
              verification_level: VerificationLevel.Orb,
            });
            if (verifyResult.finalPayload?.status === "success") {
              verify_payload = verifyResult.finalPayload;
            }
          } catch {
            // Orb verify failed/cancelled — the server will fall back to auth_token
          }
        }

        const body: Record<string, unknown> = {
          question_id: currentQuestion.id,
          choice,
        };
        if (verify_payload) body.verify_payload = verify_payload;
        if (authToken) body.auth_token = authToken;

        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await res.json();

        if (res.status === 409) {
          // Already voted — hydrate UI with our prior choice + load the tally
          setUserVote(choice);
        } else if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Vote failed");
        } else {
          setUserVote(choice);
        }

        // Load the tally so the Reveal panel can render
        const tallyRes = await fetch(`/api/tally/${currentQuestion.id}`);
        if (tallyRes.ok) {
          const tallyJson = await tallyRes.json();
          if (tallyJson.tally) setTally(tallyJson.tally as Tally);
        }
      } catch (err) {
        console.error("[AppProvider] handleVote error:", err);
        throw err;
      } finally {
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    },
    [currentQuestion, authToken]
  );

  // ── Load next random question (for post-vote "Next" CTA) ──────────────────
  const loadNextQuestion = useCallback(async () => {
    setUserVote(null);
    setTally(null);
    setIsLoadingQuestion(true);
    try {
      const res = await fetch("/api/questions");
      if (res.ok) {
        const json = await res.json();
        if (json.question) setCurrentQuestion(json.question as Question);
      }
    } finally {
      setIsLoadingQuestion(false);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentQuestion,
        tally,
        userVote,
        walletAddress,
        authToken,
        userProfile,
        isLoadingQuestion,
        isSubmitting,
        onAuthenticated,
        handleVote,
        loadNextQuestion,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
