import { MiniKit, Permission } from "@worldcoin/minikit-js";
import { track } from "./track";

/**
 * World App deep link for Daily Predict.
 * Opens directly in World App; falls back to download page.
 */
export const APP_DEEP_LINK =
  "https://worldcoin.org/mini-app?app_id=app_9ea9956fcd3bcb53a6accf1e93383e22";

/**
 * Share text via MiniKit (in World App) → Web Share API → clipboard.
 * Prefers MiniKit's native share inside World App for higher conversion.
 */
export async function shareText(text: string): Promise<boolean> {
  // 1. Prefer MiniKit share inside World App (native bottom sheet)
  try {
    if (MiniKit.isInstalled()) {
      const result = await MiniKit.commandsAsync.share({
        title: "Daily Predict",
        text,
        url: APP_DEEP_LINK,
      });
      if (result?.finalPayload) {
        track("share", { metadata: { surface: "minikit" } });
        return true;
      }
    }
  } catch {
    // Fall through to web share
  }

  // 2. Web Share API (mobile browsers outside World App)
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text, title: "Daily Predict", url: APP_DEEP_LINK });
      track("share", { metadata: { surface: "web_share" } });
      return true;
    } catch {
      // User cancelled or not supported
    }
  }

  // 3. Clipboard fallback (desktop / unsupported browsers)
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(`${text}\n\n${APP_DEEP_LINK}`);
      track("share", { metadata: { surface: "clipboard" } });
      return true;
    } catch {
      // Clipboard not available
    }
  }

  return false;
}

/**
 * Build share text for a prediction result.
 */
export function buildResultShareText(
  questionEn: string,
  isCorrect: boolean,
  correctPercent: number
): string {
  const emoji = isCorrect ? "\u2705" : "\u274C";
  return isCorrect
    ? `${emoji} I was in the ${correctPercent}% who got it right on Daily Predict!\n\n"${questionEn}"\n\n\uD83C\uDFAF Play now:`
    : `${emoji} ${correctPercent}% of humans got today's Daily Predict right \u2014 I wasn't one of them.\n\n"${questionEn}"\n\n\uD83C\uDFAF Play now:`;
}

/**
 * Build share text for a locked prediction (voted but not yet resolved).
 */
export function buildPredictionShareText(
  questionEn: string,
  chosenLabel: string,
  agreePercent: number
): string {
  return `\uD83D\uDD2E I just predicted "${chosenLabel}" on Daily Predict!\n\n"${questionEn}"\n\n${agreePercent}% agree with me. What do you think?\n\n\uD83C\uDFAF Play now:`;
}

/**
 * Request notification permission via MiniKit.
 * Critical for daily-habit apps: users who enable notifications return 3-5x more often.
 * Safe to call multiple times — MiniKit handles the "already_requested" state gracefully.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!MiniKit.isInstalled()) return false;
    const { finalPayload } = await MiniKit.commandsAsync.requestPermission({
      permission: Permission.Notifications,
    });
    if (finalPayload.status === "success") return true;
    return false;
  } catch (err) {
    console.warn("[notifications] requestPermission failed:", err);
    return false;
  }
}
