"use client";

import { ArrowClockwise, Money } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { StatusCard } from "@/components/Status";
import { Avatar, Button, ErrorBox, Spinner } from "@/components/ui";
import { formatDate, manilaDateOf, TIMEZONE } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatPhone } from "@/lib/phone";
import { planLabel } from "@/lib/plans";
import { getMemberStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { THEME } from "@/lib/theme";
import type { Membership, MemberStatusRow } from "@/lib/types";

const CACHE_KEY = "dfg:me";

interface MeData {
  profile: MemberStatusRow;
  history: Pick<Membership, "id" | "plan" | "start_date" | "end_date" | "created_at">[];
  fetchedAt: string;
}

function readCache(): MeData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as MeData) : null;
  } catch {
    return null;
  }
}

function formatUpdated(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Member status screen. Rendered only in the browser (see MeClient), so it can show
 * the last saved status instantly, then refresh from the server.
 */
export default function MeView() {
  const [data, setData] = useState<MeData | null>(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      // Offline with an expired token: keep showing the saved status, don't log out.
      if (!userId && (sessionError || !navigator.onLine)) throw sessionError ?? new Error("offline");
      if (!userId) {
        window.location.replace("/login");
        return;
      }
      // Don't show another person's cached status on a shared phone.
      if (readCache()?.profile.id !== userId) {
        localStorage.removeItem(CACHE_KEY);
        setData(null);
      }

      const [profileRes, historyRes] = await Promise.all([
        supabase.from("member_status").select("*").eq("id", userId).single(),
        supabase
          .from("memberships")
          .select("id, plan, start_date, end_date, created_at")
          .eq("profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (historyRes.error) throw historyRes.error;

      const next: MeData = {
        profile: profileRes.data as MemberStatusRow,
        history: historyRes.data as MeData["history"],
        fetchedAt: new Date().toISOString(),
      };
      setData(next);
      setError("");
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {}
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your membership."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);

  // First visit with no cache: full-screen loading / error.
  if (!data) {
    return (
      <Shell>
        {error ? (
          <>
            <ErrorBox>{error}</ErrorBox>
            <Button onClick={load} loading={loading}>
              Try again
            </Button>
            <LogoutButton />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-gray-600">
            <Spinner className="h-10 w-10 text-brand" />
            <p className="text-lg">Loading your membership…</p>
          </div>
        )}
      </Shell>
    );
  }

  const { profile, history } = data;
  // Recompute from the end date every render, so a cached status is still right today.
  const info = getMemberStatus(profile.end_date);

  return (
    <Shell>
      <header className="flex items-center gap-4">
        <Avatar src={profile.photo_url} name={profile.full_name} size={72} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{profile.full_name}</h1>
          <p className="text-base text-gray-600">{formatPhone(profile.phone)}</p>
        </div>
      </header>

      {error && (
        <div role="status" className="rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-3 text-base text-yellow-900">
          You&apos;re offline or the connection is slow. Showing your last saved status.
        </div>
      )}

      {profile.is_active ? (
        <StatusCard info={info} />
      ) : (
        <section className="rounded-3xl border-4 border-gray-300 bg-gray-100 px-5 py-8 text-center text-gray-800">
          <p className="text-2xl font-bold">Account turned off</p>
          <p className="mt-2 text-lg">Please talk to the front desk.</p>
        </section>
      )}

      <dl className="grid grid-cols-2 gap-3 text-base">
        <div className="rounded-2xl bg-gray-50 p-4">
          <dt className="text-sm text-gray-500">Current plan</dt>
          <dd className="text-lg font-semibold">{planLabel(profile.current_plan)}</dd>
        </div>
        <div className="rounded-2xl bg-gray-50 p-4">
          <dt className="text-sm text-gray-500">End date</dt>
          <dd className="text-lg font-semibold">{formatDate(profile.end_date)}</dd>
        </div>
      </dl>

      {info.status !== "pending" && (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-gray-50 p-4 text-base text-gray-700">
          <Money size={24} weight="bold" aria-hidden className="text-green-700" /> To renew, pay at the front desk.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">History</h2>
        {history.length === 0 ? (
          <p className="text-base text-gray-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold">{planLabel(h.plan)}</p>
                  <p className="text-sm text-gray-500">Paid {formatDate(manilaDateOf(h.created_at))}</p>
                </div>
                <p className="text-right text-sm text-gray-700">
                  until
                  <br />
                  <span className="text-base font-semibold">{formatDate(h.end_date)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
        <span>Last updated {formatUpdated(data.fetchedAt)}</span>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex min-h-12 items-center gap-2 rounded-xl px-3 font-semibold text-gray-700 active:bg-gray-100"
        >
          {loading ? <Spinner className="h-4 w-4" /> : <ArrowClockwise size={18} weight="bold" aria-hidden />} Refresh
        </button>
      </div>

      <LogoutButton />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="bg-ink">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
          <Logo size={40} />
          <span className="text-lg font-bold text-white">{THEME.gymName}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">{children}</main>
    </>
  );
}
