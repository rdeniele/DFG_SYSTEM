"use client";

import { ArrowClockwise, ArrowLeft, CaretLeft, CaretRight, QrCode, SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar, ErrorBox, Spinner } from "@/components/ui";
import { addDays, formatDate, formatDuration, formatTime, manilaStartOf, todayManila } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

interface Row {
  id: string;
  clock_in: string;
  clock_out: string | null;
  profiles: { full_name: string; photo_url: string | null } | null;
}

export default function AttendanceView() {
  const today = todayManila();
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await createClient()
      .from("attendance")
      .select("id, clock_in, clock_out, profiles(full_name, photo_url)")
      .gte("clock_in", manilaStartOf(day))
      .lt("clock_in", manilaStartOf(addDays(day, 1)))
      .order("clock_in", { ascending: false });
    setLoading(false);
    if (e) return setError(friendlyError(e, "Couldn't load attendance."));
    setError("");
    setRows(data as unknown as Row[]);
  }, [day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching when the day changes
    void load();
    if (day !== today) return;
    const timer = window.setInterval(load, 60_000); // today's list refreshes itself
    return () => window.clearInterval(timer);
  }, [load, day, today]);

  async function clockOut(r: Row) {
    if (!window.confirm(`Clock out ${r.profiles?.full_name ?? "this member"} now?`)) return;
    setBusyId(r.id);
    const { error: e } = await createClient()
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", r.id);
    setBusyId(null);
    if (e) return setError(friendlyError(e, "Couldn't clock out."));
    await load();
  }

  const inside = rows?.filter((r) => !r.clock_out) ?? [];
  const isToday = day === today;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="flex min-h-12 items-center gap-2 rounded-xl pr-3 text-lg font-semibold text-gray-700 active:bg-gray-100"
        >
          <ArrowLeft size={22} weight="bold" aria-hidden /> Members
        </Link>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-semibold text-gray-700 active:bg-gray-100"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <ArrowClockwise size={20} weight="bold" aria-hidden />} Refresh
        </button>
      </div>

      <h1 className="text-3xl font-bold">Attendance</h1>

      {/* Day picker */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 p-2">
        <button
          type="button"
          onClick={() => setDay(addDays(day, -1))}
          aria-label="Previous day"
          className="flex h-12 w-12 items-center justify-center rounded-xl active:bg-gray-200"
        >
          <CaretLeft size={24} weight="bold" />
        </button>
        <div className="text-center">
          <p className="text-lg font-bold">{isToday ? "Today" : formatDate(day)}</p>
          {isToday && <p className="text-sm text-gray-500">{formatDate(day)}</p>}
        </div>
        <button
          type="button"
          onClick={() => setDay(addDays(day, 1))}
          disabled={isToday}
          aria-label="Next day"
          className="flex h-12 w-12 items-center justify-center rounded-xl active:bg-gray-200 disabled:opacity-30"
        >
          <CaretRight size={24} weight="bold" />
        </button>
      </div>

      <ErrorBox>{error}</ErrorBox>

      {rows && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-gray-200 p-4">
            <p className="text-sm text-gray-500">Visits</p>
            <p className="text-3xl font-bold">{rows.length}</p>
          </div>
          <div className={`rounded-2xl border-2 p-4 ${isToday ? "border-green-400 bg-green-50" : "border-gray-200"}`}>
            <p className="text-sm text-gray-500">{isToday ? "In the gym now" : "No clock-out"}</p>
            <p className="text-3xl font-bold">{inside.length}</p>
          </div>
        </div>
      )}

      {rows === null ? (
        <Spinner className="h-8 w-8 text-brand" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-gray-50 p-6 text-center text-gray-600">
          <QrCode size={40} weight="bold" aria-hidden />
          <p className="text-base">No scans {isToday ? "yet today" : "on this day"}.</p>
          {isToday && (
            <Link href="/admin/qr" className="font-semibold text-brand underline">
              Show the clock-in QR
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar src={r.profiles?.photo_url} name={r.profiles?.full_name ?? "?"} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{r.profiles?.full_name ?? "Deleted member"}</p>
                <p className="text-sm text-gray-600 tabular-nums">
                  In {formatTime(r.clock_in)}
                  {r.clock_out
                    ? ` · Out ${formatTime(r.clock_out)} · ${formatDuration(r.clock_in, r.clock_out)}`
                    : isToday
                      ? " · still in"
                      : " · no clock-out"}
                </p>
              </div>
              {!r.clock_out && isToday && (
                <button
                  type="button"
                  onClick={() => clockOut(r)}
                  disabled={busyId === r.id}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-gray-300 px-3 text-sm font-semibold active:bg-gray-100"
                >
                  {busyId === r.id ? <Spinner className="h-4 w-4" /> : <SignOut size={18} weight="bold" aria-hidden />}
                  Clock out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
