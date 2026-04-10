import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter (resets on cold start, sufficient for Vercel serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 30; // requests per window
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

export function middleware(req: NextRequest) {
  // Only rate-limit API routes
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip cron routes (authenticated by CRON_SECRET)
  if (req.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Skip analytics events: they are high-frequency by design (every screen
  // view, vote, etc) and would otherwise trip the per-IP limit. The endpoint
  // itself enforces a strict event whitelist + payload size cap to mitigate
  // abuse, and writes are silently rate-limited at the database level by
  // Supabase free-tier connection limits.
  if (req.nextUrl.pathname === "/api/events") {
    return NextResponse.next();
  }

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${ip}:${req.nextUrl.pathname}`;

  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
