import type { MetadataRoute } from "next";
import { THEME } from "@/lib/theme";

// Served at /manifest.webmanifest. Built from lib/theme.ts so a rebrand updates it too.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: THEME.gymName,
    short_name: THEME.shortName,
    description: THEME.tagline,
    // Opens on /login: logged-in users are forwarded to /me or /admin right away.
    start_url: "/login?source=app",
    scope: "/",
    display: "standalone",
    background_color: THEME.backgroundColor,
    theme_color: THEME.inkColor,
    lang: "en",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
