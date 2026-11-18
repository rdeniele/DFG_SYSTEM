import { NextResponse } from "next/server";
import { isValidPin } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Front desk sets a new PIN for a member who forgot theirs. Admins only. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { profileId?: string; pin?: string } | null;
  if (!body?.profileId || !body.pin || !isValidPin(body.pin)) {
    return NextResponse.json({ error: "The new PIN must be exactly 6 numbers." }, { status: 400 });
  }

  // Check the caller with their own session (RLS-aware), never trust the body.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "PIN reset isn't set up yet (missing SUPABASE_SERVICE_ROLE_KEY on the server)." },
      { status: 500 },
    );
  }

  const { error } = await admin.auth.admin.updateUserById(body.profileId, { password: body.pin });
  if (error) return NextResponse.json({ error: "Couldn't change the PIN. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
