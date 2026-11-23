import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { holdSupabaseAnonKey, holdSupabaseUrl, isHoldSupabaseConfigured } from "@/lib/supabase/env";

type PendingCookie = { name: string; value: string; options: CookieOptions };

export function isSupabaseConfigured() {
  return isHoldSupabaseConfigured();
}

export async function withSupabase() {
  const cookieStore = await cookies();
  const pending: PendingCookie[] = [];
  const applyAuthCookies = (response: NextResponse) => {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  };
  const url = holdSupabaseUrl();
  const key = holdSupabaseAnonKey();
  if (!url || !key) return { supabase: null, applyAuthCookies };

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((cookie) => pending.push(cookie));
      },
    },
  });

  return {
    supabase,
    applyAuthCookies,
  };
}
