import { NextResponse } from "next/server";
import { emailAccountDatabase, storageError, validDay } from "@/lib/email-account-server";

export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day");
  if (!validDay(day)) return NextResponse.json({ error: "Choose a valid day." }, { status: 400 });
  const account = await emailAccountDatabase();
  if (account.error) return account.error;
  const { data, error } = await account.supabase.rpc("email_commitments_for_day", { target_email: account.email, target_day: day });
  if (error) return storageError(error);
  return NextResponse.json({ commitments: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!validDay(body?.day) || typeof body?.id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)
    || !["add", "update", "delete"].includes(body?.operation)
    || (body.operation === "add" && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120))
    || (body.operation === "add" && body.dueAt != null && (typeof body.dueAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(body.dueAt)
      || Number.isNaN(Date.parse(body.dueAt))))
    || (body.operation === "update" && typeof body.done !== "boolean")) {
    return NextResponse.json({ error: "Enter a valid commitment." }, { status: 400 });
  }
  const account = await emailAccountDatabase();
  if (account.error) return account.error;
  const { data, error } = await account.supabase.rpc("change_email_commitment", {
    target_email: account.email, target_day: body.day, operation: body.operation, item_id: body.id,
    item_title: body.operation === "add" ? body.title.trim() : null,
    item_done: body.operation === "update" ? body.done : null,
    item_due_at: body.operation === "add" && body.dueAt ? new Date(body.dueAt).toISOString() : null,
  });
  if (error) return storageError(error);
  return NextResponse.json({ commitments: data }, { headers: { "Cache-Control": "no-store" } });
}
