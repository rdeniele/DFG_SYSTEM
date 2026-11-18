"use client";

import { useEffect, useState } from "react";
import type { Role } from "./roles";
import { createClient } from "./supabase/client";

/** The logged-in user's role (null while loading). Only used to show/hide buttons;
 *  the database enforces the real rules. */
export function useMyRole(): { role: Role | null; myId: string | null } {
  const [state, setState] = useState<{ role: Role | null; myId: string | null }>({ role: null, myId: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", id).single();
      if (!cancelled && p) setState({ role: p.role as Role, myId: id });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
