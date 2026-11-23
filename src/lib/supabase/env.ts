export function holdSupabaseUrl() {
  return process.env.NEXT_HOLD_SUPABASE_URL?.trim() || "";
}

export function holdSupabaseAnonKey() {
  return process.env.NEXT_HOLD_SUPABASE_ANON_KEY?.trim() || "";
}

export function isHoldSupabaseConfigured() {
  return Boolean(holdSupabaseUrl() && holdSupabaseAnonKey());
}
