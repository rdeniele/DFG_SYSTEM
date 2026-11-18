-- =====================================================================
-- QR attendance (clock in / clock out)
-- The gym shows/prints a QR that links to /checkin?t=<checkin_token>.
-- A logged-in member opens it; clock_scan() records IN or OUT.
-- =====================================================================

-- One-row settings table holding the secret code inside the QR.
create table public.gym_settings (
  id int primary key default 1 check (id = 1),
  checkin_token text not null default replace(gen_random_uuid()::text, '-', ''),
  token_updated_at timestamptz not null default now()
);
insert into public.gym_settings (id) values (1) on conflict do nothing;

-- Every visit: one row, clock_out filled on the second scan.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  check (clock_out is null or clock_out >= clock_in)
);
create index attendance_profile_in_idx on public.attendance (profile_id, clock_in desc);
create index attendance_in_idx on public.attendance (clock_in desc);

alter table public.gym_settings enable row level security;
alter table public.attendance   enable row level security;

-- Only admins can see or change the QR code.
create policy "gym_settings: admin read"
  on public.gym_settings for select to authenticated
  using ((select public.is_admin()));
create policy "gym_settings: admin update"
  on public.gym_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Members read their own visits; admins read all and can fix mistakes.
-- Nobody inserts directly: scans go through clock_scan(), which checks the QR code.
create policy "attendance: read own or admin"
  on public.attendance for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));
create policy "attendance: admin update"
  on public.attendance for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "attendance: admin delete"
  on public.attendance for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.gym_settings, public.attendance from anon;
grant select, update on public.gym_settings to authenticated;
grant select, update, delete on public.attendance to authenticated;

-- ---------------------------------------------------------------------
-- clock_scan(token): the member scanned the QR.
-- Returns jsonb { result, ... } where result is one of:
--   in        clocked in now
--   out       clocked out now (same Manila day as clock-in)
--   duplicate scanned again within 1 minute: nothing changed
--   blocked   membership is pending/expired: not recorded
--   inactive  account turned off
--   admin     admins don't clock in
--   bad_code  QR code is old or wrong
-- ---------------------------------------------------------------------
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

  if v_member.role = 'admin' then
    return jsonb_build_object('result', 'admin', 'name', v_member.full_name);
  end if;
  if not v_member.is_active then
    return jsonb_build_object('result', 'inactive', 'name', v_member.full_name);
  end if;
  if v_member.status in ('pending', 'expired') then
    return jsonb_build_object('result', 'blocked', 'name', v_member.full_name,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  -- One scan at a time per member (double taps, two phones).
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select * into v_last
    from public.attendance
   where profile_id = v_uid
   order by clock_in desc
   limit 1;

  -- Accidental double scan: ignore anything within 1 minute of the last scan.
  if v_last.id is not null
     and greatest(v_last.clock_in, coalesce(v_last.clock_out, v_last.clock_in)) > now() - interval '1 minute' then
    return jsonb_build_object(
      'result', 'duplicate', 'name', v_member.full_name,
      'state', case when v_last.clock_out is null then 'in' else 'out' end,
      'clock_in', v_last.clock_in, 'clock_out', v_last.clock_out,
      'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  -- Open visit from today → clock out. Otherwise (none, closed, or forgot yesterday) → clock in.
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

revoke all on function public.clock_scan(text) from public, anon;
grant execute on function public.clock_scan(text) to authenticated;

-- Admin: make a new QR code (old printouts stop working).
create or replace function public.rotate_checkin_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.gym_settings
     set checkin_token = replace(gen_random_uuid()::text, '-', ''),
         token_updated_at = now()
   where id = 1
  returning checkin_token into v_token;
  return v_token;
end;
$$;

revoke all on function public.rotate_checkin_token() from public, anon;
grant execute on function public.rotate_checkin_token() to authenticated;
