/**
 * Offline test of the SQL migration: runs it in an in-memory Postgres (PGlite)
 * with a minimal stand-in for Supabase's `auth` and `storage` schemas, then checks
 * the sign-up trigger, the member_status view, and the RLS rules.
 *
 *   npm run test:db
 *
 * This does not replace testing on the real Supabase project; it catches SQL
 * mistakes and policy holes early, without needing Docker or a cloud project.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage to anon, authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text,
  identity_data jsonb
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  // Someone registered BEFORE the migration ran (auth user, no profile yet)
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-0000000000aa', '09179999999@members.gym.local', '{"full_name":"Early Bird","phone":"09179999999"}')`);

  const dir = join(process.cwd(), "prisma", "migrations");
  // Same order Prisma uses: one folder per migration, each with migration.sql
  for (const f of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    await db.exec(readFileSync(join(dir, f, "migration.sql"), "utf8"));
    console.log(`applied ${f}`);
  }

  const early = await db.query<{ full_name: string }>(
    `select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000aa'`,
  );
  check("backfill: early registrant gets a profile", early.rows[0]?.full_name === "Early Bird");

  // --- helpers -----------------------------------------------------------
  const signUp = async (name: string, phone: string) => {
    const r = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [`${phone}@members.gym.local`, JSON.stringify({ full_name: name, phone })],
    );
    const id = r.rows[0].id;
    await db.query(`insert into auth.identities (user_id, provider, identity_data) values ($1,'email',$2)`, [
      id,
      JSON.stringify({ email: `${phone}@members.gym.local` }),
    ]);
    return id;
  };
  /** Run fn as a logged-in user (role authenticated + jwt sub), or as anon. */
  const as = async <T>(userId: string | null, fn: () => Promise<T>): Promise<T> => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    if (userId) {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
      await db.exec(`set role authenticated`);
    } else {
      await db.exec(`set role anon`);
    }
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };
  const fails = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };

  // --- sign-up trigger ---------------------------------------------------
  const admin = await signUp("Admin", "09990000000");
  const alice = await signUp("Alice", "09170000001");
  const bob = await signUp("Bob", "09170000002");
  const sneaky = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ('09170000003@members.gym.local',
     '{"full_name":"Sneaky","phone":"09170000003","role":"admin"}') returning id`,
  );
  const prof = await db.query<{ full_name: string; role: string }>(
    `select full_name, role from public.profiles where id = $1`,
    [alice],
  );
  check("trigger creates profile from metadata", prof.rows[0]?.full_name === "Alice");
  const sneakyRole = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
    sneaky.rows[0].id,
  ]);
  check("metadata cannot grant admin at sign-up", sneakyRole.rows[0].role === "member");
  check(
    "bad phone rejected at sign-up",
    await fails(() =>
      db.query(`insert into auth.users (email, raw_user_meta_data) values ('x@members.gym.local', '{"phone":"123"}')`),
    ),
  );

  // promote first admin the documented way (SQL editor = no auth.uid())
  await db.exec(`update public.profiles set role = 'admin' where phone = '09990000000'`);
  check(
    "SQL editor can promote first admin",
    (await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [admin])).rows[0].role ===
      "admin",
  );

  // --- anon --------------------------------------------------------------
  check("anon cannot read profiles", await as(null, () => fails(() => db.query(`select * from public.profiles`))));
  check("anon cannot read member_status", await as(null, () => fails(() => db.query(`select * from public.member_status`))));

  // --- member visibility -------------------------------------------------
  const aliceSees = await as(alice, () => db.query(`select id from public.profiles`));
  check("member sees only own profile", aliceSees.rows.length === 1);
  const aliceStatus = await as(alice, () => db.query<{ status: string }>(`select status from public.member_status`));
  check("member_status shows only self, pending", aliceStatus.rows.length === 1 && aliceStatus.rows[0].status === "pending");

  // --- member cannot escalate ---------------------------------------------
  check(
    "member cannot change own role",
    await as(alice, () => fails(() => db.query(`update public.profiles set role='admin' where id = $1`, [alice]))),
  );
  check(
    "member cannot change own is_active",
    await as(alice, () => fails(() => db.query(`update public.profiles set is_active=false where id = $1`, [alice]))),
  );
  check(
    "member cannot change own phone",
    await as(alice, () => fails(() => db.query(`update public.profiles set phone='09171111111' where id = $1`, [alice]))),
  );
  const ok = await as(alice, () =>
    db.query(`update public.profiles set full_name='Alice B', photo_url='x' where id = $1`, [alice]),
  );
  check("member can update own name/photo", ok.affectedRows === 1);
  const bobUpdate = await as(alice, () => db.query(`update public.profiles set full_name='hacked' where id = $1`, [bob]));
  check("member cannot update another profile", bobUpdate.affectedRows === 0);
  check(
    "member cannot insert membership",
    await as(alice, () =>
      fails(() =>
        db.query(
          `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'monthly',current_date,current_date+29)`,
          [alice],
        ),
      ),
    ),
  );
  check(
    "member cannot read walk-ins",
    (await as(alice, () => db.query(`select * from public.walk_ins`))).rows.length === 0,
  );
  check(
    "member cannot add walk-ins",
    await as(alice, () => fails(() => db.query(`insert into public.walk_ins (name, amount) values ('x', 1)`))),
  );

  // --- admin -------------------------------------------------------------
  const today = (await db.query<{ d: string }>(`select ((now() at time zone 'Asia/Manila')::date)::text as d`)).rows[0].d;
  await as(admin, () =>
    db.query(
      `insert into public.memberships (profile_id, plan, start_date, end_date, amount)
       values ($1,'monthly',$2::date, $2::date + 29, 600)`,
      [alice, today],
    ),
  );
  await as(admin, () =>
    db.query(
      `insert into public.memberships (profile_id, plan, start_date, end_date, amount)
       values ($1,'weekly',$2::date - 10, $2::date - 4, 200)`,
      [bob, today],
    ),
  );
  const createdBy = await db.query<{ created_by: string }>(`select created_by from public.memberships where profile_id=$1`, [alice]);
  check("created_by defaults to admin", createdBy.rows[0].created_by === admin);
  const all = await as(admin, () =>
    db.query<{ phone: string; status: string; days_left: number }>(
      `select phone, status, days_left from public.member_status order by status_priority, end_date`,
    ),
  );
  check("admin sees all members", all.rows.length === 5, `${all.rows.length} rows`);
  const byPhone = Object.fromEntries(all.rows.map((r) => [r.phone, r]));
  check("status active after monthly", byPhone["09170000001"].status === "active" && byPhone["09170000001"].days_left === 29);
  check("status expired", byPhone["09170000002"].status === "expired");
  check("sort: expired first", all.rows[0].status === "expired");

  // expiring edge: end = today + 3
  await as(admin, () =>
    db.query(
      `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'manual',$2::date - 1, $2::date + 3)`,
      [bob, today],
    ),
  );
  const bobNow = await as(admin, () =>
    db.query<{ status: string }>(`select status from public.member_status where id = $1`, [bob]),
  );
  check("latest row wins; end = today+3 is expiring", bobNow.rows[0].status === "expiring");

  await as(admin, () => db.query(`insert into public.walk_ins (name, amount) values ('Walk', 60)`));
  check("admin can add + read walk-ins", (await as(admin, () => db.query(`select * from public.walk_ins`))).rows.length === 1);

  // admin edits a phone -> login email follows
  await as(admin, () => db.query(`update public.profiles set phone = '09175555555' where id = $1`, [bob]));
  const email = await db.query<{ email: string }>(`select email from auth.users where id = $1`, [bob]);
  check("phone change syncs login email", email.rows[0].email === "09175555555@members.gym.local");

  await as(admin, () => db.query(`update public.profiles set is_active = false where id = $1`, [bob]));
  check(
    "admin can deactivate a member",
    (await db.query<{ is_active: boolean }>(`select is_active from public.profiles where id=$1`, [bob])).rows[0].is_active === false,
  );
  check(
    "admin cannot remove own admin role",
    await as(admin, () => fails(() => db.query(`update public.profiles set role='member' where id = $1`, [admin]))),
  );

  // --- storage -----------------------------------------------------------
  check(
    "member can upload to own avatar folder",
    !(await as(alice, () =>
      fails(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alice}/a.jpg`])),
    )),
  );
  check(
    "member cannot upload to someone else's folder",
    await as(alice, () =>
      fails(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${bob}/a.jpg`])),
    ),
  );
  check(
    "admin can upload to any member folder",
    !(await as(admin, () =>
      fails(() => db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${bob}/b.jpg`])),
    )),
  );

  // --- QR attendance ----------------------------------------------------
  const token = (await db.query<{ t: string }>(`select checkin_token as t from public.gym_settings`)).rows[0].t;
  const scan = async (uid: string, t = token) =>
    (await as(uid, () => db.query<{ r: { result: string } }>(`select public.clock_scan($1) as r`, [t]))).rows[0].r;

  check("scan: wrong QR code rejected", (await scan(alice, "nope")).result === "bad_code");
  check("scan: active member clocks IN", (await scan(alice)).result === "in");
  check("scan: double scan within 1 min ignored", (await scan(alice)).result === "duplicate");
  await db.exec(`update public.attendance set clock_in = now() - interval '90 minutes'`);
  check("scan: second scan clocks OUT", (await scan(alice)).result === "out");
  await db.exec(`update public.attendance set clock_in = clock_in - interval '1 minute', clock_out = now() - interval '2 minutes'`);
  check("scan: next scan starts a new visit", (await scan(alice)).result === "in");
  const visits = await as(alice, () => db.query(`select * from public.attendance`));
  check("scan: member sees own 2 visits", visits.rows.length === 2, `${visits.rows.length}`);
  // forgot to clock out yesterday → today's scan is a new clock-in, not a clock-out
  await db.exec(`update public.attendance set clock_in = now() - interval '1 day', clock_out = null`);
  check("scan: open visit from yesterday → new clock-in", (await scan(alice)).result === "in");

  check("scan: turned-off member refused", (await scan(bob)).result === "inactive");
  const carol = await signUp("Carol", "09170000004");
  check("scan: pending member blocked (not recorded)", (await scan(carol)).result === "blocked");
  check(
    "scan: blocked scan left no row",
    (await db.query(`select 1 from public.attendance where profile_id = $1`, [carol])).rows.length === 0,
  );
  check("scan: admin gets 'admin'", (await scan(admin)).result === "admin");
  check(
    "member cannot insert attendance directly",
    await as(alice, () => fails(() => db.query(`insert into public.attendance (profile_id) values ($1)`, [alice]))),
  );
  check(
    "member cannot read the QR code",
    (await as(alice, () => db.query(`select * from public.gym_settings`))).rows.length === 0,
  );
  check(
    "member cannot make a new QR code",
    await as(alice, () => fails(() => db.query(`select public.rotate_checkin_token()`))),
  );
  check(
    "anon cannot scan",
    await as(null, () => fails(() => db.query(`select public.clock_scan($1)`, [token]))),
  );
  const newToken = (await as(admin, () => db.query<{ t: string }>(`select public.rotate_checkin_token() as t`))).rows[0].t;
  check("admin makes new QR code", newToken !== token && newToken.length === 32);
  await db.exec(`update public.attendance set clock_in = clock_in - interval '5 minutes'`);
  check("old printed QR stops working", (await scan(alice, token)).result === "bad_code");
  const adminSees = await as(admin, () => db.query(`select * from public.attendance`));
  check("admin sees all attendance", adminSees.rows.length >= 3);

  // --- Roles: super admin / owner / co-admin ----------------------------
  const sup = await signUp("Super", "09170000101");
  const owner = await signUp("Owner", "09170000102");
  const staff = await signUp("Staff", "09170000103");
  const dave = await signUp("Dave", "09170000104");
  await db.exec(`update public.profiles set role = 'superadmin' where phone = '09170000101'`); // SQL editor
  const setRole = (actor: string, target: string, role: string) =>
    as(actor, () => db.query(`select public.set_member_role($1, $2)`, [target, role]));
  const roleOf = async (id: string) =>
    (await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [id])).rows[0].role;

  check("super admin makes an owner", !(await fails(() => setRole(sup, owner, "owner"))) && (await roleOf(owner)) === "owner");
  check("owner makes a co-admin", !(await fails(() => setRole(owner, staff, "admin"))) && (await roleOf(staff)) === "admin");
  check("owner cannot make another owner", await fails(() => setRole(owner, dave, "owner")));
  check("owner cannot demote super admin", await fails(() => setRole(owner, sup, "member")));
  check("co-admin cannot give roles", await fails(() => setRole(staff, dave, "admin")));
  check("member cannot give roles", await fails(() => setRole(dave, dave, "admin")));
  check("nobody changes own role", await fails(() => setRole(owner, owner, "member")));
  check(
    "co-admin cannot set role by direct update",
    await as(staff, () => fails(() => db.query(`update public.profiles set role = 'owner' where id = $1`, [dave]))),
  );
  check(
    "owner cannot set role by direct update either",
    await as(owner, () => fails(() => db.query(`update public.profiles set role = 'admin' where id = $1`, [dave]))),
  );
  check(
    "co-admin cannot turn off the owner",
    await as(staff, () => fails(() => db.query(`update public.profiles set is_active = false where id = $1`, [owner]))),
  );
  check(
    "co-admin cannot change the owner's phone",
    await as(staff, () => fails(() => db.query(`update public.profiles set phone = '09171230000' where id = $1`, [owner]))),
  );
  check(
    "owner cannot turn off the super admin",
    await as(owner, () => fails(() => db.query(`update public.profiles set is_active = false where id = $1`, [sup]))),
  );
  check(
    "co-admin can still renew members",
    !(await as(staff, () =>
      fails(() =>
        db.query(
          `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'weekly',current_date,current_date+6)`,
          [dave],
        ),
      ),
    )),
  );
  const cm = async (actor: string, target: string) =>
    (await as(actor, () => db.query<{ ok: boolean }>(`select public.can_manage($1) as ok`, [target]))).rows[0].ok;
  check("can_manage: co-admin → member yes", (await cm(staff, dave)) === true);
  check("can_manage: co-admin → owner no (no PIN reset)", (await cm(staff, owner)) === false);
  check("can_manage: owner → co-admin yes", (await cm(owner, staff)) === true);
  check("can_manage: owner → super admin no", (await cm(owner, sup)) === false);
  check("can_manage: nobody → self", (await cm(owner, owner)) === false);
  check("owner removes co-admin access", !(await fails(() => setRole(owner, staff, "member"))) && (await roleOf(staff)) === "member");
  check("owner without membership: front desk only", (await scan(owner, newToken)).result === "admin");
  // Super admin who also trains: give them a membership → clocks in like a member
  await as(owner, () =>
    db.query(
      `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'monthly',current_date,current_date+29)`,
      [sup],
    ),
  );
  check("super admin WITH membership clocks in", (await scan(sup, newToken)).result === "in");
  await db.query(
    `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'weekly',current_date-20,current_date-14)`,
    [owner],
  );
  check("staff with EXPIRED membership is blocked", (await scan(owner, newToken)).result === "blocked");

  // --- Clock IN / OUT by choice ------------------------------------------
  const erin = await signUp("Erin", "09170000105");
  await db.query(
    `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'monthly',current_date,current_date+29)`,
    [erin],
  );
  const act = async (uid: string, a: "in" | "out", t = newToken) =>
    (await as(uid, () => db.query<{ r: { result: string } }>(`select public.clock_action($1,$2) as r`, [t, a]))).rows[0].r;
  const st = async (uid: string, t = newToken) =>
    (await as(uid, () => db.query<{ r: Record<string, unknown> }>(`select public.clock_status($1) as r`, [t]))).rows[0].r;

  let s1 = await st(erin);
  check("status: not clocked in, can clock in", s1.result === "ok" && s1.open_since === null && s1.can_clock_in === true);
  check("choice: Clock OUT when not in → not_in", (await act(erin, "out")).result === "not_in");
  check("choice: Clock IN → in", (await act(erin, "in")).result === "in");
  s1 = await st(erin);
  check("status: shows clocked in since", s1.open_since !== null);
  check("choice: Clock IN again → already_in (no 2nd row)", (await act(erin, "in")).result === "already_in");
  check("choice: Clock OUT right away works (no 1-minute wait)", (await act(erin, "out")).result === "out");
  check("choice: Clock OUT again → not_in", (await act(erin, "out")).result === "not_in");
  check("choice: Clock IN again later → new visit", (await act(erin, "in")).result === "in");
  check(
    "choice: visits recorded = 2",
    (await db.query(`select 1 from public.attendance where profile_id = $1`, [erin])).rows.length === 2,
  );
  // yesterday's forgotten visit is not closed by today's Clock OUT
  await db.query(`update public.attendance set clock_in = clock_in - interval '1 day', clock_out = null where profile_id = $1`, [erin]);
  check("choice: yesterday's open visit isn't today's → Clock OUT says not_in", (await act(erin, "out")).result === "not_in");
  check("choice: wrong QR → bad_code", (await act(erin, "in", "nope")).result === "bad_code");
  // expired member: can't clock in, but CAN clock out if inside
  await db.query(`delete from public.attendance where profile_id = $1`, [erin]);
  await act(erin, "in");
  await db.query(`update public.memberships set start_date = current_date-40, end_date = current_date-1 where profile_id = $1`, [erin]);
  check("expired: status says can't clock in", (await st(erin)).can_clock_in === false);
  check("expired but inside: Clock OUT still works", (await act(erin, "out")).result === "out");
  check("expired: Clock IN blocked", (await act(erin, "in")).result === "blocked");
  check("pending member: blocked", (await act(carol, "in")).result === "blocked");
  const guard = await signUp("Guard", "09170000106");
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [guard]); // SQL editor
  check("staff without membership: admin", (await act(guard, "in")).result === "admin");
  check(
    "anon cannot use clock_action",
    await as(null, () => fails(() => db.query(`select public.clock_action($1,'in')`, [newToken]))),
  );

  // --- Front desk clocks members in/out ----------------------------------
  const fran = await signUp("Fran", "09170000107");
  await db.query(
    `insert into public.memberships (profile_id, plan, start_date, end_date) values ($1,'monthly',current_date,current_date+29)`,
    [fran],
  );
  const desk = async (actor: string, target: string, a: "in" | "out") =>
    (await as(actor, () => db.query<{ r: { result: string } }>(`select public.staff_clock($1,$2) as r`, [target, a])))
      .rows[0].r;
  check("desk: clock member IN", (await desk(admin, fran, "in")).result === "in");
  check("desk: IN again → already_in", (await desk(admin, fran, "in")).result === "already_in");
  check("desk: clock member OUT", (await desk(admin, fran, "out")).result === "out");
  check("desk: OUT again → not_in", (await desk(admin, fran, "out")).result === "not_in");
  check("desk: pending member blocked", (await desk(admin, carol, "in")).result === "blocked");
  check("desk: staff without membership → admin", (await desk(admin, guard, "in")).result === "admin");
  check("desk: member cannot clock others", await fails(() => desk(fran, erin, "in")));
  check("desk: member cannot use desk clock on self", await fails(() => desk(fran, fran, "in")));
  const deskIn = await desk(admin, fran, "in");
  check(
    "desk + member's own Clock OUT share the same visit",
    deskIn.result === "in" && (await act(fran, "out")).result === "out",
  );

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
