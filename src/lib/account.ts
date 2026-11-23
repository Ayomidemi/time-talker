import { NextResponse } from "next/server";
import { EMAIL_COOKIE, NAME_COOKIE, PENDING_COOKIE } from "@/lib/cookies";

const YEAR = 60 * 60 * 24 * 365;

function keep(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, { path: "/", maxAge: YEAR, sameSite: "lax" });
}

function drop(response: NextResponse, name: string) {
  response.cookies.set(name, "", { path: "/", maxAge: 0, sameSite: "lax" });
}

export function writeIdentity(
  response: NextResponse,
  identity: { name: string; email: string; pending: boolean },
) {
  if (identity.name) keep(response, NAME_COOKIE, identity.name);
  else drop(response, NAME_COOKIE);

  if (identity.email) keep(response, EMAIL_COOKIE, identity.email);
  else drop(response, EMAIL_COOKIE);

  if (identity.pending) keep(response, PENDING_COOKIE, "1");
  else drop(response, PENDING_COOKIE);
}
