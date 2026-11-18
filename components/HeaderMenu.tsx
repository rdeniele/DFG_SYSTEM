"use client";

import { List, SignOut, X, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "./LogoutButton";
import { Spinner } from "./ui";

export interface MenuLink {
  href: string;
  icon: Icon;
  label: string;
}

/** ☰ menu for the black top bar. Always ends with Log out. */
export function HeaderMenu({ links }: { links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu"
        className="flex h-12 w-12 items-center justify-center rounded-xl text-white active:bg-white/10"
      >
        {open ? <X size={28} weight="bold" aria-hidden /> : <List size={28} weight="bold" aria-hidden />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-xl"
        >
          {links.map(({ href, icon: IconCmp, label }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center gap-3 border-b border-gray-100 px-4 text-base font-semibold active:bg-gray-100"
            >
              <IconCmp size={24} weight="bold" aria-hidden /> {label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await logout();
            }}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-base font-semibold text-red-700 active:bg-red-50"
          >
            {busy ? <Spinner className="h-5 w-5" /> : <SignOut size={24} weight="bold" aria-hidden />} Log out
          </button>
        </div>
      )}
    </div>
  );
}
