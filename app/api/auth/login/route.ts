import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { authConfigured, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map<string, { failures: number; blockedUntil: number }>();
const DUMMY_HASH = "$2b$12$9Qv7LJf3yPVUhcC0W0Ww2uNnJpvXnTtPXNJuMj/eor2i6j2HSeQgy";

function sameText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clientKey(request: NextRequest, username: string) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return `${ip}:${username.toLowerCase()}`;
}

function isSameOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  if (!authConfigured()) return NextResponse.json({ error: "登录服务尚未完成配置" }, { status: 503 });
  let body: { username?: unknown; password?: unknown; remember?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效" }, { status: 400 }); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const key = clientKey(request, username);
  const current = attempts.get(key);
  const now = Date.now();
  if (current?.blockedUntil && current.blockedUntil > now) {
    return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试" }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.blockedUntil - now) / 1000)) } });
  }
  if (current?.blockedUntil && current.blockedUntil <= now) attempts.delete(key);

  const expectedUser = process.env.APP_USERNAME!;
  const userMatches = sameText(username, expectedUser);
  const passwordMatches = await bcrypt.compare(password, userMatches ? process.env.APP_PASSWORD_HASH! : DUMMY_HASH);
  if (!userMatches || !passwordMatches) {
    const failures = (attempts.get(key)?.failures ?? 0) + 1;
    attempts.set(key, { failures, blockedUntil: failures >= MAX_FAILURES ? now + WINDOW_MS : 0 });
    return NextResponse.json({ error: failures >= MAX_FAILURES ? "尝试次数过多，请 15 分钟后再试" : "用户名或密码不正确" }, { status: failures >= MAX_FAILURES ? 429 : 401 });
  }

  attempts.delete(key);
  const remember = body.remember === true;
  const session = await createSessionToken(expectedUser, remember);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(remember, session.expiresAt - Math.floor(Date.now() / 1000)));
  return response;
}
