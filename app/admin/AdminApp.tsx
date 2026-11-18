"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorBox, Spinner } from "@/components/ui";
import { fetchMembers, type MemberRow } from "@/lib/admin-data";
import { friendlyError } from "@/lib/errors";
import { THEME } from "@/lib/theme";
import { MemberList, type Filter } from "./MemberList";
import { MemberProfile } from "./MemberProfile";
import { WalkInSheet } from "./WalkInSheet";

/**
 * Admin home. Phone: list OR profile (full screen). Tablet/PC (md+): list left, profile right.
 * The selected member lives in the URL (?m=<id>) so the phone's Back button works.
 */
export default function AdminApp() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("m");

  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const closeWalkIn = useCallback(() => setWalkInOpen(false), []);

  const load = useCallback(async () => {
    try {
      setMembers(await fetchMembers());
      setError("");
    } catch (err) {
      setError(friendlyError(err, "Couldn't load members."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [load]);

  const select = (id: string) => {
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const url = `${pathname}?m=${id}`;
    // On a phone, push so Back returns to the list. On a wide screen, just swap.
    if (wide || selectedId) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace(pathname);
  };

  const selected = members?.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-black text-white">
            {THEME.shortName}
          </span>
          <span className="hidden text-lg font-bold sm:inline">Front desk</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/summary"
            className="flex min-h-12 items-center rounded-xl border-2 border-gray-300 px-3 text-base font-semibold active:bg-gray-100"
          >
            📊 Summary
          </Link>
          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="flex min-h-12 items-center rounded-xl bg-brand px-4 text-base font-bold text-white active:bg-brand-dark"
          >
            + Walk-in
          </button>
        </div>
      </header>
      {walkInOpen && <WalkInSheet onClose={closeWalkIn} />}

      {members === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          {error ? (
            <>
              <ErrorBox>{error}</ErrorBox>
              <Button onClick={load} className="max-w-xs">
                Try again
              </Button>
            </>
          ) : (
            <>
              <Spinner className="h-10 w-10 text-brand" />
              <p className="text-lg text-gray-600">Loading members…</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* List: always on md+, only when nothing is selected on phones */}
          <div
            className={`min-h-0 w-full overflow-y-auto md:block md:w-[380px] md:shrink-0 md:border-r md:border-gray-200 lg:w-[420px] ${
              selected ? "hidden" : "block"
            }`}
          >
            {error && (
              <div className="p-3">
                <ErrorBox>{error}</ErrorBox>
              </div>
            )}
            <MemberList
              members={members}
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
              selectedId={selectedId}
              onSelect={select}
            />
          </div>

          {/* Profile */}
          <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "block" : "hidden md:block"}`}>
            {selected ? (
              <div className="mx-auto max-w-2xl">
                <MemberProfile key={selected.id} member={selected} onChanged={load} onBack={back} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center text-lg text-gray-500">
                {selectedId ? "Member not found." : "Tap a member on the left to see their profile."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
