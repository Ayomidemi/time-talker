import { NextResponse } from "next/server";
import { emailAccountDatabase, storageError } from "@/lib/email-account-server";
import { validPreferences } from "@/lib/preferences";
import type { Settings } from "@/lib/types";

async function preferences(changes: Partial<Settings>) {
  const account = await emailAccountDatabase();
  if (account.error) return account.error;
  const { data, error } = await account.supabase.rpc("email_preferences", { target_email: account.email, changes });
  if (error) return storageError(error);
  return NextResponse.json({ settings: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() { return preferences({}); }

export async function PATCH(request: Request) {
  const changes = await request.json().catch(() => null);
  if (!validPreferences(changes) || !Object.keys(changes).length) {
    return NextResponse.json({ error: "Choose valid preferences." }, { status: 400 });
  }
  return preferences(changes);
}
