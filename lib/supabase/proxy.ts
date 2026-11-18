import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isStaff } from "@/lib/roles";

const MEMBER_ONLY = ["/me"];
const ADMIN_ONLY = ["/admin"];
const AUTH_PAGES = ["/login", "/register"];
/** QR clock-in link: any logged-in user; logged-out users log in first, then come back. */
const CHECKIN = ["/checkin"];

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Refreshes the Supabase session cookie on every request and guards routes:
 * - /me and /admin need a logged-in user
 * - /admin needs role = 'admin'
 * - logged-in users visiting /login or /register go to their dashboard
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  const path = request.nextUrl.pathname;
  const needsAuth =
    startsWithAny(path, MEMBER_ONLY) || startsWithAny(path, ADMIN_ONLY) || startsWithAny(path, CHECKIN);
  const isAuthPage = startsWithAny(path, AUTH_PAGES);

  const redirectTo = (to: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const res = NextResponse.redirect(url);
    // keep any refreshed auth cookies
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!userId) {
    // After logging in, a scanned QR link continues to /checkin.
    if (needsAuth) {
      return redirectTo("/login", startsWithAny(path, CHECKIN) ? path + request.nextUrl.search : undefined);
    }
    return response;
  }

  // Logged in: only look up the role when we need it.
  if (startsWithAny(path, ADMIN_ONLY) || startsWithAny(path, MEMBER_ONLY) || isAuthPage || path === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();

    const staff = isStaff(profile?.role);
    const home = staff ? "/admin" : "/me";

    if (startsWithAny(path, ADMIN_ONLY) && !staff) return redirectTo("/me");
    if (startsWithAny(path, MEMBER_ONLY) && staff) return redirectTo("/admin");
    if (isAuthPage || path === "/") return redirectTo(home);
  }

  return response;
}
