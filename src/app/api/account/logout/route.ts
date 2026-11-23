import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeIdentity } from "@/lib/account";

export async function POST() {
  // Email-only profiles have no remote Auth session to revoke. Local logout
  // must not depend on Supabase being reachable.
  const response = NextResponse.json({ next: "/login" });
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
  writeIdentity(response, { name: "", email: "", pending: false });
  response.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  response.headers.set("Cache-Control", "no-store");
  return response;
}
