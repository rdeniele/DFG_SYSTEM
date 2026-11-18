"use client";

import { CalendarCheck, ChartBar, Plus, QrCode, ShieldCheck, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { HeaderMenu } from "@/components/HeaderMenu";
import { Logo } from "@/components/Logo";
import { WalkInSheet } from "./WalkInSheet";

/** Phone top bar for every front desk page: logo (→ home) · title · ☰ menu. */
export function AdminTopBar() {
  return (
    <header className="no-print sticky top-0 z-30 flex h-[var(--top-nav)] items-center justify-between gap-3 bg-ink px-3 md:hidden">
      <Link href="/" className="flex min-w-0 items-center gap-2 rounded-xl pr-2 active:bg-white/10" aria-label="Home">
        <Logo size={42} />
        <span className="truncate text-lg font-bold text-white">Front desk</span>
      </Link>
      <HeaderMenu
        links={[
          { href: "/admin/summary", icon: ChartBar, label: "Summary" },
          { href: "/admin/team", icon: ShieldCheck, label: "Team & access" },
          { href: "/me", icon: UserCircle, label: "My membership & clock in" },
        ]}
      />
    </header>
  );
}

/** Phone bottom bar: Attendance · (+ Walk-in) · QR */
export function AdminNav() {
  const path = usePathname();
  const [walkIn, setWalkIn] = useState(false);
  const closeWalkIn = useCallback(() => setWalkIn(false), []);

  return (
    <>
      <BottomNav
        label="Front desk"
        items={[
          {
            key: "attendance",
            label: "Attendance",
            icon: CalendarCheck,
            href: "/admin/attendance",
            active: path.startsWith("/admin/attendance"),
          },
          { key: "walkin", label: "Walk-in", icon: Plus, center: true, onClick: () => setWalkIn(true) },
          { key: "qr", label: "QR", icon: QrCode, href: "/admin/qr", active: path.startsWith("/admin/qr") },
        ]}
      />
      {walkIn && <WalkInSheet onClose={closeWalkIn} />}
    </>
  );
}
