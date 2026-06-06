-- FieldTrace V3 - Journal incident non destructif
-- Objectif pilote La Soredi:
-- - ajouter une trace append-only des actions incident;
-- - ne modifier ni supprimer aucun incident existant;
-- - rester compatible avec le client anon actuel pendant la phase d'essai.
--
-- A executer uniquement apres backup Supabase. Ce script ne contient aucun DROP,
-- TRUNCATE, DELETE ou UPDATE sur les donnees metier existantes.

begin;

create extension if not exists pgcrypto;

create table if not exists public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null,
  project_id uuid null,
  action text not null check (
    action in (
      'incident_created',
      'incident_updated',
      'status_changed',
      'assigned',
      'photo_added',
      'closed',
      'reopened',
      'deleted',
      'pdf_exported'
    )
  ),
  actor_label text null,
  actor_role text null,
  source text null check (source is null or source in ('terrain', 'boss', 'project')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists incident_events_incident_created_idx
  on public.incident_events (incident_id, created_at desc);

create index if not exists incident_events_project_created_idx
  on public.incident_events (project_id, created_at desc);

create index if not exists incident_events_created_idx
  on public.incident_events (created_at desc);

create index if not exists incident_events_action_created_idx
  on public.incident_events (action, created_at desc);

create index if not exists incident_events_source_created_idx
  on public.incident_events (source, created_at desc);

create index if not exists incident_events_actor_created_idx
  on public.incident_events (actor_label, created_at desc);

alter table public.incident_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'incident_events'
      and policyname = 'incident_events_select_pilot'
  ) then
    create policy incident_events_select_pilot
      on public.incident_events
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'incident_events'
      and policyname = 'incident_events_insert_pilot'
  ) then
    create policy incident_events_insert_pilot
      on public.incident_events
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

revoke update, delete, truncate on public.incident_events from anon, authenticated;
grant select, insert on public.incident_events to anon, authenticated;

notify pgrst, 'reload schema';

commit;
