"use client";

import { ArrowLeft, CalendarBlank, CheckCircle, Key, PencilSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { StatusBadge } from "@/components/Status";
import { Avatar, Button, ErrorBox, Field, PhoneInput, PinInput, Spinner, TextInput } from "@/components/ui";
import { fetchHistory, type MemberRow } from "@/lib/admin-data";
import { uploadAvatar } from "@/lib/avatar";
import { addDays, formatDate, manilaDateOf, todayManila } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatPhone, isValidPin, normalizePhone } from "@/lib/phone";
import { formatPeso, PLAN_KEYS, PLANS, planLabel, type MembershipPlan, type PlanKey } from "@/lib/plans";
import { computeRenewal, describeStatus } from "@/lib/status";
import { RoleControl } from "@/components/RoleControl";
import { canManage, ROLE_LABEL, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Membership } from "@/lib/types";

type Choice = PlanKey | "manual" | null;

/** Start/end for the chosen option, following the renewal rule. */
function computeNew(choice: Choice, manualEnd: string, member: MemberRow, today: string) {
  if (!choice) return null;
  if (choice !== "manual") return computeRenewal(choice, member.end_date, today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manualEnd)) return null;
  const stillActive = member.info.status === "active" || member.info.status === "expiring";
  const startDate =
    stillActive && member.end_date && manualEnd > member.end_date
      ? addDays(member.end_date, 1)
      : manualEnd < today
        ? manualEnd
        : today;
  return { startDate, endDate: manualEnd };
}

export function MemberProfile({
  member,
  myRole,
  myId,
  onChanged,
  onBack,
}: {
  member: MemberRow;
  myRole: Role | null;
  myId: string | null;
  onChanged: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<Membership[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [mode, setMode] = useState<"view" | "edit" | "pin">("view");
  const router = useRouter();
  const isMe = member.id === myId;
  const manageable = !isMe && canManage(myRole, member.role);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchHistory(member.id));
      setHistoryError("");
    } catch (err) {
      setHistoryError(friendlyError(err, "Couldn't load history."));
    }
  }, [member.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount / member change
    void loadHistory();
  }, [loadHistory]);

  const afterSave = async () => {
    await Promise.all([onChanged(), loadHistory()]);
  };

  return (
    <div className="flex flex-col gap-5 p-4 pb-10 md:p-6">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-12 items-center gap-2 self-start rounded-xl pr-3 text-lg font-semibold text-gray-700 active:bg-gray-100 md:hidden"
      >
        <ArrowLeft size={22} weight="bold" aria-hidden /> Back to list
      </button>

      <header className="flex items-center gap-4">
        <Avatar src={member.photo_url} name={member.full_name} size={88} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold">{member.full_name}</h2>
          <p className="text-lg text-gray-600">{formatPhone(member.phone)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={member.info.status} />
            {!member.is_active && (
              <span className="rounded-full bg-gray-800 px-3 py-1 text-sm font-semibold text-white">TURNED OFF</span>
            )}
          </div>
        </div>
      </header>

      <div className="rounded-2xl bg-gray-50 p-4 text-base">
        <p className="font-semibold">{describeStatus(member.info)}</p>
        <p className="text-gray-600">
          Plan: {planLabel(member.current_plan)} · End date: {formatDate(member.end_date)}
        </p>
      </div>

      {mode === "view" && member.is_active && <RenewBox member={member} onSaved={afterSave} />}

      {mode === "edit" && (
        <EditBox
          member={member}
          onDone={async (changed) => {
            setMode("view");
            if (changed) await onChanged();
          }}
        />
      )}
      {mode === "pin" && <PinBox member={member} onDone={() => setMode("view")} />}

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-bold">History</h3>
        {historyError && <ErrorBox>{historyError}</ErrorBox>}
        {history === null && !historyError ? (
          <Spinner className="h-6 w-6 text-brand" />
        ) : history && history.length === 0 ? (
          <p className="text-base text-gray-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200">
            {history?.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-base">
                <div>
                  <p className="font-semibold">
                    {planLabel(h.plan)} · {formatPeso(h.amount)}
                  </p>
                  <p className="text-sm text-gray-500">Paid {formatDate(manilaDateOf(h.created_at))}</p>
                </div>
                <p className="text-right text-sm text-gray-600">
                  {formatDate(h.start_date)} →
                  <br />
                  <span className="text-base font-semibold text-gray-900">{formatDate(h.end_date)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === "view" && (
        <section className="flex flex-col gap-3 border-t border-gray-200 pt-5">
          {(isMe || manageable) && (
            <Button variant="secondary" onClick={() => setMode("edit")}>
              <PencilSimple size={22} weight="bold" aria-hidden /> Edit name, phone, photo
            </Button>
          )}
          {manageable && (
            <>
              <Button variant="secondary" onClick={() => setMode("pin")}>
                <Key size={22} weight="bold" aria-hidden /> Reset PIN
              </Button>
              <ActiveToggle member={member} onChanged={onChanged} />
            </>
          )}
          {!isMe && !manageable && (
            <p className="text-center text-sm text-gray-500">
              {ROLE_LABEL[member.role]} account: only someone above them can edit it (see Team).
            </p>
          )}
        </section>
      )}

      {mode === "view" && member.is_active && (
        <RoleControl
          target={member}
          myRole={myRole}
          onChanged={async () => {
            // They're staff now, so they leave the member list: show them on the Team page.
            router.push("/admin/team");
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RenewBox({ member, onSaved }: { member: MemberRow; onSaved: () => Promise<void> }) {
  const today = todayManila();
  const [choice, setChoice] = useState<Choice>(null);
  const [manualEnd, setManualEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const result = computeNew(choice, manualEnd, member, today);

  const pick = (c: Choice) => {
    setChoice(c);
    setError("");
    setDone("");
    if (c && c !== "manual") setAmount(PLANS[c].price ? String(PLANS[c].price) : "");
    if (c === "manual") setAmount("");
  };

  async function save() {
    if (!choice || !result) return;
    const amt = amount.trim() === "" ? null : Number(amount);
    if (amt !== null && (!Number.isFinite(amt) || amt < 0)) return setError("Amount must be a number.");
    setSaving(true);
    setError("");
    const { error: dbError } = await createClient()
      .from("memberships")
      .insert({
        profile_id: member.id,
        plan: choice as MembershipPlan,
        start_date: result.startDate,
        end_date: result.endDate,
        amount: amt,
      });
    if (dbError) {
      setSaving(false);
      return setError(friendlyError(dbError, "Couldn't save. Please try again."));
    }
    await onSaved();
    setSaving(false);
    setDone(`Saved. ${member.full_name.split(" ")[0]} is now good until ${formatDate(result.endDate)}.`);
    setChoice(null);
    setManualEnd("");
    setAmount("");
  }

  const stillActive = member.info.status === "active" || member.info.status === "expiring";

  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-gray-200 p-4">
      <h3 className="text-lg font-bold">Update membership</h3>
      <p className="text-sm text-gray-600">
        {stillActive
          ? `Still active: new days are added after ${formatDate(member.end_date)}.`
          : "Not active: new days start today."}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {PLAN_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pick(k)}
            aria-pressed={choice === k}
            className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 px-2 text-center ${
              choice === k ? "border-brand bg-red-50" : "border-gray-300 bg-white active:bg-gray-100"
            }`}
          >
            <span className="text-lg font-bold">{PLANS[k].label}</span>
            <span className="text-sm text-gray-600">+{PLANS[k].days} days</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => pick("manual")}
          aria-pressed={choice === "manual"}
          className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 px-2 text-center ${
            choice === "manual" ? "border-brand bg-red-50" : "border-gray-300 bg-white active:bg-gray-100"
          }`}
        >
          <span className="flex items-center gap-1.5 text-lg font-bold">
            <CalendarBlank size={22} weight="bold" aria-hidden /> Set date
          </span>
          <span className="text-sm text-gray-600">pick end date</span>
        </button>
      </div>

      {choice === "manual" && (
        <Field label="End date" htmlFor="manual-end" hint="The last day they can use the gym.">
          <TextInput id="manual-end" type="date" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
        </Field>
      )}

      {choice && (
        <Field label="Amount paid (₱, optional)" htmlFor="amount">
          <TextInput
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
          />
        </Field>
      )}

      {result && (
        <p className="rounded-2xl bg-green-50 p-4 text-center text-lg">
          New end date: <strong className="text-xl">{formatDate(result.endDate)}</strong>
        </p>
      )}

      <ErrorBox>{error}</ErrorBox>
      {done && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-green-100 p-4 text-base font-semibold text-green-900">
          <CheckCircle size={24} weight="fill" aria-hidden className="shrink-0" /> {done}
        </p>
      )}

      {choice && (
        <Button onClick={save} loading={saving} disabled={!result}>
          {saving ? "Saving…" : "Save"}
        </Button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function EditBox({ member, onDone }: { member: MemberRow; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fullName = name.trim().replace(/\s+/g, " ");
    const normalized = normalizePhone(phone);
    if (fullName.length < 2) return setError("Please enter the full name.");
    if (!normalized) return setError("Please enter a valid mobile number.");
    setSaving(true);
    setError("");
    const supabase = createClient();
    try {
      if (fullName !== member.full_name || normalized !== member.phone) {
        const { error: dbError } = await supabase
          .from("profiles")
          .update({ full_name: fullName, phone: normalized })
          .eq("id", member.id);
        if (dbError) {
          if (dbError.code === "23505") throw new Error("phone-taken");
          throw dbError;
        }
      }
      if (photo) await uploadAvatar(supabase, member.id, photo);
      onDone(true);
    } catch (err) {
      setSaving(false);
      setError(
        (err as Error).message === "phone-taken"
          ? "Another member already uses this phone number."
          : friendlyError(err, "Couldn't save changes."),
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-3xl border-2 border-gray-200 p-4" noValidate>
      <h3 className="text-lg font-bold">Edit details</h3>
      <Field label="Full name" htmlFor="edit-name">
        <TextInput id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Mobile number" htmlFor="edit-phone" hint="This is also their login. Tell them if you change it.">
        <PhoneInput id="edit-phone" value={phone} onChange={setPhone} />
      </Field>
      <Field label="Photo" htmlFor="edit-photo">
        <PhotoPicker file={photo} onChange={setPhoto} name={name} currentUrl={member.photo_url} />
      </Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={saving}>
        Save changes
      </Button>
      <Button type="button" variant="ghost" onClick={() => onDone(false)} disabled={saving}>
        Cancel
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function PinBox({ member, onDone }: { member: { id: string; full_name: string }; onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) return setError("The new PIN must be exactly 6 numbers.");
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: member.id, pin }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't change the PIN.");
      setOk(true);
    } catch (err) {
      setError(
        navigator.onLine ? (err as Error).message : friendlyError(err, "Couldn't change the PIN."),
      );
    } finally {
      setSaving(false);
    }
  }

  if (ok) {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border-2 border-green-300 bg-green-50 p-4">
        <p className="flex items-start gap-2 text-lg font-semibold text-green-900">
          <CheckCircle size={26} weight="fill" aria-hidden className="shrink-0" /> PIN changed. Tell {member.full_name.split(" ")[0]} their new PIN.
        </p>
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-3xl border-2 border-gray-200 p-4" noValidate>
      <h3 className="text-lg font-bold">Reset PIN</h3>
      <Field label="New 6-digit PIN" htmlFor="new-pin" hint="Give this to the member. They log in with it.">
        <PinInput id="new-pin" value={pin} onChange={setPin} autoComplete="off" />
      </Field>
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" loading={saving}>
        Set new PIN
      </Button>
      <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
        Cancel
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function ActiveToggle({
  member,
  onChanged,
}: {
  member: { id: string; full_name: string; is_active: boolean };
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    const turningOff = member.is_active;
    if (
      turningOff &&
      !window.confirm(`Turn off ${member.full_name}? They won't be able to log in. You can turn them back on later.`)
    )
      return;
    setBusy(true);
    setError("");
    const { error: dbError } = await createClient()
      .from("profiles")
      .update({ is_active: !member.is_active })
      .eq("id", member.id);
    if (dbError) setError(friendlyError(dbError, "Couldn't update. Please try again."));
    else await onChanged();
    setBusy(false);
  }

  return (
    <>
      <ErrorBox>{error}</ErrorBox>
      <Button variant={member.is_active ? "danger" : "primary"} onClick={toggle} loading={busy}>
        {member.is_active ? "Turn off member" : "Turn member back on"}
      </Button>
    </>
  );
}
