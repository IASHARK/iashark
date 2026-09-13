-- IASHARK - Visiteurs reels (suivi interne anonyme, funnel-track.js)
-- 1) autorise l'evenement page_view (vue de page anonyme, jamais reliee a un compte)
-- 2) admin_stats() expose les visiteurs du jour, 7 jours, par jour et par version du site
alter table public.funnel_events drop constraint if exists funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check check (event_type in (
  'landing_view','signup_started','signup_completed','login_completed','onboarding_dismissed',
  'tool_page_view','paywall_view','checkout_started','checkout_unavailable',
  'checkout_success_view','checkout_cancel_view','page_view'));
create index if not exists funnel_events_created_at_idx on public.funnel_events (created_at);

create or replace function public.admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select json_build_object(
    'total_users', (select count(*) from public.users),
    'free_users', (select count(*) from public.users where plan = 'free'),
    'pro_users', (select count(*) from public.users where plan = 'pro'),
    'admin_users', (select count(*) from public.users where role = 'admin'),
    'signups_last_7d', (select count(*) from public.users where created_at > now() - interval '7 days'),
    'signups_last_30d', (select count(*) from public.users where created_at > now() - interval '30 days'),
    'funnel_last_7d', (
      select coalesce(json_object_agg(event_type, cnt), '{}'::json)
      from (
        select event_type, count(*) as cnt
        from public.funnel_events
        where created_at > now() - interval '7 days'
        group by event_type
      ) t
    ),
    'visitors_today', (
      select count(distinct session_id) from public.funnel_events
      where event_type = 'page_view'
        and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
    ),
    'visitors_last_7d', (
      select count(distinct session_id) from public.funnel_events
      where event_type = 'page_view' and created_at > now() - interval '7 days'
    ),
    'page_views_last_7d', (
      select count(*) from public.funnel_events
      where event_type = 'page_view' and created_at > now() - interval '7 days'
    ),
    'visitors_by_day_14d', (
      select coalesce(json_agg(json_build_object('day', d, 'visitors', v) order by d), '[]'::json)
      from (
        select (created_at at time zone 'Europe/Paris')::date as d, count(distinct session_id) as v
        from public.funnel_events
        where event_type = 'page_view' and created_at > now() - interval '14 days'
        group by 1
      ) x
    ),
    'visitors_by_site_7d', (
      select coalesce(json_object_agg(locale, v), '{}'::json)
      from (
        select coalesce(locale, 'fr') as locale, count(distinct session_id) as v
        from public.funnel_events
        where event_type = 'page_view' and created_at > now() - interval '7 days'
        group by 1
      ) y
    ),
    'generated_at', now()
  ) into result;

  return result;
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
