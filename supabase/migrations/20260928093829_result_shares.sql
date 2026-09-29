create table public.saju_shared_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  nickname text not null check (char_length(nickname) between 1 and 30),
  chart jsonb not null,
  reading jsonb not null,
  schema_version integer not null default 1,
  reading_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint expires_after_create check (expires_at > created_at)
);

create index saju_shared_readings_user_created_idx
  on public.saju_shared_readings (user_id, created_at desc);

alter table public.saju_shared_readings enable row level security;

revoke all on table public.saju_shared_readings from anon, authenticated;
grant select, delete on table public.saju_shared_readings to authenticated;

create policy "Owners can list their shared readings"
  on public.saju_shared_readings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can delete their shared readings"
  on public.saju_shared_readings for delete to authenticated
  using ((select auth.uid()) = user_id);
