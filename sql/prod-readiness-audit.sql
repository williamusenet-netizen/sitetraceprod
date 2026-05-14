-- Read-only checks to run in Supabase SQL editor before production cutover.

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'incidents', 'operators')
order by tablename, policyname;

select
  routine_schema,
  routine_name,
  routine_type,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('delete_incident_with_password');

select
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'delete_incident_with_password'
order by grantee, privilege_type;

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'incident-photos';

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname in ('public', 'storage')
  and tablename in ('projects', 'incidents', 'operators', 'objects');
