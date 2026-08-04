import { NextRequest, NextResponse } from "next/server";
import { authConfigured, createSessionToken, RENEW_WINDOW_SECONDS, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/api/health", "/login", "/api/auth/login"]);

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api/health") return NextResponse.next();
  if (!authConfigured()) {
    if (path.startsWith("/api/") && path !== "/api/auth/login") return apiError("authentication unavailable", 503);
    if (PUBLIC_PATHS.has(path)) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value ?? "");
  if (PUBLIC_PATHS.has(path)) {
    if (path === "/login" && session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (!session) {
    if (path.startsWith("/api/")) return apiError("authentication required", 401);
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  const now = Math.floor(Date.now() / 1000);
  if (session.remember && session.expiresAt - now < RENEW_WINDOW_SECONDS) {
    try {
      const renewed = await createSessionToken(session.username, true, session.issuedAt);
      response.cookies.set(SESSION_COOKIE, renewed.token, sessionCookieOptions(true, renewed.expiresAt - now));
    } catch {
      response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(false), maxAge: 0 });
    }
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg|manifest.webmanifest).*)"] };
