-- =====================================================================
-- Clock in / clock out by CHOICE (no more guessing).
-- After scanning the QR the member sees their current state and taps
-- "Clock IN" or "Clock OUT".
--   clock_status(token)          read-only: who you are + are you clocked in
--   clock_action(token, action)  action = 'in' | 'out'
-- The old 1-minute "ignore repeat scan" rule is gone.
-- =====================================================================

-- Today's open visit (clocked in, not out), Manila day. Null if none.
create or replace function public.open_visit_today(p_profile uuid)
returns public.attendance
language sql
stable
security definer
set search_path = ''
as $$
  select *
    from public.attendance
   where profile_id = p_profile
     and clock_out is null
     and (clock_in at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date
   order by clock_in desc
   limit 1;
$$;
revoke all on function public.open_visit_today(uuid) from public, anon, authenticated;

-- What the choice screen needs. Changes nothing.
-- result: ok | bad_code | inactive | admin
create or replace function public.clock_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member record;
  v_open public.attendance;
  v_last public.attendance;
begin
  if v_uid is null then
    raise exception 'Not logged in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.gym_settings where checkin_token = p_token) then
    return jsonb_build_object('result', 'bad_code');
  end if;

  select full_name, role, is_active, status, end_date into v_member
    from public.member_status where id = v_uid;

  -- Staff with no membership are front desk only.
  if v_member.role <> 'member' and v_member.status = 'pending' then
    return jsonb_build_object('result', 'admin', 'name', v_member.full_name);
  end if;
  if not v_member.is_active then
    return jsonb_build_object('result', 'inactive', 'name', v_member.full_name);
  end if;

  v_open := public.open_visit_today(v_uid);
  select * into v_last from public.attendance
   where profile_id = v_uid and clock_out is not null
   order by clock_out desc limit 1;

  return jsonb_build_object(
    'result', 'ok',
    'name', v_member.full_name,
    'status', v_member.status,
    'end_date', v_member.end_date,
    'can_clock_in', v_member.status in ('active', 'expiring'),
    'open_since', v_open.clock_in,
    'last_out', v_last.clock_out
  );
end;
$$;

-- Do it. action = 'in' or 'out'.
-- result: in | out | already_in | not_in | blocked | inactive | admin | bad_code
create or replace function public.clock_action(p_token text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member record;
  v_open public.attendance;
  v_row public.attendance;
begin
  if v_uid is null then
    raise exception 'Not logged in' using errcode = '42501';
  end if;
  if p_action not in ('in', 'out') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gym_settings where checkin_token = p_token) then
    return jsonb_build_object('result', 'bad_code');
  end if;

  select full_name, role, is_active, status, end_date into v_member
    from public.member_status where id = v_uid;

  if v_member.role <> 'member' and v_member.status = 'pending' then
    return jsonb_build_object('result', 'admin', 'name', v_member.full_name);
  end if;
  if not v_member.is_active then
    return jsonb_build_object('result', 'inactive', 'name', v_member.full_name);
  end if;

  -- One action at a time per member (double taps, two phones).
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  v_open := public.open_visit_today(v_uid);

  if p_action = 'in' then
    if v_open.id is not null then
      return jsonb_build_object('result', 'already_in', 'name', v_member.full_name,
                                'clock_in', v_open.clock_in,
                                'status', v_member.status, 'end_date', v_member.end_date);
    end if;
    if v_member.status not in ('active', 'expiring') then
      return jsonb_build_object('result', 'blocked', 'name', v_member.full_name,
                                'status', v_member.status, 'end_date', v_member.end_date);
    end if;
    insert into public.attendance (profile_id) values (v_uid) returning * into v_row;
    return jsonb_build_object('result', 'in', 'name', v_member.full_name, 'clock_in', v_row.clock_in,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;

  -- action = 'out': always allowed if they're inside (even if membership just ended).
  if v_open.id is null then
    return jsonb_build_object('result', 'not_in', 'name', v_member.full_name,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;
  update public.attendance set clock_out = now() where id = v_open.id returning * into v_row;
  return jsonb_build_object('result', 'out', 'name', v_member.full_name,
                            'clock_in', v_row.clock_in, 'clock_out', v_row.clock_out,
                            'status', v_member.status, 'end_date', v_member.end_date);
end;
$$;

revoke all on function public.clock_status(text) from public, anon;
grant execute on function public.clock_status(text) to authenticated;
revoke all on function public.clock_action(text, text) from public, anon;
grant execute on function public.clock_action(text, text) to authenticated;
