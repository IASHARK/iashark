-- IASHARK - essai de la migration 0073 (match rejoue : cle (fixture_id, rejoue) de predictions_archive).
--
-- A lancer UNIQUEMENT sur une base d'ESSAI ou les migrations 0005, 0034, 0035 et 0073 sont appliquees :
--   psql "<adresse de la base d'essai>" -v ON_ERROR_STOP=1 -f supabase/tests/0073_predictions_archive_rejoue.test.sql
-- Transaction ANNULEE a la fin (rollback). Numeros de match negatifs : jamais reels.

begin;

do $$
declare
  r record;
  n int;
begin
  -- 1. Pari A, match reporte : coup d'envoi d'origine passe, annule sans score.
  insert into public.predictions_archive (fixture_id, date, prediction, cote, market, model_probability, result, kickoff_at)
    values (-9101, current_date - 13, 'Plus de 2.5 buts', '1.80', 'over-25', 60, 'scheduled', now() + interval '1 hour');
  update public.predictions_archive set kickoff_at = now() - interval '13 days' where fixture_id = -9101;
  update public.predictions_archive set result = 'void', score = null, resolved_date = current_date - 12 where fixture_id = -9101 and rejoue = 0;
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 0;
  if r.rejoue <> 0 or r.result <> 'void' then raise exception 'ECHEC 1 : ligne A (rejoue %, %)', r.rejoue, r.result; end if;

  -- 2. Pari B du match rejoue : NOUVELLE ligne (rejoue 1), A inchange.
  insert into public.predictions_archive (fixture_id, rejoue, date, prediction, cote, market, model_probability, result, kickoff_at)
    values (-9101, 1, current_date, 'Victoire Domicile', '1.55', 'home-win', 66, 'scheduled', now() + interval '10 hours')
    on conflict (fixture_id, rejoue) do update set prediction = excluded.prediction;
  select count(*) into n from public.predictions_archive where fixture_id = -9101;
  if n <> 2 then raise exception 'ECHEC 2 : % ligne(s) pour le match rejoue (2 attendues)', n; end if;
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 0;
  if r.prediction <> 'Plus de 2.5 buts' or r.result <> 'void' then raise exception 'ECHEC 2b : ligne A modifiee (%, %)', r.prediction, r.result; end if;
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 1;
  if r.published_at is distinct from now() then raise exception 'ECHEC 2c : heure de publication de B non posee par la base'; end if;
  select count(*) into n from public.predictions_archive_refus where fixture_id = -9101 and operation = 'REJOUE_SANS_ANNULATION';
  if n <> 0 then raise exception 'ECHEC 2d : B note a tort REJOUE_SANS_ANNULATION'; end if;

  -- 3. A reste verrouille : un upsert de la ligne rejoue 0 ne change ni son pari ni son resultat.
  insert into public.predictions_archive (fixture_id, rejoue, date, prediction, result)
    values (-9101, 0, current_date, 'Victoire Domicile', 'win')
    on conflict (fixture_id, rejoue) do update set prediction = excluded.prediction, result = excluded.result;
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 0;
  if r.prediction <> 'Plus de 2.5 buts' or r.result <> 'void' then raise exception 'ECHEC 3 : ligne A reecrite (%, %)', r.prediction, r.result; end if;

  -- 4. Ligne rejoue sans pari precedent annule : acceptee (un refus bloquerait le lot) mais notee.
  insert into public.predictions_archive (fixture_id, rejoue, date, prediction, result, kickoff_at)
    values (-9102, 1, current_date, 'Victoire Domicile', 'scheduled', now() + interval '10 hours');
  select count(*) into n from public.predictions_archive_refus where fixture_id = -9102 and operation = 'REJOUE_SANS_ANNULATION';
  if n <> 1 then raise exception 'ECHEC 4 : REJOUE_SANS_ANNULATION non note (%)', n; end if;

  -- 5. Correction publique : vise la bonne ligne (rejoue), jamais les deux.
  update public.predictions_archive set kickoff_at = now() - interval '3 hours' where fixture_id = -9101 and rejoue = 1;
  update public.predictions_archive set result = 'loss', score = '0-1', resolved_date = current_date where fixture_id = -9101 and rejoue = 1;
  perform public.corriger_resultat_archive(-9101, 'win', '2-1', 'score de la source corrige (essai)', 1::smallint);
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 1;
  if r.result <> 'win' or r.score <> '2-1' then raise exception 'ECHEC 5 : correction de B non appliquee (%, %)', r.result, r.score; end if;
  select * into r from public.predictions_archive where fixture_id = -9101 and rejoue = 0;
  if r.result <> 'void' or r.score is not null then raise exception 'ECHEC 5b : correction appliquee aussi a A (%, %)', r.result, r.score; end if;
  select count(*) into n from public.predictions_archive_corrections where fixture_id = -9101 and rejoue = 1;
  if n <> 1 then raise exception 'ECHEC 5c : correction absente du journal public (%)', n; end if;

  raise notice 'OK : migration 0073 (match rejoue) verifiee.';
end;
$$;

rollback;
