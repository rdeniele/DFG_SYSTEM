-- =====================================================================
-- Daryl Fitness Gym: initial schema
-- Tables, status view, is_admin(), sign-up trigger, RLS, avatars bucket.
-- Run with `supabase db push`, or paste into Supabase Dashboard -> SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- profiles: one per auth user
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null unique check (phone ~ '^09[0-9]{9}$'),
  photo_url text,
  role text not null default 'member' check (role in ('member','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- memberships: every renewal is a new row (also acts as payment history)
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('weekly','half_month','monthly','manual')),
  start_date date not null,
  end_date date not null,
  amount numeric(10,2) check (amount is null or amount >= 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index memberships_profile_end_idx on public.memberships (profile_id, end_date desc);
create index memberships_profile_created_idx on public.memberships (profile_id, created_at desc);
create index memberships_created_idx on public.memberships (created_at);

-- walk-ins: no account
create table public.walk_ins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(10,2) not null check (amount >= 0),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index walk_ins_created_idx on public.walk_ins (created_at);

-- ---------------------------------------------------------------------
-- is_admin(): security definer so it can read profiles without hitting RLS
-- (avoids infinite recursion inside the profiles policies)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- ---------------------------------------------------------------------
-- Sign-up trigger: create the profile from raw_user_meta_data.
-- Role is ALWAYS 'member' here; metadata can't make someone an admin.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Member'),
    coalesce(new.raw_user_meta_data ->> 'phone', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Guard: members can't change their own role, is_active, or phone.
-- (Phone is their login, so only the front desk changes it.)
-- Admins can change anything. SQL editor / service role (no auth.uid()) can too.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_admin() then
    -- An admin can't demote or deactivate themselves by accident.
    if auth.uid() = old.id and (new.role <> 'admin' or not new.is_active) then
      raise exception 'You cannot remove your own admin access.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.phone is distinct from old.phone
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change this field.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- When the phone changes, keep the hidden login email in sync
-- ({phone}@members.gym.local), so the member logs in with the new number.
create or replace function public.sync_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
     set email = new.phone || '@members.gym.local',
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('phone', new.phone)
   where id = new.id;
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', new.phone || '@members.gym.local')
   where user_id = new.id and provider = 'email';
  return new;
end;
$$;

create trigger profiles_sync_auth_email
  after update of phone on public.profiles
  for each row
  when (new.phone is distinct from old.phone)
  execute function public.sync_auth_email();

-- ---------------------------------------------------------------------
-- member_status view: each profile + latest membership + computed status.
-- "Latest" = most recently created row, so an admin correction wins.
-- Mirrors getMemberStatus() in lib/status.ts. Keep the 3 below in sync with
-- EXPIRING_SOON_DAYS in lib/plans.ts.
-- security_invoker = on  -> RLS of the caller applies (members see only themselves).
-- ---------------------------------------------------------------------
create or replace view public.member_status
with (security_invoker = on)
as
with today as (
  select (now() at time zone 'Asia/Manila')::date as d
)
select
  p.id,
  p.full_name,
  p.phone,
  p.photo_url,
  p.role,
  p.is_active,
  p.created_at,
  m.plan        as current_plan,
  m.start_date,
  m.end_date,
  m.amount      as last_amount,
  m.created_at  as last_renewed_at,
  case
    when m.end_date is null then 'pending'
    when m.end_date < t.d then 'expired'
    when m.end_date - t.d <= 3 then 'expiring'
    else 'active'
  end as status,
  case
    when m.end_date is null then null
    else greatest(m.end_date - t.d, 0)
  end as days_left,
  case
    when m.end_date is null then 3
    when m.end_date < t.d then 0
    when m.end_date - t.d <= 3 then 1
    else 2
  end as status_priority
from public.profiles p
cross join today t
left join lateral (
  select plan, start_date, end_date, amount, created_at
  from public.memberships
  where profile_id = p.id
  order by created_at desc
  limit 1
) m on true;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;
alter table public.walk_ins    enable row level security;

-- profiles
create policy "profiles: read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles: update own or admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- No insert policy: rows come from the sign-up trigger only.
-- No delete policy: deactivate with is_active = false (soft delete).

-- memberships
create policy "memberships: read own or admin"
  on public.memberships for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy "memberships: admin insert"
  on public.memberships for insert to authenticated
  with check ((select public.is_admin()));

create policy "memberships: admin update"
  on public.memberships for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "memberships: admin delete"
  on public.memberships for delete to authenticated
  using ((select public.is_admin()));

-- walk_ins: admins only
create policy "walk_ins: admin all"
  on public.walk_ins for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Logged-out visitors get nothing.
revoke all on public.profiles, public.memberships, public.walk_ins, public.member_status from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships, public.walk_ins to authenticated;
grant select on public.member_status to authenticated;

-- ---------------------------------------------------------------------
-- Storage: avatars bucket
-- Public read (avatar URLs work in <img>). Writes only into {user_id}/...
-- Admins can write any member's folder (front desk can update photos).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars: read own or admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "avatars: upload own or admin"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "avatars: update own or admin"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

create policy "avatars: delete own or admin"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- ---------------------------------------------------------------------
-- First admin (run once in SQL Editor after that person registers):
--   update public.profiles set role = 'admin' where phone = '09XXXXXXXXX';
-- ---------------------------------------------------------------------
