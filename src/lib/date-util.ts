/**
 * Date / timezone utilities for Daily Predict.
 *
 * Why this exists
 * ───────────────
 * The codebase had timezone bugs sprinkled across API routes that mixed local
 * server time with UTC. Vercel runs Node in UTC so it appeared to work, but
 * the boundary between UTC and JST (the app's primary user timezone) made
 * "today" / "yesterday" calculations brittle. Specifically:
 *
 *   - cron/generate creates predictions with `closes_at` set to 23:59 JST
 *     (= 14:59 UTC), so a prediction's "day" is JST-relative.
 *   - profile calendar showed the wrong month for users at JST midnight.
 *   - question/route's "yesterday" window used `setHours()` which depends on
 *     server TZ.
 *
 * This module centralizes all date math in JST (UTC+9) so server and client
 * agree on what "today" / "yesterday" mean. Uses native Date arithmetic; no
 * external dependency required.
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Returns the JST date for a given moment as YYYY-MM-DD (e.g. "2026-04-08").
 */
export function jstDateString(at: Date = new Date()): string {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

/**
 * Returns the start of the JST day (as a UTC Date instance) for a given
 * moment. Useful for "give me everything created today" queries.
 *
 * Example: at = 2026-04-08T17:00:00Z (= 2026-04-09 02:00 JST)
 * Returns: 2026-04-08T15:00:00Z (= 2026-04-09 00:00 JST)
 */
export function jstStartOfDay(at: Date = new Date()): Date {
  const jstStr = jstDateString(at);
  // Parse YYYY-MM-DD as a JST midnight, then convert to UTC by subtracting offset
  return new Date(new Date(jstStr + "T00:00:00.000Z").getTime() - JST_OFFSET_MS);
}

/** End of the JST day (exclusive upper bound = next day's start). */
export function jstEndOfDay(at: Date = new Date()): Date {
  const start = jstStartOfDay(at);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** N days before the given moment, returned as JST start-of-day in UTC. */
export function jstStartOfDayDelta(daysOffset: number, at: Date = new Date()): Date {
  const start = jstStartOfDay(at);
  return new Date(start.getTime() + daysOffset * 24 * 60 * 60 * 1000);
}

/** JST year + month (1-indexed) for the given moment. */
export function jstYearMonth(at: Date = new Date()): { year: number; month: number } {
  const jstStr = jstDateString(at);
  const [y, m] = jstStr.split("-").map(Number);
  return { year: y, month: m };
}

/** Closes-at timestamp for today's question = 23:59 JST (= 14:59 UTC). */
export function todaysCloseAt(at: Date = new Date()): Date {
  const start = jstStartOfDay(at);
  // 23 hours 59 minutes after JST midnight
  const close = new Date(start.getTime() + (23 * 60 + 59) * 60 * 1000);
  // If we're already past today's close, schedule tomorrow
  if (close.getTime() <= at.getTime()) {
    return new Date(close.getTime() + 24 * 60 * 60 * 1000);
  }
  return close;
}
