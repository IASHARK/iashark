-- IASHARK - essai du « Pro offert 1 mois » Lolly Bet (migration 0074).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI (branche Supabase ou Postgres local) ou les migrations
-- 0001, 0009, 0032 et 0074 sont appliquees. Jamais sur la vraie base :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0074_pro_offert_lolly.test.sql
-- Tout se passe dans une transaction ANNULEE a la fin (rollback) : rien ne reste.
-- Une verification qui echoue arrete le script avec « ECHEC n : ... ».

begin;

-- Deux comptes d'essai (un joueur, un admin), identifiants jamais reels.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'joueur-essai-0074@exemple.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin-essai-0074@exemple.invalid')
  on conflict (id) do nothing;
insert into public.users (id, email, plan, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'joueur-essai-0074@exemple.invalid', 'free', 'customer'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin-essai-0074@exemple.invalid', 'free', 'admin')
  on conflict (id) do update set plan = excluded.plan, role = excluded.role;

-- 1. Le joueur, connecte : il declare son login ; le statut reste en attente meme s'il triche.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.pro_offert_demandes (identifiant, partenaire) values ('  joueur_lolly  ', 'lolly');
do $$
declare r record;
begin
  select statut, identifiant into r from public.pro_offert_demandes;
  if r.statut <> 'en_attente' or r.identifiant <> 'joueur_lolly' then raise exception 'ECHEC 1 : %', row_to_json(r); end if;
end $$;

-- 2. Il ne peut pas se valider lui-meme (aucun droit de modification, ni d'appel admin).
do $$
begin
  begin
    update public.pro_offert_demandes set statut = 'valide';
    raise exception 'ECHEC 2 : modification acceptee';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_pro_offert_decider((select id from public.pro_offert_demandes limit 1), 'valide', null);
    raise exception 'ECHEC 2b : decision acceptee pour un non-admin';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Pas de deuxieme demande ouverte.
do $$
begin
  begin
    insert into public.pro_offert_demandes (identifiant) values ('autre_login');
    raise exception 'ECHEC 3 : deuxieme demande acceptee';
  exception when raise_exception then
    if sqlerrm not like 'pro_offert_deja_demande%' then raise; end if;
  end;
end $$;

-- 4. L'admin valide : Pro (plan famille) ouvert pour un mois.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select public.admin_pro_offert_decider((select id from public.pro_offert_demandes limit 1), 'valide', null);
reset role;
do $$
declare r record;
begin
  if (select plan from public.users where id = '00000000-0000-4000-8000-0000000000a1') <> 'famille' then raise exception 'ECHEC 4 : Pro non ouvert'; end if;
  select * into r from public.pro_offert_demandes limit 1;
  if r.statut <> 'valide' or r.plan_avant <> 'free' or r.pro_jusqu_au < now() + interval '27 days' then raise exception 'ECHEC 4b : %', row_to_json(r); end if;
end $$;

-- 5. Fin du mois : retour en gratuit, une seule fois.
update public.pro_offert_demandes set pro_jusqu_au = now() - interval '1 minute';
do $$
begin
  if public.pro_offert_fin() <> 1 then raise exception 'ECHEC 5 : fin non appliquee'; end if;
  if (select plan from public.users where id = '00000000-0000-4000-8000-0000000000a1') <> 'free' then raise exception 'ECHEC 5b : toujours Pro'; end if;
  if public.pro_offert_fin() <> 0 then raise exception 'ECHEC 5c : fin appliquee deux fois'; end if;
end $$;

-- 6. Un visiteur sans compte ne lit rien et n'ecrit rien.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.pro_offert_demandes;
    raise exception 'ECHEC 6 : lecture anonyme acceptee';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'OK 0074 : toutes les verifications passent' as resultat;
rollback;
