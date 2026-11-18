import Link from "next/link";
import type { ReactNode } from "react";
import { THEME } from "@/lib/theme";
import { BuiltBy } from "./BuiltBy";
import { Logo } from "./Logo";

/** Simple centered page for login/register. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <header className="bg-ink">
        <Link href="/" className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
          <Logo size={44} />
          <span className="text-xl font-bold text-white">{THEME.gymName}</span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        {children}
      </main>
      <BuiltBy />
    </>
  );
}
