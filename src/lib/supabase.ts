import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Browser-safe client (anon key) — lazy singleton, use in client components */
let _supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars missing");
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/** Convenience re-export for client components */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Server-side client (service role key) — lazy, use only in API routes / server components */
let _supabaseAdmin: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin must not be used in client-side code");
  }
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("Supabase admin env vars missing");
    _supabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _supabaseAdmin;
}

/** Convenience re-export (throws at runtime if env vars absent, not at import time) */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
