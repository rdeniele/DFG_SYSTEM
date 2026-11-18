import type { Metadata } from "next";
import { THEME } from "@/lib/theme";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when there's no internet and the page wasn't saved yet. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <span aria-hidden className="text-6xl">
        📶
      </span>
      <h1 className="text-3xl font-bold">You&apos;re offline</h1>
      <p className="text-lg text-gray-600">
        No internet right now. Connect to data or Wi-Fi, then try again.
      </p>
      <p className="text-base text-gray-500">
        Tip: open the {THEME.gymName} app once while online, and it will remember your membership status for next
        time.
      </p>
      <RetryButton />
    </main>
  );
}
