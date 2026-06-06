/**
 * Lightweight first-party analytics client.
 *
 * Sends events to /api/events using sendBeacon when available (so events fire
 * even if the user navigates away mid-request). Falls back to fetch + keepalive.
 *
 * Design rules:
 *   - Never throws. Analytics must never break UX.
 *   - Never blocks. All calls are fire-and-forget.
 *   - Never collects PII. Only nullifier hash + behavioral metadata.
 *   - Whitelisted event names only (server enforces this too).
 *
 * 2026-05-29: also mirror a whitelisted subset of events to Vercel Analytics
 * so the funnel is visible in the Vercel dashboard. First-party /api/events
 * remains the precise retention source; the Vercel mirror is a quick funnel
 * view only. PII is stripped before mirroring.
 */

import { track as vercelTrack } from "@vercel/analytics";

const STORAGE_KEY = "dp_session_id";

/**
 * High-signal funnel steps mirrored to Vercel Analytics. Kept intentionally
 * small — page views are already captured by <Analytics />; this adds the
 * behavioral steps that page views can't see. `error` is included so error
 * spikes show up in the dashboard (cheap alerting).
 */
const VERCEL_MIRROR_EVENTS = new Set<EventName>([
  "auth_success",
  "first_vote",
  "fifth_vote",
  "summary_view",
  "share_tap",
  "share_attempt",
  "share_result",
  "share_error",
  "share_success",
  "return_visit",
  "error",
]);

const DENY_METADATA_KEY = /address|wallet|nullifier|token|secret|email|phone/i;

/**
 * Flatten + PII-strip metadata for Vercel Analytics. Vercel only accepts flat
 * string/number/boolean properties, and we never forward identity keys.
 */
function sanitizeForVercel(
  meta?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  if (!meta) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (DENY_METADATA_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 64);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export type EventName =
  | "app_open"
  | "auth_success"
  | "session_start"
  | "question_pack_view"
  | "first_vote"
  | "fifth_vote"
  | "summary_view"
  | "share_tap"
  | "share_attempt"
  | "share_result"
  | "share_error"
  | "share_success"
  | "return_visit"
  | "verify_started"
  | "verify_completed"
  | "verify_failed"
  | "vote"
  | "error";

interface TrackOptions {
  metadata?: Record<string, unknown>;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(STORAGE_KEY);
  if (!id) {
    id =
      crypto.randomUUID?.() ??
      `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function getLocale(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.language?.split("-")[0];
}

export function track(event: EventName, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;

  // Mirror a whitelisted subset to Vercel Analytics (anonymous funnel view).
  // Never throws — analytics must not break UX.
  if (VERCEL_MIRROR_EVENTS.has(event)) {
    try {
      vercelTrack(event, sanitizeForVercel(options.metadata));
    } catch {
      /* swallow — Vercel mirror is best-effort */
    }
  }

  const payload = JSON.stringify({
    event_name: event,
    metadata: options.metadata ?? null,
    session_id: getSessionId(),
    locale: getLocale(),
  });

  try {
    // sendBeacon survives page navigation; preferred for "exit" events
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/events", blob);
      return;
    }
  } catch {
    /* fall through */
  }

  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}
