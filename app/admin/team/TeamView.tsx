"use client";

import { ArrowLeft, Barbell, CaretDown, CaretUp, Key, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RoleControl } from "@/components/RoleControl";
import { Avatar, Button, ErrorBox, Spinner } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { formatPhone } from "@/lib/phone";
import { canManage, ROLE_HINT, ROLE_LABEL, ROLE_RANK, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { useMyRole } from "@/lib/use-my-role";
import { ActiveToggle, PinBox } from "../MemberProfile";

interface StaffRow {
  id: string;
  full_name: string;
  phone: string;
  photo_url: string | null;
  role: Role;
  is_active: boolean;
}

const BADGE: Record<Role, string> = {
  superadmin: "bg-ink text-white",
  owner: "bg-brand text-white",
  admin: "bg-gray-200 text-gray-900",
  member: "bg-gray-100 text-gray-700",
};

export default function TeamView() {
  const { role: myRole, myId } = useMyRole();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await createClient()
      .from("profiles")
      .select("id, full_name, phone, photo_url, role, is_active")
      .neq("role", "member");
    if (e) return setError(friendlyError(e, "Couldn't load the team."));
    setError("");
    setRows(
      (data as StaffRow[]).sort(
        (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.full_name.localeCompare(b.full_name),
      ),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    void load();
  }, [load]);

  const canGiveRoles = myRole === "owner" || myRole === "superadmin";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4 md:py-8">
      <Link
        href="/admin"
        className="flex min-h-12 items-center gap-2 self-start rounded-xl pr-3 text-lg font-semibold text-gray-700 active:bg-gray-100"
      >
        <ArrowLeft size={22} weight="bold" aria-hidden /> Members
      </Link>

      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <ShieldCheck size={32} weight="bold" aria-hidden /> Team
      </h1>
      <p className="text-base text-gray-600">
        People with front desk access.
        {canGiveRoles
          ? " To add someone: they register like a member, then open them in the Members list and tap Make Co-admin."
          : " Only the owner can add or remove people here."}
      </p>

      <ErrorBox>{error}</ErrorBox>

      {rows === null ? (
        <Spinner className="h-8 w-8 text-brand" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const isMe = r.id === myId;
            const manageable = !isMe && canManage(myRole, r.role);
            const expanded = open === r.id;
            return (
              <li key={r.id} className="rounded-2xl border-2 border-gray-200">
                <button
                  type="button"
                  disabled={!manageable}
                  onClick={() => {
                    setOpen(expanded ? null : r.id);
                    setPinFor(null);
                  }}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left enabled:active:bg-gray-50"
                >
                  <Avatar src={r.photo_url} name={r.full_name} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">
                      {r.full_name} {isMe && <span className="text-sm font-normal text-gray-500">(you)</span>}
                    </p>
                    <p className="text-sm text-gray-600">{formatPhone(r.phone)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE[r.role]}`}>
                        {ROLE_LABEL[r.role]}
                      </span>
                      {!r.is_active && (
                        <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-bold text-white">
                          TURNED OFF
                        </span>
                      )}
                    </div>
                  </div>
                  {manageable &&
                    (expanded ? (
                      <CaretUp size={22} weight="bold" aria-hidden />
                    ) : (
                      <CaretDown size={22} weight="bold" aria-hidden />
                    ))}
                </button>

                <Link
                  href={`/admin?m=${r.id}`}
                  className="flex min-h-11 items-center justify-center gap-1.5 border-t border-gray-100 px-4 text-sm font-semibold text-gray-700 active:bg-gray-50"
                >
                  <Barbell size={18} weight="bold" aria-hidden />
                  {isMe ? "My gym membership (renew, history)" : "Gym membership (renew, history)"}
                </Link>

                {expanded && manageable && (
                  <div className="flex flex-col gap-3 border-t border-gray-200 p-4">
                    <p className="text-sm text-gray-500">{ROLE_HINT[r.role]}</p>
                    <RoleControl target={r} myRole={myRole} onChanged={load} />
                    {pinFor === r.id ? (
                      <PinBox member={r} onDone={() => setPinFor(null)} />
                    ) : (
                      <Button variant="secondary" onClick={() => setPinFor(r.id)}>
                        <Key size={22} weight="bold" aria-hidden /> Reset PIN
                      </Button>
                    )}
                    <ActiveToggle member={r} onChanged={load} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-2 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
        <p className="mb-2 font-bold">Who can do what</p>
        <ul className="flex flex-col gap-1.5">
          {(["superadmin", "owner", "admin"] as Role[]).map((role) => (
            <li key={role}>
              <strong>{ROLE_LABEL[role]}:</strong> {ROLE_HINT[role]}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
