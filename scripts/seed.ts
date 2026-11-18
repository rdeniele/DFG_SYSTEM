/**
 * Seed sample data: 1 admin, 15 members (every status), history, and walk-ins.
 *
 *   npm run seed
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Safe to re-run: it deletes the seed accounts (by phone) first.
 * DEV/TEST ONLY. Do not run against the live gym database.
 */
import { createClient } from "@supabase/supabase-js";
import { addDays, todayManila } from "../lib/dates";
import { phoneToAuthEmail } from "../lib/phone";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const ADMIN = { name: "Front Desk Admin", phone: "09990000000", pin: "123456" };
const MEMBER_PIN = "111111";

// Sample prices only (lib/plans.ts prices are 0 until you set them).
const PRICE = { weekly: 200, half_month: 350, monthly: 600, manual: null, walk_in: 60 } as const;
type Plan = "weekly" | "half_month" | "monthly" | "manual";

const today = todayManila();
const DAYS = { weekly: 7, half_month: 15, monthly: 30 } as const;

/** A membership row that ends `endOffset` days from today. */
function period(plan: Plan, endOffset: number, manualLength = 30) {
  const len = plan === "manual" ? manualLength : DAYS[plan];
  const end = addDays(today, endOffset);
  return { plan, start_date: addDays(end, -(len - 1)), end_date: end, amount: PRICE[plan] };
}

type Seed = { name: string; phone: string; note: string; history: ReturnType<typeof period>[] };

// history is oldest -> newest; the last row is the current membership.
const MEMBERS: Seed[] = [
  { name: "Juan Dela Cruz", phone: "09170000001", note: "pending (new)", history: [] },
  { name: "Maria Santos", phone: "09170000002", note: "pending (new)", history: [] },
  { name: "Pedro Reyes", phone: "09170000003", note: "pending (new)", history: [] },
  { name: "Ana Garcia", phone: "09170000004", note: "active weekly", history: [period("weekly", 5)] },
  { name: "Jose Bautista", phone: "09170000005", note: "active half-month", history: [period("half_month", 10)] },
  {
    name: "Carmen Villanueva",
    phone: "09170000006",
    note: "active monthly + 2 past months",
    history: [period("monthly", -40), period("monthly", -10), period("monthly", 20)],
  },
  { name: "Ramon Mendoza", phone: "09170000007", note: "active monthly", history: [period("monthly", 28)] },
  {
    name: "Liza Fernandez",
    phone: "09170000008",
    note: "active, manual date (whiteboard copy)",
    history: [period("manual", 12, 20)],
  },
  { name: "Mark Aquino", phone: "09170000009", note: "expiring today (last day)", history: [period("weekly", 0)] },
  { name: "Grace Ramos", phone: "09170000010", note: "expiring in 1 day", history: [period("monthly", 1)] },
  {
    name: "Paolo Castillo",
    phone: "09170000011",
    note: "expiring in 2 days + history",
    history: [period("weekly", -5), period("half_month", 2)],
  },
  { name: "Joy Navarro", phone: "09170000012", note: "expiring in 3 days", history: [period("monthly", 3)] },
  { name: "Ben Torres", phone: "09170000013", note: "expired yesterday", history: [period("weekly", -1)] },
  {
    name: "Rosa Lim",
    phone: "09170000014",
    note: "expired 10 days ago + history",
    history: [period("monthly", -70), period("monthly", -40), period("monthly", -10)],
  },
  { name: "Carlo Diaz", phone: "09170000015", note: "expired 40 days ago", history: [period("half_month", -40)] },
];

const WALK_INS_TODAY = ["Kevin Uy", "Tina Cruz", "Alvin Sy", "Mia Tan"];

async function deleteExisting(phones: string[]) {
  const { data: profiles, error } = await db.from("profiles").select("id, phone").in("phone", phones);
  if (error) throw error;
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length) {
    await db.from("walk_ins").delete().in("created_by", ids);
  }
  for (const id of ids) {
    const { error: delErr } = await db.auth.admin.deleteUser(id);
    if (delErr) throw delErr;
  }
}

async function createUser(name: string, phone: string, pin: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: phoneToAuthEmail(phone),
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: name, phone },
  });
  if (error || !data.user) throw new Error(`Create ${phone} failed: ${error?.message}`);
  return data.user.id;
}

async function main() {
  console.log(`Seeding (today in Manila: ${today})...`);
  await deleteExisting([ADMIN.phone, ...MEMBERS.map((m) => m.phone)]);

  const adminId = await createUser(ADMIN.name, ADMIN.phone, ADMIN.pin);
  const { error: roleErr } = await db.from("profiles").update({ role: "admin" }).eq("id", adminId);
  if (roleErr) throw roleErr;

  for (const [i, m] of MEMBERS.entries()) {
    const id = await createUser(m.name, m.phone, MEMBER_PIN);
    // Stagger sign-up times so "newest first" is visible.
    const createdAt = new Date(Date.now() - (MEMBERS.length - i) * 3_600_000).toISOString();
    await db.from("profiles").update({ created_at: createdAt }).eq("id", id);

    // Insert history oldest first, with increasing created_at so the last row is "latest".
    for (const [j, h] of m.history.entries()) {
      const { error } = await db.from("memberships").insert({
        profile_id: id,
        ...h,
        created_by: adminId,
        // Paid on the start date at 9 AM Manila (never in the future).
        created_at: new Date(
          Math.min(
            new Date(`${h.start_date}T09:00:00+08:00`).getTime(),
            Date.now() - (m.history.length - j) * 60_000,
          ),
        ).toISOString(),
      });
      if (error) throw error;
    }
  }

  const walkIns = [
    ...WALK_INS_TODAY.map((name, i) => ({
      name,
      amount: PRICE.walk_in,
      created_by: adminId,
      created_at: new Date(Date.now() - i * 45 * 60_000).toISOString(),
    })),
    // one from yesterday, to check the "today" filter
    {
      name: "Yesterday Walk-in",
      amount: PRICE.walk_in,
      created_by: adminId,
      created_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    },
  ];
  const { error: wErr } = await db.from("walk_ins").insert(walkIns);
  if (wErr) throw wErr;

  console.log("\nDone. Test logins (phone / PIN):\n");
  console.log(`  ADMIN   ${ADMIN.phone} / ${ADMIN.pin}   ${ADMIN.name}`);
  for (const m of MEMBERS) {
    console.log(`  member  ${m.phone} / ${MEMBER_PIN}   ${m.name.padEnd(18)} ${m.note}`);
  }
  console.log(`\n  + ${WALK_INS_TODAY.length} walk-ins today, 1 yesterday`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
