import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.rpc("lookup_account", { target_email: email });
  if (error) {
    return NextResponse.json(
      { error: "Couldn’t check that email. Run the latest supabase/schema.sql in Supabase." },
      { status: 500 },
    );
  }

  const result = (data ?? { exists: false }) as { exists?: boolean; name?: string; confirmed?: boolean };
  return NextResponse.json({
    exists: Boolean(result.exists),
    name: result.name ?? "",
    confirmed: result.confirmed !== false,
  });
}
