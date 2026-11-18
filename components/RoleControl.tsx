"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";
import { assignableRoles, ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorBox } from "./ui";

/**
 * "Front desk access" box: owner can make someone a co-admin (or remove it);
 * super admin can also make owners. Hidden for anyone who can't change roles.
 */
export function RoleControl({
  target,
  myRole,
  onChanged,
}: {
  target: { id: string; full_name: string; role: Role };
  myRole: Role | null;
  onChanged: (newRole: Role) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState("");
  const options = assignableRoles(myRole);
  // Only for accounts below me, and only if I can give roles at all.
  if (!options.length || !options.includes(target.role)) return null;

  const first = target.full_name.split(" ")[0];

  async function setRole(role: Role) {
    const msg =
      role === "member"
        ? `Remove ${target.full_name}'s front desk access?\n\nThey become a regular member again.`
        : `Make ${target.full_name} ${role === "owner" ? "an" : "a"} ${ROLE_LABEL[role]}?\n\n${ROLE_HINT[role]}`;
    if (!window.confirm(msg)) return;
    setBusy(role);
    setError("");
    const { error: e } = await createClient().rpc("set_member_role", { p_profile: target.id, p_role: role });
    setBusy(null);
    if (e) return setError(e.message || "Couldn't change access. Please try again.");
    await onChanged(role);
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-gray-200 p-4">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <ShieldCheck size={24} weight="bold" aria-hidden /> Front desk access
      </h3>
      <p className="text-base text-gray-700">
        {first} is now: <strong>{ROLE_LABEL[target.role]}</strong>
        <br />
        <span className="text-sm text-gray-500">{ROLE_HINT[target.role]}</span>
      </p>
      <ErrorBox>{error}</ErrorBox>
      {options
        .filter((r) => r !== target.role)
        .sort((a, b) => (a === "member" ? 1 : b === "member" ? -1 : 0))
        .map((r) => (
          <Button
            key={r}
            variant={r === "member" ? "danger" : "secondary"}
            onClick={() => setRole(r)}
            loading={busy === r}
            disabled={!!busy}
          >
            {r === "member" ? "Remove front desk access" : `Make ${ROLE_LABEL[r]}`}
          </Button>
        ))}
    </section>
  );
}
