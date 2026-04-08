create extension if not exists pgcrypto;

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  role text not null,
  email text not null unique,
  phone text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_operators_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists operators_set_updated_at on public.operators;
create trigger operators_set_updated_at
before update on public.operators
for each row
execute function public.set_operators_updated_at();

alter table public.operators enable row level security;

drop policy if exists operators_select_public on public.operators;
create policy operators_select_public
on public.operators
for select
to anon, authenticated
using (true);

drop policy if exists operators_insert_public on public.operators;
create policy operators_insert_public
on public.operators
for insert
to anon, authenticated
with check (true);

drop policy if exists operators_update_public on public.operators;
create policy operators_update_public
on public.operators
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists operators_delete_public on public.operators;
create policy operators_delete_public
on public.operators
for delete
to anon, authenticated
using (true);
