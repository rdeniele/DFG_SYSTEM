import type { ReactNode } from "react";
import { AdminNav, AdminTopBar } from "./AdminNav";

/** All front desk pages share the phone top bar (logo + ☰) and bottom bar (Attendance · Walk-in · QR). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="has-bottom-nav flex flex-1 flex-col pb-[var(--bottom-nav)]">
      <AdminTopBar />
      {children}
      <AdminNav />
    </div>
  );
}
