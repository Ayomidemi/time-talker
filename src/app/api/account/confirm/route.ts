import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeIdentity } from "@/lib/account";
import { NAME_COOKIE } from "@/lib/cookies";
import { isSupabaseConfigured, withSupabase } from "@/lib/supabase/server";

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { supabase, applyAuthCookies } = await withSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    const response = NextResponse.json({ confirmed: false });
    applyAuthCookies(response);
    return response;
  }

  const cookieStore = await cookies();
  const savedName = cookieStore.get(NAME_COOKIE)?.value?.trim() ?? "";
  const metaName = user.user_metadata?.name;
  const name =
    (typeof metaName === "string" && metaName.trim()) || savedName || user.email.split("@")[0];

  await supabase
    .from("profiles")
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  const response = NextResponse.json({ confirmed: true, next: "/", name, email: user.email });
  writeIdentity(response, { name, email: user.email, pending: false });
  applyAuthCookies(response);
  return response;
}
