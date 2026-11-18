"use client";

import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";

export interface NavItem {
  key: string;
  label: string;
  icon: Icon;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** The big round button in the middle (Walk-in, Scan). */
  center?: boolean;
  danger?: boolean;
}

/**
 * Social-app style tab bar, fixed to the bottom on phones (hidden from md up).
 * Pages inside a `.has-bottom-nav` wrapper get the right bottom space via --bottom-nav.
 */
export function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {items.map((it) => (
          <li key={it.key} className="flex flex-1 justify-center">
            <NavButton item={it} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavButton({ item }: { item: NavItem }) {
  const { label, icon: IconCmp, active, center, danger } = item;

  const inner = center ? (
    <>
      <span className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-brand text-white shadow-lg group-active:bg-brand-dark">
        <IconCmp size={30} weight="bold" aria-hidden />
      </span>
      <span className="text-xs font-bold text-gray-900">{label}</span>
    </>
  ) : (
    <>
      <IconCmp size={26} weight={active ? "fill" : "regular"} aria-hidden />
      <span className={`text-xs ${active ? "font-bold" : "font-medium"}`}>{label}</span>
      {active && <span aria-hidden className="absolute top-0 h-1 w-8 rounded-b-full bg-brand" />}
    </>
  );

  const cls = `group relative flex min-w-16 flex-col items-center justify-center gap-0.5 px-1 ${
    danger ? "text-red-700" : active ? "text-ink" : "text-gray-500"
  } active:bg-gray-50`;

  return item.href ? (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={item.onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Bottom sheet used by the "More" tab. */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="no-print fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-2xl">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" aria-hidden />
        <p className="px-5 pb-1 pt-3 text-sm font-bold uppercase tracking-wide text-gray-500">{title}</p>
        {children}
      </div>
    </div>
  );
}
