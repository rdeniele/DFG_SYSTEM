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

  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
    console.log(`applied ${f}`);
  }

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
  check("admin sees all members", all.rows.length === 4, `${all.rows.length} rows`);
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

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
