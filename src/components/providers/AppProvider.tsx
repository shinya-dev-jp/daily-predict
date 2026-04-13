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
import { MiniKit, VerificationLevel } from "@worldcoin/minikit-js";
import {
  todayPrediction as demoToday,
  yesterdayPrediction as demoYesterday,
  demoUserProfile,
} from "@/data/demo-predictions";

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

// ============================================================
// Context shape
// ============================================================

interface AppState {
  /** Currently active (today's) prediction question, null while loading */
  currentPrediction: Prediction | null;
  /** Yesterday's resolved prediction, null if unavailable */
  yesterdayPrediction: Prediction | null;
  /** Authenticated user profile; null until Wallet Auth completes */
  userProfile: UserProfile | null;
  /** Lowercase 0x-prefixed Ethereum wallet address; null until authenticated */
  walletAddress: string | null;
  /** Signed HMAC session token issued by /api/auth/wallet */
  authToken: string | null;
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
  /** Call after a successful Wallet Auth handshake */
  onAuthenticated: (address: string, profile: UserProfile, authToken?: string) => void;
  /** Submit a prediction for the current question */
  handlePredict: (option: "A" | "B") => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

// localStorage keys are intentionally distinct from any earlier IDKit-era keys
// so old browser sessions don't try to restore a nullifier-keyed identity
// against the new wallet-keyed users table.
const LS_ADDRESS_KEY = "dp_wallet_address";
const LS_TOKEN_KEY = "dp_wallet_token";

// ============================================================
// Provider
// ============================================================

export function AppProvider({ children }: { children: ReactNode }) {
  const preview = isPreviewMode();

  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(() => preview ? demoToday : null);
  const [yesterdayPrediction, setYesterdayPrediction] = useState<Prediction | null>(() => preview ? demoYesterday : null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => preview ? demoUserProfile : null);
  // Restore session from localStorage on mount
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    if (preview) return demoUserProfile.address;
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_ADDRESS_KEY) ?? null;
    }
    return null;
  });
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (preview) return "preview-token";
    if (typeof window !== "undefined") {
      return localStorage.getItem(LS_TOKEN_KEY) ?? null;
    }
    return null;
  });
  const [hasPredictedToday, setHasPredictedToday] = useState(() => preview ? true : false);
  const [userChoice, setUserChoice] = useState<"A" | "B" | null>(() => preview ? "A" : null);
  const [resultPercent, setResultPercent] = useState<number | null>(() => preview ? 58 : null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(() => preview ? false : true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTab, setCurrentTabRaw] = useState<TabKey>("predict");
  const setCurrentTab = useCallback((tab: TabKey) => setCurrentTabRaw(tab), []);

  // Double-tap / race-condition guard
  const submittingRef = useRef(false);

  // ── SSR hydration fix: preview mode relies on `window` which is unavailable
  //    during SSR, so useState initializers default to non-preview values.
  //    Re-apply preview state after mount on the client. ──────────────────────
  useEffect(() => {
    if (!isPreviewMode()) return;
    setCurrentPrediction(demoToday);
    setYesterdayPrediction(demoYesterday);
    setUserProfile(demoUserProfile);
    setWalletAddress(demoUserProfile.address);
    setAuthToken("preview-token");
    setHasPredictedToday(true);
    setUserChoice("A");
    setResultPercent(58);
    setIsLoadingQuestion(false);
  }, []);

  // ── Fetch today's (and yesterday's) question on mount ──────────────────────
  useEffect(() => {
    if (preview) return; // demo data already set in useState
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
  }, [preview]);

  // ── Restore user profile from API on session resume ────────────────────────
  useEffect(() => {
    if (preview || !walletAddress || !authToken || userProfile) return;

    async function restoreProfile() {
      try {
        const res = await fetch(`/api/profile`, {
          headers: { authorization: `Bearer ${authToken}` },
        });
        if (res.status === 401 || res.status === 404) {
          // Token expired/invalid OR user no longer exists — clear session
          // and force the user to sign in with wallet auth again.
          setAuthToken(null);
          setWalletAddress(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(LS_TOKEN_KEY);
            localStorage.removeItem(LS_ADDRESS_KEY);
          }
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (json.profile) {
          setUserProfile(json.profile);
        }
      } catch {
        // Non-fatal
      }
    }

    restoreProfile();
  }, [walletAddress, authToken, userProfile]);

  // ── Check whether user already predicted today (after authentication) ──────
  useEffect(() => {
    if (preview || !walletAddress || !authToken || !currentPrediction) return;

    async function checkPriorPrediction() {
      try {
        const res = await fetch(
          `/api/predict/check?prediction_id=${encodeURIComponent(currentPrediction!.id)}`,
          { headers: { authorization: `Bearer ${authToken}` } }
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
  }, [walletAddress, authToken, currentPrediction]);

  // ── Called by the Wallet Auth flow on success ─────────────────────────────
  const onAuthenticated = useCallback((address: string, profile: UserProfile, token?: string) => {
    setWalletAddress(address);
    setUserProfile(profile);
    if (token) setAuthToken(token);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_ADDRESS_KEY, address);
      if (token) localStorage.setItem(LS_TOKEN_KEY, token);
    }
  }, []);

  // ── Submit a prediction ───────────────────────────────────────────────────
  const handlePredict = useCallback(
    async (option: "A" | "B") => {
      if (submittingRef.current || !currentPrediction || !walletAddress || !authToken) return;
      submittingRef.current = true;
      setIsSubmitting(true);

      try {
        // ── Orb-level Incognito Action: 1-human-1-vote ──────────────────
        if (!MiniKit.isInstalled()) {
          throw new Error("MiniKit is not installed — please open in World App");
        }

        const verifyResult = await MiniKit.commandsAsync.verify({
          action: process.env.NEXT_PUBLIC_WLD_ACTION ?? "daily-predict-verify",
          signal: currentPrediction.id,
          verification_level: VerificationLevel.Orb,
        });

        const verifyPayload = verifyResult.finalPayload;
        if (!verifyPayload || verifyPayload.status !== "success") {
          // User cancelled or verification failed — do NOT submit the vote
          return;
        }

        const res = await fetch("/api/predict", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            prediction_id: currentPrediction.id,
            chosen_option: option,
            verify_payload: verifyPayload,
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
    [currentPrediction, walletAddress, authToken, setCurrentTab]
  );

  return (
    <AppContext.Provider
      value={{
        currentPrediction,
        yesterdayPrediction,
        userProfile,
        walletAddress,
        authToken,
        hasPredictedToday,
        userChoice,
        resultPercent,
        isLoadingQuestion,
        isSubmitting,
        currentTab,
        setCurrentTab,
        onAuthenticated,
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
