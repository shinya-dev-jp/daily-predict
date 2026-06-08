import { MiniKit, Permission } from "@worldcoin/minikit-js";
import { track } from "./track";
import { APP_DEEP_LINK } from "./constants";

/**
 * World App deep link for TuringVote.
 * Opens directly in World App; falls back to download page.
 * NOTE: app_id is read from NEXT_PUBLIC_WLD_APP_ID at build time so we don't
 * accidentally ship the wrong app's id (Daily Predict residual hardcode bug
 * 2026-04-19 — share link previously pointed to Daily Predict's app_id, which
 * caused JP region block on the share landing page).
 */
const SHARE_TIMEOUT_MS = 8000;

type ShareSurface = "minikit" | "web_share" | "clipboard";
type ShareStatus =
  | "start"
  | "success"
  | "error"
  | "cancelled_or_error"
  | "unsupported"
  | "no_response";

function shortErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const maybe = error as { name?: unknown; message?: unknown };
    if (typeof maybe.name === "string" && maybe.name) return maybe.name.slice(0, 48);
    if (typeof maybe.message === "string" && maybe.message) {
      return maybe.message.slice(0, 48);
    }
  }
  if (typeof error === "string" && error) return error.slice(0, 48);
  return "unknown";
}

function payloadValue(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  return (payload as Record<string, unknown>)[key];
}

function payloadStatus(payload: unknown): string | undefined {
  const status = payloadValue(payload, "status");
  return typeof status === "string" ? status : undefined;
}

function payloadErrorCode(payload: unknown): string | undefined {
  const errorCode = payloadValue(payload, "error_code");
  return typeof errorCode === "string" ? errorCode : undefined;
}

function payloadSharedFilesCount(payload: unknown): number | undefined {
  const count = payloadValue(payload, "shared_files_count");
  return typeof count === "number" && Number.isFinite(count) ? count : undefined;
}

function trackShareAttempt(surface: ShareSurface, text: string): void {
  track("share_attempt", {
    metadata: {
      surface,
      status: "start",
      has_url: true,
      has_text: text.trim().length > 0,
    },
  });
}

function trackShareResult(
  surface: ShareSurface,
  status: ShareStatus,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  track("share_result", {
    metadata: {
      surface,
      status,
      ...extra,
    },
  });
}

function trackShareError(surface: ShareSurface, error: unknown): void {
  track("share_error", {
    metadata: {
      surface,
      status: "error",
      error_code: shortErrorCode(error),
    },
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | "timeout"> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => resolve("timeout"), ms);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Share text via MiniKit (in World App) → Web Share API → clipboard.
 * Prefers MiniKit's native share inside World App for higher conversion.
 */
export async function shareText(text: string): Promise<boolean> {
  // 1. Prefer MiniKit share inside World App (native bottom sheet)
  try {
    if (MiniKit.isInstalled()) {
      trackShareAttempt("minikit", text);
      const result = await withTimeout(
        MiniKit.commandsAsync.share({
          title: "TuringVote",
          text,
          url: APP_DEEP_LINK,
        }),
        SHARE_TIMEOUT_MS,
      );
      if (result === "timeout") {
        trackShareResult("minikit", "no_response", {
          has_final_payload: false,
        });
      } else {
        const finalPayload = result?.finalPayload;
        const status = payloadStatus(finalPayload);
        const errorCode = payloadErrorCode(finalPayload);
        const sharedFilesCount = payloadSharedFilesCount(finalPayload);
        trackShareResult(
          "minikit",
          status === "success" ? "success" : status === "error" ? "error" : "no_response",
          {
            has_final_payload: Boolean(finalPayload),
            error_code: errorCode,
            shared_files_count: sharedFilesCount,
          },
        );
        if (status === "success") {
          track("share_success", { metadata: { surface: "minikit" } });
          return true;
        }
        if (errorCode === "user_rejected") return false;
      }
    } else {
      trackShareResult("minikit", "unsupported", { has_final_payload: false });
    }
  } catch (err) {
    trackShareError("minikit", err);
    // Fall through to web share
  }

  // 2. Web Share API (mobile browsers outside World App)
  if (typeof navigator !== "undefined" && navigator.share) {
    trackShareAttempt("web_share", text);
    try {
      await navigator.share({ text, title: "TuringVote", url: APP_DEEP_LINK });
      trackShareResult("web_share", "success");
      track("share_success", { metadata: { surface: "web_share" } });
      return true;
    } catch (err) {
      trackShareResult("web_share", "cancelled_or_error", {
        error_code: shortErrorCode(err),
      });
      if (shortErrorCode(err) === "AbortError") return false;
      // Fall through to clipboard for non-cancel failures.
    }
  } else {
    trackShareResult("web_share", "unsupported");
  }

  // 3. Clipboard fallback (desktop / unsupported browsers)
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    trackShareAttempt("clipboard", text);
    try {
      await navigator.clipboard.writeText(`${text}\n\n${APP_DEEP_LINK}`);
      trackShareResult("clipboard", "success");
      track("share_success", { metadata: { surface: "clipboard" } });
      return true;
    } catch (err) {
      trackShareError("clipboard", err);
    }
  } else {
    trackShareResult("clipboard", "unsupported");
  }

  return false;
}

/**
 * Build share text for a prediction result.
 *
 * 2026-05-27 update: shift from generic "got it right" framing to
 * "Orb-verified humans" emphasis to (a) align with the description /
 * \u4EBA\u9593\u9650\u5B9A category framing, and (b) differentiate from earn-loop apps
 * in the same category. EN strings only \u2014 JP localized variant is tracked
 * separately.
 */
export function buildResultShareText(
  questionEn: string,
  isCorrect: boolean,
  correctPercent: number
): string {
  return isCorrect
    ? `\uD83E\uDDE0 I landed with the ${correctPercent}% of verified humans on TuringVote.\n\n"${questionEn}"\n\nTry the 5-question mirror \u2192`
    : `\uD83E\uDDE0 Only ${correctPercent}% of verified humans chose like this on TuringVote.\n\n"${questionEn}"\n\nMajority or minority? Try the 5-question mirror \u2192`;
}

/**
 * Build share text for a locked prediction (voted but not yet resolved).
 *
 * 2026-05-27 update: same rationale as buildResultShareText.
 */
export function buildPredictionShareText(
  questionEn: string,
  chosenLabel: string,
  agreePercent: number
): string {
  return `\uD83E\uDDE0 I chose "${chosenLabel}" on TuringVote. ${agreePercent}% of verified humans chose the same side.\n\n"${questionEn}"\n\nWhere do you land in 5 quick choices? \u2192`;
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
