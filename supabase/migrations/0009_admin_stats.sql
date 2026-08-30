-- IASHARK — Admin minimal en lecture seule (MASTER V2.1 §29)
--
-- Portee volontairement restreinte : outil interne de visibilite
-- operationnelle (utilisateurs/plans/funnel), PAS un panneau d'action
-- (aucune modification de plan/role/donnee utilisateur depuis cette
-- fonction - ces changements restent reserves au service role, comme deja
-- documente dans 0001_users_table.sql). Une vraie surface d'administration
-- avec actions (changer un plan, supprimer un compte) est un chantier plus
-- large, hors scope ici (non bloquant pour un lancement public - §29).
--
-- admin_is_admin() : verifie le role de l'utilisateur AUTHENTIFIE COURANT
-- (auth.uid(), jamais un id fourni par le client) via SECURITY DEFINER pour
-- contourner RLS le temps de cette seule verification, sans donner
-- d'acces plus large. Meme pattern que handle_new_user()/set_updated_at()
-- deja utilise dans ce projet.
create or replace function public.admin_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.admin_is_admin() from public, anon;
grant execute on function public.admin_is_admin() to authenticated;

-- admin_stats() : agregats uniquement (comptes, pas de donnees
-- individuelles comme l'email ou l'id d'un utilisateur precis) - refuse
-- explicitement (exception, pas une reponse vide silencieuse) si
-- l'appelant n'est pas admin.
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
    'generated_at', now()
  ) into result;

  return result;
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
