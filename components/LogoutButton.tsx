"use client";

import { SignOut } from "@phosphor-icons/react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await createClient().auth.signOut();
    try {
      localStorage.removeItem("dfg:me");
    } catch {}
    // Full page load (not client navigation): Next.js keeps recently visited pages alive
    // in memory, which would leave the last person's phone/PIN or the member list behind
    // on a shared phone. Reloading wipes all of it.
    window.location.replace("/login");
  }

  return (
    <Button variant="secondary" onClick={logout} loading={busy} className={className}>
      {!busy && <SignOut size={22} weight="bold" aria-hidden />}
      Log out
    </Button>
  );
}
