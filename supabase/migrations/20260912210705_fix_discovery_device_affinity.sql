create or replace function public.claim_discovery_selection(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.ussd_package_discoveries%rowtype;
begin
  select *
    into v_row
  from public.ussd_package_discoveries
  where session_state = 'selected'
    and device_id = p_device_id
    and selected_order_id is not null
    and selected_index is not null
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.ussd_package_discoveries
  set session_state = 'delivering',
      session_device_id = p_device_id
  where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'label', v_row.selected_label,
    'index', v_row.selected_index,
    'order_id', v_row.selected_order_id
  );
end;
$function$;

revoke all on function public.claim_discovery_selection(text) from public;
grant execute on function public.claim_discovery_selection(text) to anon, authenticated, service_role;
