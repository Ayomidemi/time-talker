import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { EMAIL_COOKIE } from "./cookies";
import { holdSupabaseAnonKey, holdSupabaseUrl } from "@/lib/supabase/env";

export async function emailAccountDatabase() {
  const email = (await cookies()).get(EMAIL_COOKIE)?.value?.trim().toLowerCase();
  if (!email) return { error: NextResponse.json({ error: "Enter your email to use saved account data." }, { status: 401 }) };
  const url = holdSupabaseUrl();
  const key = holdSupabaseAnonKey();
  if (!url || !key) return { error: NextResponse.json({ error: "Account storage is unavailable." }, { status: 503 }) };
  // This app deliberately uses unverified email profiles, not Supabase Auth sessions.
  return { email, supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export function storageError(error: { code?: string; message: string }) {
  const message = error.code === "P0001" ? error.message
    : "Couldn’t reach account storage. Try again. If this persists, apply the latest Supabase migration.";
  return NextResponse.json({ error: message }, { status: error.code === "P0001" ? 400 : 503 });
}

export function validDay(day: unknown): day is string {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
