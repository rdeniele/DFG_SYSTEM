"use client";

import { CheckCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, Spinner, TextInput } from "@/components/ui";
import { fetchWalkInsSince, sumAmounts } from "@/lib/admin-data";
import { formatTime, todayManila } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatPeso, WALK_IN_PRICE } from "@/lib/plans";
import { createClient } from "@/lib/supabase/client";
import type { WalkIn } from "@/lib/types";

/** Full-screen sheet: add a walk-in (name + amount) and see today's walk-ins. */
export function WalkInSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(WALK_IN_PRICE ? String(WALK_IN_PRICE) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [today, setToday] = useState<WalkIn[] | null>(null);
  const [listError, setListError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setToday(await fetchWalkInsSince(todayManila()));
      setListError("");
    } catch (err) {
      setListError(friendlyError(err, "Couldn't load today's walk-ins."));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on open
    void load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, " ");
    const amt = Number(amount);
    if (!n) return setError("Please enter the name.");
    if (amount.trim() === "" || !Number.isFinite(amt) || amt < 0) return setError("Please enter the amount paid.");
    setSaving(true);
    setError("");
    setSaved("");
    const { error: dbError } = await createClient().from("walk_ins").insert({ name: n, amount: amt });
    setSaving(false);
    if (dbError) return setError(friendlyError(dbError, "Couldn't save. Please try again."));
    setSaved(`Saved: ${n} · ${formatPeso(amt)}`);
    setName("");
    setAmount(WALK_IN_PRICE ? String(WALK_IN_PRICE) : "");
    nameRef.current?.focus();
    await load();
  }

  async function remove(w: WalkIn) {
    if (!window.confirm(`Remove walk-in "${w.name}" (${formatPeso(w.amount)})?`)) return;
    const { error: dbError } = await createClient().from("walk_ins").delete().eq("id", w.id);
    if (dbError) return setListError(friendlyError(dbError, "Couldn't remove. Please try again."));
    await load();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkin-title"
      className="fixed inset-0 z-50 flex justify-center bg-black/40 md:items-center md:p-6"
    >
      <div className="flex h-full w-full flex-col overflow-y-auto bg-white md:h-auto md:max-h-[90dvh] md:max-w-lg md:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <h2 id="walkin-title" className="text-xl font-bold">
            Walk-in
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-12 items-center gap-1.5 rounded-xl px-4 text-lg font-semibold text-gray-700 active:bg-gray-100"
          >
            <X size={22} weight="bold" aria-hidden /> Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
          <Field label="Name" htmlFor="walkin-name">
            <TextInput
              id="walkin-name"
              ref={nameRef}
              autoFocus
              autoCapitalize="words"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name of walk-in"
            />
          </Field>
          <Field label="Amount paid (₱)" htmlFor="walkin-amount">
            <TextInput
              id="walkin-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
            />
          </Field>
          <ErrorBox>{error}</ErrorBox>
          {saved && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-green-100 p-3 text-base font-semibold text-green-900">
              <CheckCircle size={22} weight="fill" aria-hidden className="shrink-0" /> {saved}
            </p>
          )}
          <Button type="submit" loading={saving}>
            {saving ? "Saving…" : "Save walk-in"}
          </Button>
        </form>

        <section className="flex flex-col gap-2 border-t border-gray-200 p-4">
          <h3 className="flex items-baseline justify-between text-lg font-bold">
            <span>Today&apos;s walk-ins</span>
            {today && (
              <span className="text-base font-semibold text-gray-700">
                {today.length} · {formatPeso(sumAmounts(today))}
              </span>
            )}
          </h3>
          <ErrorBox>{listError}</ErrorBox>
          {today === null && !listError ? (
            <Spinner className="h-6 w-6 text-brand" />
          ) : today?.length === 0 ? (
            <p className="text-base text-gray-500">No walk-ins yet today.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
              {today?.map((w) => (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{w.name}</p>
                    <p className="text-sm text-gray-500">{formatTime(w.created_at)}</p>
                  </div>
                  <p className="font-semibold">{formatPeso(w.amount)}</p>
                  <button
                    type="button"
                    onClick={() => remove(w)}
                    aria-label={`Remove ${w.name}`}
                    className="min-h-11 rounded-xl px-3 text-sm text-gray-500 underline active:bg-gray-100"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
