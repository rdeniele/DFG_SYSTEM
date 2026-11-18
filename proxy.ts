import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same job: runs before every page.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static files, images, PWA assets and the service worker.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|swe-worker.*|icons/|\\.well-known/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|js|txt|apk)$).*)",
  ],
};
