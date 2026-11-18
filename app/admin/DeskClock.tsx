"use client";

import { CheckCircle, SignIn, SignOut, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import type { MemberRow } from "@/lib/admin-data";
import { formatDate, formatDuration, formatTime, manilaStartOf, todayManila } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { ScanResult } from "@/lib/types";

/**
 * Front desk clocks a member in or out (for members with no phone or no data).
 * Shares the same visit records as the member's own QR clock in/out.
 */
export function DeskClock({ member, onChanged }: { member: MemberRow; onChanged: () => Promise<void> | void }) {
  const [openSince, setOpenSince] = useState<string | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const canClockIn = member.is_active && (member.info.status === "active" || member.info.status === "expiring");
  const first = member.full_name.split(" ")[0];

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("attendance")
      .select("clock_in")
      .eq("profile_id", member.id)
      .is("clock_out", null)
      .gte("clock_in", manilaStartOf(todayManila()))
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpenSince(data?.clock_in ?? null);
  }, [member.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on open
    void load();
  }, [load]);

  async function act(action: "in" | "out") {
    setBusy(action);
    setMsg(null);
    const { data, error } = await createClient().rpc("staff_clock", { p_profile: member.id, p_action: action });
    setBusy(null);
    if (error) return setMsg({ tone: "warn", text: friendlyError(error, "Couldn't save. Please try again.") });
    const r = data as ScanResult;
    switch (r.result) {
      case "in":
        setMsg({ tone: "ok", text: `${first} clocked IN at ${formatTime(r.clock_in!)}.` });
        break;
      case "out":
        setMsg({
          tone: "ok",
          text: `${first} clocked OUT at ${formatTime(r.clock_out!)} · trained ${formatDuration(r.clock_in!, r.clock_out!)}.`,
        });
        break;
      case "already_in":
        setMsg({ tone: "warn", text: `${first} is already in since ${formatTime(r.clock_in!)}.` });
        break;
      case "not_in":
        setMsg({ tone: "warn", text: `${first} isn't clocked in today.` });
        break;
      case "blocked":
        setMsg({
          tone: "warn",
          text:
            r.status === "expired"
              ? `Membership expired on ${formatDate(r.end_date)}. Renew first, then clock in.`
              : "No active membership yet. Add a plan below first, then clock in.",
        });
        break;
      default:
        setMsg({ tone: "warn", text: "This account can't be clocked in." });
    }
    await Promise.all([load(), onChanged()]);
  }

  const inside = !!openSince;

  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Clock in / out</h3>
        {openSince === undefined ? (
          <Spinner className="h-5 w-5 text-brand" />
        ) : (
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              inside ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {inside ? `In the gym since ${formatTime(openSince!)}` : "Not in the gym"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => act("in")}
          disabled={!!busy || !canClockIn}
          className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-4 text-xl font-black disabled:opacity-40 ${
            !inside && canClockIn ? "border-green-600 bg-green-600 text-white shadow" : "border-gray-300 bg-white text-gray-600"
          }`}
        >
          {busy === "in" ? <Spinner className="h-6 w-6" /> : <SignIn size={30} weight="bold" aria-hidden />}
          Clock IN
        </button>
        <button
          type="button"
          onClick={() => act("out")}
          disabled={!!busy}
          className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-4 text-xl font-black ${
            inside ? "border-ink bg-ink text-white shadow" : "border-gray-300 bg-white text-gray-600"
          }`}
        >
          {busy === "out" ? <Spinner className="h-6 w-6" /> : <SignOut size={30} weight="bold" aria-hidden />}
          Clock OUT
        </button>
      </div>

      {!canClockIn && member.is_active && (
        <p className="text-sm text-gray-600">
          {member.info.status === "expired" ? "Membership expired. Renew below to clock in." : "No plan yet. Add one below to clock in."}
        </p>
      )}

      {msg && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-2xl p-3 text-base font-semibold ${
            msg.tone === "ok" ? "bg-green-100 text-green-900" : "bg-yellow-50 text-yellow-900"
          }`}
        >
          {msg.tone === "ok" ? (
            <CheckCircle size={22} weight="fill" aria-hidden className="shrink-0" />
          ) : (
            <WarningCircle size={22} weight="fill" aria-hidden className="shrink-0" />
          )}
          {msg.text}
        </p>
      )}
    </section>
  );
}
