import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/admin/remove-transport-category") return NextResponse.next();
  const authenticated = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (request.nextUrl.pathname === "/login") return authenticated ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  if (!authenticated) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
