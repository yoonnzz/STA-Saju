create table if not exists public.saju_daily_fortunes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fortune_date date not null,
  chart_signature text not null,
  fortune jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saju_daily_fortunes enable row level security;

create policy "Users can read their own daily fortune"
  on public.saju_daily_fortunes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own daily fortune"
  on public.saju_daily_fortunes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily fortune"
  on public.saju_daily_fortunes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own daily fortune"
  on public.saju_daily_fortunes for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_saju_daily_fortune(
  p_user_id uuid,
  p_fortune_date date,
  p_chart_signature text,
  p_source_created_at timestamptz,
  p_fortune jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_source timestamptz;
  saved jsonb;
begin
  if current_user <> 'service_role' and (select auth.uid()) is distinct from p_user_id then
    raise exception 'unauthorized';
  end if;

  select reading_created_at into current_source
  from public.saju_readings where user_id = p_user_id;
  if current_source is null or current_source is distinct from p_source_created_at then
    raise exception 'source reading changed';
  end if;

  insert into public.saju_daily_fortunes
    (user_id, fortune_date, chart_signature, fortune)
  values (p_user_id, p_fortune_date, p_chart_signature, p_fortune)
  on conflict (user_id) do update
  set fortune_date = excluded.fortune_date,
      chart_signature = excluded.chart_signature,
      fortune = excluded.fortune,
      updated_at = now()
  where public.saju_daily_fortunes.fortune_date is distinct from excluded.fortune_date
     or public.saju_daily_fortunes.chart_signature is distinct from excluded.chart_signature;

  select fortune into saved from public.saju_daily_fortunes where user_id = p_user_id;
  return saved;
end;
$$;

revoke all on function public.save_saju_daily_fortune(uuid,date,text,timestamptz,jsonb) from public, anon;
grant execute on function public.save_saju_daily_fortune(uuid,date,text,timestamptz,jsonb) to authenticated, service_role;
