-- IASHARK - 0031 : « Où les visiteurs décrochent » (tableau de bord admin) et
-- « pays inconnu » (19/09/2026).
--
-- NON APPLIQUEE. A coller dans le SQL Editor de Supabase (apres 0029). Le
-- tableau de bord fonctionne sans elle : la section « Où les visiteurs
-- décrochent » affiche alors « Migration 0031 à appliquer dans Supabase ».
-- A appliquer AVANT (ou juste apres) le deploiement du funnel-track.js qui
-- emet gate_view : sans le point 1, la base refuse ces evenements (le site
-- n'est pas affecte, l'evenement est simplement perdu).
--
-- 1) funnel_events : nouveau type d'evenement 'gate_view' = un panneau
--    « Debloquer » (mur Pro ou compte gratuit de la page match, panneau des
--    buteurs du jour de l'accueil) reellement affiche a l'ecran (au moins la
--    moitie visible pendant 1 s). Impression seulement : ni clic, ni donnee
--    personnelle (metadata : gate, pv, match_id). Tous les types existants
--    sont conserves.
--
-- 2) admin_internal_reason : + raison 'headless'. Cause d'une partie des
--    « pays inconnu » : des navigateurs automatiques non declares (pas de
--    webdriver, user-agent de vrai Chrome) regles sur le temps universel
--    (fuseau UTC / Etc/...), qui annoncent soit un ecran d'ordinateur de
--    800 px (fenetre par defaut de Chrome sans interface), soit un telephone.
--    Un vrai telephone a toujours le fuseau de son pays ; un vrai ordinateur
--    n'a jamais un ecran de 800 px en UTC. Mesure au 19/09/2026 : 9 visites
--    « non internes » sur 7 jours, toutes en-US, une seule page, sans pays.
--    Meme regle cote navigateur (funnel-track.js, bot:true). Corps identique
--    a 0019 pour toutes les autres raisons ; memes droits (aucun pour
--    public/anon/authenticated : appelee seulement par les fonctions admin).
--
-- 3) Rattrapage de l'historique (facultatif, idempotent) : autre cause des
--    « pays inconnu », la premiere page vue partait avant la reponse de
--    /api/geo (attente de 1,2 s, souvent depassee sur mobile) ; le pays
--    n'arrivait qu'avec les pages suivantes, alors que le tableau de bord lit
--    la PREMIERE page vue. Mesure au 19/09/2026 depuis la mise en ligne de
--    /api/geo : 18 visites sur 87. On recopie sur cette premiere page vue le
--    pays / region / ville deja recus plus tard DANS LA MEME VISITE (meme
--    session_id), avec la marque geo_from_session:true. Seulement les
--    premieres pages vues sans pays, seulement a partir du lancement des
--    statistiques, jamais une donnee venue d'une autre visite. Rejouer ce
--    bloc ne change plus rien.
--
-- 4) admin_conversion_funnel(...) : SECURITY DEFINER, lecture seule, reservee
--    a public.admin_is_admin(), executable par authenticated seulement.
--    Par visiteur (session_id) ayant vu au moins une page sur la periode,
--    trafic interne / tests / robots exclus comme partout (sauf
--    p_include_internal), visites d'abonnes deja Pro exclues (et comptees a
--    part) :
--      1 arrivee          : au moins une page vue ;
--      2 page match       : une page /match/<id> ou match.html ouverte ;
--      3 panneau Pro vu   : gate_view (ou clic « Debloquer », qui l'implique :
--                           avant gate_view, seule source) ;
--      4 clic Debloquer   : click kind match_*_unlock ou home_scorers_unlock
--                           (anciennes lignes : kind cta, label
--                           home_scorers_unlock) ;
--      5 offre Pro vue    : page abonnement / pro / landing, landing_view, ou
--                           etape 6-8 (le bloc CGV + paiement n'existe que sur
--                           une offre, y compris celle de « Mon compte ») ;
--      6 case CGV cochee  : click kind checkout_consent, ou etape 7-8 (le
--                           paiement ne s'ouvre jamais sans la case) ;
--      7 paiement lance   : checkout_started (pages gb/za/mx), ou clic sur le
--                           bouton de paiement actif (ready, case cochee) par
--                           un visiteur connecte (signed_in) ; anciennes
--                           lignes sans ces deux indicateurs : comptees ;
--      8 abonne           : abonnement Stripe (subscriptions, hors incomplete)
--                           cree pour le compte de ce visiteur pendant sa
--                           visite (entre 10 min avant son premier evenement
--                           et 1 h apres le dernier), ou page « paiement
--                           reussi » vue.
--    Chaque etape exige toutes les etapes d'avant (« visitors ») ; « reached »
--    compte ceux qui ont fait l'etape par n'importe quel chemin.
--    Pays de la visite : premier pays reseau (geo_country) recu pendant la
--    visite, sinon pays estime du fuseau (country_guess), sinon region de la
--    langue du navigateur (fr-FR => FR), sinon inconnu. La base (geo / tz /
--    lang) est comptee pour la transparence.
--    Filtres (valeur inconnue => ignore) : p_country (code ISO a 2 lettres ou
--    'unknown'), p_device ('mobile' = telephone + tablette, 'desktop'),
--    p_source ('google', 'direct', 'social' = TikTok/Instagram/Facebook/X/
--    WhatsApp, 'other' = Bing et autres sites) d'apres la premiere page vue
--    (admin_source_group, memes regles que 0019).
--    Aussi : pages de sortie (derniere page vue des visiteurs sans compte ni
--    inscription), temps avant inscription (mediane, depuis la premiere page
--    vue de la visite), pays disponibles pour le filtre, date de debut de
--    mesure de gate_view et de la case CGV.
-- Toute valeur numerique lue dans metadata (ecrit par anon) est validee avant
-- usage ; toute valeur texte est bornee. Aucun email, aucun identifiant de
-- compte, aucun identifiant de visite n'est renvoye.

-- ---------------------------------------------------------------------------
-- 1) Type d'evenement gate_view
-- ---------------------------------------------------------------------------
alter table public.funnel_events drop constraint if exists funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check check (event_type in (
  'landing_view','signup_started','signup_completed','login_completed','onboarding_dismissed',
  'tool_page_view','paywall_view','checkout_started','checkout_unavailable',
  'checkout_success_view','checkout_cancel_view','page_view','page_leave','click','gate_view'));

-- ---------------------------------------------------------------------------
-- 2) Raison 'headless' (navigateur automatique regle sur UTC)
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
    when coalesce(md->>'tz', '') ~ '^(Etc/[A-Za-z0-9+-]{1,16}|UTC|UCT|GMT0?|Universal|Zulu|Greenwich)$'
      and (md->>'os' in ('Android', 'iOS')
        or (md->>'os' in ('Windows', 'macOS', 'Linux', 'ChromeOS') and md->>'screen_w' = '800'))
      then 'headless'
  end
$$;
revoke all on function public.admin_internal_reason(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Rattrapage : pays de la visite recopie sur sa premiere page vue
-- ---------------------------------------------------------------------------
with firsts as (
  select distinct on (e.session_id) e.id, e.session_id
  from public.funnel_events e
  where e.event_type = 'page_view'
    and e.session_id is not null
    and e.created_at >= '2026-09-13 19:00:00+00'
  order by e.session_id, e.created_at, e.id
),
missing as (
  select f.id, f.session_id
  from firsts f
  join public.funnel_events e0 on e0.id = f.id
  where jsonb_typeof(e0.metadata) = 'object'
    and coalesce(e0.metadata->>'geo_country', '') !~ '^[A-Z]{2}$'
),
later as (
  select distinct on (e.session_id) e.session_id,
    jsonb_strip_nulls(jsonb_build_object(
      'geo_country', e.metadata->>'geo_country',
      'geo_region', left(nullif(btrim(e.metadata->>'geo_region'), ''), 60),
      'geo_city', left(nullif(btrim(e.metadata->>'geo_city'), ''), 60),
      'geo_from_session', true)) as patch
  from public.funnel_events e
  join missing m on m.session_id = e.session_id
  where jsonb_typeof(e.metadata) = 'object'
    and e.metadata->>'geo_country' ~ '^[A-Z]{2}$'
  order by e.session_id, e.created_at, e.id
)
update public.funnel_events t
set metadata = t.metadata || l.patch
from missing m
join later l on l.session_id = m.session_id
where t.id = m.id
  and pg_column_size(t.metadata || l.patch) <= 2000;

-- ---------------------------------------------------------------------------
-- 4) admin_conversion_funnel
-- ---------------------------------------------------------------------------
create or replace function public.admin_conversion_funnel(
  p_from date default null,
  p_to date default null,
  p_include_internal boolean default false,
  p_since timestamptz default '2026-09-13 19:00:00+00',
  p_country text default null,
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
        greatest(greatest(bo.from_raw, bo.to_d - 394)::timestamp at time zone 'Europe/Paris', coalesce(p_since, '-infinity'::timestamptz)) as w_start,
        least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') as w_end,
        coalesce(p_include_internal, false) as with_internal,
        case when p_country ~ '^[A-Z]{2}$' or p_country = 'unknown' then p_country end as f_country,
        case when p_device in ('mobile', 'desktop') then p_device end as f_device,
        case when p_source in ('google', 'direct', 'social', 'other') then p_source end as f_source
      from bounds bo
    ),
    raw as (
      select e.id, e.session_id, e.user_id, e.event_type, e.page, e.created_at,
        case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end as md
      from public.funnel_events e, params p
      where e.session_id is not null
        and e.created_at >= p.w_start
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
      select r.session_id,
        min(r.created_at) as first_at,
        max(r.created_at) as last_at,
        min(r.created_at) filter (where r.event_type = 'page_view') as first_pv_at,
        count(*) filter (where r.event_type = 'page_view') as pageviews,
        bool_or(r.event_type = 'page_view' and r.page ~ '/match(/[0-9]{1,12})?(\.html)?$') as saw_match,
        bool_or(r.event_type = 'gate_view') as saw_gate,
        bool_or(r.event_type = 'click' and (r.md->>'kind' in ('match_gate_unlock', 'match_avis_unlock', 'match_recall_unlock',
            'match_analysis_unlock', 'match_faq_unlock', 'match_bar_unlock', 'home_scorers_unlock')
          or (r.md->>'kind' = 'cta' and r.md->>'label' = 'home_scorers_unlock'))) as clicked_unlock,
        bool_or(r.event_type = 'landing_view'
          or (r.event_type = 'page_view' and r.page ~ '/(abonnement|pro|landing)(\.html)?$')) as saw_pricing,
        bool_or(r.event_type = 'click' and r.md->>'kind' = 'checkout_consent') as consent,
        bool_or(r.event_type = 'checkout_started'
          or (r.event_type = 'click' and r.md->>'kind' = 'checkout'
            and coalesce(r.md->>'ready', 'true') <> 'false'
            and coalesce(r.md->>'signed_in', 'true') <> 'false')) as launched,
        bool_or(r.event_type = 'checkout_success_view') as success_view,
        min(r.created_at) filter (where r.event_type = 'signup_completed') as signup_at,
        bool_or(r.user_id is not null) as has_account
      from raw r
      group by 1
    ),
    sess_users as (
      select distinct r.session_id, r.user_id from raw r where r.user_id is not null
    ),
    subs as (
      select s.user_id, s.status, s.created_at from public.subscriptions s
      where s.status not in ('incomplete', 'incomplete_expired')
    ),
    paid as (
      select distinct su.session_id
      from sess_users su
      join sess x on x.session_id = su.session_id
      join subs s on s.user_id = su.user_id
      where s.created_at >= x.first_at - interval '10 minutes'
        and s.created_at <= x.last_at + interval '1 hour'
    ),
    already_pro as (
      select distinct su.session_id
      from sess_users su
      join sess x on x.session_id = su.session_id
      join subs s on s.user_id = su.user_id
      where s.status in ('active', 'trialing', 'past_due')
        and s.created_at < x.first_at - interval '10 minutes'
    ),
    first_pv as (
      select distinct on (r.session_id) r.session_id, r.md
      from raw r where r.event_type = 'page_view'
      order by r.session_id, r.created_at, r.id
    ),
    geo as (
      select distinct on (r.session_id) r.session_id, r.md->>'geo_country' as geo_country
      from raw r where r.md->>'geo_country' ~ '^[A-Z]{2}$'
      order by r.session_id, r.created_at, r.id
    ),
    dim as (
      select s.*,
        (f.session_id is not null) as is_internal,
        (ap.session_id is not null) as is_pro,
        (pd.session_id is not null or s.success_view) as paid,
        case when fp.md->>'device' in ('mobile', 'tablet') then 'mobile'
             when fp.md->>'device' = 'desktop' then 'desktop' end as device_group,
        case public.admin_source_group(fp.md->>'utm_source', fp.md->>'ref', fp.md->>'browser')
          when 'google' then 'google'
          when 'direct' then 'direct'
          when 'tiktok' then 'social' when 'instagram' then 'social' when 'facebook' then 'social'
          when 'x' then 'social' when 'whatsapp' then 'social'
          else 'other' end as source_group,
        g.geo_country,
        case when fp.md->>'country_guess' ~ '^[A-Z]{2}$' then fp.md->>'country_guess' end as tz_country,
        case when upper(substring(fp.md->>'lang' from '^[A-Za-z]{2,3}[-_]([A-Za-z]{2})(?:[-_]|$)')) ~ '^[A-Z]{2}$'
          then upper(substring(fp.md->>'lang' from '^[A-Za-z]{2,3}[-_]([A-Za-z]{2})(?:[-_]|$)')) end as lang_country
      from sess s
      left join flagged f on f.session_id = s.session_id
      left join already_pro ap on ap.session_id = s.session_id
      left join paid pd on pd.session_id = s.session_id
      left join first_pv fp on fp.session_id = s.session_id
      left join geo g on g.session_id = s.session_id
      where s.pageviews > 0
    ),
    dim2 as (
      select d.*,
        coalesce(d.geo_country, d.tz_country, d.lang_country) as country,
        case when d.geo_country is not null then 'geo' when d.tz_country is not null then 'tz'
             when d.lang_country is not null then 'lang' else 'unknown' end as country_basis
      from dim d
    ),
    -- Visiteurs retenus hors filtre pays (liste des pays du filtre).
    base as (
      select d.* from dim2 d, params p
      where (p.with_internal or not d.is_internal)
        and not d.is_pro
        and (p.f_device is null or d.device_group = p.f_device)
        and (p.f_source is null or d.source_group = p.f_source)
    ),
    keep as (
      select b.* from base b, params p
      where p.f_country is null
        or (p.f_country = 'unknown' and b.country is null)
        or b.country = p.f_country
    ),
    flags as (
      select k.*,
        k.saw_gate or k.clicked_unlock as c3,
        k.saw_pricing or k.consent or k.launched or k.paid as c5,
        k.consent or k.launched or k.paid as c6,
        k.launched or k.paid as c7
      from keep k
    ),
    steps as (
      select
        count(*) as s1,
        count(*) filter (where saw_match) as s2,
        count(*) filter (where saw_match and c3) as s3,
        count(*) filter (where saw_match and c3 and clicked_unlock) as s4,
        count(*) filter (where saw_match and c3 and clicked_unlock and c5) as s5,
        count(*) filter (where saw_match and c3 and clicked_unlock and c5 and c6) as s6,
        count(*) filter (where saw_match and c3 and clicked_unlock and c5 and c6 and c7) as s7,
        count(*) filter (where saw_match and c3 and clicked_unlock and c5 and c6 and c7 and paid) as s8,
        count(*) filter (where c3) as r3,
        count(*) filter (where clicked_unlock) as r4,
        count(*) filter (where c5) as r5,
        count(*) filter (where c6) as r6,
        count(*) filter (where c7) as r7,
        count(*) filter (where paid) as r8
      from flags
    ),
    last_pv as (
      select distinct on (r.session_id) r.session_id,
        regexp_replace(regexp_replace(left(r.page, 300), '\.html$', ''), '/index$', '/') as npage,
        case when r.md->>'match_id' ~ '^[0-9]{1,12}$' then r.md->>'match_id' end as match_id
      from raw r
      join keep k on k.session_id = r.session_id
      where r.event_type = 'page_view'
        and k.signup_at is null and not k.has_account and not k.paid
      order by r.session_id, r.created_at desc, r.id desc
    ),
    exits as (
      select npage as page, match_id, count(*) as visitors
      from last_pv group by 1, 2
      order by visitors desc, page limit 8
    ),
    signups as (
      select k.session_id,
        greatest(0, extract(epoch from (k.signup_at - coalesce(k.first_pv_at, k.first_at))))::int as sec,
        (select count(*) from raw r where r.session_id = k.session_id and r.event_type = 'page_view' and r.created_at <= k.signup_at) as pages
      from keep k where k.signup_at is not null
    ),
    countries as (
      select country, count(*) as visitors
      from base group by 1
      order by visitors desc, country nulls last limit 40
    )
    select json_build_object(
      'from', (select p.from_d from params p),
      'to', (select p.to_d from params p),
      'filters', (select json_build_object('country', p.f_country, 'device', p.f_device, 'source', p.f_source, 'include_internal', p.with_internal) from params p),
      'steps', (select json_build_array(
          json_build_object('key', 'arrived', 'visitors', s.s1, 'reached', s.s1),
          json_build_object('key', 'match_page', 'visitors', s.s2, 'reached', s.s2),
          json_build_object('key', 'gate_view', 'visitors', s.s3, 'reached', s.r3),
          json_build_object('key', 'unlock_click', 'visitors', s.s4, 'reached', s.r4),
          json_build_object('key', 'pricing_page', 'visitors', s.s5, 'reached', s.r5),
          json_build_object('key', 'consent', 'visitors', s.s6, 'reached', s.r6),
          json_build_object('key', 'checkout', 'visitors', s.s7, 'reached', s.r7),
          json_build_object('key', 'subscribed', 'visitors', s.s8, 'reached', s.r8))
        from steps s),
      'exit_pages', (select coalesce(json_agg(json_build_object('page', e.page, 'match_id', e.match_id, 'visitors', e.visitors)
          order by e.visitors desc, e.page), '[]'::json) from exits e),
      'exit_total', (select count(*) from last_pv),
      'signup_timing', (select json_build_object(
          'signups', count(*),
          'median_sec', round((percentile_cont(0.5) within group (order by sec))::numeric),
          'median_pages', round((percentile_cont(0.5) within group (order by pages))::numeric, 1))
        from signups),
      'countries', (select coalesce(json_agg(json_build_object('country', c.country, 'visitors', c.visitors)
          order by c.visitors desc, c.country nulls last), '[]'::json) from countries c),
      'country_basis', (select json_build_object(
          'geo', count(*) filter (where country_basis = 'geo'),
          'tz', count(*) filter (where country_basis = 'tz'),
          'lang', count(*) filter (where country_basis = 'lang'),
          'unknown', count(*) filter (where country_basis = 'unknown'))
        from keep),
      'excluded', (select json_build_object(
          'internal', count(*) filter (where d.is_internal and not p.with_internal),
          'already_pro', count(*) filter (where d.is_pro and (p.with_internal or not d.is_internal)))
        from dim2 d, params p),
      'tracking', json_build_object(
        'gate_view_since', (select min(x.created_at) from public.funnel_events x where x.event_type = 'gate_view'),
        'consent_since', (select min(x.created_at) from public.funnel_events x
          where x.event_type = 'click' and x.metadata->>'kind' = 'checkout_consent')),
      'generated_at', now()
    )
  );
end;
$$;
revoke all on function public.admin_conversion_funnel(date, date, boolean, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_conversion_funnel(date, date, boolean, timestamptz, text, text, text) to authenticated;

-- Recharge du cache de schema PostgREST.
notify pgrst, 'reload schema';
