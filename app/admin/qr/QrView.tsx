"use client";

import { ArrowClockwise, ArrowLeft, ArrowsOut, Printer, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button, ErrorBox, Spinner } from "@/components/ui";
import { formatDate, manilaDateOf } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { THEME } from "@/lib/theme";

/** The address inside the QR. Uses the live site address when set, so a QR printed
 *  from a laptop still points to the real website. */
function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
}

export default function QrView() {
  const [token, setToken] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [rotating, setRotating] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await createClient()
      .from("gym_settings")
      .select("checkin_token, token_updated_at")
      .single();
    if (e) return setError(friendlyError(e, "Couldn't load the QR code."));
    setToken(data.checkin_token);
    setUpdatedAt(data.token_updated_at);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    void load();
  }, [load]);

  const url = token ? `${siteOrigin()}/checkin?t=${token}` : "";
  const isLocal = /localhost|127\.0\.0\.1/.test(url);

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111" } }).then(
      setSvg,
    );
  }, [url]);

  async function rotate() {
    if (
      !window.confirm(
        "Make a NEW QR code?\n\nThe old QR (printouts and photos of it) will stop working right away. You'll need to print the new one.",
      )
    )
      return;
    setRotating(true);
    const { error: e } = await createClient().rpc("rotate_checkin_token");
    setRotating(false);
    if (e) return setError(friendlyError(e, "Couldn't make a new code."));
    await load();
  }

  async function fullScreen() {
    try {
      await posterRef.current?.requestFullscreen();
      // Keep the screen on while it's shown at the desk.
      await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request(
        "screen",
      );
    } catch {}
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4 md:py-8">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="flex min-h-12 items-center gap-2 rounded-xl pr-3 text-lg font-semibold text-gray-700 active:bg-gray-100"
        >
          <ArrowLeft size={22} weight="bold" aria-hidden /> Members
        </Link>
      </div>

      <div className="no-print">
        <h1 className="text-3xl font-bold">Clock-in QR</h1>
        <p className="text-base text-gray-600">
          Print it and put it at the entrance, or show it full-screen on a phone or tablet at the desk.
        </p>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {isLocal && (
        <p className="no-print flex gap-2 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-3 text-base text-yellow-900">
          <WarningCircle size={24} weight="fill" aria-hidden className="shrink-0" />
          <span>
            This QR points to <strong>{new URL(url).host}</strong> (this computer). Set{" "}
            <code>NEXT_PUBLIC_SITE_URL</code> to your live website, or open this page on the live site, before
            printing.
          </span>
        </p>
      )}

      {/* The poster: this is what prints, and what goes full-screen */}
      <div
        ref={posterRef}
        className="print-poster flex flex-col items-center gap-4 rounded-3xl border-2 border-gray-200 bg-white p-6 text-center"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-ink p-1">
            <Logo size={56} />
          </span>
          <span className="text-2xl font-black">{THEME.gymName}</span>
        </div>
        <p className="text-3xl font-black tracking-tight">SCAN TO CLOCK IN / OUT</p>
        {svg ? (
          <div
            className="aspect-square w-full max-w-[420px] [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="Clock-in QR code"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex aspect-square w-full max-w-[420px] items-center justify-center">
            <Spinner className="h-10 w-10 text-brand" />
          </div>
        )}
        <ol className="flex flex-col gap-1 text-lg text-gray-800">
          <li>
            <strong>1.</strong> Open the {THEME.shortName} app → <strong>Scan to clock in / out</strong>
          </li>
          <li>
            <strong>2.</strong> Or point your phone camera here
          </li>
          <li>
            <strong>3.</strong> Scan again when you leave
          </li>
        </ol>
      </div>

      <div className="no-print flex flex-col gap-3">
        <Button onClick={() => window.print()} disabled={!svg}>
          <Printer size={22} weight="bold" aria-hidden /> Print
        </Button>
        <Button variant="secondary" onClick={fullScreen} disabled={!svg}>
          <ArrowsOut size={22} weight="bold" aria-hidden /> Show full screen
        </Button>
        <Button variant="danger" onClick={rotate} loading={rotating} disabled={!token}>
          <ArrowClockwise size={22} weight="bold" aria-hidden /> Make a new QR code
        </Button>
        <p className="text-sm text-gray-500">
          Use &quot;Make a new QR code&quot; if a photo of the QR is being shared so people clock in from home. Old
          printouts stop working.
          {updatedAt && ` Current code made ${formatDate(manilaDateOf(updatedAt))}.`}
        </p>
      </div>
    </main>
  );
}
