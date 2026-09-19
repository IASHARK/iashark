-- 0029 - admin_unlock_clicks : 6e emplacement, le panneau d'analyse (19/09/2026).
--
-- La page match (match-page.js#proGate) remplace, sur un match payant, l'avis
-- ferme et son petit bouton par UN panneau « Debloquer l'analyse complete »
-- (apercu factice floute + bouton ambre « Debloquer avec Pro »). Son clic est
-- suivi sous le kind match_gate_unlock (funnel-track.js, liste fermee).
-- admin_unlock_clicks (0025) ne compte que les kinds de sa liste : sans cette
-- mise a jour, le tableau de bord afficherait 0 clic pour le panneau.
-- match_avis_unlock reste compte (match gratuit du jour sans compte).
--
-- Corps identique a 0025, une seule ligne changee (la liste des kinds, panneau
-- en tete). Signature et droits inchanges. A appliquer dans le SQL Editor.

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
      values ('match_gate_unlock', 1), ('match_avis_unlock', 2), ('match_recall_unlock', 3), ('match_analysis_unlock', 4), ('match_faq_unlock', 5), ('match_bar_unlock', 6)
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

-- Recharge du cache de schema PostgREST.
notify pgrst, 'reload schema';
