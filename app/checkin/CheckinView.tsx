"use client";

import { SignIn, SignOut, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClockResult, Result } from "@/components/ClockResult";
import { Button, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { formatTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { THEME } from "@/lib/theme";
import type { ClockAction, ScanResult } from "@/lib/types";

interface Status {
  result: "ok" | "bad_code" | "inactive" | "admin";
  name?: string;
  status?: ScanResult["status"];
  end_date?: string | null;
  can_clock_in?: boolean;
  open_since?: string | null;
}

/** QR links opened from a phone's camera let the member choose an action here. */
export default function CheckinView() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [res, setRes] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<ClockAction | null>(null);
  const started = useRef<string | null>(null);
  const token = new URLSearchParams(window.location.search).get("t") ?? "";

  const load = useCallback(async () => {
    setError("");
    setRes(null);
    setStatus(null);
    if (!token) return setRes({ result: "bad_code" });
    const { data, error: e } = await createClient().rpc("clock_status", { p_token: token });
    if (e) return setError(friendlyError(e, "We couldn't check your status. Please try again."));
    const st = data as Status;
    if (st.result !== "ok") return setRes({ result: st.result, name: st.name });
    if (!st.can_clock_in && !st.open_since) {
      return setRes({ result: "blocked", name: st.name, status: st.status, end_date: st.end_date });
    }
    setStatus(st);
  }, [token]);

  async function act(action: ClockAction) {
    setBusy(action);
    setError("");
    const { data, error: e } = await createClient().rpc("clock_action", { p_token: token, p_action: action });
    setBusy(null);
    if (e) return setError(friendlyError(e, "We couldn't record it. Please try again."));
    setRes(data as ScanResult);
    if ("vibrate" in navigator) navigator.vibrate?.(80);
  }

  useEffect(() => {
    // Once per opened link, even in React dev double-mount.
    const key = window.location.href + "|" + performance.timeOrigin;
    if (started.current === key) return;
    started.current = key;
    void load();
  }, [load]);

  const first = (status?.name ?? res?.name ?? "").split(" ")[0];
  const inside = !!status?.open_since;

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-ink">
        <Link href="/" aria-label="Home" className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
          <Logo size={40} />
          <span className="text-lg font-bold text-white">{THEME.gymName}</span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-8">
        {error ? (
          <>
            <Result tone="red" icon={WarningCircle} title="Not recorded" lines={[error]} />
            <Button onClick={load}>Try again</Button>
            <Button variant="secondary" onClick={() => router.replace("/me")}>
              Back
            </Button>
          </>
        ) : res ? (
          <>
            <ClockResult res={res} />
            {res.result === "already_in" && (
              <Button variant="secondary" onClick={() => act("out")} loading={busy === "out"}>
                <SignOut size={24} weight="bold" aria-hidden /> Clock OUT instead
              </Button>
            )}
            {res.result === "not_in" && (
              <Button variant="secondary" onClick={() => act("in")} loading={busy === "in"}>
                <SignIn size={24} weight="bold" aria-hidden /> Clock IN instead
              </Button>
            )}
            <Button onClick={() => window.location.replace(res.result === "admin" ? "/admin" : "/me")}>Done</Button>
          </>
        ) : status ? (
          <>
            <section className="flex flex-col items-center gap-1 text-center">
              <p className="text-2xl font-bold">Hi, {first}!</p>
              <p className={`text-lg ${inside ? "font-semibold text-green-800" : "text-gray-600"}`}>
                {inside
                  ? `You're clocked in since ${formatTime(status.open_since!)}`
                  : "You're not clocked in right now"}
              </p>
            </section>
            {status.can_clock_in && (
              <button
                type="button"
                onClick={() => act("in")}
                disabled={!!busy}
                className={`flex min-h-24 items-center justify-center gap-3 rounded-3xl border-4 text-2xl font-black ${
                  inside ? "border-gray-300 bg-white text-gray-500" : "border-green-600 bg-green-600 text-white shadow-lg"
                }`}
              >
                {busy === "in" ? <Spinner className="h-7 w-7" /> : <SignIn size={36} weight="bold" aria-hidden />}
                Clock IN
              </button>
            )}
            <button
              type="button"
              onClick={() => act("out")}
              disabled={!!busy}
              className={`flex min-h-24 items-center justify-center gap-3 rounded-3xl border-4 text-2xl font-black ${
                inside ? "border-ink bg-ink text-white shadow-lg" : "border-gray-300 bg-white text-gray-500"
              }`}
            >
              {busy === "out" ? <Spinner className="h-7 w-7" /> : <SignOut size={36} weight="bold" aria-hidden />}
              Clock OUT
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-600">
            <Spinner className="h-12 w-12 text-brand" />
            <p className="text-xl">Checking…</p>
          </div>
        )}
      </main>
    </div>
  );
}
