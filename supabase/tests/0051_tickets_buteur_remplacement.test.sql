-- IASHARK - essai du remplacement du buteur du jour (migration 0051).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI (branche Supabase ou Postgres local) ou les migrations
-- 0050 et 0051 sont appliquees. Jamais sur la vraie base :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0051_tickets_buteur_remplacement.test.sql
-- Tout se passe dans une transaction ANNULEE a la fin (rollback) : rien ne reste.
-- Une verification qui echoue arrete le script avec « ECHEC n : ... ».
-- Jour d'essai 1999-01-02 : jamais un vrai jour de tickets.

begin;

do $$
declare
  r record;
  ancien constant jsonb := jsonb_build_object('joueur', 'Ancien', 'joueur_id', 1, 'fixture_id', -1,
    'coup_envoi_ms', (extract(epoch from now() + interval '2 hours') * 1000)::bigint);
  nouveau constant jsonb := jsonb_build_object('joueur', 'Nouveau', 'joueur_id', 2, 'fixture_id', -2,
    'coup_envoi_ms', (extract(epoch from now() + interval '5 hours') * 1000)::bigint);
  passe constant jsonb := jsonb_build_object('joueur', 'Passe', 'joueur_id', 3, 'fixture_id', -3,
    'coup_envoi_ms', (extract(epoch from now() - interval '1 hour') * 1000)::bigint);
  trace jsonb;
begin
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
    values ('1999-01-02', 'buteur', 'essai', '{}', ancien, now() + interval '2 hours');
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
    values ('1999-01-02', 'x5', 'essai', '{"nb_matchs":3}', '{"jambes":[{"fixture_id":-1}]}', now() + interval '2 hours');

  -- 1. Sans trace : contenu remis (gel de 0050 inchange).
  update public.tickets_du_jour set contenu = nouveau where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.contenu <> ancien then raise exception 'ECHEC 1 : buteur remplace sans trace'; end if;

  -- 2. Trace d'un autre motif ou d'un autre ancien joueur : refuse.
  update public.tickets_du_jour set contenu = nouveau,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'blessure', 'ancien', ancien)))
    where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.contenu <> ancien or r.etats ? 'remplacements' then raise exception 'ECHEC 2 : motif autre que la composition accepte'; end if;
  update public.tickets_du_jour set contenu = nouveau,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', nouveau)))
    where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.contenu <> ancien then raise exception 'ECHEC 2b : trace fausse acceptee'; end if;

  -- 3. Nouveau joueur dont le match a deja commence : refuse.
  update public.tickets_du_jour set contenu = passe,
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', ancien)))
    where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.contenu <> ancien then raise exception 'ECHEC 3 : remplacant deja en jeu accepte'; end if;

  -- 4. Remplacement valide : nouveau joueur, premier_coup_envoi = son match, trace gardee et horodatee par la base.
  update public.tickets_du_jour set contenu = nouveau, meta = '{"x":1}', regle_version = 'autre',
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', ancien)))
    where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.contenu <> nouveau then raise exception 'ECHEC 4 : remplacement valide refuse'; end if;
  if r.premier_coup_envoi <> to_timestamp(((nouveau ->> 'coup_envoi_ms')::numeric) / 1000.0) then raise exception 'ECHEC 4b : premier_coup_envoi non mis a jour'; end if;
  if r.etats -> 'remplacements' -> 0 -> 'ancien' <> ancien or (r.etats -> 'remplacements' -> 0 ->> 'remplace_a') is null then raise exception 'ECHEC 4c : trace absente ou non horodatee'; end if;
  if r.meta <> '{}'::jsonb or r.regle_version <> 'essai' then raise exception 'ECHEC 4d : meta ou version modifiees'; end if;
  trace := r.etats -> 'remplacements';

  -- 5. La trace ne s'efface jamais ; les etats, eux, evoluent.
  update public.tickets_du_jour set etats = '{"joueur":"reporte"}' where jour = '1999-01-02' and type = 'buteur';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'buteur';
  if r.etats -> 'remplacements' <> trace or r.etats ->> 'joueur' <> 'reporte' then raise exception 'ECHEC 5 : trace effacee ou etat bloque'; end if;

  -- 6. Les autres types restent figes, meme avec une trace.
  update public.tickets_du_jour set contenu = '{"jambes":[]}',
      etats = jsonb_build_object('remplacements', jsonb_build_array(jsonb_build_object('motif', 'absent_composition', 'ancien', '{"jambes":[{"fixture_id":-1}]}'::jsonb)))
    where jour = '1999-01-02' and type = 'x5';
  select * into r from public.tickets_du_jour where jour = '1999-01-02' and type = 'x5';
  if r.contenu <> '{"jambes":[{"fixture_id":-1}]}'::jsonb then raise exception 'ECHEC 6 : ticket x5 modifie'; end if;

  raise notice 'tickets_du_jour, remplacement du buteur : 6 verifications OK';
end;
$$;

rollback;
