"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, ErrorBox, Field, PhoneInput, PinInput, TextInput } from "@/components/ui";
import { uploadAvatar } from "@/lib/avatar";
import { friendlyError } from "@/lib/errors";
import { isValidPin, normalizePhone, phoneToAuthEmail } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "account" | "photo">("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const fullName = name.trim().replace(/\s+/g, " ");
    const normalized = normalizePhone(phone);
    if (fullName.length < 2) return setError("Please enter your full name.");
    if (!normalized) return setError("Please enter a valid mobile number, like 0917 123 4567.");
    if (!isValidPin(pin)) return setError("Your PIN must be exactly 6 numbers.");
    if (pin !== pin2) return setError("The two PINs don't match. Please type them again.");

    const supabase = createClient();
    setBusy("account");
    try {
      // 1) Server creates the account (already confirmed, so Supabase's
      //    "Confirm email" setting doesn't matter).
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone: normalized, pin }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setBusy("");
        return setError(body.error ?? "We couldn't create your account. Please try again.");
      }

      // 2) Log in with phone + PIN as usual.
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: phoneToAuthEmail(normalized),
        password: pin,
      });
      if (signInError || !data.user) throw new Error("no-session");

      if (photo) {
        setBusy("photo");
        try {
          await uploadAvatar(supabase, data.user.id, photo);
        } catch {
          // Photo is optional; the front desk can add it later.
        }
      }

      // Clear the form: Next.js may keep this page alive after we leave it.
      setName("");
      setPhone("");
      setPin("");
      setPin2("");
      setPhoto(null);
      setBusy("");
      router.replace("/me");
      router.refresh();
    } catch (err) {
      setBusy("");
      if ((err as Error).message === "no-session") {
        setError("Your account was created but we couldn't log you in. Please go to Log in.");
      } else {
        setError(friendlyError(err, "We couldn't create your account. Please try again."));
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <p className="text-base text-gray-600">New and old members: register once, then check your membership anytime.</p>

      <Field label="Full name" htmlFor="name">
        <TextInput
          id="name"
          autoComplete="name"
          autoCapitalize="words"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Juan Dela Cruz"
        />
      </Field>

      <Field label="Mobile number" htmlFor="phone" hint="You will use this to log in.">
        <PhoneInput id="phone" value={phone} onChange={setPhone} />
      </Field>

      <Field label="Create a 6-digit PIN" htmlFor="pin" hint="Easy for you to remember, hard for others to guess.">
        <PinInput id="pin" value={pin} onChange={setPin} autoComplete="new-password" />
      </Field>

      <Field label="Type your PIN again" htmlFor="pin2">
        <PinInput id="pin2" value={pin2} onChange={setPin2} autoComplete="new-password" />
      </Field>

      <Field label="Your photo (optional)" htmlFor="photo" hint="Helps the front desk recognize you.">
        <PhotoPicker file={photo} onChange={setPhoto} name={name} />
      </Field>

      <ErrorBox>{error}</ErrorBox>

      <Button type="submit" loading={!!busy}>
        {busy === "photo" ? "Saving photo…" : busy === "account" ? "Creating account…" : "Register"}
      </Button>

      <p className="text-center text-base text-gray-600">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-brand underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
