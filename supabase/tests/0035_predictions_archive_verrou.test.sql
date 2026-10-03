-- IASHARK - essai du verrou de predictions_archive (migration 0035).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI (branche Supabase ou Postgres local) ou
-- les migrations 0005, 0034 et 0035 sont appliquees. Jamais sur la vraie base :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0035_predictions_archive_verrou.test.sql
-- Tout se passe dans une transaction ANNULEE a la fin (rollback) : rien ne reste.
-- Une verification qui echoue arrete le script avec « ECHEC n : ... ».
-- now() est fige pendant la transaction : les coups d'envoi sont donc places
-- avant (+2 h) ou apres (-2 h) ce moment. Numeros de match negatifs : jamais reels.

begin;

do $$
declare
  r record;
  n int;
  pipeline_ment constant timestamptz := now() - interval '3 days';
begin
  -- 1. published_at pose par la base : l'heure antidatee envoyee par le pipeline est ignoree.
  insert into public.predictions_archive (fixture_id, date, prediction, cote, market, model_probability, result, published_at, kickoff_at)
    values (-9001, current_date, 'Victoire Domicile', '1.80', 'victoire_dom', 60, 'scheduled', pipeline_ment, now() + interval '2 hours');
  select * into r from public.predictions_archive where fixture_id = -9001;
  if r.published_at is distinct from now() then raise exception 'ECHEC 1 : published_at declare par le pipeline accepte (%)', r.published_at; end if;

  -- 2. Upsert du pipeline (meme pari, autre heure) : l'heure d'origine reste.
  insert into public.predictions_archive (fixture_id, date, prediction, cote, market, model_probability, result, published_at, kickoff_at)
    values (-9001, current_date, 'Victoire Domicile', '1.80', 'victoire_dom', 60, 'scheduled', pipeline_ment, now() + interval '2 hours')
    on conflict (fixture_id) do update set published_at = excluded.published_at, kickoff_at = excluded.kickoff_at;
  select * into r from public.predictions_archive where fixture_id = -9001;
  if r.published_at is distinct from now() then raise exception 'ECHEC 2 : published_at reecrit par un upsert (%)', r.published_at; end if;
  update public.predictions_archive set published_at = pipeline_ment where fixture_id = -9001;
  select * into r from public.predictions_archive where fixture_id = -9001;
  if r.published_at is distinct from now() then raise exception 'ECHEC 2b : published_at reecrit par un update (%)', r.published_at; end if;

  -- 3. kickoff_at jamais remis a vide (avant le match) : ancienne valeur remise, tentative notee.
  update public.predictions_archive set kickoff_at = null where fixture_id = -9001;
  select * into r from public.predictions_archive where fixture_id = -9001;
  if r.kickoff_at is null then raise exception 'ECHEC 3 : kickoff_at remis a vide'; end if;
  select count(*) into n from public.predictions_archive_refus where fixture_id = -9001 and operation = 'UPDATE_KICKOFF_VIDE';
  if n <> 1 then raise exception 'ECHEC 3b : tentative UPDATE_KICKOFF_VIDE non notee (%)', n; end if;

  -- 4. Match reporte avant le coup d'envoi : permis, mais note.
  update public.predictions_archive set kickoff_at = now() + interval '1 day' where fixture_id = -9001;
  select * into r from public.predictions_archive where fixture_id = -9001;
  if r.kickoff_at is distinct from now() + interval '1 day' then raise exception 'ECHEC 4 : report refuse'; end if;
  select count(*) into n from public.predictions_archive_refus where fixture_id = -9001 and operation = 'KICKOFF_DEPLACE';
  if n <> 1 then raise exception 'ECHEC 4b : report non note (%)', n; end if;

  -- 5. Pari ajoute APRES son coup d'envoi : gardé avec sa vraie heure (ne prouve rien), tentative notee.
  insert into public.predictions_archive (fixture_id, date, prediction, cote, market, model_probability, result, published_at, kickoff_at)
    values (-9002, current_date, 'Plus de 2.5 buts', '1.90', 'over_25', 55, 'scheduled', pipeline_ment, now() - interval '2 hours');
  select * into r from public.predictions_archive where fixture_id = -9002;
  if not (r.published_at >= r.kickoff_at) then raise exception 'ECHEC 5 : pari tardif presente comme publie avant le match'; end if;
  select count(*) into n from public.predictions_archive_refus where fixture_id = -9002 and operation = 'INSERT_APRES_COUP_D_ENVOI';
  if n <> 1 then raise exception 'ECHEC 5b : ajout tardif non note (%)', n; end if;

  -- 6. Apres le coup d'envoi : pari, heure et coup d'envoi figes (valeur d'origine remise).
  update public.predictions_archive set prediction = 'Moins de 2.5 buts', published_at = pipeline_ment, kickoff_at = null where fixture_id = -9002;
  select * into r from public.predictions_archive where fixture_id = -9002;
  if r.prediction <> 'Plus de 2.5 buts' then raise exception 'ECHEC 6 : pari modifie apres le coup d envoi'; end if;
  if r.kickoff_at is null or r.published_at is distinct from now() then raise exception 'ECHEC 6b : heure ou coup d envoi modifies apres le match'; end if;

  -- 7. Resultat : libre tant qu'il n'est pas regle, puis fige (sauf correction publique).
  update public.predictions_archive set result = 'loss', score = '1-0', resolved_date = current_date where fixture_id = -9002;
  select * into r from public.predictions_archive where fixture_id = -9002;
  if r.result <> 'loss' then raise exception 'ECHEC 7 : premier reglement refuse'; end if;
  update public.predictions_archive set result = 'void' where fixture_id = -9002;
  select * into r from public.predictions_archive where fixture_id = -9002;
  if r.result <> 'loss' then raise exception 'ECHEC 7b : perdu devenu rembourse en silence'; end if;
  perform public.corriger_resultat_archive(-9002, 'win', '3-1', 'Score corrige par la source officielle');
  select * into r from public.predictions_archive where fixture_id = -9002;
  if r.result <> 'win' or r.score <> '3-1' then raise exception 'ECHEC 7c : correction publique refusee'; end if;

  -- 8. Suppression apres le coup d'envoi : refusee.
  begin
    delete from public.predictions_archive where fixture_id = -9002;
    raise exception 'ECHEC 8 : suppression acceptee apres le coup d envoi';
  exception when others then
    if sqlerrm like 'ECHEC 8%' then raise; end if;
  end;

  raise notice 'Verrou 0035 : 8 verifications OK (transaction annulee).';
end;
$$;

rollback;
