import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  // Quick check: does a session cookie exist?
  // This is fast (no network call) - full auth verification happens in the layout
  const hasSessionCookie = request.cookies.has("sb-access-token") ||
    Array.from(request.cookies.getAll()).some(c => c.name.includes("auth-token"));

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/callback");

  // Only redirect to login if no session cookie exists at all
  // Full auth verification with getUser() happens in the layout with Suspense
  if (isProtectedRoute && !hasSessionCookie) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // For auth routes, do the full check to redirect authenticated users
  if (isAuthRoute) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Refresh session in background (non-blocking for page render)
  // The getSession call refreshes tokens if needed
  supabase.auth.getSession();

  return response;
}
