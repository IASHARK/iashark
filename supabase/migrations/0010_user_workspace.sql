-- IASHARK user workspace: preferences and betting journal.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  favorite_leagues jsonb not null default '[]'::jsonb,
  language text not null default 'fr' check (language in ('fr','en','es','de','it','pt')),
  timezone text not null default 'Europe/Paris',
  notify_match_analysis boolean not null default true,
  notify_weekly_recap boolean not null default true,
  daily_exposure_pct numeric not null default 5 check (daily_exposure_pct between 0.5 and 20),
  stop_loss_pct numeric not null default 10 check (stop_loss_pct between 1 and 50),
  updated_at timestamptz not null default now()
);

create table if not exists public.betting_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id bigint,
  match_label text not null check (char_length(match_label) between 3 and 160),
  market text not null check (char_length(market) between 2 and 120),
  odds numeric not null check (odds > 1 and odds <= 100),
  estimated_probability numeric not null check (estimated_probability > 0 and estimated_probability < 100),
  stake numeric not null check (stake > 0),
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  result_pnl numeric,
  kickoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists betting_decisions_user_created_idx on public.betting_decisions(user_id,created_at desc);

alter table public.user_preferences enable row level security;
alter table public.betting_decisions enable row level security;

create policy user_preferences_select_own on public.user_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy user_preferences_update_own on public.user_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create policy betting_decisions_select_own on public.betting_decisions for select to authenticated using ((select auth.uid())=user_id);
create policy betting_decisions_insert_pro on public.betting_decisions for insert to authenticated with check (
  (select auth.uid())=user_id and exists(select 1 from public.users u where u.id=(select auth.uid()) and (u.plan='pro' or u.role='admin'))
);
create policy betting_decisions_update_pro on public.betting_decisions for update to authenticated using (
  (select auth.uid())=user_id and exists(select 1 from public.users u where u.id=(select auth.uid()) and (u.plan='pro' or u.role='admin'))
) with check (
  (select auth.uid())=user_id and exists(select 1 from public.users u where u.id=(select auth.uid()) and (u.plan='pro' or u.role='admin'))
);
create policy betting_decisions_delete_pro on public.betting_decisions for delete to authenticated using (
  (select auth.uid())=user_id and exists(select 1 from public.users u where u.id=(select auth.uid()) and (u.plan='pro' or u.role='admin'))
);

revoke all on public.user_preferences, public.betting_decisions from anon;
grant select,insert,update on public.user_preferences to authenticated;
grant select,insert,update,delete on public.betting_decisions to authenticated;

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();
drop trigger if exists betting_decisions_updated_at on public.betting_decisions;
create trigger betting_decisions_updated_at before update on public.betting_decisions for each row execute function public.set_updated_at();
