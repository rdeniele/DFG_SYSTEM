"use client";

import {
  CheckCircle,
  ClockCounterClockwise,
  QrCode,
  SignIn,
  SignOut,
  UserGear,
  WarningCircle,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { formatDate, formatDuration, formatTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { getMemberStatus } from "@/lib/status";
import { createClient } from "@/lib/supabase/client";
import { THEME } from "@/lib/theme";
import type { ScanResult } from "@/lib/types";

/** Opened from the gym QR (or the in-app scanner): records clock in / out once. */
export default function CheckinView() {
  const router = useRouter();
  const [res, setRes] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function run() {
    setError("");
    setRes(null);
    const token = new URLSearchParams(window.location.search).get("t") ?? "";
    if (!token) return setRes({ result: "bad_code" });
    const { data, error: rpcError } = await createClient().rpc("clock_scan", { p_token: token });
    if (rpcError) return setError(friendlyError(rpcError, "We couldn't record your scan. Please try again."));
    setRes(data as ScanResult);
    if ("vibrate" in navigator) navigator.vibrate?.(80);
  }

  useEffect(() => {
    if (started.current) return; // run once, even in React dev double-mount
    started.current = true;
    void run();
  }, []);

  const done = (
    <div className="mt-2 flex flex-col gap-3">
      <Button onClick={() => router.replace(res?.result === "admin" ? "/admin" : "/me")}>Done</Button>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-ink">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
          <Logo size={40} />
          <span className="text-lg font-bold text-white">{THEME.gymName}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-8">
        {error ? (
          <>
            <Result tone="red" icon={WarningCircle} title="Not recorded" lines={[error]} />
            <Button onClick={run}>Try again</Button>
            <Button variant="secondary" onClick={() => router.replace("/me")}>
              Back
            </Button>
          </>
        ) : !res ? (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-600">
            <Spinner className="h-12 w-12 text-brand" />
            <p className="text-xl">Recording your scan…</p>
          </div>
        ) : (
          <>
            <ResultFor res={res} />
            {done}
          </>
        )}
      </main>
    </div>
  );
}

function ResultFor({ res }: { res: ScanResult }) {
  const first = res.name?.split(" ")[0] ?? "";
  const info = getMemberStatus(res.end_date ?? null);
  const membershipLine =
    res.end_date && (info.status === "active" || info.status === "expiring")
      ? info.status === "expiring"
        ? `Your membership ends ${info.daysLeft === 0 ? "today" : `in ${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"}`}. Renew at the front desk.`
        : `Membership until ${formatDate(res.end_date)}`
      : null;

  switch (res.result) {
    case "in":
      return (
        <Result
          tone="green"
          icon={SignIn}
          title="Clocked IN"
          big={formatTime(res.clock_in!)}
          lines={[`Have a great workout, ${first}!`]}
          note={membershipLine}
          warn={info.status === "expiring"}
        />
      );
    case "out":
      return (
        <Result
          tone="ink"
          icon={SignOut}
          title="Clocked OUT"
          big={formatTime(res.clock_out!)}
          lines={[`You trained ${formatDuration(res.clock_in!, res.clock_out!)}. See you next time, ${first}!`]}
          note={membershipLine}
          warn={info.status === "expiring"}
        />
      );
    case "duplicate":
      return (
        <Result
          tone="gray"
          icon={ClockCounterClockwise}
          title={res.state === "in" ? "Already clocked in" : "Already clocked out"}
          big={formatTime((res.state === "in" ? res.clock_in : res.clock_out) ?? new Date().toISOString())}
          lines={["You just scanned. Nothing changed."]}
        />
      );
    case "blocked":
      return (
        <Result
          tone="red"
          icon={XCircle}
          title="Can't clock in"
          lines={
            res.status === "expired"
              ? [`Your membership expired on ${formatDate(res.end_date)}.`, "Please pay at the front desk."]
              : ["Your membership isn't active yet.", "Please pay at the front desk."]
          }
        />
      );
    case "inactive":
      return (
        <Result tone="red" icon={XCircle} title="Account turned off" lines={["Please talk to the front desk."]} />
      );
    case "admin":
      return (
        <Result
          tone="gray"
          icon={UserGear}
          title="You're the front desk"
          lines={["Front desk accounts don't clock in.", "Members scan this QR on their own phone."]}
        />
      );
    case "bad_code":
    default:
      return (
        <Result
          tone="red"
          icon={QrCode}
          title="Old or wrong QR code"
          lines={["This QR code doesn't work anymore.", "Ask the front desk for the current one."]}
        />
      );
  }
}

const TONES = {
  green: "bg-green-50 border-green-500 text-green-900",
  ink: "bg-gray-900 border-gray-900 text-white",
  gray: "bg-gray-100 border-gray-300 text-gray-900",
  red: "bg-red-50 border-red-500 text-red-900",
} as const;

function Result({
  tone,
  icon: IconCmp,
  title,
  big,
  lines,
  note,
  warn,
}: {
  tone: keyof typeof TONES;
  icon: Icon;
  title: string;
  big?: string;
  lines: string[];
  note?: string | null;
  warn?: boolean;
}) {
  return (
    <section
      role="status"
      aria-live="assertive"
      className={`flex flex-col items-center gap-2 rounded-3xl border-4 px-5 py-8 text-center ${TONES[tone]}`}
    >
      <IconCmp size={80} weight="fill" aria-hidden />
      <p className="text-3xl font-black tracking-wide">{title}</p>
      {big && <p className="text-5xl font-black tabular-nums">{big}</p>}
      {lines.map((l) => (
        <p key={l} className="text-lg font-medium">
          {l}
        </p>
      ))}
      {note && (
        <p
          className={`mt-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-base font-semibold ${
            warn ? "bg-yellow-300 text-yellow-950" : tone === "ink" ? "bg-white/10" : "bg-white/70"
          }`}
        >
          {warn ? <WarningCircle size={20} weight="fill" aria-hidden /> : <CheckCircle size={20} weight="fill" aria-hidden />}
          {note}
        </p>
      )}
    </section>
  );
}
