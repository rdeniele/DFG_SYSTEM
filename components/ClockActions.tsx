"use client";

import { CameraSlash, SignIn, SignOut, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { ClockAction, ScanResult } from "@/lib/types";
import { BottomNav } from "./BottomNav";
import { ClockResult, Result } from "./ClockResult";
import { Button, Spinner } from "./ui";

/** Pulls the clock-in code out of whatever the camera read. Accepts the gym QR link only. */
function checkinTokenFrom(text: string): string | null {
  try {
    const url = new URL(text, window.location.origin);
    const t = url.searchParams.get("t");
    if (url.pathname.replace(/\/+$/, "") === "/checkin" && t) return t;
  } catch {}
  return null;
}

const ACTIONS = {
  in: { label: "Clock in", icon: SignIn },
  out: { label: "Clock out", icon: SignOut },
} as const;

type Flow =
  | { step: "scan"; action: ClockAction }
  | { step: "recording"; action: ClockAction }
  | { step: "error"; action: ClockAction; token: string; message: string }
  | { step: "done"; result: ScanResult };

export function ClockActions({ canClockIn, onDone }: { canClockIn: boolean; onDone: () => void }) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const recording = useRef(false);

  const record = useCallback(async (action: ClockAction, token: string) => {
    if (recording.current) return;
    recording.current = true;
    setFlow({ step: "recording", action });
    try {
      const { data, error } = await createClient().rpc("clock_action", { p_token: token, p_action: action });
      if (error) throw error;
      setFlow({ step: "done", result: data as ScanResult });
    } catch (error) {
      const message = friendlyError(error, "We couldn't record it. Please try again.");
      setFlow({ step: "error", action, token, message });
    } finally {
      recording.current = false;
    }
  }, []);

  const actions: ClockAction[] = canClockIn ? ["in", "out"] : ["out"];
  const choose = (action: ClockAction) => setFlow({ step: "scan", action });
  const close = () => {
    setFlow(null);
    onDone();
  };

  return (
    <>
      <div className="hidden gap-3 md:flex">
        {actions.map((action) => {
          const { label, icon: Icon } = ACTIONS[action];
          return (
            <Button
              key={action}
              type="button"
              variant={action === "in" ? "primary" : "secondary"}
              onClick={() => choose(action)}
            >
              <Icon size={24} weight="bold" aria-hidden />
              {label}
            </Button>
          );
        })}
      </div>
      <BottomNav
        label="Attendance"
        items={actions.map((action) => ({ key: action, ...ACTIONS[action], center: true, onClick: () => choose(action) }))}
      />
      {flow?.step === "scan" && <ScannerOverlay action={flow.action} onClose={() => setFlow(null)} onScan={record} />}
      {flow && flow.step !== "scan" && (
        <div role="dialog" aria-modal="true" aria-label="Attendance result" className="fixed inset-0 z-50 flex overflow-y-auto bg-white p-5">
          <div className="m-auto flex w-full max-w-md flex-col gap-4">
            {flow.step === "recording" ? (
              <div role="status" className="flex flex-col items-center gap-3 py-12 text-lg text-gray-700">
                <Spinner className="h-10 w-10 text-brand" />
                {flow.action === "in" ? "Clocking in…" : "Clocking out…"}
              </div>
            ) : flow.step === "error" ? (
              <>
                <Result tone="red" icon={WarningCircle} title="Couldn’t confirm attendance" lines={[flow.message]} />
                <Button type="button" onClick={() => record(flow.action, flow.token)}>Try again</Button>
                <Button type="button" variant="secondary" onClick={close}>Back</Button>
              </>
            ) : (
              <>
                <ClockResult res={flow.result} />
                <Button type="button" onClick={close}>Done</Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ScannerOverlay({ action, onClose, onScan }: {
  action: ClockAction;
  onClose: () => void;
  onScan: (action: ClockAction, token: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "nocamera">("starting");
  const [hint, setHint] = useState("");
  const handled = useRef(false);

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !videoRef.current) return;
        const hasCamera = await QrScanner.hasCamera();
        if (cancelled || !videoRef.current) return;
        if (!hasCamera) return setState("nocamera");
        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (cancelled || handled.current) return;
            const token = checkinTokenFrom(result.data);
            if (!token) {
              setHint("That's not the gym QR code. Point at the QR at the front desk.");
              return;
            }
            handled.current = true;
            scanner?.stop();
            onScan(action, token);
            navigator.vibrate?.(60);
          },
          { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
        );
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
  }, [action, onScan]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Scan QR to ${ACTIONS[action].label.toLowerCase()}`} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-lg font-bold">Scan to {ACTIONS[action].label.toLowerCase()}</p>
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
