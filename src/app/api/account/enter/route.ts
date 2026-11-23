import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { writeIdentity } from "@/lib/account";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      (body.name !== undefined && typeof body.name !== "string") ||
      (body.email !== undefined && typeof body.email !== "string")) {
    return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  if (name.length > 40 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "Use a name up to 40 characters and a valid email, or skip email." }, { status: 400 });
  }

  function complete(savedName: string) {
    const response = NextResponse.json({ needsName: false, next: "/", name: savedName, email });
    writeIdentity(response, { name: savedName, email, pending: false });
    return response;
  }

  if (!email) {
    return name ? complete(name) : NextResponse.json({ needsName: true });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Email accounts are unavailable. You can skip email to continue on this device." }, { status: 503 });
  }

  // Email accounts intentionally identify a profile without authenticating its owner.
  // They must never grant access to private Supabase Auth data.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("enter_email_account", {
    target_email: email,
    target_name: name || null,
  });
  if (error) {
    return NextResponse.json({ error: "Couldn’t open your account. Try again, or skip email to continue on this device." }, { status: 503 });
  }
  if (data?.needs_name === true) return NextResponse.json({ needsName: true });
  if (typeof data?.name !== "string" || !data.name.trim()) {
    return NextResponse.json({ error: "Couldn’t load your saved name. Please try again." }, { status: 502 });
  }
  return complete(data.name);
}
