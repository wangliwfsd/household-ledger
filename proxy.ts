import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const expectedUser=process.env.APP_USERNAME;
  const expectedPassword=process.env.APP_PASSWORD;
  if (!expectedUser || !expectedPassword) return NextResponse.next();
  const auth=request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const [user,password]=atob(auth.slice(6)).split(":");
    if (user===expectedUser && password===expectedPassword) return NextResponse.next();
  }
  return new NextResponse("Authentication required",{status:401,headers:{"WWW-Authenticate":'Basic realm="Household Ledger", charset="UTF-8"'}});
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.svg|manifest.webmanifest).*)"]};
