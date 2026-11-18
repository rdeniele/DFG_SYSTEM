"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui";
import { detectDevice, type DeviceInfo } from "@/lib/device";

const ANDROID_APP_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? "";

let cached: DeviceInfo | null = null;
const getDevice = () => (cached ??= detectDevice());
const subscribe = () => () => {};

const btn =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold transition-colors";
const primary = `${btn} bg-brand text-white active:bg-brand-dark`;
const secondary = `${btn} border-2 border-gray-300 bg-white text-gray-900 active:bg-gray-100`;

export function Landing() {
  // null on the server / first paint, real value in the browser.
  const device = useSyncExternalStore(subscribe, getDevice, () => null);

  // Installed app: skip the landing page. /login forwards logged-in users to their dashboard.
  useEffect(() => {
    if (device?.standalone) window.location.replace("/login");
  }, [device]);

  if (!device || device.standalone) {
    return (
      <div className="flex justify-center py-6">
        <Spinner className="h-8 w-8 text-brand" />
      </div>
    );
  }

  if (device.platform === "android") return <AndroidActions inApp={device.inAppBrowser} />;
  if (device.platform === "ios") return <IosActions inApp={device.inAppBrowser} />;
  return (
    <div className="flex flex-col gap-3">
      <Link href="/login" className={primary}>
        Log in
      </Link>
      <Link href="/register" className={secondary}>
        Register (new member)
      </Link>
      <p className="mt-2 text-center text-base text-gray-500">
        On your phone? Open this page there to get the app.
      </p>
    </div>
  );
}

function ContinueOnWeb() {
  return (
    <div className="flex flex-col gap-2">
      <Link href="/login" className={secondary}>
        Continue on web
      </Link>
      <p className="text-center text-base text-gray-600">
        New member?{" "}
        <Link href="/register" className="font-semibold text-brand underline">
          Register here
        </Link>
      </p>
    </div>
  );
}

function AndroidActions({ inApp }: { inApp: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {ANDROID_APP_URL && (
        <>
          <a href={ANDROID_APP_URL} download className={primary}>
            ⬇️ Download the app
          </a>
          {inApp && <OpenInBrowserNote browser="Chrome" />}
          <details className="rounded-2xl bg-gray-50 p-4 text-base">
            <summary className="cursor-pointer font-semibold">How to install</summary>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-gray-700">
              <li>Tap <strong>Download the app</strong>.</li>
              <li>When it&apos;s done, tap <strong>Open</strong> (or find it in your Downloads).</li>
              <li>
                If your phone asks, tap <strong>Settings</strong> and turn on <strong>Allow from this source</strong>,
                then go back.
              </li>
              <li>Tap <strong>Install</strong>.</li>
              <li>
                If a <strong>Play Protect</strong> message appears, tap <strong>More details</strong> then{" "}
                <strong>Install anyway</strong>. Then open the app and log in.
              </li>
            </ol>
          </details>
        </>
      )}
      <ContinueOnWeb />
    </div>
  );
}

function IosActions({ inApp }: { inApp: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border-2 border-gray-200 p-4">
        <h2 className="text-lg font-bold">Add to Home Screen</h2>
        <p className="text-base text-gray-600">Get an app icon on your iPhone, no App Store needed:</p>
        {inApp && <OpenInBrowserNote browser="Safari" />}
        <ol className="flex flex-col gap-3 text-base">
          <li className="flex items-center gap-3">
            <Step n={1} />
            <span>
              Tap the <strong>Share</strong> button <ShareIcon /> at the bottom of Safari.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong> <AddIcon />
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            <span>
              Tap <strong>Add</strong>. Open the new icon on your Home Screen.
            </span>
          </li>
        </ol>
      </section>
      <ContinueOnWeb />
    </div>
  );
}

function OpenInBrowserNote({ browser }: { browser: string }) {
  return (
    <p className="rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-3 text-base text-yellow-900">
      You opened this inside another app (like Messenger). If it doesn&apos;t work, tap <strong>⋯</strong> and choose{" "}
      <strong>Open in {browser}</strong>.
    </p>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
      {n}
    </span>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-label="Share"
      viewBox="0 0 24 24"
      className="inline h-6 w-6 align-text-bottom text-blue-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="inline h-6 w-6 align-text-bottom text-gray-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
