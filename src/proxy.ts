import { NextResponse, type NextRequest } from "next/server";
import { NAME_COOKIE, PENDING_COOKIE } from "@/lib/cookies";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const name = request.cookies.get(NAME_COOKIE)?.value;
  const pending = request.cookies.get(PENDING_COOKIE)?.value === "1";
  const open =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/confirm" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api");

  if (pending && pathname !== "/confirm" && pathname !== "/login" && !pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/confirm", request.url));
  }

  if (!name && !pending && !open) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (name && !pending && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
