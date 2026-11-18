"use client";

import { StatusDot } from "@/components/Status";
import { Avatar } from "@/components/ui";
import { matchesSearch, sortByStatus, type MemberRow } from "@/lib/admin-data";
import { formatDate } from "@/lib/dates";
import { STATUS_META, type MemberStatus } from "@/lib/status";

export type Filter = "all" | MemberStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "expiring", label: "Expiring" },
  { key: "expired", label: "Expired" },
  { key: "active", label: "Active" },
];

export function MemberList({
  members,
  search,
  onSearch,
  filter,
  onFilter,
  selectedId,
  onSelect,
}: {
  members: MemberRow[];
  search: string;
  onSearch: (s: string) => void;
  filter: Filter;
  onFilter: (f: Filter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = members.filter((m) => m.is_active);
  const counts = active.reduce<Record<MemberStatus, number>>(
    (acc, m) => ((acc[m.info.status] += 1), acc),
    { pending: 0, active: 0, expiring: 0, expired: 0 },
  );
  const found = active.filter((m) => matchesSearch(m, search));
  const pending = found.filter((m) => m.info.status === "pending"); // already newest first
  const others = found.filter((m) => m.info.status !== "pending").sort(sortByStatus);
  const inactive = members.filter((m) => !m.is_active && matchesSearch(m, search));

  const row = (m: MemberRow) => (
    <li key={m.id}>
      <button
        type="button"
        onClick={() => onSelect(m.id)}
        aria-current={selectedId === m.id}
        className={`flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-gray-100 ${
          selectedId === m.id ? "bg-red-50" : ""
        }`}
      >
        <Avatar src={m.photo_url} name={m.full_name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{m.full_name}</p>
          <p className="flex items-center gap-1.5 text-sm text-gray-600">
            <StatusDot status={m.info.status} />
            <span className={STATUS_META[m.info.status].text}>{STATUS_META[m.info.status].label}</span>
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          {m.end_date ? (
            <>
              <p className="text-gray-500">{m.info.status === "expired" ? "ended" : "until"}</p>
              <p className="font-semibold">{formatDate(m.end_date)}</p>
            </>
          ) : (
            <p className="text-gray-500">new</p>
          )}
        </div>
      </button>
    </li>
  );

  const section = (title: string, items: MemberRow[], badge?: number, empty?: string) => (
    <section>
      <h2 className="sticky top-0 z-10 flex items-center gap-2 border-y border-gray-200 bg-gray-50 px-4 py-2 text-sm font-bold uppercase tracking-wide text-gray-600">
        {title}
        {badge !== undefined && badge > 0 && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{badge}</span>
        )}
      </h2>
      {items.length ? (
        <ul className="divide-y divide-gray-100">{items.map(row)}</ul>
      ) : (
        <p className="px-4 py-4 text-base text-gray-500">{empty ?? "No members here."}</p>
      )}
    </section>
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 pb-3 pt-3">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="🔍 Search name or phone"
          aria-label="Search name or phone"
          className="min-h-12 w-full rounded-2xl border-2 border-gray-300 px-4 text-lg focus:border-brand focus:outline-none"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? active.length : counts[f.key];
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onFilter(f.key)}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-base font-semibold ${
                  on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800"
                }`}
              >
                {f.key !== "all" && <StatusDot status={f.key} />}
                {f.label}
                <span className={on ? "text-gray-300" : "text-gray-500"}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filter === "all" ? (
        <>
          {section("New registrations", pending, pending.length, "No new registrations.")}
          {section("All members", others)}
          {inactive.length > 0 && (
            <details className="border-t border-gray-200">
              <summary className="min-h-12 cursor-pointer px-4 py-3 text-base font-semibold text-gray-600">
                Turned off ({inactive.length})
              </summary>
              <ul className="divide-y divide-gray-100 opacity-70">{inactive.map(row)}</ul>
            </details>
          )}
        </>
      ) : filter === "pending" ? (
        section("New registrations", pending, pending.length, "No new registrations.")
      ) : (
        section(
          STATUS_META[filter].label,
          others.filter((m) => m.info.status === filter),
          undefined,
          search ? "No match." : "No members here.",
        )
      )}
    </div>
  );
}
