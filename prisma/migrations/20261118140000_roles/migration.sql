-- =====================================================================
-- Staff roles
--   superadmin  the developer/manager: sets owners and co-admins
--   owner       gym owner: sets co-admins
--   admin       co-admin / front desk / guard: desk work only
--   member      everyone else
-- Rank: member 0 < admin 1 < owner 2 < superadmin 3
-- Rules: nobody changes their own role; you can only edit, turn off, reset PIN of,
-- or change the role of someone ranked BELOW you; you can only give roles below yours.
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('member', 'admin', 'owner', 'superadmin'));

create or replace function public.role_rank(p_role text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'superadmin' then 3
    when 'owner' then 2
    when 'admin' then 1
    else 0
  end;
$$;

-- Rank of the logged-in user (0 if not logged in / turned off).
create or replace function public.my_rank()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.role_rank(role) from public.profiles where id = auth.uid() and is_active),
    0
  );
$$;

-- Any staff role can do front-desk work (all existing policies use this).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_rank() >= 1;
$$;

-- Can the logged-in user manage this account (edit, turn off, reset PIN)?
create or replace function public.can_manage(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile <> auth.uid()
     and public.my_rank() >= 1
     and public.my_rank() > coalesce(
           (select public.role_rank(role) from public.profiles where id = p_profile), 99);
$$;

-- Guard on every profile update (replaces the earlier version).
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_rank int;
begin
  -- SQL Editor / service role (no logged-in user): allowed, e.g. making the first super admin.
  if v_actor is null then
    return new;
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change this field.' using errcode = '42501';
  end if;

  v_actor_rank := public.my_rank();

  -- Own profile: name and photo only (staff may also fix their own phone/login).
  if v_actor = old.id then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'You cannot change your own access.' using errcode = '42501';
    end if;
    if new.phone is distinct from old.phone and v_actor_rank < 1 then
      raise exception 'Not allowed to change this field.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Someone else's profile: only staff, and only for accounts ranked below them.
  if v_actor_rank < 1 or v_actor_rank <= public.role_rank(old.role) then
    raise exception 'You can''t change this account.' using errcode = '42501';
  end if;

  -- Role changes only through set_member_role(), which checks who may give which role.
  if new.role is distinct from old.role
     and coalesce(current_setting('app.role_change', true), '') <> 'on' then
    raise exception 'Use set_member_role() to change roles.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Give someone a role. Owner+ only; target and new role must both rank below you.
create or replace function public.set_member_role(p_profile uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank int := public.my_rank();
  v_target_role text;
begin
  if p_role not in ('member', 'admin', 'owner', 'superadmin') then
    raise exception 'Unknown role.' using errcode = '22023';
  end if;
  if v_rank < 2 then
    raise exception 'Only the owner can change who has front desk access.' using errcode = '42501';
  end if;
  if p_profile = auth.uid() then
    raise exception 'You cannot change your own access.' using errcode = '42501';
  end if;

  select role into v_target_role from public.profiles where id = p_profile;
  if v_target_role is null then
    raise exception 'Account not found.' using errcode = '22023';
  end if;
  if public.role_rank(v_target_role) >= v_rank or public.role_rank(p_role) >= v_rank then
    raise exception 'You can''t give or change that role.' using errcode = '42501';
  end if;

  perform set_config('app.role_change', 'on', true);
  update public.profiles set role = p_role where id = p_profile;
  perform set_config('app.role_change', '', true);
end;
$$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
revoke all on function public.can_manage(uuid) from public, anon;
grant execute on function public.can_manage(uuid) to authenticated;
revoke all on function public.my_rank() from public, anon;
grant execute on function public.my_rank() to authenticated;

-- Staff don't clock in (any staff role, not just 'admin').
create or replace function public.clock_scan(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_member record;
  v_last public.attendance;
  v_row public.attendance;
begin
  if v_uid is null then
    raise exception 'Not logged in' using errcode = '42501';
  end if;

  if not exists (select 1 from public.gym_settings where checkin_token = p_token) then
    return jsonb_build_object('result', 'bad_code');
  end if;

  select full_name, role, is_active, status, end_date
    into v_member
    from public.member_status
   where id = v_uid;

  if v_member.role <> 'member' then
    return jsonb_build_object('result', 'admin', 'name', v_member.full_name);
  end if;
  if not v_member.is_active then
    return jsonb_build_object('result', 'inactive', 'name', v_member.full_name);
  end if;
  if v_member.status in ('pending', 'expired') then
    return jsonb_build_object('result', 'blocked', 'name', v_member.full_name,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select * into v_last
    from public.attendance
   where profile_id = v_uid
   order by clock_in desc
   limit 1;

  if v_last.id is not null
     and greatest(v_last.clock_in, coalesce(v_last.clock_out, v_last.clock_in)) > now() - interval '1 minute' then
    return jsonb_build_object(
      'result', 'duplicate', 'name', v_member.full_name,
      'state', case when v_last.clock_out is null then 'in' else 'out' end,
      'clock_in', v_last.clock_in, 'clock_out', v_last.clock_out,
      'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  if v_last.id is not null and v_last.clock_out is null
     and (v_last.clock_in at time zone 'Asia/Manila')::date = v_today then
    update public.attendance set clock_out = now() where id = v_last.id returning * into v_row;
    return jsonb_build_object('result', 'out', 'name', v_member.full_name,
                              'clock_in', v_row.clock_in, 'clock_out', v_row.clock_out,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  insert into public.attendance (profile_id) values (v_uid) returning * into v_row;
  return jsonb_build_object('result', 'in', 'name', v_member.full_name,
                            'clock_in', v_row.clock_in,
                            'status', v_member.status, 'end_date', v_member.end_date);
end;
$$;
