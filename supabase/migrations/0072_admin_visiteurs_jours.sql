-- 0072 (07/11/2026) : carte « Visiteurs » de l'appli admin.
-- admin_analytics sur 42 jours prend ~23 s et la base coupe (code 57014) : la carte restait en erreur.
-- Un jour passe ne change plus : on garde son total une fois calcule (meme calcul que l'ecran Aujourd'hui,
-- admin_analytics sur un seul jour, robots et tests retires) et on ne recalcule que la journee en cours.

create table if not exists public.admin_visiteurs_jour (
  jour date primary key,
  visiteurs integer not null,
  pages integer not null default 0,
  calcule_le timestamptz not null default now()
);
alter table public.admin_visiteurs_jour enable row level security;
-- Aucune politique : lecture seulement par la fonction ci-dessous (admin verifie).

create or replace function public.admin_visiteurs_jours(p_jours integer default 42)
returns json
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_n integer := greatest(1, least(coalesce(p_jours, 42), 120));
  v_from date := v_today - (v_n - 1);
  v_manque date;
  v_a json;
  v_faits integer := 0;
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  -- Jours passes absents : calcules au plus 4 par appel (~1 s chacun) pour rester sous la limite de temps.
  for v_manque in
    select d::date from generate_series(v_from, v_today - 1, interval '1 day') d
    where not exists (select 1 from public.admin_visiteurs_jour j where j.jour = d::date)
    order by d desc
  loop
    exit when v_faits >= 4;
    v_a := public.admin_analytics(1, false, v_manque, v_manque);
    insert into public.admin_visiteurs_jour (jour, visiteurs, pages)
    values (v_manque, coalesce((v_a->'kpis'->>'visitors')::int, 0), coalesce((v_a->'kpis'->>'page_views')::int, 0))
    on conflict (jour) do nothing;
    v_faits := v_faits + 1;
  end loop;

  -- Journee en cours : toujours recalculee.
  v_a := public.admin_analytics(1, false, v_today, v_today);

  return json_build_object(
    'series', (
      select coalesce(json_agg(json_build_object('t', x.jour, 'visitors', x.visiteurs, 'page_views', x.pages) order by x.jour), '[]'::json)
      from (
        select jour, visiteurs, pages from public.admin_visiteurs_jour where jour >= v_from and jour < v_today
        union all
        select v_today, coalesce((v_a->'kpis'->>'visitors')::int, 0), coalesce((v_a->'kpis'->>'page_views')::int, 0)
      ) x
    ),
    'manquants', (
      select count(*) from generate_series(v_from, v_today - 1, interval '1 day') d
      where not exists (select 1 from public.admin_visiteurs_jour j where j.jour = d::date)
    )
  );
end;
$function$;

revoke all on function public.admin_visiteurs_jours(integer) from public, anon;
grant execute on function public.admin_visiteurs_jours(integer) to authenticated;
