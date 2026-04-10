/**
 * Structured server-side logging.
 *
 * Wraps console with a consistent JSON shape so Vercel logs are searchable
 * and we can later pipe them to a sink (Logtail, Axiom, Better Stack) without
 * touching call sites.
 *
 * Usage:
 *   import { logError, logInfo, logWarn } from "@/lib/server-log";
 *   logError("api/verify", "verifyCloudProof failed", { detail });
 */

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, source: string, message: string, ctx?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    source,
    message,
    ...ctx,
  };
  // Stringify so Vercel groups by JSON shape; truncate giant payloads
  const line = JSON.stringify(entry).slice(0, 4000);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(source: string, message: string, ctx?: LogContext): void {
  emit("info", source, message, ctx);
}

export function logWarn(source: string, message: string, ctx?: LogContext): void {
  emit("warn", source, message, ctx);
}

export function logError(source: string, message: string, ctx?: LogContext): void {
  emit("error", source, message, ctx);
}
