"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds only (a dev service worker gets in the way). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the app still works online.
    });
  }, []);
  return null;
}
