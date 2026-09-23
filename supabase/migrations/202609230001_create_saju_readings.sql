create table if not exists public.saju_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chart jsonb not null,
  reading jsonb not null,
  schema_version integer not null default 1 check (schema_version = 1),
  reading_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saju_readings enable row level security;

create policy "Users can read their own saju reading"
  on public.saju_readings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own saju reading"
  on public.saju_readings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own saju reading"
  on public.saju_readings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own saju reading"
  on public.saju_readings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_saju_reading_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_saju_reading_updated_at on public.saju_readings;
create trigger set_saju_reading_updated_at
before update on public.saju_readings
for each row execute function public.set_saju_reading_updated_at();
