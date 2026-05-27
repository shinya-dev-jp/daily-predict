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
 */

const STORAGE_KEY = "dp_session_id";

export type EventName =
  | "app_open"
  | "auth_success"
  | "session_start"
  | "question_pack_view"
  | "first_vote"
  | "fifth_vote"
  | "summary_view"
  | "share_tap"
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
