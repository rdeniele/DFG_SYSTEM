"use client";

import { SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Spinner } from "./ui";

/** Sign out and wipe everything kept on this phone. */
export async function logout() {
  await createClient().auth.signOut();
  try {
    localStorage.removeItem("dfg:me");
  } catch {}
  // Full page load (not client navigation): Next.js keeps recently visited pages alive
  // in memory, which would leave the last person's phone/PIN or the member list behind
  // on a shared phone. Reloading wipes all of it.
  window.location.replace("/login");
}

/**
 * Log out button.
 * - default: big full-width button (bottom of pages)
 * - variant="header": small white-outline button for the black top bars
 */
export function LogoutButton({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "header";
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    setBusy(true);
    await logout();
  };

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-white/40 px-3 text-base font-semibold text-white active:bg-white/10 ${className}`}
      >
        {busy ? <Spinner className="h-4 w-4" /> : <SignOut size={20} weight="bold" aria-hidden />}
        Log out
      </button>
    );
  }

  return (
    <Button variant="secondary" onClick={onClick} loading={busy} className={className}>
      {!busy && <SignOut size={22} weight="bold" aria-hidden />}
      Log out
    </Button>
  );
}
