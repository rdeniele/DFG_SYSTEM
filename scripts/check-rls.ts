/**
 * Checks the security rules on your REAL Supabase project, using only the public anon key
 * (exactly what a phone has). Run after `npm run seed`:
 *
 *   npm run check:rls
 *
 * Logs in as seeded member 09170000004 (PIN 111111) and admin 09990000000 (PIN 123456).
 * It only reads, plus a few writes that MUST be rejected. Nothing is changed.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { phoneToAuthEmail } from "../lib/phone";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!url || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const MEMBER = { phone: "09170000004", pin: "111111" };
const ADMIN = { phone: "09990000000", pin: "123456" };

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
};

const client = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function login(phone: string, pin: string): Promise<[SupabaseClient, string]> {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email: phoneToAuthEmail(phone), password: pin });
  if (error) throw new Error(`Login ${phone} failed: ${error.message}. Did you run npm run seed?`);
  return [c, data.user.id];
}

async function main() {
  // Logged out
  const anonClient = client();
  const a1 = await anonClient.from("profiles").select("id");
  check("logged-out: cannot read profiles", !!a1.error || (a1.data ?? []).length === 0);
  const a2 = await anonClient.from("member_status").select("id");
  check("logged-out: cannot read member_status", !!a2.error || (a2.data ?? []).length === 0);
  const a3 = await anonClient.from("walk_ins").select("id");
  check("logged-out: cannot read walk_ins", !!a3.error || (a3.data ?? []).length === 0);

  const wrong = await client().auth.signInWithPassword({ email: phoneToAuthEmail(MEMBER.phone), password: "000000" });
  check("wrong PIN is rejected", !!wrong.error);

  // Member
  const [m, memberId] = await login(MEMBER.phone, MEMBER.pin);
  const p = await m.from("profiles").select("id");
  check("member: sees only own profile", p.data?.length === 1 && p.data[0].id === memberId, `${p.data?.length} rows`);
  const s = await m.from("member_status").select("id");
  check("member: member_status shows only self", s.data?.length === 1, `${s.data?.length} rows`);
  const ms = await m.from("memberships").select("profile_id");
  check("member: sees only own memberships", (ms.data ?? []).every((r) => r.profile_id === memberId));
  const w = await m.from("walk_ins").select("id");
  check("member: cannot see walk-ins", (w.data ?? []).length === 0);

  const role = await m.from("profiles").update({ role: "admin" }).eq("id", memberId).select();
  check("member: cannot make self admin", !!role.error || role.data?.[0]?.role !== "admin");
  const act = await m.from("profiles").update({ is_active: false }).eq("id", memberId).select();
  check("member: cannot change is_active", !!act.error);
  const ph = await m.from("profiles").update({ phone: "09171112222" }).eq("id", memberId).select();
  check("member: cannot change own phone", !!ph.error);
  const ins = await m
    .from("memberships")
    .insert({ profile_id: memberId, plan: "monthly", start_date: "2026-01-01", end_date: "2030-01-01" })
    .select();
  check("member: cannot give self a membership", !!ins.error);
  const isAdmin = await m.rpc("is_admin");
  check("member: is_admin() is false", isAdmin.data === false);
  const up = await m.storage.from("avatars").upload(`${crypto.randomUUID()}/x.jpg`, new Blob(["x"], { type: "image/jpeg" }));
  check("member: cannot upload into another user's photo folder", !!up.error);

  const qr = await m.from("gym_settings").select("checkin_token");
  check("member: cannot read the clock-in QR code", (qr.data ?? []).length === 0);
  const att = await m.from("attendance").insert({ profile_id: memberId }).select();
  check("member: cannot add attendance without scanning", !!att.error);
  const rot = await m.rpc("rotate_checkin_token");
  check("member: cannot make a new QR code", !!rot.error);
  const bad = await m.rpc("clock_scan", { p_token: "not-the-code" });
  check("member: wrong QR code is rejected", bad.data?.result === "bad_code");
  const anonScan = await anonClient.rpc("clock_scan", { p_token: "x" });
  check("logged-out: cannot scan", !!anonScan.error);

  // Admin
  const [ad] = await login(ADMIN.phone, ADMIN.pin);
  const all = await ad.from("member_status").select("id, status").eq("role", "member");
  check("admin: sees all members", (all.data?.length ?? 0) > 1, `${all.data?.length} members`);
  const wa = await ad.from("walk_ins").select("id");
  check("admin: can read walk-ins", !wa.error);
  // The seeded admin is a co-admin: desk work yes, changing access no.
  const { data: someMember } = await ad.from("profiles").select("id").eq("phone", MEMBER.phone).single();
  const give = await ad.rpc("set_member_role", { p_profile: someMember!.id, p_role: "admin" });
  check("co-admin: cannot give front desk access", !!give.error);
  const direct = await ad.from("profiles").update({ role: "owner" }).eq("id", someMember!.id).select();
  check("co-admin: cannot change roles by direct update", !!direct.error);
  const { data: top } = await ad.from("profiles").select("id").in("role", ["owner", "superadmin"]).limit(1);
  if (top?.[0]) {
    const cm = await ad.rpc("can_manage", { p_profile: top[0].id });
    check("co-admin: cannot manage owner/super admin (no PIN reset)", cm.data === false);
    const off = await ad.from("profiles").update({ is_active: false }).eq("id", top[0].id).select();
    check("co-admin: cannot turn off owner/super admin", !!off.error);
  }

  const tok = await ad.from("gym_settings").select("checkin_token").single();
  check("admin: can read the clock-in QR code", !!tok.data?.checkin_token);
  const adm = await ad.rpc("is_admin");
  check("admin: is_admin() is true", adm.data === true);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll security checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
