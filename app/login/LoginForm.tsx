"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, PhoneInput, PinInput } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { isValidPin, normalizePhone, phoneToAuthEmail } from "@/lib/phone";
import { isStaff } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = normalizePhone(phone);
    if (!normalized) return setError("Please enter a valid mobile number, like 0917 123 4567.");
    if (!isValidPin(pin)) return setError("Your PIN is 6 numbers.");

    const supabase = createClient();
    setBusy(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: phoneToAuthEmail(normalized),
        password: pin,
      });
      if (signInError) throw signInError;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .single();
      if (profileError) throw profileError;

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setBusy(false);
        return setError("Your account is turned off. Please talk to the front desk.");
      }

      // Don't leave the PIN in memory: Next.js may keep this page alive after we leave it.
      setPin("");
      setBusy(false);
      // Came from a scanned QR? Continue to the clock-in page.
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/checkin") ? next : null;
      router.replace(safeNext ?? (isStaff(profile.role) ? "/admin" : "/me"));
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(friendlyError(err, "We couldn't log you in. Please try again."));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field label="Mobile number" htmlFor="phone">
        <PhoneInput id="phone" value={phone} onChange={setPhone} autoFocus />
      </Field>

      <Field label="6-digit PIN" htmlFor="pin">
        <PinInput id="pin" value={pin} onChange={setPin} />
      </Field>

      <ErrorBox>{error}</ErrorBox>

      <Button type="submit" loading={busy}>
        {busy ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-center text-base text-gray-600">Forgot your PIN? Ask the front desk.</p>

      <p className="text-center text-base text-gray-600">
        New here?{" "}
        <Link href="/register" className="font-semibold text-brand underline">
          Register
        </Link>
      </p>
    </form>
  );
}
