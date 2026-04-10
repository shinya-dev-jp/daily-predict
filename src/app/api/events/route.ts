import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/events
 *
 * Minimal first-party analytics endpoint. Accepts a single event from the
 * client and inserts it into the `app_events` table. No third-party tracker.
 *
 * Body shape:
 *   { event_name: string, user_address?: string, metadata?: object,
 *     session_id?: string, locale?: string }
 *
 * Designed to be fire-and-forget from the client (sendBeacon-friendly).
 * Errors are swallowed silently — analytics must never break the app.
 */

const ALLOWED_EVENTS = new Set([
  "app_open",
  "screen_view",
  "verify_started",
  "verify_completed",
  "verify_failed",
  "vote",
  "share",
  "reward_earned",
  "error",
]);

interface EventPayload {
  event_name: string;
  user_address?: string;
  metadata?: Record<string, unknown>;
  session_id?: string;
  locale?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EventPayload;

    if (!body?.event_name || typeof body.event_name !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Whitelist enforcement: only known events allowed (anti-spam, schema discipline)
    if (!ALLOWED_EVENTS.has(body.event_name)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Trim metadata size to prevent bloat (max ~2KB serialized)
    let metadata = body.metadata ?? null;
    if (metadata) {
      const serialized = JSON.stringify(metadata);
      if (serialized.length > 2048) metadata = { _truncated: true };
    }

    // Fire-and-forget: ignore insert errors so analytics never breaks the app
    await supabaseAdmin.from("app_events").insert({
      event_name: body.event_name,
      user_address: body.user_address ?? null,
      metadata,
      session_id: body.session_id ?? null,
      locale: body.locale ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Silent failure — analytics must never affect UX
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
