import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/app", "/platform"];
const publicRoutes = [
  "/",
  "/login",
  "/teste-gratis",
  "/manual",
  "/status",
  "/m",
  "/q",
  "/invite",
  "/reset",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("gm_session");

  if (!sessionCookie && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/platform/:path*"],
};
