-- IASHARK - 0052 : admin en 9 écrans, « pourquoi ça ne convertit pas » (19/10/2026).
--
-- Étude du 19/10 (etudes/ADMIN-ETUDE-2026-10-19.md) : l'admin comptait les
-- visites, mais ne disait ni si les visiteurs voyaient vraiment le contenu,
-- ni si le site plantait, ni quel réseau / quelle publication amène des gens
-- utiles, ni où l'inscription ou le paiement échouent.
--
-- 1) funnel_events : nouveaux types d'événements (aucune donnée personnelle) :
--    - js_error            : erreur JavaScript de la page (message coupé à
--                            160 caractères, fichier, ligne ; 5 par page au plus) ;
--    - signup_form_started : première saisie dans le formulaire d'inscription ;
--    - signup_submitted    : formulaire envoyé ;
--    - signup_failed       : inscription refusée (code d'erreur seulement,
--                            jamais la valeur saisie) ;
--    - checkout_failed     : le paiement n'a pas pu s'ouvrir (motif court).
--    page_leave reçoit en plus (funnel-track.js, même jour) : content_ms
--    (délai d'affichage du contenu principal, -1 = jamais affiché avant le
--    départ), lcp / fcp / ttfb / inp (ms) et cls (Web Vitals, sans
--    bibliothèque), et page_view reçoit utm_content (la publication).
--    Tous les types existants sont conservés.
--
-- 2) admin_source_group : + youtube, snapchat (y compris le navigateur
--    intégré Snapchat), ia (chatgpt.com, perplexity, gemini, copilot,
--    claude.ai), reddit, telegram. Avant : tout cela tombait dans « Autre ».
--    Les listes de sources acceptées par les filtres des autres fonctions
--    admin sont élargies d'autant (bloc 3, remplacement de texte, idempotent).
--
-- 3) admin_num(text) : lecture sûre d'un nombre écrit par le navigateur
--    (metadata est contrôlée par le visiteur : jamais de cast direct).
--
-- 4) admin_diagnostics(...) : SECURITY DEFINER, lecture seule, réservée à
--    public.admin_is_admin(), exécutable par authenticated seulement. Mêmes
--    exclusions que partout (robots, tests, appareil du propriétaire, comptes
--    internes), mêmes filtres de période / version / appareil / source.
--    Une session « utile » = a ouvert une page match, OU vu au moins 2 pages,
--    OU passé au moins 30 secondes actives sur le site.
--    Renvoie : totaux, sources, campagnes / publications (utm), pages
--    d'arrivée, langues (langue du navigateur vs version du site), erreurs
--    JS, Web Vitals (75e centile, par appareil), étapes du formulaire
--    d'inscription, étapes du paiement, argent (table subscriptions, comptes
--    internes exclus) et qualité des données (dernier événement reçu par
--    type, date de début de chaque nouveau suivi).

-- ---------- 1) Types d'événements ----------
alter table public.funnel_events drop constraint if exists funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check check (event_type in (
  'landing_view', 'signup_started', 'signup_completed', 'login_completed', 'onboarding_dismissed',
  'tool_page_view', 'paywall_view', 'checkout_started', 'checkout_unavailable', 'checkout_success_view',
  'checkout_cancel_view', 'page_view', 'page_leave', 'click', 'gate_view',
  'js_error', 'signup_form_started', 'signup_submitted', 'signup_failed', 'checkout_failed'));

-- ---------- 2) Groupes de sources ----------
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
      when coalesce(p_browser, '') ilike 'Snapchat%' then 'snapchat'
      else 'direct' end
    when x.s ~ 'whatsapp|^wa\.me$' then 'whatsapp'
    when x.s ~ 'tiktok|musical\.ly|bytedance|^tt$' then 'tiktok'
    when x.s ~ 'instagram|^ig$' then 'instagram'
    when x.s ~ 'facebook|^fb$|(^|\.)fb\.com$|^m\.me$|messenger' then 'facebook'
    when x.s ~ '^t\.co$|twitter|^x$|(^|\.)x\.com$' then 'x'
    when x.s ~ 'youtube|youtu\.be|^yt$' then 'youtube'
    when x.s ~ 'snapchat|^snap$' then 'snapchat'
    when x.s ~ 'chatgpt|openai|perplexity|gemini\.google|copilot|claude\.ai|^ia$' then 'ia'
    when x.s ~ '(^|\.)google(\.|$)|googlequicksearchbox' then 'google'
    when x.s ~ '(^|\.)bing(\.|$)' then 'bing'
    when x.s ~ 'reddit' then 'reddit'
    when x.s ~ 'telegram|^t\.me$' then 'telegram'
    else 'other'
  end
  from (select nullif(lower(btrim(coalesce(nullif(btrim(p_utm), ''), nullif(btrim(p_ref), ''), ''))), '') as s) x
$$;

-- ---------- 3) Filtres des autres fonctions admin : nouvelles sources ----------
do $$
declare
  r record;
  d text;
  n text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('admin_analytics', 'admin_recent_sessions', 'admin_live_view', 'admin_conversion_funnel',
                        'admin_members', 'admin_business', 'admin_recent_signups')
  loop
    d := pg_get_functiondef(r.oid);
    n := replace(d, $q$'x', 'whatsapp', 'direct', 'other')$q$,
                 $q$'x', 'whatsapp', 'youtube', 'snapchat', 'ia', 'reddit', 'telegram', 'direct', 'other')$q$);
    n := replace(n, $q$when 'x' then 'social' when 'whatsapp' then 'social'$q$,
                 $q$when 'x' then 'social' when 'whatsapp' then 'social' when 'youtube' then 'social' when 'snapchat' then 'social' when 'reddit' then 'social' when 'telegram' then 'social'$q$);
    if n <> d then
      execute n;
    end if;
  end loop;
end
$$;

-- ---------- 4) Nombre sûr ----------
create or replace function public.admin_num(p text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case when p ~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then p::numeric end
$$;
revoke all on function public.admin_num(text) from public, anon, authenticated;

-- ---------- 5) Diagnostics ----------
create or replace function public.admin_diagnostics(
  p_from date default null,
  p_to date default null,
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
    with bounds as (
      select least(coalesce(p_from, b.today), coalesce(p_to, p_from, b.today), b.today) as from_raw,
        least(greatest(coalesce(p_from, b.today), coalesce(p_to, p_from, b.today)), b.today) as to_d
      from (select (now() at time zone 'Europe/Paris')::date as today) b
    ),
    params as (
      select greatest(bo.from_raw, bo.to_d - 394) as from_d, bo.to_d,
        greatest(greatest(bo.from_raw, bo.to_d - 394)::timestamp at time zone 'Europe/Paris', '2026-09-13 19:00:00+00'::timestamptz) as w_start,
        least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') as w_end,
        case when p_site in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx', 'intl') then p_site end as f_site,
        case when p_device in ('mobile', 'tablet', 'desktop') then p_device end as f_device,
        case when p_source ~ '^[a-z]{1,20}$' then p_source end as f_source,
        coalesce(p_include_internal, false) as with_internal
      from bounds bo
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
    raw as (
      select e.id, e.session_id, e.event_type, e.page, e.locale, e.created_at,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= p.w_start
        and e.created_at <= p.w_end
        and (p.with_internal or not exists (select 1 from flagged f where f.session_id = e.session_id))
    ),
    first_pv as (
      select distinct on (session_id) session_id, page, locale, md
      from raw
      where event_type = 'page_view'
      order by session_id, created_at, id
    ),
    sess0 as (
      select f.session_id,
        left(coalesce(f.page, ''), 300) as landing,
        left(coalesce(f.locale, 'fr'), 8) as site,
        left(f.md->>'pv', 40) as landing_pv,
        left(f.md->>'device', 20) as device,
        left(f.md->>'browser', 40) as browser,
        lower(left(coalesce(f.md->>'lang', ''), 2)) as blang,
        public.admin_source_group(f.md->>'utm_source', f.md->>'ref', f.md->>'browser') as src,
        left(nullif(btrim(f.md->>'utm_medium'), ''), 40) as medium,
        left(nullif(btrim(f.md->>'utm_campaign'), ''), 80) as campaign,
        left(nullif(btrim(f.md->>'utm_content'), ''), 80) as content,
        case when f.md->>'geo_country' ~ '^[A-Z]{2}$' then f.md->>'geo_country'
             when f.md->>'country_guess' ~ '^[A-Z]{2}$' then f.md->>'country_guess' end as country
      from first_pv f
    ),
    sess as (
      select s.*
      from sess0 s, params p
      where (p.f_site is null or s.site = p.f_site or (p.f_site = 'intl' and s.site in ('en', 'es', 'de', 'it', 'pt')))
        and (p.f_device is null or s.device = p.f_device)
        and (p.f_source is null or s.src = p.f_source)
    ),
    pv_leave as (
      select r.session_id, left(r.md->>'pv', 40) as pv,
        max(public.admin_num(r.md->>'sec')) as sec,
        max(public.admin_num(r.md->>'scroll')) as scroll,
        max(public.admin_num(r.md->>'content_ms')) as content_ms,
        bool_or(r.md ? 'content_ms') as content_known,
        max(public.admin_num(r.md->>'lcp')) as lcp,
        max(public.admin_num(r.md->>'fcp')) as fcp,
        max(public.admin_num(r.md->>'ttfb')) as ttfb,
        max(public.admin_num(r.md->>'inp')) as inp,
        max(public.admin_num(r.md->>'cls')) as cls
      from raw r
      where r.event_type = 'page_leave' and r.md ? 'pv'
        and r.session_id in (select session_id from sess)
      group by 1, 2
    ),
    agg as (
      select r.session_id,
        count(*) filter (where r.event_type = 'page_view') as pageviews,
        bool_or(r.event_type = 'page_view' and r.page ~ '/match(/[0-9]{1,12})?(\.html)?$') as saw_match,
        bool_or(r.event_type = 'signup_started' or (r.event_type = 'page_view' and r.page ~ '/inscription(\.html)?$')) as saw_signup,
        bool_or(r.event_type = 'signup_form_started') as form_started,
        bool_or(r.event_type = 'signup_submitted') as form_submitted,
        bool_or(r.event_type = 'signup_failed') as form_failed,
        bool_or(r.event_type = 'signup_completed') as signed_up,
        bool_or(r.event_type in ('landing_view', 'paywall_view')
          or (r.event_type = 'page_view' and r.page ~ '/(abonnement|pro|landing)(\.html)?$')) as saw_offer,
        bool_or(r.event_type = 'click' and r.md->>'kind' = 'checkout_consent') as consent,
        bool_or(r.event_type = 'click' and r.md->>'kind' = 'checkout') as pay_click,
        bool_or(r.event_type = 'checkout_started') as pay_started,
        bool_or(r.event_type in ('checkout_failed', 'checkout_unavailable')) as pay_failed,
        bool_or(r.event_type = 'checkout_success_view') as pay_success,
        bool_or(r.event_type = 'checkout_cancel_view') as pay_cancel,
        bool_or(r.event_type = 'gate_view') as saw_gate,
        bool_or(r.event_type = 'click' and (r.md->>'kind' in ('pro', 'abonnement') or r.md->>'kind' like '%\_unlock')) as pro_interest,
        count(*) filter (where r.event_type = 'js_error') as js_errors,
        bool_or(r.event_type = 'page_leave') as has_leave
      from raw r
      where r.session_id in (select session_id from sess)
      group by 1
    ),
    tsum as (
      select session_id, coalesce(sum(sec), 0) as sec from pv_leave group by 1
    ),
    fs as (
      select s.*, a.pageviews, a.saw_match, a.saw_signup, a.form_started, a.form_submitted, a.form_failed, a.signed_up,
        a.saw_offer, a.consent, a.pay_click, a.pay_started, a.pay_failed, a.pay_success, a.pay_cancel, a.saw_gate,
        a.pro_interest, a.js_errors, a.has_leave,
        coalesce(t.sec, 0) as total_sec,
        l.sec as landing_sec, l.content_ms as landing_content_ms, coalesce(l.content_known, false) as landing_content_known,
        (a.saw_match or a.pageviews >= 2 or coalesce(t.sec, 0) >= 30) as useful,
        case
          when s.blang = '' then false
          when s.site = 'fr' then s.blang <> 'fr'
          when s.site in ('en', 'gb', 'za') then s.blang <> 'en'
          when s.site in ('es', 'mx') then s.blang <> 'es'
          else false
        end as lang_mismatch
      from sess s
      join agg a on a.session_id = s.session_id
      left join tsum t on t.session_id = s.session_id
      left join pv_leave l on l.session_id = s.session_id and l.pv = s.landing_pv
    )
    select json_build_object(
      'range', json_build_object('from', p.from_d, 'to', p.to_d),
      'totals', (select json_build_object(
          'sessions', count(*),
          'useful', count(*) filter (where useful),
          'one_page', count(*) filter (where pageviews <= 1),
          'signups', count(*) filter (where signed_up),
          'pay_clicks', count(*) filter (where pay_click or pay_started),
          'pay_success', count(*) filter (where pay_success),
          'with_error', count(*) filter (where js_errors > 0),
          'lang_mismatch', count(*) filter (where lang_mismatch),
          'content_known', count(*) filter (where landing_content_known),
          'before_content', count(*) filter (where landing_content_known and landing_content_ms < 0),
          'median_sec', percentile_cont(0.5) within group (order by total_sec)
        ) from fs),
      'sources', (select coalesce(json_agg(x order by x.sessions desc, x.source), '[]'::json) from (
          select src as source, count(*) as sessions,
            count(*) filter (where useful) as useful,
            count(*) filter (where pageviews <= 1) as one_page,
            round(percentile_cont(0.5) within group (order by total_sec)::numeric, 0) as median_sec,
            count(*) filter (where signed_up) as signups,
            count(*) filter (where pro_interest) as pro_interest,
            count(*) filter (where pay_click or pay_started) as pay_clicks,
            count(*) filter (where pay_success) as pay_success
          from fs group by src) x),
      'campaigns', (select coalesce(json_agg(x order by x.sessions desc), '[]'::json) from (
          select src as source, medium, campaign, content, count(*) as sessions,
            count(*) filter (where useful) as useful,
            count(*) filter (where pageviews <= 1) as one_page,
            count(*) filter (where signed_up) as signups,
            count(*) filter (where pay_click or pay_started) as pay_clicks,
            min(landing) as landing
          from fs where campaign is not null or content is not null or medium is not null
          group by src, medium, campaign, content
          order by count(*) desc limit 40) x),
      'landing', (select coalesce(json_agg(x order by x.sessions desc), '[]'::json) from (
          select regexp_replace(regexp_replace(landing, '\?.*$', ''), '/match/[0-9]{1,12}(\.html)?$', '/match/') as page, site,
            count(*) as sessions,
            count(*) filter (where useful) as useful,
            count(*) filter (where pageviews <= 1) as one_page,
            round(percentile_cont(0.5) within group (order by coalesce(landing_sec, 0))::numeric, 0) as median_sec,
            count(*) filter (where landing_content_known) as content_known,
            count(*) filter (where landing_content_known and landing_content_ms < 0) as before_content,
            round(percentile_cont(0.5) within group (order by landing_content_ms) filter (where landing_content_ms >= 0)::numeric, 0) as content_ms,
            count(*) filter (where lang_mismatch) as lang_mismatch
          from fs group by 1, 2
          order by count(*) desc limit 25) x),
      'languages', (select coalesce(json_agg(x order by x.sessions desc), '[]'::json) from (
          select site, nullif(blang, '') as lang, count(*) as sessions,
            count(*) filter (where useful) as useful,
            count(*) filter (where pageviews <= 1) as one_page,
            bool_or(lang_mismatch) as mismatch
          from fs group by 1, 2
          order by count(*) desc limit 30) x),
      'errors', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
          select left(coalesce(r.md->>'msg', '?'), 160) as msg, left(coalesce(r.md->>'src', ''), 80) as src,
            count(*) as n, count(distinct r.session_id) as sessions, max(r.created_at) as last_at,
            min(left(r.page, 120)) as page
          from raw r join fs on fs.session_id = r.session_id
          where r.event_type = 'js_error'
          group by 1, 2
          order by count(*) desc limit 15) x),
      'vitals', (select coalesce(json_agg(x order by x.device), '[]'::json) from (
          select coalesce(s.device, 'unknown') as device,
            count(*) filter (where l.lcp is not null) as n_lcp,
            round(percentile_cont(0.75) within group (order by l.lcp) filter (where l.lcp is not null)::numeric, 0) as lcp,
            round(percentile_cont(0.75) within group (order by l.fcp) filter (where l.fcp is not null)::numeric, 0) as fcp,
            round(percentile_cont(0.75) within group (order by l.ttfb) filter (where l.ttfb is not null)::numeric, 0) as ttfb,
            count(*) filter (where l.inp is not null) as n_inp,
            round(percentile_cont(0.75) within group (order by l.inp) filter (where l.inp is not null)::numeric, 0) as inp,
            count(*) filter (where l.cls is not null) as n_cls,
            round(percentile_cont(0.75) within group (order by l.cls) filter (where l.cls is not null)::numeric, 3) as cls
          from pv_leave l join fs s on s.session_id = l.session_id
          group by 1) x),
      'signup', (select json_build_object(
          'page', count(*) filter (where saw_signup),
          'form_started', count(*) filter (where form_started),
          'submitted', count(*) filter (where form_submitted),
          'failed', count(*) filter (where form_failed),
          'completed', count(*) filter (where signed_up),
          'reasons', (select coalesce(json_agg(y order by y.n desc), '[]'::json) from (
              select left(coalesce(r.md->>'code', '?'), 40) as code, count(*) as n
              from raw r join fs on fs.session_id = r.session_id
              where r.event_type = 'signup_failed' group by 1 order by count(*) desc limit 10) y)
        ) from fs),
      'payment', (select json_build_object(
          'gate', count(*) filter (where saw_gate),
          'offer', count(*) filter (where saw_offer),
          'consent', count(*) filter (where consent),
          'click', count(*) filter (where pay_click or pay_started),
          'failed', count(*) filter (where pay_failed),
          'success', count(*) filter (where pay_success),
          'cancel', count(*) filter (where pay_cancel),
          'reasons', (select coalesce(json_agg(y order by y.n desc), '[]'::json) from (
              select left(coalesce(r.md->>'reason', r.event_type), 40) as reason, count(*) as n
              from raw r join fs on fs.session_id = r.session_id
              where r.event_type in ('checkout_failed', 'checkout_unavailable') group by 1 order by count(*) desc limit 10) y)
        ) from fs),
      'money', (select json_build_object(
          'active', count(*) filter (where s.status in ('active', 'trialing', 'past_due')),
          'paying', count(*) filter (where s.status = 'active'),
          'trialing', count(*) filter (where s.status = 'trialing'),
          'past_due', count(*) filter (where s.status = 'past_due'),
          'cancel_planned', count(*) filter (where s.status in ('active', 'trialing') and s.cancel_at_period_end),
          'new_in_period', count(*) filter (where s.created_at >= p.w_start and s.created_at <= p.w_end
            and s.status not in ('incomplete', 'incomplete_expired')),
          'canceled_in_period', count(*) filter (where s.status = 'canceled' and s.updated_at >= p.w_start and s.updated_at <= p.w_end),
          'canceled_total', count(*) filter (where s.status = 'canceled'),
          'by_market', (select coalesce(json_object_agg(m.k, m.n), '{}'::json) from (
              select coalesce(s2.market, 'fr') as k, count(*) as n
              from public.subscriptions s2 left join public.users u2 on u2.id = s2.user_id
              where s2.status in ('active', 'trialing', 'past_due')
                and (u2.id is null or not public.admin_internal_account(u2.email, u2.role))
              group by 1) m),
          'by_interval', (select coalesce(json_object_agg(m.k, m.n), '{}'::json) from (
              select coalesce(s2.billing_interval, 'month') as k, count(*) as n
              from public.subscriptions s2 left join public.users u2 on u2.id = s2.user_id
              where s2.status in ('active', 'trialing', 'past_due')
                and (u2.id is null or not public.admin_internal_account(u2.email, u2.role))
              group by 1) m)
        )
        from public.subscriptions s left join public.users u on u.id = s.user_id
        where u.id is null or not public.admin_internal_account(u.email, u.role)),
      'quality', json_build_object(
          'events', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
              select e.event_type, count(*) as n, max(e.created_at) as last_at
              from public.funnel_events e
              where e.created_at >= p.w_start and e.created_at <= p.w_end
              group by 1) x),
          'last_event_at', (select max(e.created_at) from public.funnel_events e),
          'excluded_sessions', (select count(*) from flagged),
          'sessions', (select count(*) from fs),
          'no_leave', (select count(*) from fs where not has_leave),
          'unknown_country', (select count(*) from fs where country is null),
          'direct', (select count(*) from fs where src = 'direct'),
          'since', json_build_object(
            'js_error', (select min(e.created_at) from public.funnel_events e where e.event_type = 'js_error'),
            'vitals', (select min(e.created_at) from public.funnel_events e where e.event_type = 'page_leave' and e.metadata ? 'lcp'),
            'content', (select min(e.created_at) from public.funnel_events e where e.event_type = 'page_leave' and e.metadata ? 'content_ms'),
            'signup_form', (select min(e.created_at) from public.funnel_events e where e.event_type = 'signup_form_started'),
            'utm_content', (select min(e.created_at) from public.funnel_events e where e.event_type = 'page_view' and e.metadata ? 'utm_content'),
            'checkout_failed', (select min(e.created_at) from public.funnel_events e where e.event_type = 'checkout_failed')
          )
        )
    )
    from params p
  );
end;
$$;

revoke all on function public.admin_diagnostics(date, date, boolean, text, text, text) from public, anon;
grant execute on function public.admin_diagnostics(date, date, boolean, text, text, text) to authenticated;
