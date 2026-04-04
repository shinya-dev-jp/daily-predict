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
import type {
  Prediction,
  UserProfile,
  TabKey,
} from "@/lib/types";

// ============================================================
// Context shape
// ============================================================

interface AppState {
  /** Currently active (today's) prediction question, null while loading */
  currentPrediction: Prediction | null;
  /** Yesterday's resolved prediction, null if unavailable */
  yesterdayPrediction: Prediction | null;
  /** Authenticated user profile; null until World ID verified */
  userProfile: UserProfile | null;
  /** nullifier_hash from World ID; null until verified */
  nullifierHash: string | null;
  /** Whether the user has already predicted today */
  hasPredictedToday: boolean;
  /** The option the user chose today ("A" | "B"), or null */
  userChoice: "A" | "B" | null;
  /** Updated option_a_percent after user predicts */
  resultPercent: number | null;
  /** Whether the initial question fetch is in progress */
  isLoadingQuestion: boolean;
  /** Whether a prediction submission is in progress */
  isSubmitting: boolean;
  /** Active bottom-nav tab */
  currentTab: TabKey;
  setCurrentTab: (tab: TabKey) => void;
  /** Call after successful World ID verification */
  onVerified: (nullifierHash: string, profile: UserProfile) => void;
  /** Submit a prediction for the current question */
  handlePredict: (option: "A" | "B") => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// ============================================================
// Provider
// ============================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);
  const [yesterdayPrediction, setYesterdayPrediction] = useState<Prediction | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [nullifierHash, setNullifierHash] = useState<string | null>(null);
  const [hasPredictedToday, setHasPredictedToday] = useState(false);
  const [userChoice, setUserChoice] = useState<"A" | "B" | null>(null);
  const [resultPercent, setResultPercent] = useState<number | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTab, setCurrentTabRaw] = useState<TabKey>("predict");
  const setCurrentTab = useCallback((tab: TabKey) => setCurrentTabRaw(tab), []);

  // Double-tap / race-condition guard
  const submittingRef = useRef(false);

  // ── Fetch today's (and yesterday's) question on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchQuestion() {
      setIsLoadingQuestion(true);
      try {
        const res = await fetch("/api/question");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setCurrentPrediction(json.today ?? null);
          setYesterdayPrediction(json.yesterday ?? null);
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
  }, []);

  // ── Check whether user already predicted today (after verification) ────────
  useEffect(() => {
    if (!nullifierHash || !currentPrediction) return;

    async function checkPriorPrediction() {
      try {
        const res = await fetch(
          `/api/predict/check?nullifier_hash=${encodeURIComponent(nullifierHash!)}&prediction_id=${encodeURIComponent(currentPrediction!.id)}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (json.has_predicted) {
          setHasPredictedToday(true);
          setUserChoice(json.chosen_option ?? null);
        }
      } catch {
        // Non-fatal — user will see "predict" UI and get a 409 on duplicate
      }
    }

    checkPriorPrediction();
  }, [nullifierHash, currentPrediction]);

  // ── Called by the World ID verify flow ────────────────────────────────────
  const onVerified = useCallback((hash: string, profile: UserProfile) => {
    setNullifierHash(hash);
    setUserProfile(profile);
  }, []);

  // ── Submit a prediction ───────────────────────────────────────────────────
  const handlePredict = useCallback(
    async (option: "A" | "B") => {
      if (submittingRef.current || !currentPrediction || !nullifierHash) return;
      submittingRef.current = true;
      setIsSubmitting(true);

      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prediction_id: currentPrediction.id,
            chosen_option: option,
            nullifier_hash: nullifierHash,
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error ?? "Prediction failed");
        }

        // Update local state with server-returned vote counts
        setResultPercent(json.option_a_percent);
        setCurrentPrediction((prev) =>
          prev
            ? {
                ...prev,
                option_a_percent: json.option_a_percent,
                vote_count: json.vote_count,
              }
            : prev
        );
        setUserChoice(option);
        setHasPredictedToday(true);
        setUserProfile((prev) =>
          prev ? { ...prev, total_predictions: prev.total_predictions + 1 } : prev
        );
        // Navigate to results tab after predicting
        setCurrentTab("results");
      } catch (err) {
        console.error("[AppProvider] handlePredict error:", err);
        throw err; // Re-throw so UI can show an error toast
      } finally {
        setIsSubmitting(false);
        submittingRef.current = false;
      }
    },
    [currentPrediction, nullifierHash, setCurrentTab]
  );

  return (
    <AppContext.Provider
      value={{
        currentPrediction,
        yesterdayPrediction,
        userProfile,
        nullifierHash,
        hasPredictedToday,
        userChoice,
        resultPercent,
        isLoadingQuestion,
        isSubmitting,
        currentTab,
        setCurrentTab,
        onVerified,
        handlePredict,
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
