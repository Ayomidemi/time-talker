import { NextResponse, type NextRequest } from "next/server";
import { NAME_COOKIE } from "@/lib/cookies";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const name = request.cookies.get(NAME_COOKIE)?.value;
  const open =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/confirm" ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api");

  if (!name && !open) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (name && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|fonts/|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
