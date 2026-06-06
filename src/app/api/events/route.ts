import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/constants";
import { verifyAuthToken } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logError, logWarn } from "@/lib/server-log";

const MAX_BODY_BYTES = 4096;
const MAX_SESSION_ID_LENGTH = 80;
const MAX_LOCALE_LENGTH = 16;
const MAX_METADATA_KEYS = 12;
const MAX_METADATA_KEY_LENGTH = 48;
const MAX_METADATA_STRING_LENGTH = 180;

const ALLOWED_EVENTS = new Set([
  "app_open",
  "auth_success",
  "session_start",
  "question_pack_view",
  "first_vote",
  "fifth_vote",
  "summary_view",
  "share_tap",
  "share_attempt",
  "share_result",
  "share_error",
  "share_success",
  "return_visit",
  "vote",
  "verify_started",
  "verify_completed",
  "verify_failed",
  "error",
]);

const DENY_METADATA_KEY = /address|wallet|nullifier|token|secret|email|phone/i;

function empty(status: number): NextResponse {
  return new NextResponse(null, { status });
}

function analyticsSubject(req: NextRequest): string | null {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  let subject: string | null = null;
  try {
    subject = verifyAuthToken(token);
  } catch {
    return null;
  }
  if (!subject) return null;

  const secret = process.env.DP_AUTH_SECRET ?? process.env.CRON_SECRET ?? process.env.NULLIFIER_SECRET;
  if (!secret || secret.length < 16) return null;

  return createHmac("sha256", secret)
    .update(`turingvote-events:${subject.toLowerCase()}`)
    .digest("hex");
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function cleanMetadata(value: unknown): Record<string, string | number | boolean | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const output: Record<string, string | number | boolean | null> = {};

  for (const [key, raw] of Object.entries(input).slice(0, MAX_METADATA_KEYS)) {
    if (!key || key.length > MAX_METADATA_KEY_LENGTH || DENY_METADATA_KEY.test(key)) {
      continue;
    }
    if (raw === null || typeof raw === "boolean") {
      output[key] = raw;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = raw;
    } else if (typeof raw === "string") {
      output[key] = raw.slice(0, MAX_METADATA_STRING_LENGTH);
    }
  }

  return Object.keys(output).length > 0 ? output : null;
}

export async function POST(req: NextRequest) {
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "invalid_body_size" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const eventName = cleanString(input.event_name, 64);
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "invalid_event_name" }, { status: 400 });
  }

  const sessionId = cleanString(input.session_id, MAX_SESSION_ID_LENGTH);
  const locale = cleanString(input.locale, MAX_LOCALE_LENGTH);
  const metadata = cleanMetadata(input.metadata);
  const userAddress = analyticsSubject(req);

  try {
    const { error } = await getSupabaseAdmin()
      .from("app_events")
      .insert({
        user_address: userAddress,
        event_name: eventName,
        metadata,
        session_id: sessionId,
        locale,
      });

    if (error) {
      logWarn("api/events", "event insert failed", { code: error.code, eventName });
      return empty(202);
    }
  } catch (err) {
    logError("api/events", "unexpected event ingest error", {
      error: err instanceof Error ? err.message : String(err),
      eventName,
    });
    return empty(202);
  }

  return empty(204);
}
