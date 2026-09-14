-- IASHARK - Tableau de bord admin v2 : trafic interne/tests exclu par defaut,
-- periodes libres (hier, personnalise), filtres version/appareil/source,
-- exclusion manuelle d'une visite.
--
-- A appliquer APRES 0015_admin_analytics.sql (deja en production).
-- A RELIRE par le lead avant application (ce fichier n'a pas ete applique).
--
-- 1) Helpers purs (immutable, non exposes) :
--    - admin_internal_reason(metadata) : raison pour laquelle un evenement
--      est interne ou de test, NULL sinon :
--        'excluded' : visite exclue a la main depuis le tableau de bord ;
--        'internal' : navigateur du proprietaire (localStorage
--                     iashark_internal=1 pose par admin.html ou ?internal=1) ;
--        'qa'       : utm_source commencant par "qa" (ex. qa_lead_check) ;
--                     (les fonctions excluent aussi tout session_id commencant
--                     par "qa", ex. qa_diag_sid_gb insere a la main) ;
--        'bot'      : navigateur pilote (webdriver, headless, Playwright...) ;
--        'emulated' : ordinateur macOS/Windows annoncant un ecran de moins de
--                     600 px de large : impossible pour un vrai ordinateur,
--                     signature des tests mobiles emules (Playwright). Regle
--                     heuristique appliquee aussi a l'historique.
--    - admin_source_group(utm_source, ref, browser) : regroupement lisible
--      (tiktok, instagram, facebook, google, bing, x, whatsapp, direct,
--      other). MEMES regles que sourceGroup() dans admin-dashboard.js
--      (verifie par tests/admin-dashboard.test.js).
-- 2) Fonctions admin en LECTURE SEULE remplacees (DROP de l'ancienne
--    signature puis CREATE : les nouveaux parametres ont tous une valeur par
--    defaut, donc les anciens appels admin_analytics(p_days),
--    admin_live_view(), admin_recent_sessions(p_limit) restent valides) :
--    - p_include_internal boolean default false : par defaut, toute visite
--      (session_id) dont AU MOINS un evenement a une raison interne est
--      exclue ;
--    - p_since timestamptz default '2026-09-13 19:00:00+00' : lancement des
--      statistiques ; tout ce qui precede (presque uniquement des tests) est
--      ignore. Passer NULL pour afficher la periode de test ;
--    - p_from / p_to (dates calendaires de Paris, incluses) : periode libre ;
--      a defaut, les p_days derniers jours aujourd'hui inclus ;
--    - p_site ('fr','gb','za','mx','en','es','de','it','pt' ou 'intl' =
--      en/es/de/it/pt), p_device ('mobile','tablet','desktop'), p_source
--      (cle de admin_source_group) : filtres au niveau de la visite, d'apres
--      sa premiere page vue. Valeur inconnue => filtre ignore.
--    admin_recent_signups(p_limit) : meme signature, ajoute groupe de source,
--    source brute et navigateur.
--    admin_business(p_days, p_from, p_to) : nouvelle, comptes par offre,
--    abonnements (nouveaux, actifs, resilies) et encaissements Stripe recus.
--    admin_health() : nouvelle, dernier evenement recu, volumes 24 h,
--    derniere inscription, dernier evenement Stripe.
--    - comptes internes (admin_internal_account : role admin, compte du
--      proprietaire, adresses e2e/playwright/example.*) : exclus des
--      comptes, abonnements et inscriptions ; toute visite portant leur
--      user_id est traitee comme trafic interne (raison 'account').
--    - tunnel : accueil -> page match -> abonnement/offre Pro -> paiement
--      commence (clic sur le bouton de paiement, aucun code n'emettant
--      checkout_started) -> paiement reussi ; plus page inscription/inscrit.
-- 3) admin_exclude_session(p_session_id, p_exclude default true) : SEULE
--    fonction qui ECRIT. Admin uniquement. UPDATE de metadata uniquement
--    (jamais de DELETE) : ajoute {"internal": true, "admin_excluded": true}
--    sur les evenements de la visite qui n'etaient pas deja internes.
--    p_exclude = false annule precisement ce marquage (retire les deux cles
--    uniquement la ou admin_excluded = true). Renvoie le nombre de lignes
--    modifiees.
--
-- Definitions (sans cookie, donc sans visiteur unique persistant) :
-- - visiteur = identifiant d'onglet (sessionStorage) ayant vu au moins une
--   page sur la periode ;
-- - visite = periode d'activite d'un visiteur ; une nouvelle visite commence
--   apres 30 minutes sans aucun evenement (meme regle que Google Analytics) ;
-- - duree = somme des temps actifs (page_leave, 30 min max par page) ou, a
--   defaut, ecart premier/dernier evenement, 4 h max ;
-- - rebond = visiteur n'ayant vu qu'une seule page ;
-- - taux d'inscription = visiteurs inscrits / visiteurs ;
-- - "plusieurs visites" = visiteur revenu dans le MEME onglet apres 30 min.
--   Un vrai "nouveau / habitue" est impossible a mesurer honnetement sans
--   identifiant persistant (choix de confidentialite du site).
-- Jours et heures calcules en Europe/Paris. Toute valeur numerique lue dans
-- metadata (ecrit par anon) est validee par regex dans un CASE avant
-- conversion : une ligne malformee ne peut pas faire echouer le tableau de bord.

-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.admin_internal_reason(md jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when md is null or jsonb_typeof(md) <> 'object' then null
    when md->>'admin_excluded' = 'true' then 'excluded'
    when md->>'internal' = 'true' then 'internal'
    when md->>'qa' = 'true' or coalesce(md->>'utm_source', '') ilike 'qa%' then 'qa'
    when md->>'bot' = 'true' then 'bot'
    when md->>'os' in ('macOS', 'Windows')
      and (case when md->>'screen_w' ~ '^[0-9]{1,5}$' then (md->>'screen_w')::int between 1 and 599 else false end)
      then 'emulated'
  end
$$;
revoke all on function public.admin_internal_reason(jsonb) from public, anon, authenticated;

create or replace function public.admin_source_group(p_utm text, p_ref text, p_browser text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when x.s is null then case
      when coalesce(p_browser, '') ilike 'TikTok%' then 'tiktok'
      when coalesce(p_browser, '') ilike 'Instagram%' then 'instagram'
      when coalesce(p_browser, '') ilike 'Facebook%' then 'facebook'
      else 'direct' end
    when x.s ~ 'whatsapp|^wa\.me$' then 'whatsapp'
    when x.s ~ 'tiktok|musical\.ly|bytedance|^tt$' then 'tiktok'
    when x.s ~ 'instagram|^ig$' then 'instagram'
    when x.s ~ 'facebook|^fb$|(^|\.)fb\.com$|^m\.me$|messenger' then 'facebook'
    when x.s ~ '^t\.co$|twitter|^x$|(^|\.)x\.com$' then 'x'
    when x.s ~ '(^|\.)google(\.|$)|googlequicksearchbox' then 'google'
    when x.s ~ '(^|\.)bing(\.|$)' then 'bing'
    else 'other'
  end
  from (select nullif(lower(btrim(coalesce(nullif(btrim(p_utm), ''), nullif(btrim(p_ref), ''), ''))), '') as s) x
$$;
revoke all on function public.admin_source_group(text, text, text) from public, anon, authenticated;

-- Compte interne ou de test : jamais compte comme client ni comme visiteur.
-- - role = 'admin' ;
-- - compte du proprietaire (liste fermee ci-dessous, a completer ici si un
--   autre compte personnel est cree) ;
-- - adresses de test evidentes (e2e, playwright, domaines example.*).
-- Toute visite (session_id) ayant un evenement porte par un tel compte
-- (signup_completed avec user_id) est exclue comme trafic interne.
create or replace function public.admin_internal_account(p_email text, p_role text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_role, '') = 'admin'
    or lower(btrim(coalesce(p_email, ''))) in ('yaramode81@gmail.com')
    or lower(coalesce(p_email, '')) ~ '(^|[._+-])(e2e|playwright)([._+@-]|$)|@example\.(com|org|net)$'
$$;
revoke all on function public.admin_internal_account(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2a) admin_analytics : chiffres cles, evolution, pages, matchs, sources,
--     pays, versions, appareils, tunnel. "previous" = meme duree juste avant.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_analytics(integer);
create or replace function public.admin_analytics(
  p_days integer default 7,
  p_include_internal boolean default false,
  p_from date default null,
  p_to date default null,
  p_since timestamptz default '2026-09-13 19:00:00+00',
  p_site text default null,
  p_device text default null,
  p_source text default null
)
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
    with base as (
      select
        (now() at time zone 'Europe/Paris')::date as today,
        greatest(1, least(coalesce(p_days, 7), 395)) as days
    ),
    bounds as (
      select b.today,
        case when p_from is null then b.today - (b.days - 1)
             else least(p_from, coalesce(p_to, p_from), b.today) end as from_d,
        least(case when p_from is null then b.today
                   else greatest(p_from, coalesce(p_to, p_from)) end, b.today) as to_raw
      from base b
    ),
    params as (
      select x.*,
        (x.to_d - x.from_d + 1) as n_days,
        (x.to_d - x.from_d + 1) <= 2 as hourly,
        x.from_d::timestamp at time zone 'Europe/Paris' as cur_start,
        least(now(), (x.to_d + 1)::timestamp at time zone 'Europe/Paris') as cur_end,
        (x.from_d - (x.to_d - x.from_d + 1))::timestamp at time zone 'Europe/Paris' as prev_start,
        ((least(now(), (x.to_d + 1)::timestamp at time zone 'Europe/Paris') at time zone 'Europe/Paris')
          - make_interval(days => (x.to_d - x.from_d + 1))) at time zone 'Europe/Paris' as prev_end,
        case when p_site in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx', 'intl') then p_site end as f_site,
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device end as f_device,
        case when p_source in ('tiktok', 'instagram', 'facebook', 'google', 'bing', 'x', 'whatsapp', 'direct', 'other') then p_source end as f_source,
        coalesce(p_include_internal, false) as with_internal
      from (
        select bo.today, greatest(bo.from_d, bo.to_raw - 394) as from_d, bo.to_raw as to_d
        from bounds bo
      ) x
    ),
    raw as (
      select e.id, e.session_id, e.event_type, e.page, e.locale,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md,
        e.created_at,
        case when e.created_at >= p.cur_start then 'cur' else 'prev' end as period
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= greatest(p.prev_start, coalesce(p_since, '-infinity'::timestamptz))
        and e.created_at <= p.cur_end
        and (e.created_at >= p.cur_start or e.created_at <= p.prev_end)
    ),
    flagged as (
      select distinct e.session_id
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= p.prev_start - interval '1 day'
        and e.created_at <= p.cur_end
        and (public.admin_internal_reason(e.metadata) is not null or e.session_id ilike 'qa%'
          or e.user_id in (select u.id from public.users u where public.admin_internal_account(u.email, u.role)))
    ),
    sess as (
      select period, session_id,
        min(created_at) as first_at, max(created_at) as last_at,
        count(*) filter (where event_type = 'page_view') as pageviews,
        bool_or(event_type = 'signup_completed') as signed_up,
        bool_or(event_type = 'signup_started' or (event_type = 'page_view' and page ~ '/inscription(\.html)?$')) as saw_signup,
        bool_or(event_type in ('landing_view', 'paywall_view', 'tool_page_view')
          or (event_type = 'page_view' and page ~ '/(abonnement|pro|landing)(\.html)?$')) as saw_pricing,
        bool_or(event_type = 'page_view' and page ~ '^/((fr|en|es|de|it|pt|gb|za|mx)/?)?(index(\.html)?)?$') as saw_home,
        bool_or(event_type = 'page_view' and page ~ '/match(/[0-9]{1,12})?(\.html)?$') as saw_match,
        -- Aucun code du site n'emet checkout_started : le clic sur le bouton
        -- de paiement (click, kind = checkout) en tient lieu.
        bool_or(event_type = 'checkout_started' or (event_type = 'click' and md->>'kind' = 'checkout')) as checkout_started,
        bool_or(event_type = 'checkout_success_view') as checkout_success
      from raw
      group by 1, 2
    ),
    first_pv as (
      select distinct on (period, session_id) period, session_id, locale, md
      from raw where event_type = 'page_view'
      order by period, session_id, created_at, id
    ),
    first_ev as (
      select distinct on (period, session_id) period, session_id, locale
      from raw
      order by period, session_id, created_at, id
    ),
    sess_dim as (
      select s.*,
        left(coalesce(fp.locale, fe.locale), 16) as site,
        left(fp.md->>'device', 20) as device,
        left(fp.md->>'country_guess', 8) as country,
        left(fp.md->>'browser', 40) as browser,
        left(fp.md->>'os', 20) as os,
        case when fp.session_id is not null
          then public.admin_source_group(fp.md->>'utm_source', fp.md->>'ref', fp.md->>'browser') end as source_group,
        left(coalesce(nullif(fp.md->>'utm_source', ''), nullif(fp.md->>'ref', '')), 80) as source_raw,
        left(nullif(fp.md->>'utm_source', ''), 80) as utm_source,
        left(nullif(fp.md->>'utm_medium', ''), 80) as medium,
        left(nullif(fp.md->>'utm_campaign', ''), 80) as campaign,
        (f.session_id is not null) as is_internal
      from sess s
      left join first_pv fp on fp.period = s.period and fp.session_id = s.session_id
      left join first_ev fe on fe.period = s.period and fe.session_id = s.session_id
      left join flagged f on f.session_id = s.session_id
    ),
    keep as (
      select d.*
      from sess_dim d, params p
      where (p.with_internal or not d.is_internal)
        and (p.f_site is null
          or (p.f_site = 'intl' and d.site in ('en', 'es', 'de', 'it', 'pt'))
          or d.site = p.f_site)
        and (p.f_device is null or d.device = p.f_device)
        and (p.f_source is null or d.source_group = p.f_source)
    ),
    ev as (
      select r.* from raw r
      join keep k on k.period = r.period and k.session_id = r.session_id
    ),
    gaps as (
      select period, session_id,
        created_at - lag(created_at) over (partition by period, session_id order by created_at, id) as gap
      from ev
    ),
    visit_counts as (
      select period, session_id, 1 + count(*) filter (where gap > interval '30 minutes') as visits
      from gaps group by 1, 2
    ),
    leaves as (
      select period, session_id, md->>'pv' as pv,
        max(case when md->>'sec' ~ '^[0-9]{1,7}$' then least((md->>'sec')::int, 1800) end) as sec,
        max(case when md->>'scroll' ~ '^[0-9]{1,3}$' then least((md->>'scroll')::int, 100) end) as scroll
      from ev
      where event_type = 'page_leave' and md->>'pv' is not null
      group by 1, 2, 3
    ),
    sess_full as (
      select k.*, coalesce(v.visits, 1) as visits,
        least(coalesce(l.total, extract(epoch from (k.last_at - k.first_at))::int), 14400) as sec
      from keep k
      left join visit_counts v on v.period = k.period and v.session_id = k.session_id
      left join (select period, session_id, sum(sec) as total from leaves group by 1, 2) l
        on l.period = k.period and l.session_id = k.session_id
    ),
    kpi as (
      select period,
        count(*) filter (where pageviews > 0) as visitors,
        coalesce(sum(visits) filter (where pageviews > 0), 0) as visits,
        coalesce(sum(pageviews), 0) as page_views,
        round(avg(sec) filter (where pageviews > 0)) as avg_visit_sec,
        round(100.0 * count(*) filter (where pageviews = 1) / nullif(count(*) filter (where pageviews > 0), 0), 1) as bounce_rate,
        count(*) filter (where signed_up) as signups,
        round(100.0 * count(*) filter (where signed_up and pageviews > 0) / nullif(count(*) filter (where pageviews > 0), 0), 2) as signup_rate,
        count(*) filter (where checkout_started) as checkout_started,
        count(*) filter (where checkout_success) as checkout_success,
        count(*) filter (where pageviews > 0 and visits > 1) as multi_visit_visitors
      from sess_full
      group by 1
    ),
    kpi_full as (
      select pr.period,
        coalesce(k.visitors, 0) as visitors,
        coalesce(k.visits, 0) as visits,
        coalesce(k.page_views, 0) as page_views,
        k.avg_visit_sec, k.bounce_rate,
        coalesce(k.signups, 0) as signups,
        k.signup_rate,
        coalesce(k.checkout_started, 0) as checkout_started,
        coalesce(k.checkout_success, 0) as checkout_success,
        coalesce(k.multi_visit_visitors, 0) as multi_visit_visitors
      from (values ('cur'), ('prev')) as pr(period)
      left join kpi k on k.period = pr.period
    ),
    pv as (
      select ev.*,
        regexp_replace(regexp_replace(left(ev.page, 300), '\.html$', ''), '/index$', '/') as npage,
        case when ev.md->>'match_id' ~ '^[0-9]{1,12}$' then ev.md->>'match_id' end as match_id
      from ev where ev.period = 'cur' and ev.event_type = 'page_view'
    ),
    buckets as (
      select g as bucket
      from params p,
        generate_series(
          p.from_d::timestamp,
          case when p.hourly
            then greatest(p.from_d::timestamp, date_trunc('hour', (p.cur_end - interval '1 microsecond') at time zone 'Europe/Paris'))
            else p.to_d::timestamp end,
          case when p.hourly then interval '1 hour' else interval '1 day' end
        ) g
    ),
    bucket_counts as (
      select date_trunc(case when p.hourly then 'hour' else 'day' end, pv.created_at at time zone 'Europe/Paris') as bucket,
        count(distinct pv.session_id) as visitors,
        count(*) as page_views
      from pv, params p
      group by 1
    ),
    top_pages as (
      select pv.npage as page, pv.match_id,
        count(*) as views,
        count(distinct pv.session_id) as visitors,
        round(avg(l.sec)) as avg_sec,
        round(avg(l.scroll)) as avg_scroll
      from pv
      left join leaves l on l.period = 'cur' and l.session_id = pv.session_id and l.pv = pv.md->>'pv'
      group by pv.npage, pv.match_id
      order by views desc, pv.npage
      limit 100
    ),
    top_matches as (
      select match_id, count(*) as views, count(distinct session_id) as visitors,
        array_agg(distinct left(locale, 16)) filter (where locale is not null) as sites
      from pv
      where match_id is not null
      group by 1
      order by views desc, match_id
      limit 100
    ),
    page_views_by_page as (
      select npage, match_id, count(*) as views from pv group by 1, 2
    ),
    entry_pages as (
      select f.npage as page, f.match_id, count(*) as entries
      from (select distinct on (session_id) session_id, npage, match_id from pv order by session_id, created_at, id) f
      group by 1, 2 order by entries desc, page limit 50
    ),
    exit_pages as (
      select l.npage as page, l.match_id, count(*) as exits,
        max(v.views) as views,
        round(100.0 * count(*) / nullif(max(v.views), 0), 1) as exit_rate
      from (select distinct on (session_id) session_id, npage, match_id from pv order by session_id, created_at desc, id desc) l
      left join page_views_by_page v on v.npage = l.npage and v.match_id is not distinct from l.match_id
      group by 1, 2 order by exits desc, page limit 50
    ),
    heatmap as (
      select extract(isodow from created_at at time zone 'Europe/Paris')::int as dow,
        extract(hour from created_at at time zone 'Europe/Paris')::int as hour,
        count(distinct session_id) as visitors,
        count(*) as page_views
      from pv group by 1, 2
    ),
    cur_sess as (
      select * from sess_full where period = 'cur' and pageviews > 0
    ),
    sources as (
      select source_group, count(*) as visitors,
        count(*) filter (where signed_up) as signups,
        count(*) filter (where checkout_success) as checkout_success,
        (array_agg(distinct source_raw) filter (where source_raw is not null))[1:8] as examples
      from cur_sess group by 1 order by visitors desc, source_group
    ),
    campaigns as (
      select utm_source, medium, campaign, source_group, count(*) as visitors,
        count(*) filter (where signed_up) as signups
      from cur_sess
      where utm_source is not null or campaign is not null
      group by 1, 2, 3, 4 order by visitors desc, utm_source limit 50
    ),
    countries as (
      select country, count(*) as visitors, count(*) filter (where signed_up) as signups
      from cur_sess group by 1 order by visitors desc limit 60
    ),
    sites as (
      select site, count(*) as visitors, count(*) filter (where signed_up) as signups
      from cur_sess group by 1 order by visitors desc
    ),
    devices as (
      select device, count(*) as visitors from cur_sess group by 1 order by visitors desc
    ),
    funnel as (
      select count(*) filter (where pageviews > 0) as visitors,
        count(*) filter (where saw_home) as home_page,
        count(*) filter (where saw_match) as match_page,
        count(*) filter (where saw_signup) as signup_page,
        count(*) filter (where signed_up) as signed_up,
        count(*) filter (where saw_pricing) as pricing_page,
        count(*) filter (where checkout_started) as checkout_started,
        count(*) filter (where checkout_success) as checkout_success
      from sess_full where period = 'cur'
    )
    select json_build_object(
      'range', (select json_build_object(
          'from', p.from_d, 'to', p.to_d, 'days', p.n_days,
          'granularity', case when p.hourly then 'hour' else 'day' end,
          'cur_start', p.cur_start, 'cur_end', p.cur_end,
          'prev_start', p.prev_start, 'prev_end', p.prev_end,
          'since', p_since,
          'previous_complete', (p_since is null or p.prev_start >= p_since))
        from params p),
      'filters', (select json_build_object('include_internal', p.with_internal, 'site', p.f_site, 'device', p.f_device, 'source', p.f_source) from params p),
      'kpis', (select row_to_json(k) from kpi_full k where k.period = 'cur'),
      'previous', (select row_to_json(k) from kpi_full k where k.period = 'prev'),
      'internal_sessions', (select count(*) from sess_dim where period = 'cur' and is_internal),
      'series', (select coalesce(json_agg(json_build_object(
          't', b.bucket, 'visitors', coalesce(c.visitors, 0), 'page_views', coalesce(c.page_views, 0)) order by b.bucket), '[]'::json)
        from buckets b left join bucket_counts c on c.bucket = b.bucket),
      'top_pages', (select coalesce(json_agg(t order by t.views desc, t.page), '[]'::json) from top_pages t),
      'top_matches', (select coalesce(json_agg(t order by t.views desc, t.match_id), '[]'::json) from top_matches t),
      'sources', (select coalesce(json_agg(t order by t.visitors desc, t.source_group), '[]'::json) from sources t),
      'campaigns', (select coalesce(json_agg(t order by t.visitors desc), '[]'::json) from campaigns t),
      'countries', (select coalesce(json_agg(t order by t.visitors desc), '[]'::json) from countries t),
      'sites', (select coalesce(json_agg(t order by t.visitors desc), '[]'::json) from sites t),
      'devices', (select coalesce(json_agg(t order by t.visitors desc), '[]'::json) from devices t),
      'funnel', (select row_to_json(f) from funnel f),
      'entry_pages', (select coalesce(json_agg(t order by t.entries desc, t.page), '[]'::json) from entry_pages t),
      'exit_pages', (select coalesce(json_agg(t order by t.exits desc, t.page), '[]'::json) from exit_pages t),
      'heatmap', (select coalesce(json_agg(t order by t.dow, t.hour), '[]'::json) from heatmap t),
      'coverage', json_build_object(
        'first_event_at', (select min(created_at) from public.funnel_events),
        'last_event_at', (select max(created_at) from public.funnel_events),
        'launch_at', '2026-09-13 19:00:00+00'::timestamptz
      ),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_analytics(integer, boolean, date, date, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_analytics(integer, boolean, date, date, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b) admin_live_view : visiteurs actifs (evenement dans les 5 dernieres
--     minutes), page courante, pages vues par minute sur 30 minutes.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_live_view();
create or replace function public.admin_live_view(
  p_include_internal boolean default false,
  p_site text default null,
  p_device text default null,
  p_source text default null
)
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
      select
        case when p_site in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx', 'intl') then p_site end as f_site,
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device end as f_device,
        case when p_source in ('tiktok', 'instagram', 'facebook', 'google', 'bing', 'x', 'whatsapp', 'direct', 'other') then p_source end as f_source,
        coalesce(p_include_internal, false) as with_internal
    ),
    ev as (
      select e.id, e.session_id, e.event_type, e.page, e.locale,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md,
        e.created_at
      from public.funnel_events e
      where e.created_at > now() - interval '30 minutes'
        and e.created_at <= now()
        and e.session_id is not null
    ),
    sessions as (
      select session_id, max(created_at) as last_at, min(created_at) as first_at
      from ev group by session_id
    ),
    dim as (
      select s.session_id, s.last_at, s.first_at,
        lp.page, lp.locale as page_locale, lp.match_id,
        fp.md as first_md, fp.locale as first_locale,
        le.event_type as last_type,
        coalesce(fl.flag, false) as is_internal,
        pvc.page_views
      from sessions s
      left join lateral (
        select x.page, x.locale,
          case when x.metadata->>'match_id' ~ '^[0-9]{1,12}$' then x.metadata->>'match_id' end as match_id
        from public.funnel_events x
        where x.session_id = s.session_id and x.event_type = 'page_view'
          and x.created_at > now() - interval '12 hours' and x.created_at <= now()
        order by x.created_at desc, x.id desc limit 1
      ) lp on true
      left join lateral (
        select case when jsonb_typeof(x.metadata) = 'object' then x.metadata else '{}'::jsonb end as md, x.locale
        from public.funnel_events x
        where x.session_id = s.session_id and x.event_type = 'page_view'
          and x.created_at > now() - interval '12 hours' and x.created_at <= now()
        order by x.created_at, x.id limit 1
      ) fp on true
      left join lateral (
        select x.event_type from ev x where x.session_id = s.session_id
        order by x.created_at desc, x.id desc limit 1
      ) le on true
      left join lateral (
        select true as flag from public.funnel_events x
        where x.session_id = s.session_id and x.created_at > now() - interval '1 day'
          and (public.admin_internal_reason(x.metadata) is not null or x.session_id ilike 'qa%'
            or x.user_id in (select u.id from public.users u where public.admin_internal_account(u.email, u.role)))
        limit 1
      ) fl on true
      left join lateral (
        select count(*) as page_views from public.funnel_events x
        where x.session_id = s.session_id and x.event_type = 'page_view'
          and x.created_at > now() - interval '12 hours' and x.created_at <= now()
      ) pvc on true
    ),
    enriched as (
      select d.*,
        left(coalesce(d.first_locale, d.page_locale), 16) as site,
        left(d.first_md->>'device', 20) as device,
        left(d.first_md->>'country_guess', 8) as country,
        case when d.first_md is not null
          then public.admin_source_group(d.first_md->>'utm_source', d.first_md->>'ref', d.first_md->>'browser') end as source_group,
        left(coalesce(nullif(d.first_md->>'utm_source', ''), nullif(d.first_md->>'ref', '')), 80) as source_raw
      from dim d
    ),
    kept as (
      select en.* from enriched en, params p
      where (p.with_internal or not en.is_internal)
        and (p.f_site is null
          or (p.f_site = 'intl' and en.site in ('en', 'es', 'de', 'it', 'pt'))
          or en.site = p.f_site)
        and (p.f_device is null or en.device = p.f_device)
        and (p.f_source is null or en.source_group = p.f_source)
    ),
    active as (
      select * from kept where last_at > now() - interval '5 minutes'
    ),
    minutes as (
      select generate_series(date_trunc('minute', now()) - interval '29 minutes', date_trunc('minute', now()), interval '1 minute') as m
    ),
    per_minute as (
      select date_trunc('minute', ev.created_at) as m, count(*) as page_views
      from ev join kept k on k.session_id = ev.session_id
      where ev.event_type = 'page_view' group by 1
    )
    select json_build_object(
      'active_visitors', (select count(*) from active),
      'internal_active', (select count(*) from enriched where is_internal and last_at > now() - interval '5 minutes'),
      'page_views_30m', (select coalesce(sum(page_views), 0) from per_minute),
      'visitors', (select coalesce(json_agg(json_build_object(
          'session_id', a.session_id, 'last_at', a.last_at, 'first_at', a.first_at,
          'page_views', a.page_views, 'page', left(a.page, 300), 'match_id', a.match_id,
          'site', a.site, 'country', a.country, 'device', a.device,
          'source_group', a.source_group, 'source_raw', a.source_raw,
          'tab_hidden', (a.last_type = 'page_leave'), 'is_internal', a.is_internal
        ) order by a.last_at desc), '[]'::json)
        from (select * from active order by last_at desc limit 50) a),
      'per_minute', (select json_agg(json_build_object('t', mi.m, 'page_views', coalesce(pm.page_views, 0)) order by mi.m)
        from minutes mi left join per_minute pm on pm.m = mi.m),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_live_view(boolean, text, text, text) from public, anon;
grant execute on function public.admin_live_view(boolean, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2c) admin_recent_sessions : dernieres visites de la periode (memes filtres)
--     avec parcours ordonne, temps par page, clics et issue. Aucun user_id ni
--     email. session_id renvoye pour admin_exclude_session.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_recent_sessions(integer);
create or replace function public.admin_recent_sessions(
  p_limit integer default 60,
  p_include_internal boolean default false,
  p_from date default null,
  p_to date default null,
  p_since timestamptz default '2026-09-13 19:00:00+00',
  p_site text default null,
  p_device text default null,
  p_source text default null
)
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
      select
        case when p_from is null then now() - interval '30 days'
             else least(p_from, coalesce(p_to, p_from))::timestamp at time zone 'Europe/Paris' end as w_start,
        case when p_from is null then now()
             else least(now(), (greatest(p_from, coalesce(p_to, p_from)) + 1)::timestamp at time zone 'Europe/Paris') end as w_end,
        coalesce(p_since, '-infinity'::timestamptz) as floor_at,
        greatest(1, least(coalesce(p_limit, 60), 200)) as lim,
        case when p_site in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx', 'intl') then p_site end as f_site,
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device end as f_device,
        case when p_source in ('tiktok', 'instagram', 'facebook', 'google', 'bing', 'x', 'whatsapp', 'direct', 'other') then p_source end as f_source,
        coalesce(p_include_internal, false) as with_internal
    ),
    raw as (
      select e.id, e.session_id, e.event_type, e.page, e.locale,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md,
        e.created_at
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= greatest(p.w_start, p.floor_at)
        and e.created_at <= p.w_end
    ),
    flagged as (
      select distinct e.session_id
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= p.w_start - interval '1 day'
        and e.created_at <= p.w_end
        and (public.admin_internal_reason(e.metadata) is not null or e.session_id ilike 'qa%'
          or e.user_id in (select u.id from public.users u where public.admin_internal_account(u.email, u.role)))
    ),
    sess as (
      select session_id, min(created_at) as first_at, max(created_at) as last_at
      from raw group by 1
    ),
    first_pv as (
      select distinct on (session_id) session_id, page, locale, md
      from raw where event_type = 'page_view'
      order by session_id, created_at, id
    ),
    first_ev as (
      select distinct on (session_id) session_id, page, locale
      from raw order by session_id, created_at, id
    ),
    dim as (
      select s.session_id, s.first_at, s.last_at,
        left(coalesce(fp.locale, fe.locale), 16) as site,
        left(coalesce(fp.page, fe.page), 300) as entry_page,
        case when fp.md->>'match_id' ~ '^[0-9]{1,12}$' then fp.md->>'match_id' end as entry_match_id,
        left(fp.md->>'device', 20) as device,
        left(fp.md->>'browser', 40) as browser,
        left(fp.md->>'os', 20) as os,
        left(fp.md->>'country_guess', 8) as country,
        case when fp.session_id is not null
          then public.admin_source_group(fp.md->>'utm_source', fp.md->>'ref', fp.md->>'browser') end as source_group,
        left(coalesce(nullif(fp.md->>'utm_source', ''), nullif(fp.md->>'ref', '')), 80) as source_raw,
        left(nullif(fp.md->>'utm_campaign', ''), 80) as utm_campaign,
        (f.session_id is not null) as is_internal
      from sess s
      left join first_pv fp on fp.session_id = s.session_id
      left join first_ev fe on fe.session_id = s.session_id
      left join flagged f on f.session_id = s.session_id
    ),
    kept as (
      select d.* from dim d, params p
      where (p.with_internal or not d.is_internal)
        and (p.f_site is null
          or (p.f_site = 'intl' and d.site in ('en', 'es', 'de', 'it', 'pt'))
          or d.site = p.f_site)
        and (p.f_device is null or d.device = p.f_device)
        and (p.f_source is null or d.source_group = p.f_source)
      order by d.last_at desc
      limit (select lim from params)
    ),
    detail as (
      select k.*,
        agg.page_views, agg.signed_up, agg.checkout_started, agg.checkout_success,
        least(coalesce(agg.leave_sec, extract(epoch from (k.last_at - k.first_at))::int), 14400) as duration_sec,
        coalesce(rsn.reason, case when k.session_id ilike 'qa%' then 'qa' when k.is_internal then 'account' end) as internal_reason,
        pages.list as pages,
        events.list as events
      from kept k
      cross join params p
      left join lateral (
        select public.admin_internal_reason(x.metadata) as reason
        from public.funnel_events x
        where x.session_id = k.session_id
          and x.created_at >= p.w_start - interval '1 day' and x.created_at <= p.w_end
          and public.admin_internal_reason(x.metadata) is not null
        order by x.created_at limit 1
      ) rsn on true
      left join lateral (
        select count(*) filter (where e.event_type = 'page_view') as page_views,
          bool_or(e.event_type = 'signup_completed') as signed_up,
          bool_or(e.event_type = 'checkout_started' or (e.event_type = 'click' and e.md->>'kind' = 'checkout')) as checkout_started,
          bool_or(e.event_type = 'checkout_success_view') as checkout_success,
          (select sum(x.sec) from (
             select max(case when l.md->>'sec' ~ '^[0-9]{1,7}$' then least((l.md->>'sec')::int, 1800) end) as sec
             from raw l
             where l.session_id = k.session_id and l.event_type = 'page_leave' and l.md->>'pv' is not null
             group by l.md->>'pv') x) as leave_sec
        from raw e
        where e.session_id = k.session_id
      ) agg on true
      left join lateral (
        select json_agg(json_build_object(
            'page', left(q.page, 300), 'match_id', q.match_id, 'at', q.created_at, 'sec', q.sec, 'scroll', q.scroll)
            order by q.created_at, q.id) as list
        from (
          select v.id, v.page, v.created_at,
            case when v.md->>'match_id' ~ '^[0-9]{1,12}$' then v.md->>'match_id' end as match_id,
            -- Sans page_leave : ecart jusqu'a la page suivante (30 min max) ;
            -- derniere page sans page_leave => null (inconnu). least(NULL, x)
            -- vaut x en Postgres, d'ou le case.
            coalesce(lv.sec,
              case when lead(v.created_at) over (order by v.created_at, v.id) is not null
                then least(extract(epoch from (lead(v.created_at) over (order by v.created_at, v.id) - v.created_at))::int, 1800)
              end) as sec,
            lv.scroll
          from raw v
          left join lateral (
            select max(case when l.md->>'sec' ~ '^[0-9]{1,7}$' then least((l.md->>'sec')::int, 1800) end) as sec,
                   max(case when l.md->>'scroll' ~ '^[0-9]{1,3}$' then least((l.md->>'scroll')::int, 100) end) as scroll
            from raw l
            where l.session_id = k.session_id and l.event_type = 'page_leave'
              and l.md->>'pv' is not null and l.md->>'pv' = v.md->>'pv'
          ) lv on true
          where v.session_id = k.session_id and v.event_type = 'page_view'
          order by v.created_at, v.id
          limit 60
        ) q
      ) pages on true
      left join lateral (
        select json_agg(json_build_object(
            'type', y.event_type, 'at', y.created_at, 'page', left(y.page, 300),
            'label', left(y.md->>'label', 80), 'kind', left(y.md->>'kind', 20),
            'match_id', case when y.md->>'match_id' ~ '^[0-9]{1,12}$' then y.md->>'match_id' end)
            order by y.created_at, y.id) as list
        from (
          select e.id, e.event_type, e.created_at, e.page, e.md
          from raw e
          where e.session_id = k.session_id and e.event_type not in ('page_view', 'page_leave')
          order by e.created_at, e.id
          limit 40
        ) y
      ) events on true
    )
    select coalesce(json_agg(json_build_object(
        'session_id', d.session_id, 'first_at', d.first_at, 'last_at', d.last_at,
        'site', d.site, 'entry_page', d.entry_page, 'entry_match_id', d.entry_match_id,
        'device', d.device, 'browser', d.browser, 'os', d.os, 'country', d.country,
        'source_group', d.source_group, 'source_raw', d.source_raw, 'utm_campaign', d.utm_campaign,
        'page_views', d.page_views, 'duration_sec', d.duration_sec,
        'signed_up', d.signed_up, 'checkout_started', d.checkout_started, 'checkout_success', d.checkout_success,
        'is_internal', d.is_internal, 'internal_reason', d.internal_reason,
        'pages', coalesce(d.pages, '[]'::json), 'events', coalesce(d.events, '[]'::json)
      ) order by d.last_at desc), '[]'::json)
    from detail d
  );
end;
$$;
revoke all on function public.admin_recent_sessions(integer, boolean, date, date, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_recent_sessions(integer, boolean, date, date, timestamptz, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2d) admin_recent_signups(p_limit) : meme signature que 0015, ajoute le
--     groupe de source, la source brute et le navigateur de la visite.
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
        public.admin_internal_account(u.email, u.role) as is_internal,
        s.locale as site_version,
        s.page as signup_page,
        fp.source_group, fp.source_raw, fp.source, fp.country_guess, fp.device, fp.browser
      from public.users u
      left join lateral (
        select e.session_id, e.locale, e.page
        from public.funnel_events e
        where e.user_id = u.id and e.event_type = 'signup_completed'
        order by e.created_at limit 1
      ) s on true
      left join lateral (
        select public.admin_source_group(f.metadata->>'utm_source', f.metadata->>'ref', f.metadata->>'browser') as source_group,
          left(coalesce(nullif(f.metadata->>'utm_source', ''), nullif(f.metadata->>'ref', '')), 80) as source_raw,
          left(coalesce(nullif(f.metadata->>'utm_source', ''), nullif(f.metadata->>'ref', ''), '(direct)'), 80) as source,
          left(f.metadata->>'country_guess', 8) as country_guess,
          left(f.metadata->>'device', 20) as device,
          left(f.metadata->>'browser', 40) as browser
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
-- 2e) admin_business : comptes, abonnements et encaissements (LECTURE SEULE).
--     Aucun prix n'est duplique : les montants viennent des evenements Stripe
--     reellement recus (billing_events). Premiers paiements =
--     checkout.session.completed payes ; renouvellements = factures payees de
--     type subscription_cycle, dedoublonnees par identifiant de facture
--     (invoice.paid et invoice.payment_succeeded arrivent tous les deux).
--     Les comptes admin sont exclus des inscriptions.
-- ---------------------------------------------------------------------------
create or replace function public.admin_business(
  p_days integer default 7,
  p_from date default null,
  p_to date default null
)
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
    with base as (
      select (now() at time zone 'Europe/Paris')::date as today,
        greatest(1, least(coalesce(p_days, 7), 395)) as days
    ),
    bounds as (
      select
        case when p_from is null then b.today - (b.days - 1)
             else least(p_from, coalesce(p_to, p_from), b.today) end as from_d,
        least(case when p_from is null then b.today
                   else greatest(p_from, coalesce(p_to, p_from)) end, b.today) as to_d
      from base b
    ),
    params as (
      select bo.from_d, bo.to_d,
        bo.from_d::timestamp at time zone 'Europe/Paris' as cur_start,
        least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') as cur_end,
        (bo.from_d - (bo.to_d - bo.from_d + 1))::timestamp at time zone 'Europe/Paris' as prev_start,
        ((least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') at time zone 'Europe/Paris')
          - make_interval(days => (bo.to_d - bo.from_d + 1))) at time zone 'Europe/Paris' as prev_end
      from bounds bo
    ),
    new_users as (
      select u.id, u.plan, u.created_at, s.locale, fp.source_group
      from public.users u
      cross join params p
      left join lateral (
        select e.session_id, e.locale from public.funnel_events e
        where e.user_id = u.id and e.event_type = 'signup_completed'
        order by e.created_at limit 1
      ) s on true
      left join lateral (
        select public.admin_source_group(f.metadata->>'utm_source', f.metadata->>'ref', f.metadata->>'browser') as source_group
        from public.funnel_events f
        where s.session_id is not null and f.session_id = s.session_id and f.event_type = 'page_view'
        order by f.created_at, f.id limit 1
      ) fp on true
      where not public.admin_internal_account(u.email, u.role)
        and u.created_at >= p.cur_start and u.created_at <= p.cur_end
    ),
    ext_users as (
      select u.id, u.plan, u.created_at from public.users u
      where not public.admin_internal_account(u.email, u.role)
    ),
    ext_subs as (
      select s.* from public.subscriptions s
      where not exists (select 1 from public.users u
        where u.id = s.user_id and public.admin_internal_account(u.email, u.role))
    ),
    pay as (
      select be.event_type, be.processed_at,
        be.payload->'data'->'object' as obj
      from public.billing_events be, params p
      where be.processed_at >= p.cur_start and be.processed_at <= p.cur_end
        and jsonb_typeof(be.payload->'data'->'object') = 'object'
    ),
    first_payments as (
      select lower(left(obj->>'currency', 8)) as currency,
        count(*) as payments,
        sum(case when obj->>'amount_total' ~ '^[0-9]{1,12}$' then (obj->>'amount_total')::bigint else 0 end) as amount_cents
      from pay
      where event_type = 'checkout.session.completed'
        and coalesce(obj->>'payment_status', 'paid') = 'paid'
      group by 1
    ),
    renewals as (
      select lower(left(r.currency, 8)) as currency, count(*) as payments, sum(r.amount) as amount_cents
      from (
        select distinct on (obj->>'id') obj->>'currency' as currency,
          case when obj->>'amount_paid' ~ '^[0-9]{1,12}$' then (obj->>'amount_paid')::bigint else 0 end as amount
        from pay
        where event_type in ('invoice.paid', 'invoice.payment_succeeded')
          and obj->>'billing_reason' = 'subscription_cycle'
          and obj->>'id' is not null
        order by obj->>'id', processed_at
      ) r
      group by 1
    )
    select json_build_object(
      'range', (select json_build_object('from', p.from_d, 'to', p.to_d, 'cur_start', p.cur_start, 'cur_end', p.cur_end) from params p),
      'users', json_build_object(
        'total', (select count(*) from ext_users),
        'free', (select count(*) from ext_users where plan = 'free'),
        'pro', (select count(*) from ext_users where plan = 'pro'),
        'admins', (select count(*) from public.users where role = 'admin'),
        'internal', (select count(*) from public.users u where public.admin_internal_account(u.email, u.role))
      ),
      'accounts_created', (select count(*) from new_users),
      'accounts_created_prev', (select count(*) from ext_users u, params p
        where u.created_at >= p.prev_start and u.created_at <= p.prev_end),
      'subscriptions', json_build_object(
        'active', (select count(*) from ext_subs where status in ('active', 'trialing')),
        'past_due', (select count(*) from ext_subs where status = 'past_due'),
        'cancel_pending', (select count(*) from ext_subs where status in ('active', 'trialing') and cancel_at_period_end),
        'new_in_period', (select count(*) from ext_subs s, params p where s.created_at >= p.cur_start and s.created_at <= p.cur_end),
        'new_prev_period', (select count(*) from ext_subs s, params p where s.created_at >= p.prev_start and s.created_at <= p.prev_end),
        'ended_in_period', (select count(*) from ext_subs s, params p
          where s.status in ('canceled', 'unpaid', 'incomplete_expired') and s.updated_at >= p.cur_start and s.updated_at <= p.cur_end)
      ),
      'first_payments', (select coalesce(json_agg(t order by t.amount_cents desc), '[]'::json) from first_payments t),
      'renewals', (select coalesce(json_agg(t order by t.amount_cents desc), '[]'::json) from renewals t),
      'signups_by_site', (select coalesce(json_agg(t order by t.signups desc), '[]'::json)
        from (select locale as site, count(*) as signups from new_users group by 1) t),
      'signups_by_source', (select coalesce(json_agg(t order by t.signups desc), '[]'::json)
        from (select source_group, count(*) as signups from new_users group by 1) t),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_business(integer, date, date) from public, anon;
grant execute on function public.admin_business(integer, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) admin_exclude_session : retro-nettoyage manuel d'une visite.
--    SEULE ecriture de cette migration. UPDATE de metadata uniquement.
-- ---------------------------------------------------------------------------
create or replace function public.admin_exclude_session(p_session_id text, p_exclude boolean default true)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'invalid_session_id' using errcode = '22023';
  end if;

  if coalesce(p_exclude, true) then
    update public.funnel_events
       set metadata = (case when jsonb_typeof(metadata) = 'object' then metadata else '{}'::jsonb end)
                      || '{"internal": true, "admin_excluded": true}'::jsonb
     where session_id = p_session_id
       and coalesce(metadata->>'internal', '') <> 'true';
  else
    update public.funnel_events
       set metadata = (metadata - 'internal') - 'admin_excluded'
     where session_id = p_session_id
       and metadata->>'admin_excluded' = 'true';
  end if;

  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.admin_exclude_session(text, boolean) from public, anon;
grant execute on function public.admin_exclude_session(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) admin_health : sante du suivi et des paiements (LECTURE SEULE). Les
--    fichiers du pipeline quotidien (data-home.json) sont lus par la page
--    elle-meme, pas par la base.
-- ---------------------------------------------------------------------------
create or replace function public.admin_health()
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

  return json_build_object(
    'last_event_at', (select max(created_at) from public.funnel_events),
    'last_page_view_at', (select max(created_at) from public.funnel_events where event_type = 'page_view'),
    'events_24h', (select count(*) from public.funnel_events where created_at > now() - interval '24 hours'),
    'page_views_24h', (select count(*) from public.funnel_events where event_type = 'page_view' and created_at > now() - interval '24 hours'),
    'flagged_events_24h', (select count(*) from public.funnel_events
      where created_at > now() - interval '24 hours'
        and (public.admin_internal_reason(metadata) is not null or session_id ilike 'qa%')),
    'last_signup_at', (select max(u.created_at) from public.users u where not public.admin_internal_account(u.email, u.role)),
    'last_billing_event_at', (select max(processed_at) from public.billing_events),
    'first_event_at', (select min(created_at) from public.funnel_events),
    'generated_at', now()
  );
end;
$$;
revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;

-- Recharge du cache de schema PostgREST (nouvelles signatures RPC).
notify pgrst, 'reload schema';
