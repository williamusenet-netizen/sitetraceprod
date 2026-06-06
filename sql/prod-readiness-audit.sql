-- Read-only checks to run in Supabase SQL editor before production cutover.

select
  'projects' as object_name,
  to_regclass('public.projects') is not null as exists_in_database
union all
select 'incidents', to_regclass('public.incidents') is not null
union all
select 'operators', to_regclass('public.operators') is not null
union all
select 'incident_events', to_regclass('public.incident_events') is not null
union all
select 'delete_incident_with_password', to_regprocedure('public.delete_incident_with_password(uuid,text)') is not null;

select
  n.nspname as schemaname,
  c.relname as object_name,
  c.relkind,
  c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('projects', 'incidents', 'operators', 'incident_events')
order by c.relname;

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
  and tablename in ('projects', 'incidents', 'operators', 'incident_events')
order by tablename, policyname;

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
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

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
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'incident_events'
  and grantee in ('anon', 'authenticated')
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
  b.id as bucket_id,
  count(o.id)::int as object_count,
  pg_size_pretty(
    coalesce(
      sum(
        case
          when o.metadata ? 'size' and (o.metadata->>'size') ~ '^[0-9]+$'
            then (o.metadata->>'size')::bigint
          else 0
        end
      ),
      0
    )
  ) as estimated_media_size
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
where b.id = 'incident-photos'
group by b.id;

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname in ('public', 'storage')
  and tablename in ('projects', 'incidents', 'operators', 'incident_events', 'objects');

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'incident_events'
order by indexname;
