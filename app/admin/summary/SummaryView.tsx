"use client";

import { ArrowClockwise, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusDot } from "@/components/Status";
import { Button, ErrorBox, Spinner } from "@/components/ui";
import {
  fetchMembers,
  fetchMembershipsSince,
  fetchWalkInsSince,
  sumAmounts,
} from "@/lib/admin-data";
import { manilaDateOf, monthStart, todayManila, TIMEZONE } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatPeso } from "@/lib/plans";
import { STATUS_META, type MemberStatus } from "@/lib/status";

interface Summary {
  today: string;
  walkInsToday: { count: number; total: number };
  renewalsToday: { count: number; total: number };
  month: { walkIns: number; memberships: number };
  counts: Record<MemberStatus, number>;
}

async function loadSummary(): Promise<Summary> {
  const today = todayManila();
  const [members, walkIns, memberships] = await Promise.all([
    fetchMembers(),
    fetchWalkInsSince(monthStart(today)),
    fetchMembershipsSince(monthStart(today)),
  ]);
  const isToday = (r: { created_at: string }) => manilaDateOf(r.created_at) === today;
  const wToday = walkIns.filter(isToday);
  const mToday = memberships.filter(isToday);
  const counts: Record<MemberStatus, number> = { pending: 0, active: 0, expiring: 0, expired: 0 };
  for (const m of members) if (m.is_active) counts[m.info.status] += 1;
  return {
    today,
    walkInsToday: { count: wToday.length, total: sumAmounts(wToday) },
    renewalsToday: { count: mToday.length, total: sumAmounts(mToday) },
    month: { walkIns: sumAmounts(walkIns), memberships: sumAmounts(memberships) },
    counts,
  };
}

export default function SummaryView() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadSummary());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't load the summary."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    void load();
  }, [load]);

  const monthName = data
    ? new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "long", year: "numeric" }).format(
        new Date(`${data.today}T12:00:00+08:00`),
      )
    : "";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-4 md:py-8">
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

      <h1 className="text-3xl font-bold">Summary</h1>
      <ErrorBox>{error}</ErrorBox>

      {!data ? (
        loading ? (
          <Spinner className="h-10 w-10 text-brand" />
        ) : (
          <Button onClick={load}>Try again</Button>
        )
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Today</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Walk-ins" big={formatPeso(data.walkInsToday.total)} small={`${data.walkInsToday.count} people`} />
              <Stat
                label="Renewals"
                big={formatPeso(data.renewalsToday.total)}
                small={`${data.renewalsToday.count} payment${data.renewalsToday.count === 1 ? "" : "s"}`}
              />
            </div>
            <div className="rounded-2xl bg-gray-900 p-4 text-white">
              <p className="text-sm text-gray-300">Total today</p>
              <p className="text-3xl font-bold">{formatPeso(data.walkInsToday.total + data.renewalsToday.total)}</p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">This month · {monthName}</h2>
            <div className="rounded-2xl border-2 border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total income</p>
              <p className="text-3xl font-bold">{formatPeso(data.month.memberships + data.month.walkIns)}</p>
              <p className="mt-1 text-base text-gray-600">
                Memberships {formatPeso(data.month.memberships)} · Walk-ins {formatPeso(data.month.walkIns)}
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Members</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["active", "expiring", "expired", "pending"] as MemberStatus[]).map((s) => (
                <div key={s} className={`rounded-2xl border-2 p-4 ${STATUS_META[s].card}`}>
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${STATUS_META[s].text}`}>
                    <StatusDot status={s} /> {STATUS_META[s].label}
                  </p>
                  <p className="text-3xl font-bold">{data.counts[s]}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="text-sm text-gray-500">Amounts are what the front desk typed in. Blank amounts count as ₱0.</p>
        </>
      )}

      <div className="mt-4 border-t border-gray-200 pt-5">
        <LogoutButton />
      </div>
    </main>
  );
}

function Stat({ label, big, small }: { label: string; big: string; small: string }) {
  return (
    <div className="rounded-2xl border-2 border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold">{big}</p>
      <p className="text-base text-gray-600">{small}</p>
    </div>
  );
}
