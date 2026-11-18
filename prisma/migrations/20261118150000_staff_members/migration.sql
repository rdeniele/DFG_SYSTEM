-- =====================================================================
-- Staff can also be gym members (e.g. the super admin trains here too).
-- Staff WITH a membership clock in like any member (active/expiring yes,
-- expired blocked). Staff with NO membership get 'admin' (front desk only).
-- =====================================================================
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

  if v_member.role <> 'member' and v_member.status = 'pending' then
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
