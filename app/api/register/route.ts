import { NextResponse } from "next/server";
import { isValidPin, normalizePhone, phoneToAuthEmail } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creates a member account on the server, already confirmed, so registration works
 * whether or not "Confirm email" is turned on in Supabase. The browser then logs in
 * with phone + PIN as usual. The sign-up trigger always makes the role 'member'.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { fullName?: string; phone?: string; pin?: string }
    | null;

  const fullName = body?.fullName?.trim().replace(/\s+/g, " ") ?? "";
  const phone = normalizePhone(body?.phone ?? "");
  const pin = body?.pin ?? "";

  if (fullName.length < 2 || fullName.length > 80) {
    return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Please enter a valid mobile number, like 0917 123 4567." }, { status: 400 });
  }
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "Your PIN must be exactly 6 numbers." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Registration isn't set up yet (missing SUPABASE_SERVICE_ROLE_KEY on the server)." },
      { status: 500 },
    );
  }

  const { error } = await admin.auth.admin.createUser({
    email: phoneToAuthEmail(phone),
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || error.status === 422) {
      return NextResponse.json(
        { error: "This phone number is already registered. Please log in instead." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "We couldn't create your account. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}
