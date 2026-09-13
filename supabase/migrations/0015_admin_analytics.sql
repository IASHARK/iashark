-- IASHARK - Tableau de bord analytics admin (facon "Shopify Analytics / Live View")
--
-- A appliquer APRES 0010_page_view_visitors.sql (deja en production).
-- Numerotation : 0011_past_due_grace_period.sql existe deja ; ce fichier
-- a ete renomme 0015_admin_analytics (0011 deja pris) et ne depend d'aucune
-- migration posterieure a 0010.
--
-- 1) event_type : ajoute page_leave (temps actif + scroll) et click
--    (actions significatives), envoyes par funnel-track.js.
-- 2) garde-fous de taille sur les lignes inserees par la cle anon publique
--    (NOT VALID : l'historique n'est pas revalide, les nouvelles lignes oui).
-- 3) index pour les agregats par visite.
-- 4) fonctions admin en LECTURE SEULE (SECURITY DEFINER, refus explicite
--    access_denied si l'appelant n'est pas admin, jamais executables par
--    anon) : admin_analytics, admin_live_view, admin_recent_sessions,
--    admin_recent_signups.
-- 5) purge_old_funnel_events() : suppression des evenements de plus de 13
--    mois (fonction seule, aucune planification ; service_role uniquement).
--
-- Definitions (sans cookie, donc sans visiteur unique persistant) :
-- - "visite" (session) = un session_id (identifiant d'onglet en
--   sessionStorage) ayant au moins un evenement sur la periode ;
-- - "visitors" = visites ayant au moins une page_view ;
-- - duree d'une visite = somme des temps actifs (page_leave, plafonnes a
--   30 min par page) ou, a defaut, ecart premier/dernier evenement, plafonne
--   a 4 h ;
-- - rebond = visite avec exactement une page_view ;
-- - country_guess = pays ESTIME depuis le fuseau horaire du navigateur.
-- Jours et heures calcules en Europe/Paris (comme admin_stats).
-- Toutes les valeurs numeriques lues dans metadata (ecrit par anon) sont
-- validees par regex avant conversion : une ligne malformee ne peut jamais
-- faire echouer le tableau de bord.

alter table public.funnel_events drop constraint if exists funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check check (event_type in (
  'landing_view','signup_started','signup_completed','login_completed','onboarding_dismissed',
  'tool_page_view','paywall_view','checkout_started','checkout_unavailable',
  'checkout_success_view','checkout_cancel_view','page_view','page_leave','click'));

alter table public.funnel_events drop constraint if exists funnel_events_size_check;
alter table public.funnel_events add constraint funnel_events_size_check check (
  (metadata is null or pg_column_size(metadata) <= 2048)
  and (page is null or length(page) <= 512)
  and (session_id is null or length(session_id) <= 64)
  and (locale is null or length(locale) <= 16)
) not valid;

create index if not exists funnel_events_session_created_idx
  on public.funnel_events (session_id, created_at) where session_id is not null;
create index if not exists funnel_events_type_created_idx
  on public.funnel_events (event_type, created_at);

-- ---------------------------------------------------------------------------
-- admin_analytics(p_days) : periode = aujourd'hui (p_days = 1, par heure) ou
-- les p_days derniers jours calendaires aujourd'hui inclus (par jour).
-- "previous" = meme duree decalee de p_days jours (comparaison).
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics(p_days integer default 7)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return (
    with params as (
      select d.days, d.today,
        (d.today - make_interval(days => d.days - 1)) at time zone 'Europe/Paris' as cur_start,
        (d.today - make_interval(days => 2 * d.days - 1)) at time zone 'Europe/Paris' as prev_start,
        ((now() at time zone 'Europe/Paris') - make_interval(days => d.days)) at time zone 'Europe/Paris' as prev_end
      from (
        select greatest(1, least(coalesce(p_days, 7), 395)) as days,
               date_trunc('day', now() at time zone 'Europe/Paris') as today
      ) d
    ),
    ev as (
      select e.id, e.session_id, e.event_type, e.page, e.locale,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md,
        e.created_at,
        case when e.created_at >= p.cur_start then 'cur' else 'prev' end as period
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= p.prev_start
        and e.created_at <= now()
        and (e.created_at >= p.cur_start or e.created_at <= p.prev_end)
    ),
    leaves as (
      select period, session_id, md->>'pv' as pv,
        max(case when md->>'sec' ~ '^[0-9]{1,7}$' then least((md->>'sec')::int, 1800) end) as sec,
        max(case when md->>'scroll' ~ '^[0-9]{1,3}$' then least((md->>'scroll')::int, 100) end) as scroll
      from ev
      where event_type = 'page_leave' and md->>'pv' is not null
      group by 1, 2, 3
    ),
    sess as (
      select period, session_id,
        min(created_at) as first_at, max(created_at) as last_at,
        count(*) filter (where event_type = 'page_view') as pageviews,
        bool_or(event_type = 'signup_completed') as signed_up,
        bool_or(event_type = 'signup_started' or (event_type = 'page_view' and page ~ '/inscription(\.html)?$')) as saw_signup,
        bool_or(event_type in ('landing_view', 'paywall_view', 'tool_page_view')
          or (event_type = 'page_view' and page ~ '/(abonnement|pro|landing)(\.html)?$')) as saw_pricing,
        bool_or(event_type = 'checkout_started') as checkout_started,
        bool_or(event_type = 'checkout_success_view') as checkout_success
      from ev
      group by 1, 2
    ),
    sess_dur as (
      select s.*,
        least(coalesce(l.total, extract(epoch from (s.last_at - s.first_at))::int), 14400) as sec
      from sess s
      left join (select period, session_id, sum(sec) as total from leaves group by 1, 2) l
        on l.period = s.period and l.session_id = s.session_id
    ),
    kpi as (
      select period,
        count(*) as sessions,
        count(*) filter (where pageviews > 0) as visitors,
        coalesce(sum(pageviews), 0) as page_views,
        round(avg(sec) filter (where pageviews > 0)) as avg_visit_sec,
        round(100.0 * count(*) filter (where pageviews = 1) / nullif(count(*) filter (where pageviews > 0), 0), 1) as bounce_rate,
        count(*) filter (where signed_up) as signup_sessions,
        round(100.0 * count(*) filter (where signed_up) / nullif(count(*), 0), 2) as signup_conversion,
        count(*) filter (where checkout_started) as checkout_sessions
      from sess_dur
      group by 1
    ),
    kpi_full as (
      select pr.period,
        coalesce(k.sessions, 0) as sessions,
        coalesce(k.visitors, 0) as visitors,
        coalesce(k.page_views, 0) as page_views,
        k.avg_visit_sec, k.bounce_rate,
        coalesce(k.signup_sessions, 0) as signup_sessions,
        k.signup_conversion,
        coalesce(k.checkout_sessions, 0) as checkout_sessions,
        (select count(*) from public.users u, params p
          where case when pr.period = 'cur'
            then u.created_at >= p.cur_start and u.created_at <= now()
            else u.created_at >= p.prev_start and u.created_at <= p.prev_end end) as signups
      from (values ('cur'), ('prev')) as pr(period)
      left join kpi k on k.period = pr.period
    ),
    pv as (
      select * from ev where period = 'cur' and event_type = 'page_view'
    ),
    first_pv as (
      select distinct on (session_id) session_id, page, locale, md
      from pv order by session_id, created_at, id
    ),
    first_ev as (
      select distinct on (session_id) session_id, locale
      from ev where period = 'cur' order by session_id, created_at, id
    ),
    buckets as (
      select g as bucket
      from params p,
        generate_series(
          case when p.days = 1 then p.today else p.today - make_interval(days => p.days - 1) end,
          case when p.days = 1 then date_trunc('hour', now() at time zone 'Europe/Paris') else p.today end,
          case when p.days = 1 then interval '1 hour' else interval '1 day' end
        ) g
    ),
    bucket_counts as (
      select date_trunc(case when p.days = 1 then 'hour' else 'day' end, e.created_at at time zone 'Europe/Paris') as bucket,
        count(distinct e.session_id) as visits,
        count(*) filter (where e.event_type = 'page_view') as page_views
      from ev e, params p
      where e.period = 'cur'
      group by 1
    ),
    top_pages as (
      select pv.page,
        count(*) as views,
        count(distinct pv.session_id) as visits,
        round(avg(l.sec)) as avg_sec,
        round(avg(l.scroll)) as avg_scroll
      from pv
      left join leaves l on l.period = 'cur' and l.session_id = pv.session_id and l.pv = pv.md->>'pv'
      group by pv.page
      order by views desc, pv.page
      limit 20
    ),
    top_matches as (
      select md->>'match_id' as match_id, count(*) as views, count(distinct session_id) as visits
      from pv
      where md->>'match_id' ~ '^[0-9]{1,12}$'
      group by 1
      order by views desc, match_id
      limit 15
    ),
    src as (
      select fp.session_id,
        left(coalesce(nullif(fp.md->>'utm_source', ''), nullif(fp.md->>'ref', ''), '(direct)'), 80) as source,
        left(nullif(fp.md->>'utm_medium', ''), 80) as medium,
        left(nullif(fp.md->>'utm_campaign', ''), 80) as campaign,
        s.signed_up
      from first_pv fp
      join sess s on s.period = 'cur' and s.session_id = fp.session_id
    ),
    sources as (
      select source, count(*) as visits, count(*) filter (where signed_up) as signups
      from src group by 1 order by visits desc, source limit 15
    ),
    campaigns as (
      select source, medium, campaign, count(*) as visits, count(*) filter (where signed_up) as signups
      from src where medium is not null or campaign is not null
      group by 1, 2, 3 order by visits desc limit 15
    ),
    countries as (
      select left(md->>'country_guess', 8) as key, count(*) as visits
      from first_pv group by 1 order by visits desc limit 30
    ),
    site_versions as (
      select left(locale, 16) as key, count(*) as visits
      from first_ev group by 1 order by visits desc
    ),
    devices as (
      select left(md->>'device', 20) as key, count(*) as visits from first_pv group by 1 order by visits desc limit 10
    ),
    browsers as (
      select left(md->>'browser', 40) as key, count(*) as visits from first_pv group by 1 order by visits desc limit 12
    ),
    systems as (
      select left(md->>'os', 20) as key, count(*) as visits from first_pv group by 1 order by visits desc limit 10
    ),
    funnel as (
      select count(*) as visits,
        count(*) filter (where saw_signup) as signup_page,
        count(*) filter (where signed_up) as signup_completed,
        count(*) filter (where saw_pricing) as pricing_page,
        count(*) filter (where checkout_started) as checkout_started,
        count(*) filter (where checkout_success) as checkout_success
      from sess where period = 'cur'
    ),
    event_counts as (
      select event_type, count(*) as events, count(distinct session_id) as visits
      from ev where period = 'cur' group by 1
    )
    select json_build_object(
      'days', (select days from params),
      'granularity', (select case when days = 1 then 'hour' else 'day' end from params),
      'period_start', (select cur_start from params),
      'previous_start', (select prev_start from params),
      'previous_end', (select prev_end from params),
      'kpis', (select row_to_json(k) from kpi_full k where k.period = 'cur'),
      'previous', (select row_to_json(k) from kpi_full k where k.period = 'prev'),
      'series', (select coalesce(json_agg(json_build_object(
          't', b.bucket, 'visits', coalesce(c.visits, 0), 'page_views', coalesce(c.page_views, 0)) order by b.bucket), '[]'::json)
        from buckets b left join bucket_counts c on c.bucket = b.bucket),
      'top_pages', (select coalesce(json_agg(t order by t.views desc, t.page), '[]'::json) from top_pages t),
      'top_matches', (select coalesce(json_agg(t order by t.views desc, t.match_id), '[]'::json) from top_matches t),
      'sources', (select coalesce(json_agg(t order by t.visits desc, t.source), '[]'::json) from sources t),
      'campaigns', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from campaigns t),
      'countries', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from countries t),
      'site_versions', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from site_versions t),
      'devices', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from devices t),
      'browsers', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from browsers t),
      'os', (select coalesce(json_agg(t order by t.visits desc), '[]'::json) from systems t),
      'funnel', (select row_to_json(f) from funnel f),
      'event_counts', (select coalesce(json_agg(t order by t.events desc), '[]'::json) from event_counts t),
      'coverage', json_build_object(
        'first_event_at', (select min(created_at) from public.funnel_events),
        'first_page_view_at', (select min(created_at) from public.funnel_events where event_type = 'page_view'),
        'first_page_leave_at', (select min(created_at) from public.funnel_events where event_type = 'page_leave'),
        'first_click_at', (select min(created_at) from public.funnel_events where event_type = 'click')
      ),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_analytics(integer) from public, anon;
grant execute on function public.admin_analytics(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_live_view() : visites actives (un evenement dans les 5 dernieres
-- minutes) avec leur page courante, et pages vues par minute sur 30 minutes.
-- ---------------------------------------------------------------------------
create or replace function public.admin_live_view()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return (
    with ev as (
      select e.id, e.session_id, e.event_type, e.page, e.locale,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md,
        e.created_at
      from public.funnel_events e
      where e.created_at > now() - interval '30 minutes'
        and e.created_at <= now()
        and e.session_id is not null
    ),
    active as (
      select session_id, max(created_at) as last_at, min(created_at) as first_at,
        count(*) filter (where event_type = 'page_view') as page_views
      from ev
      group by session_id
      having max(created_at) > now() - interval '5 minutes'
    ),
    last_pv as (
      select distinct on (session_id) session_id, page, locale, md
      from ev where event_type = 'page_view'
      order by session_id, created_at desc, id desc
    ),
    last_ev as (
      select distinct on (session_id) session_id, page, locale, event_type
      from ev order by session_id, created_at desc, id desc
    ),
    visitors as (
      select a.last_at, a.first_at, a.page_views,
        left(coalesce(lp.page, le.page), 300) as page,
        left(coalesce(lp.locale, le.locale), 16) as locale,
        left(lp.md->>'country_guess', 8) as country_guess,
        left(lp.md->>'device', 20) as device,
        left(coalesce(nullif(lp.md->>'utm_source', ''), nullif(lp.md->>'ref', '')), 80) as source,
        (le.event_type = 'page_leave') as tab_hidden
      from active a
      left join last_pv lp on lp.session_id = a.session_id
      left join last_ev le on le.session_id = a.session_id
    ),
    minutes as (
      select generate_series(date_trunc('minute', now()) - interval '29 minutes', date_trunc('minute', now()), interval '1 minute') as m
    ),
    per_minute as (
      select date_trunc('minute', created_at) as m, count(*) as page_views
      from ev where event_type = 'page_view' group by 1
    )
    select json_build_object(
      'active_visitors', (select count(*) from active),
      'page_views_30m', (select count(*) from ev where event_type = 'page_view'),
      'visitors', (select coalesce(json_agg(v order by v.last_at desc), '[]'::json)
        from (select * from visitors order by last_at desc limit 50) v),
      'current_pages', (select coalesce(json_agg(t order by t.visitors desc, t.page), '[]'::json)
        from (select page, count(*) as visitors from visitors group by page order by count(*) desc limit 10) t),
      'per_minute', (select json_agg(json_build_object('t', mi.m, 'page_views', coalesce(pm.page_views, 0)) order by mi.m)
        from minutes mi left join per_minute pm on pm.m = mi.m),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_live_view() from public, anon;
grant execute on function public.admin_live_view() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_recent_sessions(p_limit) : dernieres visites anonymes (30 derniers
-- jours) avec le parcours ordonne, le temps sur chaque page, l'appareil, la
-- source et l'issue (inscription / checkout). Aucun user_id ni email.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recent_sessions(p_limit integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return (
    with recent as (
      select session_id, min(created_at) as first_at, max(created_at) as last_at
      from public.funnel_events
      where created_at > now() - interval '30 days'
        and created_at <= now()
        and session_id is not null
      group by session_id
      order by max(created_at) desc
      limit greatest(1, least(coalesce(p_limit, 30), 200))
    ),
    detail as (
      select r.first_at, r.last_at,
        fe.locale, fe.page as entry_page,
        left(fp.md->>'device', 20) as device,
        left(fp.md->>'browser', 40) as browser,
        left(fp.md->>'os', 20) as os,
        left(fp.md->>'country_guess', 8) as country_guess,
        left(coalesce(nullif(fp.md->>'utm_source', ''), nullif(fp.md->>'ref', ''), case when fp.md is not null then '(direct)' end), 80) as source,
        left(nullif(fp.md->>'utm_campaign', ''), 80) as campaign,
        agg.page_views, agg.signed_up, agg.checkout_started, agg.checkout_success,
        least(coalesce(agg.leave_sec, extract(epoch from (r.last_at - r.first_at))::int), 14400) as duration_sec,
        pages.list as pages,
        events.list as events
      from recent r
      left join lateral (
        select e.locale, e.page from public.funnel_events e
        where e.session_id = r.session_id order by e.created_at, e.id limit 1
      ) fe on true
      left join lateral (
        select case when jsonb_typeof(e.metadata) = 'object' then e.metadata end as md
        from public.funnel_events e
        where e.session_id = r.session_id and e.event_type = 'page_view'
        order by e.created_at, e.id limit 1
      ) fp on true
      left join lateral (
        select count(*) filter (where e.event_type = 'page_view') as page_views,
          bool_or(e.event_type = 'signup_completed') as signed_up,
          bool_or(e.event_type = 'checkout_started') as checkout_started,
          bool_or(e.event_type = 'checkout_success_view') as checkout_success,
          (select sum(x.sec) from (
             select max(case when l.metadata->>'sec' ~ '^[0-9]{1,7}$' then least((l.metadata->>'sec')::int, 1800) end) as sec
             from public.funnel_events l
             where l.session_id = r.session_id and l.event_type = 'page_leave' and l.metadata->>'pv' is not null
             group by l.metadata->>'pv') x) as leave_sec
        from public.funnel_events e
        where e.session_id = r.session_id
      ) agg on true
      left join lateral (
        select json_agg(json_build_object(
            'page', left(p.page, 300), 'at', p.created_at, 'sec', p.sec, 'scroll', p.scroll) order by p.created_at, p.id) as list
        from (
          select v.id, v.page, v.created_at,
            -- Sans page_leave : ecart jusqu'a la page suivante (plafonne a
            -- 30 min) ; derniere page sans page_leave => null (inconnu).
            -- Attention : least(NULL, 1800) vaut 1800 en Postgres, d'ou le case.
            coalesce(lv.sec,
              case when lead(v.created_at) over (order by v.created_at, v.id) is not null
                then least(extract(epoch from (lead(v.created_at) over (order by v.created_at, v.id) - v.created_at))::int, 1800)
              end) as sec,
            lv.scroll
          from public.funnel_events v
          left join lateral (
            select max(case when l.metadata->>'sec' ~ '^[0-9]{1,7}$' then least((l.metadata->>'sec')::int, 1800) end) as sec,
                   max(case when l.metadata->>'scroll' ~ '^[0-9]{1,3}$' then least((l.metadata->>'scroll')::int, 100) end) as scroll
            from public.funnel_events l
            where l.session_id = r.session_id and l.event_type = 'page_leave'
              and l.metadata->>'pv' is not null and l.metadata->>'pv' = v.metadata->>'pv'
          ) lv on true
          where v.session_id = r.session_id and v.event_type = 'page_view'
          order by v.created_at, v.id
          limit 50
        ) p
      ) pages on true
      left join lateral (
        select json_agg(json_build_object(
            'type', x.event_type, 'at', x.created_at, 'page', left(x.page, 300),
            'label', left(x.metadata->>'label', 80), 'kind', left(x.metadata->>'kind', 20)) order by x.created_at, x.id) as list
        from (
          select e.id, e.event_type, e.created_at, e.page,
            case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as metadata
          from public.funnel_events e
          where e.session_id = r.session_id and e.event_type not in ('page_view', 'page_leave')
          order by e.created_at, e.id
          limit 40
        ) x
      ) events on true
    )
    select coalesce(json_agg(d order by d.last_at desc), '[]'::json) from detail d
  );
end;
$$;
revoke all on function public.admin_recent_sessions(integer) from public, anon;
grant execute on function public.admin_recent_sessions(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_recent_signups(p_limit) : derniers comptes (liste clients du
-- proprietaire, admin uniquement) et, quand l'evenement signup_completed a
-- ete relie au compte, la version du site et la source de la visite.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recent_signups(p_limit integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return (
    select coalesce(json_agg(x order by x.created_at desc), '[]'::json)
    from (
      select u.email, u.created_at, u.plan, u.role,
        s.locale as site_version,
        s.page as signup_page,
        fp.source, fp.country_guess, fp.device
      from public.users u
      left join lateral (
        select e.session_id, e.locale, e.page
        from public.funnel_events e
        where e.user_id = u.id and e.event_type = 'signup_completed'
        order by e.created_at limit 1
      ) s on true
      left join lateral (
        select left(coalesce(nullif(f.metadata->>'utm_source', ''), nullif(f.metadata->>'ref', ''), '(direct)'), 80) as source,
          left(f.metadata->>'country_guess', 8) as country_guess,
          left(f.metadata->>'device', 20) as device
        from public.funnel_events f
        where s.session_id is not null and f.session_id = s.session_id and f.event_type = 'page_view'
          and jsonb_typeof(f.metadata) = 'object'
        order by f.created_at, f.id limit 1
      ) fp on true
      order by u.created_at desc
      limit greatest(1, least(coalesce(p_limit, 30), 500))
    ) x
  );
end;
$$;
revoke all on function public.admin_recent_signups(integer) from public, anon;
grant execute on function public.admin_recent_signups(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- purge_old_funnel_events() : retention 13 mois. Fonction seule, AUCUNE
-- planification ici. Executable uniquement par service_role (jamais depuis le
-- navigateur, meme par un admin). Renvoie le nombre de lignes supprimees.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_funnel_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.funnel_events where created_at < now() - interval '13 months';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
revoke all on function public.purge_old_funnel_events() from public, anon, authenticated;
grant execute on function public.purge_old_funnel_events() to service_role;
