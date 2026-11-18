"use client";

export type Platform = "android" | "ios" | "desktop";

export interface DeviceInfo {
  platform: Platform;
  /** Running as an installed app (PWA on home screen, or the Android TWA). */
  standalone: boolean;
  /** Facebook/Messenger/Instagram/etc. built-in browser: downloads and "Add to Home Screen" often don't work there. */
  inAppBrowser: boolean;
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const platform: Platform = /Android/i.test(ua)
    ? "android"
    : /iPhone|iPad|iPod/i.test(ua) || isIPadOS
      ? "ios"
      : "desktop";

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith("android-app://");

  const inAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|TikTok|; wv\)/i.test(ua);

  return { platform, standalone, inAppBrowser };
}
