-- IASHARK - essai des deux buteurs du jour (migration 0058).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI (branche Supabase ou Postgres local) ou les migrations
-- 0050, 0051 et 0058 sont appliquees. Jamais sur la vraie base :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0058_tickets_deux_buteurs.test.sql
-- Tout se passe dans une transaction ANNULEE a la fin (rollback) : rien ne reste.
-- Une verification qui echoue arrete le script avec « ECHEC n : ... ».
-- Jours d'essai 1999-01-03 et 1999-01-04 : jamais de vrais jours de tickets.

begin;

do $$
declare
  r record;
  j1 constant jsonb := jsonb_build_object('joueur', 'Un', 'joueur_id', 1, 'fixture_id', -1, 'coup_envoi_ms', (extract(epoch from now() + interval '2 hours') * 1000)::bigint);
  j2 constant jsonb := jsonb_build_object('joueur', 'Deux', 'joueur_id', 2, 'fixture_id', -2, 'coup_envoi_ms', (extract(epoch from now() + interval '4 hours') * 1000)::bigint);
  j3 constant jsonb := jsonb_build_object('joueur', 'Trois', 'joueur_id', 3, 'fixture_id', -3, 'coup_envoi_ms', (extract(epoch from now() + interval '5 hours') * 1000)::bigint);
  j3_meme_match constant jsonb := jsonb_build_object('joueur', 'Trois', 'joueur_id', 3, 'fixture_id', -1, 'coup_envoi_ms', (extract(epoch from now() + interval '2 hours') * 1000)::bigint);
  j3_en_jeu constant jsonb := jsonb_build_object('joueur', 'Trois', 'joueur_id', 3, 'fixture_id', -3, 'coup_envoi_ms', (extract(epoch from now() - interval '1 hour') * 1000)::bigint);
  avant jsonb;
  apres jsonb;
  trace jsonb;
  ancien_seul constant jsonb := jsonb_build_object('joueur', 'Ancien', 'joueur_id', 9, 'fixture_id', -9, 'coup_envoi_ms', (extract(epoch from now() + interval '2 hours') * 1000)::bigint);
  nouveau_seul constant jsonb := jsonb_build_object('joueur', 'Nouveau', 'joueur_id', 8, 'fixture_id', -8, 'coup_envoi_ms', (extract(epoch from now() + interval '5 hours') * 1000)::bigint);
begin
  avant := j1 || jsonb_build_object('buteurs', jsonb_build_array(j1, j2));
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
    values ('1999-01-03', 'buteur', 'essai', '{"nb_buteurs":2}', avant, now() + interval '2 hours');

  -- 1. Sans trace : contenu remis.
  apres := j1 || jsonb_build_object('buteurs', jsonb_build_array(j1, j3));
  update public.tickets_du_jour set contenu = apres where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 1 : buteur remplace sans trace'; end if;

  -- 2. Trace sans rang, ou avec le mauvais rang : refuse.
  update public.tickets_du_jour set contenu = apres,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant or r.etats ? 'remplacements' then raise exception 'ECHEC 2 : trace sans rang acceptee'; end if;
  update public.tickets_du_jour set contenu = apres,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 0)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 2b : mauvais rang accepte'; end if;

  -- 3. Les deux joueurs changent d'un coup : refuse.
  update public.tickets_du_jour set contenu = j3 || jsonb_build_object('buteurs', jsonb_build_array(j3, j1)),
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 0)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 3 : deux joueurs changes en une fois'; end if;

  -- 4. Remplacant du match de l'autre buteur, ou dont le match a commence : refuse.
  update public.tickets_du_jour set contenu = j1 || jsonb_build_object('buteurs', jsonb_build_array(j1, j3_meme_match)),
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 1)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 4 : deux buteurs du meme match acceptes'; end if;
  update public.tickets_du_jour set contenu = j1 || jsonb_build_object('buteurs', jsonb_build_array(j1, j3_en_jeu)),
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 1)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 4b : remplacant deja en jeu accepte'; end if;

  -- 5. Premier niveau different de buteurs[0] : refuse.
  update public.tickets_du_jour set contenu = j2 || jsonb_build_object('buteurs', jsonb_build_array(j1, j3)),
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 1)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 5 : premier niveau incoherent accepte'; end if;
  update public.tickets_du_jour set contenu = j1 || jsonb_build_object('buteurs', jsonb_build_object('a', 1)),
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 1)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> avant then raise exception 'ECHEC 5b : liste illisible acceptee'; end if;

  -- 6. Remplacement valide du 2e joueur : seul lui change, premier_coup_envoi = le plus tot, trace horodatee.
  update public.tickets_du_jour set contenu = apres, meta = '{"x":1}', regle_version = 'autre',
      etats = jsonb_build_object('buteurs', jsonb_build_array('a_venir', 'a_venir'),
        'remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', avant, 'rang', 1)))
    where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.contenu <> apres then raise exception 'ECHEC 6 : remplacement valide refuse'; end if;
  if r.premier_coup_envoi <> to_timestamp(((j1 ->> 'coup_envoi_ms')::numeric) / 1000.0) then raise exception 'ECHEC 6b : premier_coup_envoi faux'; end if;
  if (r.etats -> 'remplacements' -> 0 ->> 'remplace_a') is null or r.etats -> 'remplacements' -> 0 -> 'ancien' <> avant then raise exception 'ECHEC 6c : trace absente ou non horodatee'; end if;
  if r.meta <> '{"nb_buteurs":2}'::jsonb or r.regle_version <> 'essai' then raise exception 'ECHEC 6d : meta ou version modifiees'; end if;
  trace := r.etats -> 'remplacements';

  -- 7. La trace ne s'efface jamais ; les etats par joueur evoluent.
  update public.tickets_du_jour set etats = '{"buteurs":["reporte","a_venir"],"joueur":"reporte"}' where jour = '1999-01-03' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
  if r.etats -> 'remplacements' <> trace or r.etats -> 'buteurs' ->> 0 <> 'reporte' then raise exception 'ECHEC 7 : trace effacee ou etat bloque'; end if;

  -- 8. Ancien ticket a un joueur : la regle de 0051 reste la meme.
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
    values ('1999-01-04', 'buteur', 'essai', '{}', ancien_seul, now() + interval '2 hours');
  update public.tickets_du_jour set contenu = nouveau_seul,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', ancien_seul)))
    where jour = '1999-01-04' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-04' and type = 'buteur';
  if r.contenu <> nouveau_seul then raise exception 'ECHEC 8 : ancien ticket non remplace'; end if;
  if r.premier_coup_envoi <> to_timestamp(((nouveau_seul ->> 'coup_envoi_ms')::numeric) / 1000.0) then raise exception 'ECHEC 8b : premier_coup_envoi faux'; end if;

  -- 9. Suppression refusee.
  begin
    delete from public.tickets_du_jour where jour = '1999-01-03' and type = 'buteur';
    raise exception 'ECHEC 9 : suppression acceptee';
  exception when others then
    if sqlerrm like 'ECHEC 9%' then raise; end if;
  end;

  raise notice 'tickets_du_jour, deux buteurs du jour : 10 verifications OK';
end;
$$;

rollback;
