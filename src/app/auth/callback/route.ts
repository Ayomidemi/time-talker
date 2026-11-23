import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PENDING_COOKIE } from "@/lib/cookies";
import { holdSupabaseAnonKey, holdSupabaseUrl, isHoldSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  const destination = NextResponse.redirect(`${origin}/`);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?auth=missing`);
  }

  if (!isHoldSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?auth=unconfigured`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    holdSupabaseUrl(),
    holdSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            destination.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/confirm?auth=error`);
  }

  destination.cookies.set(PENDING_COOKIE, "", { path: "/", maxAge: 0 });
  return destination;
}
