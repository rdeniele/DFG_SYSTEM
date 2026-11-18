"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await createClient().auth.signOut();
    try {
      localStorage.removeItem("dfg:me");
    } catch {}
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={logout} loading={busy} className={className}>
      Log out
    </Button>
  );
}
