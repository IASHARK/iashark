-- 0028 - admin_members : ville de chaque inscrit (18/09/2026).
--
-- Le tableau de bord (admin-dashboard.js#placeLabel) sait afficher "Ville, Pays"
-- mais admin_members ne renvoyait que le pays. La ville vient de la meme page
-- vue d'origine (inscription, sinon premiere visite suivie) que le pays :
-- geo_city pose par /api/geo (Netlify, approximative, jamais l'IP). Inconnue
-- pour les inscrits anterieurs au suivi de la localisation.
--
-- Corps identique a 0025 (verifie contre la version en ligne le 18/09/2026),
-- une seule ligne ajoutee ('city'). Droits inchanges.

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
            'city', nullif(left(btrim(r.origin_md->>'geo_city'), 80), ''),
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
