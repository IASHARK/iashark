-- IASHARK - essai du gel de tickets_du_jour (migration 0050).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI (branche Supabase ou Postgres local) ou la
-- migration 0050 est appliquee. Jamais sur la vraie base :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0050_tickets_du_jour.test.sql
-- Tout se passe dans une transaction ANNULEE a la fin (rollback) : rien ne reste.
-- Une verification qui echoue arrete le script avec « ECHEC n : ... ».
-- Jour d'essai 1999-01-01 : jamais un vrai jour de tickets.

begin;

do $$
declare
  r record;
  n int;
  refuse boolean;
  pipeline_ment constant timestamptz := now() - interval '3 days';
begin
  -- 1. publie_a pose par la base : l'heure envoyee est ignoree.
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi, publie_a)
    values ('1999-01-01', 'x5', 'essai', '{"nb_matchs":3,"cote_totale":4.62}', '{"jambes":[{"fixture_id":-1}]}', now() + interval '2 hours', pipeline_ment);
  select * into r from public.tickets_du_jour where jour = '1999-01-01' and type = 'x5';
  if r.publie_a is distinct from now() then raise exception 'ECHEC 1 : publie_a declare par le pipeline accepte (%)', r.publie_a; end if;

  -- 2. Un second insert du meme jour et type ne remplace rien (on conflict do nothing).
  insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
    values ('1999-01-01', 'x5', 'autre', '{"nb_matchs":4}', '{"jambes":[]}', now() + interval '2 hours')
    on conflict (jour, type) do nothing;
  select * into r from public.tickets_du_jour where jour = '1999-01-01' and type = 'x5';
  if r.regle_version <> 'essai' or (r.meta->>'nb_matchs')::int <> 3 then raise exception 'ECHEC 2 : ticket publie remplace'; end if;

  -- 3. Gel : contenu, meta, heure et version remis a leur valeur d'origine ; etats et resultat changent.
  update public.tickets_du_jour
    set contenu = '{"jambes":[]}', meta = '{}', publie_a = pipeline_ment, regle_version = 'x',
        premier_coup_envoi = now() + interval '9 hours', etats = '{"jambes":{"-1":"reporte"}}', resultat = 'essai'
    where jour = '1999-01-01' and type = 'x5';
  select * into r from public.tickets_du_jour where jour = '1999-01-01' and type = 'x5';
  if r.contenu <> '{"jambes":[{"fixture_id":-1}]}'::jsonb then raise exception 'ECHEC 3 : contenu modifie apres publication'; end if;
  if (r.meta->>'nb_matchs')::int <> 3 or r.regle_version <> 'essai' or r.publie_a is distinct from now() then raise exception 'ECHEC 3b : meta, version ou heure modifiees'; end if;
  if r.premier_coup_envoi <> now() + interval '2 hours' then raise exception 'ECHEC 3c : premier_coup_envoi modifie'; end if;
  if r.etats->'jambes'->>'-1' <> 'reporte' or r.resultat <> 'essai' then raise exception 'ECHEC 3d : etats ou resultat non mis a jour'; end if;

  -- 4. Suppression refusee.
  refuse := false;
  begin
    delete from public.tickets_du_jour where jour = '1999-01-01' and type = 'x5';
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 4 : suppression acceptee'; end if;

  -- 5. Ticket dont le premier match a commence : refuse.
  refuse := false;
  begin
    insert into public.tickets_du_jour (jour, type, regle_version, meta, contenu, premier_coup_envoi)
      values ('1999-01-01', 'x10', 'essai', '{}', '{}', now() - interval '1 minute');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ECHEC 5 : ticket publie apres le coup d''envoi accepte'; end if;
  select count(*) into n from public.tickets_du_jour where jour = '1999-01-01' and type = 'x10';
  if n <> 0 then raise exception 'ECHEC 5b : ligne x10 presente'; end if;

  -- 6. Aucun droit pour anon et authenticated (ni lecture ni ecriture).
  if has_table_privilege('anon', 'public.tickets_du_jour', 'select') or has_table_privilege('authenticated', 'public.tickets_du_jour', 'select')
     or has_table_privilege('anon', 'public.tickets_du_jour', 'insert') or has_table_privilege('authenticated', 'public.tickets_du_jour', 'update') then
    raise exception 'ECHEC 6 : anon ou authenticated ont un droit sur tickets_du_jour';
  end if;
  if has_table_privilege('anon', 'public.tickets_du_jour_calculs', 'select') or has_table_privilege('authenticated', 'public.tickets_du_jour_calculs', 'select') then
    raise exception 'ECHEC 6b : anon ou authenticated lisent tickets_du_jour_calculs';
  end if;

  raise notice 'tickets_du_jour : 6 verifications OK';
end;
$$;

rollback;
