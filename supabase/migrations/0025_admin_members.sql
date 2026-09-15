-- IASHARK - Tableau de bord admin : suivi des INSCRITS (section « Mes inscrits »
-- de admin.html).
--
-- NON APPLIQUEE. A RELIRE par le lead avant application.
-- A appliquer APRES 0019_admin_dashboard_v2.sql (deja en production). Aucune
-- dependance a 0022. Le tableau de bord fonctionne sans cette migration
-- (message « a activer »).
--
-- Contexte : funnel-track.js attache desormais le user_id (avec le jeton du
-- compte, politique RLS funnel_events_insert_own) aux page_view / page_leave
-- / click d'un inscrit CONNECTE qui n'a pas refuse le suivi. Avant la mise en
-- ligne de ce changement, seuls signup_completed (user_id) et
-- auth.users.last_sign_in_at existent : rien n'est reconstitue, les fonctions
-- renvoient `tracking_since` (premier evenement de navigation lie a un
-- compte, NULL tant que le suivi n'a pas demarre).
--
-- Refus du suivi : auth.users.raw_user_meta_data->>'tracking_opt_out' = 'true'
-- (interrupteur « Ne pas lier mes visites a mon compte » de compte.html). Pour
-- un tel compte, AUCUN evenement n'est lu (ni les anciens, ni la session
-- d'inscription) : seules les donnees du compte (inscription, offre, derniere
-- connexion) sont affichees.
--
-- 1) Helpers (non exposes : revoke public, anon, authenticated) :
--    - admin_mask_email(email) : « le***@gmail.com » (1 ou 2 premiers
--      caracteres). MEMES regles que maskEmail() dans admin-dashboard.js.
--    - admin_member_events() : evenements rattaches a un compte = user_id
--      renseigne, plus les evenements anonymes de la session (onglet) ou le
--      compte a ete cree (parcours juste avant l'inscription,
--      via_signup = true). Comptes ayant refuse le suivi exclus.
-- 2) Fonctions admin en LECTURE SEULE (security definer, admin_is_admin(),
--    executables par authenticated uniquement, jamais par anon) :
--    - admin_members(p_days default 30, p_include_internal default false) :
--      { generated_at, days, tracking_since, thresholds, members: [une ligne
--      par inscrit] } avec email (complet, pour l'admin) + email_masked,
--      offre, inscription, source / pays / appareil d'origine (premiere page
--      vue de la session d'inscription, a defaut premiere visite suivie),
--      derniere connexion, derniere visite vue, jours actifs sur 7 et 30 jours
--      (+ liste des jours actifs sur 30 jours), pages vues et matchs consultes
--      sur p_days, a vu la page abonnement, a clique sur payer, statut.
--    - admin_member_journey(p_user_id, p_limit default 200) : { member,
--      tracking_since, limit, items } : les p_limit dernieres actions (pages
--      vues avec duree, clics, etapes) dans l'ordre chronologique.
--    - admin_retention(p_include_internal default false) : cohortes par
--      semaine d'inscription (lundi, heure de Paris), revenus J1 / J7 / J30,
--      inscrits actifs aujourd'hui / 7 jours / 30 jours.
--    - admin_unlock_clicks(p_from, p_to, p_include_internal default false,
--      p_since) : clics sur les 5 boutons « Debloquer » de la page match par
--      emplacement (tableau de bord, carte « Du visiteur au client »).
--    Comptes internes (admin_internal_account : admin, proprietaire, e2e,
--    playwright, example.*) exclus par defaut.
--
-- Definitions (memes seuils que memberStatus() dans admin-dashboard.js) :
-- - jour actif = jour (Paris) avec au moins un evenement lie au compte ou la
--   derniere connexion (auth.users.last_sign_in_at) ;
-- - derniere activite = la plus recente de : derniere visite vue, derniere
--   connexion, inscription ;
-- - statut, dans cet ordre : 'pro' (offre pro) ; 'new' (inscrit depuis moins
--   de 7 jours) ; 'active' (derniere activite de moins de 7 jours) ;
--   'to_nudge' (7 a 29 jours, « a relancer ») ; 'gone' (30 jours ou plus) ;
-- - revenu apres N jours = au moins un jour actif >= jour d'inscription + N.
--   Un inscrit n'entre dans le calcul (eligible) qu'une fois N jours passes.
--   last_sign_in_at ne garde que la DERNIERE connexion : avant le suivi par
--   inscrit, le taux est donc sous-estime, jamais invente.
-- Toute valeur numerique lue dans metadata (ecrite depuis le navigateur) est
-- validee par regex avant conversion.

-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.admin_mask_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when position('@' in btrim(coalesce(p_email, ''))) < 2 then null
    else left(split_part(btrim(p_email), '@', 1),
              case when length(split_part(btrim(p_email), '@', 1)) <= 2 then 1 else 2 end)
      || '***@' || split_part(btrim(p_email), '@', 2)
  end
$$;
revoke all on function public.admin_mask_email(text) from public, anon, authenticated;

create or replace function public.admin_member_events()
returns table (uid uuid, eid bigint, sid text, etype text, epage text, elocale text, md jsonb, at timestamptz, via_signup boolean)
language sql
stable
set search_path = public
as $$
  with opted_out as (
    select au.id from auth.users au
    where coalesce(au.raw_user_meta_data->>'tracking_opt_out', '') = 'true'
  ),
  signup_sess as (
    select distinct on (e.session_id) e.session_id, e.user_id
    from public.funnel_events e
    where e.event_type = 'signup_completed' and e.user_id is not null and e.session_id is not null
    order by e.session_id, e.created_at, e.id
  )
  select coalesce(e.user_id, ss.user_id), e.id, e.session_id, e.event_type, left(e.page, 300), left(e.locale, 16),
    case when jsonb_typeof(e.metadata) = 'object' then e.metadata else '{}'::jsonb end,
    e.created_at, e.user_id is null
  from public.funnel_events e
  left join signup_sess ss on e.user_id is null and ss.session_id = e.session_id
  where (e.user_id is not null or ss.user_id is not null)
    and coalesce(e.user_id, ss.user_id) not in (select o.id from opted_out o)
$$;
revoke all on function public.admin_member_events() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2a) admin_members : une ligne par inscrit
-- ---------------------------------------------------------------------------
create or replace function public.admin_members(
  p_days integer default 30,
  p_include_internal boolean default false
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
      select x.days, x.today,
        (x.today - (x.days - 1))::timestamp at time zone 'Europe/Paris' as w_start,
        coalesce(p_include_internal, false) as with_internal
      from (
        select greatest(1, least(coalesce(p_days, 30), 395)) as days,
          (now() at time zone 'Europe/Paris')::date as today
      ) x
    ),
    members as (
      select u.id, u.email, u.plan, u.role, u.created_at, au.last_sign_in_at,
        public.admin_internal_account(u.email, u.role) as is_internal,
        coalesce(au.raw_user_meta_data->>'tracking_opt_out', '') = 'true' as opted_out
      from public.users u
      left join auth.users au on au.id = u.id
      cross join params p
      where p.with_internal or not public.admin_internal_account(u.email, u.role)
    ),
    ev as (
      select x.* from public.admin_member_events() x
      where x.uid in (select m.id from members m)
    ),
    signup_pv as (
      select distinct on (x.uid) x.uid, x.md, x.elocale
      from ev x
      where x.etype = 'page_view'
        and x.sid in (select s.sid from ev s where s.etype = 'signup_completed' and s.uid = x.uid)
      order by x.uid, x.at, x.eid
    ),
    first_pv as (
      select distinct on (x.uid) x.uid, x.md, x.elocale
      from ev x
      where x.etype = 'page_view' and not x.via_signup
      order by x.uid, x.at, x.eid
    ),
    origin as (
      select m.id as uid,
        coalesce(s.md, f.md) as md,
        coalesce(s.elocale, f.elocale) as site,
        case when s.uid is not null then 'signup' when f.uid is not null then 'first_tracked_visit' end as basis
      from members m
      left join signup_pv s on s.uid = m.id
      left join first_pv f on f.uid = m.id
    ),
    stats as (
      select m.id as uid,
        max(x.at) as last_seen_at,
        count(x.eid) filter (where x.etype = 'page_view' and x.at >= p.w_start) as page_views,
        count(distinct case when x.etype = 'page_view' and x.at >= p.w_start and x.md->>'match_id' ~ '^[0-9]{1,12}$'
          then x.md->>'match_id' end) as matches_viewed,
        coalesce(bool_or(x.etype in ('landing_view', 'paywall_view', 'tool_page_view')
          or (x.etype = 'page_view' and x.epage ~ '/(abonnement|pro|landing)(\.html)?$')), false) as saw_pricing,
        coalesce(bool_or(x.etype = 'checkout_started' or (x.etype = 'click' and x.md->>'kind' = 'checkout')), false) as clicked_pay
      from members m
      cross join params p
      left join ev x on x.uid = m.id
      group by m.id
    ),
    days as (
      select x.uid, (x.at at time zone 'Europe/Paris')::date as d from ev x where not x.via_signup
      union
      select m.id, (m.last_sign_in_at at time zone 'Europe/Paris')::date from members m where m.last_sign_in_at is not null
    ),
    act as (
      select dd.uid,
        count(*) filter (where dd.d > p.today - 7) as active_days_7,
        count(*) filter (where dd.d > p.today - 30) as active_days_30,
        json_agg(to_char(dd.d, 'YYYY-MM-DD') order by dd.d) filter (where dd.d > p.today - 30) as active_dates
      from days dd
      cross join params p
      group by dd.uid
    ),
    rows as (
      select m.*, st.last_seen_at, st.page_views, st.matches_viewed, st.saw_pricing, st.clicked_pay,
        a.active_days_7, a.active_days_30, a.active_dates,
        o.md as origin_md, o.site as origin_site, o.basis as origin_basis,
        greatest(st.last_seen_at, m.last_sign_in_at) as last_activity_at,
        case
          when m.plan = 'pro' then 'pro'
          when m.created_at > now() - interval '7 days' then 'new'
          when greatest(m.created_at, st.last_seen_at, m.last_sign_in_at) > now() - interval '7 days' then 'active'
          when greatest(m.created_at, st.last_seen_at, m.last_sign_in_at) > now() - interval '30 days' then 'to_nudge'
          else 'gone'
        end as status
      from members m
      left join stats st on st.uid = m.id
      left join act a on a.uid = m.id
      left join origin o on o.uid = m.id
    )
    select json_build_object(
      'generated_at', now(),
      'days', (select p.days from params p),
      'tracking_since', (select min(e.created_at) from public.funnel_events e
        where e.user_id is not null and e.event_type in ('page_view', 'page_leave', 'click')),
      'thresholds', json_build_object('new_days', 7, 'idle_days', 7, 'gone_days', 30),
      'members', coalesce((
        select json_agg(json_build_object(
            'user_id', r.id,
            'email', r.email,
            'email_masked', public.admin_mask_email(r.email),
            'plan', r.plan,
            'is_internal', r.is_internal,
            'created_at', r.created_at,
            'last_sign_in_at', r.last_sign_in_at,
            'last_seen_at', case when r.opted_out then null else r.last_seen_at end,
            'last_activity_at', r.last_activity_at,
            'status', r.status,
            'tracking_opt_out', r.opted_out,
            'active_days_7', coalesce(r.active_days_7, 0),
            'active_days_30', coalesce(r.active_days_30, 0),
            'active_dates', coalesce(r.active_dates, '[]'::json),
            'page_views', case when r.opted_out then null else coalesce(r.page_views, 0) end,
            'matches_viewed', case when r.opted_out then null else coalesce(r.matches_viewed, 0) end,
            'saw_pricing', case when r.opted_out then null else coalesce(r.saw_pricing, false) end,
            'clicked_pay', case when r.opted_out then null else coalesce(r.clicked_pay, false) end,
            'origin_basis', r.origin_basis,
            'site', r.origin_site,
            'source_group', case when r.origin_basis is not null
              then public.admin_source_group(r.origin_md->>'utm_source', r.origin_md->>'ref', r.origin_md->>'browser') end,
            'source_raw', left(coalesce(nullif(r.origin_md->>'utm_source', ''), nullif(r.origin_md->>'ref', '')), 80),
            'country', case
              when r.origin_md->>'geo_country' ~ '^[A-Z]{2}$' then r.origin_md->>'geo_country'
              when r.origin_md->>'country_guess' ~ '^[A-Z]{2}$' then r.origin_md->>'country_guess' end,
            'device', left(r.origin_md->>'device', 20)
          ) order by r.last_activity_at desc nulls last, r.created_at desc)
        from rows r
      ), '[]'::json)
    )
  );
end;
$$;
revoke all on function public.admin_members(integer, boolean) from public, anon;
grant execute on function public.admin_members(integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b) admin_member_journey : chronologie d'un inscrit
-- ---------------------------------------------------------------------------
create or replace function public.admin_member_journey(
  p_user_id uuid,
  p_limit integer default 200
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
      select greatest(1, least(coalesce(p_limit, 200), 500)) as lim
    ),
    m as (
      select u.id, u.email, u.plan, u.role, u.created_at, au.last_sign_in_at,
        coalesce(au.raw_user_meta_data->>'tracking_opt_out', '') = 'true' as opted_out
      from public.users u
      left join auth.users au on au.id = u.id
      where u.id = p_user_id
    ),
    ev as (
      select x.* from public.admin_member_events() x where x.uid = p_user_id
    ),
    leaves as (
      select x.sid, x.md->>'pv' as pv,
        max(case when x.md->>'sec' ~ '^[0-9]{1,7}$' then least((x.md->>'sec')::int, 1800) end) as sec
      from ev x
      where x.etype = 'page_leave' and x.md->>'pv' is not null
      group by 1, 2
    ),
    items as (
      select x.eid, x.etype, x.at, x.epage, x.sid, x.via_signup, x.md, l.sec
      from ev x
      left join leaves l on x.etype = 'page_view' and l.sid is not distinct from x.sid and l.pv = x.md->>'pv'
      where x.etype <> 'page_leave'
      order by x.at desc, x.eid desc
      limit (select p.lim from params p)
    )
    select json_build_object(
      'member', (select json_build_object(
          'user_id', m.id, 'email', m.email, 'email_masked', public.admin_mask_email(m.email),
          'plan', m.plan, 'created_at', m.created_at, 'last_sign_in_at', m.last_sign_in_at,
          'is_internal', public.admin_internal_account(m.email, m.role), 'tracking_opt_out', m.opted_out)
        from m),
      'tracking_since', (select min(e.created_at) from public.funnel_events e
        where e.user_id is not null and e.event_type in ('page_view', 'page_leave', 'click')),
      'limit', (select p.lim from params p),
      'items', coalesce((
        select json_agg(json_build_object(
            'type', i.etype,
            'at', i.at,
            'page', i.epage,
            'match_id', case when i.md->>'match_id' ~ '^[0-9]{1,12}$' then i.md->>'match_id' end,
            'sec', i.sec,
            'kind', case when i.etype = 'click' then left(i.md->>'kind', 30) end,
            'label', case when i.etype = 'click' then left(i.md->>'label', 80) end,
            'target', case when i.etype = 'click' then left(i.md->>'target', 120) end,
            'session_id', left(i.sid, 60),
            'before_signup', i.via_signup
          ) order by i.at, i.eid)
        from items i
      ), '[]'::json)
    )
  );
end;
$$;
revoke all on function public.admin_member_journey(uuid, integer) from public, anon;
grant execute on function public.admin_member_journey(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2c) admin_retention : est-ce que les inscrits reviennent ?
-- ---------------------------------------------------------------------------
create or replace function public.admin_retention(
  p_include_internal boolean default false
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
      select (now() at time zone 'Europe/Paris')::date as today,
        coalesce(p_include_internal, false) as with_internal
    ),
    members as (
      select u.id, (u.created_at at time zone 'Europe/Paris')::date as d0, au.last_sign_in_at
      from public.users u
      left join auth.users au on au.id = u.id
      cross join params p
      where p.with_internal or not public.admin_internal_account(u.email, u.role)
    ),
    days as (
      select x.uid, (x.at at time zone 'Europe/Paris')::date as d
      from public.admin_member_events() x
      where x.uid in (select m.id from members m) and not x.via_signup
      union
      select m.id, (m.last_sign_in_at at time zone 'Europe/Paris')::date from members m where m.last_sign_in_at is not null
    ),
    per_member as (
      select m.id, m.d0,
        date_trunc('week', m.d0::timestamp)::date as week_start,
        p.today - m.d0 as age_days,
        coalesce(bool_or(dd.d >= m.d0 + 1), false) as r1,
        coalesce(bool_or(dd.d >= m.d0 + 7), false) as r7,
        coalesce(bool_or(dd.d >= m.d0 + 30), false) as r30,
        coalesce(bool_or(dd.d = p.today), false) as act_today,
        coalesce(bool_or(dd.d > p.today - 7), false) as act_week,
        coalesce(bool_or(dd.d > p.today - 30), false) as act_month
      from members m
      cross join params p
      left join days dd on dd.uid = m.id
      group by m.id, m.d0, p.today
    ),
    cohorts as (
      select pm.week_start,
        count(*) as signups,
        count(*) filter (where pm.age_days >= 1) as eligible_d1,
        count(*) filter (where pm.age_days >= 1 and pm.r1) as returned_d1,
        count(*) filter (where pm.age_days >= 7) as eligible_d7,
        count(*) filter (where pm.age_days >= 7 and pm.r7) as returned_d7,
        count(*) filter (where pm.age_days >= 30) as eligible_d30,
        count(*) filter (where pm.age_days >= 30 and pm.r30) as returned_d30
      from per_member pm
      group by 1
      order by 1 desc
      limit 26
    )
    select json_build_object(
      'generated_at', now(),
      'today', (select p.today from params p),
      'tracking_since', (select min(e.created_at) from public.funnel_events e
        where e.user_id is not null and e.event_type in ('page_view', 'page_leave', 'click')),
      'members_total', (select count(*) from per_member),
      'active', (select json_build_object(
          'today', count(*) filter (where pm.act_today),
          'week', count(*) filter (where pm.act_week),
          'month', count(*) filter (where pm.act_month))
        from per_member pm),
      'overall', (select json_build_object(
          'eligible_d1', count(*) filter (where pm.age_days >= 1),
          'returned_d1', count(*) filter (where pm.age_days >= 1 and pm.r1),
          'eligible_d7', count(*) filter (where pm.age_days >= 7),
          'returned_d7', count(*) filter (where pm.age_days >= 7 and pm.r7),
          'eligible_d30', count(*) filter (where pm.age_days >= 30),
          'returned_d30', count(*) filter (where pm.age_days >= 30 and pm.r30))
        from per_member pm),
      'cohorts', coalesce((
        select json_agg(json_build_object(
            'week_start', c.week_start, 'signups', c.signups,
            'eligible_d1', c.eligible_d1, 'returned_d1', c.returned_d1,
            'eligible_d7', c.eligible_d7, 'returned_d7', c.returned_d7,
            'eligible_d30', c.eligible_d30, 'returned_d30', c.returned_d30
          ) order by c.week_start desc)
        from cohorts c
      ), '[]'::json)
    )
  );
end;
$$;
revoke all on function public.admin_retention(boolean) from public, anon;
grant execute on function public.admin_retention(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2d) admin_unlock_clicks : clics sur les 5 boutons « Debloquer » de la page
--     match (match-page.js, kinds acceptes par funnel-track.js), par
--     emplacement, sur une periode (dates de Paris incluses, defaut
--     aujourd'hui). Visites internes / tests exclues comme dans 0019.
-- ---------------------------------------------------------------------------
create or replace function public.admin_unlock_clicks(
  p_from date default null,
  p_to date default null,
  p_include_internal boolean default false,
  p_since timestamptz default '2026-09-13 19:00:00+00'
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
        coalesce(p_include_internal, false) as with_internal
      from bounds bo
    ),
    kinds (kind, ord) as (
      values ('match_avis_unlock', 1), ('match_recall_unlock', 2), ('match_analysis_unlock', 3), ('match_faq_unlock', 4), ('match_bar_unlock', 5)
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
    clicks as (
      select e.session_id, e.user_id, e.metadata->>'kind' as kind
      from public.funnel_events e
      cross join params p
      where e.event_type = 'click'
        and jsonb_typeof(e.metadata) = 'object'
        and e.metadata->>'kind' in (select k.kind from kinds k)
        and e.created_at >= p.w_start
        and e.created_at <= p.w_end
        and (p.with_internal or (public.admin_internal_reason(e.metadata) is null
          and (e.session_id is null or e.session_id not in (select f.session_id from flagged f))))
    )
    select json_build_object(
      'from', (select p.from_d from params p),
      'to', (select p.to_d from params p),
      'total_clicks', (select count(*) from clicks),
      'rows', (
        select json_agg(json_build_object(
            'kind', k.kind,
            'clicks', coalesce(c.clicks, 0),
            'visitors', coalesce(c.visitors, 0),
            'members', coalesce(c.members, 0)
          ) order by k.ord)
        from kinds k
        left join (
          select x.kind, count(*) as clicks, count(distinct x.session_id) as visitors, count(distinct x.user_id) as members
          from clicks x group by x.kind
        ) c on c.kind = k.kind
      )
    )
  );
end;
$$;
revoke all on function public.admin_unlock_clicks(date, date, boolean, timestamptz) from public, anon;
grant execute on function public.admin_unlock_clicks(date, date, boolean, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Droit d'acces : un inscrit peut LIRE ses propres evenements lies a son
--    compte (export « Exporter mes donnees » de compte.html, account-page.js).
--    Lecture uniquement, seulement les lignes dont user_id = son compte :
--    jamais les lignes anonymes ni celles d'un autre compte. anon n'a
--    toujours aucun droit de lecture (0008) ; update et delete restent
--    revoques.
-- ---------------------------------------------------------------------------
grant select on public.funnel_events to authenticated;
drop policy if exists funnel_events_select_own on public.funnel_events;
create policy funnel_events_select_own on public.funnel_events
  for select to authenticated
  using (user_id is not null and user_id = (select auth.uid()));

-- Recharge du cache de schema PostgREST.
notify pgrst, 'reload schema';
