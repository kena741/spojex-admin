import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, parseSessionJson } from "@/lib/api/session";

function hasUserBearer(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && !token.startsWith("sb_");
}

function sessionFromRequest(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return parseSessionJson(decodeURIComponent(raw));
  } catch {
    return parseSessionJson(raw);
  }
}

export async function proxy(request: NextRequest) {
  const session = sessionFromRequest(request);
  const hasSession = Boolean(session?.access_token && session?.user?.id);
  const pathname = request.nextUrl.pathname;

  if (!hasSession && !hasUserBearer(request)) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "auth");
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
