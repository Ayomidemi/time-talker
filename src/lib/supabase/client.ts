import { createBrowserClient } from "@supabase/ssr";
import { holdSupabaseAnonKey, holdSupabaseUrl, isHoldSupabaseConfigured } from "@/lib/supabase/env";

export function isSupabaseConfigured() {
  return isHoldSupabaseConfigured();
}

export function createClient() {
  const url = holdSupabaseUrl();
  const key = holdSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  return createBrowserClient(url, key);
}
