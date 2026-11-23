import { NextResponse } from "next/server";
import { emailAccountDatabase, storageError } from "@/lib/email-account-server";

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) return NextResponse.json({ error: "Name must be between 1 and 40 characters." }, { status: 400 });
  const account = await emailAccountDatabase();
  if (account.error) return account.error;
  const { data, error } = await account.supabase.rpc("update_email_display_name", { target_email: account.email, target_name: name });
  if (error) return storageError(error);
  if (typeof data?.name !== "string") return NextResponse.json({ error: "Couldn’t save your name." }, { status: 502 });
  // The client updates identity after confirming that this request is still active.
  // Do not write cookies here: an in-flight response could otherwise restore them after logout.
  return NextResponse.json({ name: data.name }, { headers: { "Cache-Control": "no-store" } });
}
