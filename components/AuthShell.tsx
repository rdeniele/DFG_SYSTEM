import Link from "next/link";
import type { ReactNode } from "react";
import { THEME } from "@/lib/theme";

/** Simple centered page for login/register. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
      <Link href="/" className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-black text-white">
          {THEME.shortName}
        </span>
        <span className="text-xl font-bold">{THEME.gymName}</span>
      </Link>
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
