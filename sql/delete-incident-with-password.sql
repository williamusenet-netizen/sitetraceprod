create or replace function public.delete_incident_with_password(
  target_incident_id uuid,
  delete_password text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_incident_id uuid;
begin
  if delete_password <> 'deletesuperuser' then
    raise exception 'invalid delete password' using errcode = '42501';
  end if;

  delete from public.incidents
  where id = target_incident_id
  returning id into deleted_incident_id;

  return deleted_incident_id;
end;
$$;

revoke all on function public.delete_incident_with_password(uuid, text) from public;
grant execute on function public.delete_incident_with_password(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
