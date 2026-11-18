-- =====================================================================
-- Front desk clocks a member in/out (for members without a phone or data).
-- Same rules as the member's own Clock IN / OUT:
--   in   only for active/expiring members, not if already in today
--   out  closes today's open visit (works even if the membership just ended)
-- result: in | out | already_in | not_in | blocked | inactive | admin
-- =====================================================================
create or replace function public.staff_clock(p_profile uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_open public.attendance;
  v_row public.attendance;
begin
  if not public.is_admin() then
    raise exception 'Front desk only' using errcode = '42501';
  end if;
  if p_action not in ('in', 'out') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  select full_name, role, is_active, status, end_date into v_member
    from public.member_status where id = p_profile;
  if v_member.full_name is null then
    raise exception 'Member not found' using errcode = '22023';
  end if;
  if v_member.role <> 'member' and v_member.status = 'pending' then
    return jsonb_build_object('result', 'admin', 'name', v_member.full_name);
  end if;
  if not v_member.is_active then
    return jsonb_build_object('result', 'inactive', 'name', v_member.full_name);
  end if;

  perform pg_advisory_xact_lock(hashtext(p_profile::text));
  v_open := public.open_visit_today(p_profile);

  if p_action = 'in' then
    if v_open.id is not null then
      return jsonb_build_object('result', 'already_in', 'name', v_member.full_name, 'clock_in', v_open.clock_in,
                                'status', v_member.status, 'end_date', v_member.end_date);
    end if;
    if v_member.status not in ('active', 'expiring') then
      return jsonb_build_object('result', 'blocked', 'name', v_member.full_name,
                                'status', v_member.status, 'end_date', v_member.end_date);
    end if;
    insert into public.attendance (profile_id) values (p_profile) returning * into v_row;
    return jsonb_build_object('result', 'in', 'name', v_member.full_name, 'clock_in', v_row.clock_in,
                              'status', v_member.status, 'end_date', v_member.end_date);
  end if;

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

revoke all on function public.staff_clock(uuid, text) from public, anon;
grant execute on function public.staff_clock(uuid, text) to authenticated;
