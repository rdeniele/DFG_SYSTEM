"use client";

import { CameraSlash, QrCode, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "./ui";

/** Pulls the clock-in code out of whatever the camera read. Accepts the gym QR link only. */
function checkinPathFrom(text: string): string | null {
  try {
    const url = new URL(text, window.location.origin);
    const t = url.searchParams.get("t");
    if (url.pathname.replace(/\/+$/, "") === "/checkin" && t) return `/checkin?t=${encodeURIComponent(t)}`;
  } catch {}
  return null;
}

/** Big "Scan to clock in / out" button that opens the camera inside the app. */
export function QrScanButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-ink px-5 text-xl font-bold text-white shadow-lg active:bg-black ${className}`}
      >
        <QrCode size={36} weight="bold" aria-hidden />
        Scan to clock in / out
      </button>
      {open && <ScannerOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

export function ScannerOverlay({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "nocamera">("starting");
  const [hint, setHint] = useState("");
  const handled = useRef(false);

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let cancelled = false;

    (async () => {
      const { default: QrScanner } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      if (!(await QrScanner.hasCamera())) return setState("nocamera");
      scanner = new QrScanner(
        videoRef.current,
        (result) => {
          if (handled.current) return;
          const path = checkinPathFrom(result.data);
          if (!path) {
            setHint("That's not the gym QR code. Point at the QR at the front desk.");
            return;
          }
          handled.current = true;
          navigator.vibrate?.(60);
          scanner?.stop();
          // Full page load, NOT client navigation: Next.js keeps the last /checkin page alive
          // in memory, so a second in-app scan (the clock-out) would just show the old
          // "Clocked IN" result without recording anything.
          window.location.assign(new URL(path, window.location.origin).href);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
      );
      try {
        await scanner.start();
        // Some browsers "start" without ever giving a camera picture (permission silently
        // refused). Only say we're scanning if there's a real video stream.
        if (!cancelled) setState(videoRef.current?.srcObject ? "scanning" : "denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();

    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan QR code" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-lg font-bold">Point at the gym QR</p>
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-lg font-semibold active:bg-white/10"
        >
          <X size={24} weight="bold" aria-hidden /> Close
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {state === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Spinner className="h-10 w-10" />
            <p className="text-lg">Opening camera…</p>
          </div>
        )}
        {(state === "denied" || state === "nocamera") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
            <CameraSlash size={64} weight="bold" aria-hidden />
            <p className="text-xl font-bold">
              {state === "denied" ? "Camera is blocked" : "No camera found"}
            </p>
            <p className="text-base text-gray-300">
              {state === "denied"
                ? "Allow camera access for this app in your phone settings, then try again. Or scan the QR with your phone's camera app."
                : "Scan the QR with your phone's camera app instead."}
            </p>
            <Button variant="secondary" onClick={onClose} className="max-w-xs">
              Close
            </Button>
          </div>
        )}
      </div>

      <p className="min-h-16 px-5 py-4 text-center text-base text-white" aria-live="polite">
        {state === "scanning" ? hint || "Hold steady. It will scan by itself." : ""}
      </p>
    </div>
  );
}
