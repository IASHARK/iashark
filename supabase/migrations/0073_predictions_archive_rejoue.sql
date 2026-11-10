-- IASHARK - predictions_archive : une deuxieme ligne pour un match REJOUE apres un pari annule
-- (decision de Clement du 10/11/2026, vers 4 h : « enleve "match reporte", laisse-les normaux et donne
-- des pronos »).
--
-- Cas : un pari A publie avant le match, match reporte, A annule (result = 'void', sans score). Le match
-- revient plus tard a une nouvelle date : le site publie un nouveau pari B (lib/pick-freeze.js#matchRejoue).
-- Jusqu'ici la cle de la table etait fixture_id seul : B aurait ecrase la ligne de A, ou plutot le verrou
-- (migration 0035) aurait garde A et jete B en silence. Les deux sont inacceptables pour l'historique public.
--
-- 1. Nouvelle colonne rejoue : 0 pour toutes les lignes existantes et pour tout pari normal ; 1, 2... pour le
--    pari d'un match rejoue (1er, 2e report). Cle primaire (fixture_id, rejoue). La ligne de A ne change PAS
--    (meme contenu, meme resultat, meme verrou) : elle reste visible telle quelle.
-- 2. Les deux fonctions de la migration 0035 suivent la nouvelle cle :
--    - predictions_archive_publication : une ligne deja archivee = meme (fixture_id, rejoue) ; une ligne de
--      match rejoue (rejoue > 0) sans ligne precedente annulee sans score (rejoue - 1, 'void', score vide) est
--      notee dans predictions_archive_refus (REJOUE_SANS_ANNULATION). Pas de refus de la ligne : un refus
--      bloquerait tout le lot de 200 (arret du 09/09) ;
--    - predictions_archive_verrou : la correction publique d'un resultat vise (fixture_id, rejoue).
-- 3. Journal public des corrections : colonne rejoue (0 par defaut) ; corriger_resultat_archive prend un 5e
--    argument p_rejoue (0 par defaut), l'ancienne version a 4 arguments est retiree (sinon appel ambigu).
-- 4. match_snapshots (donnees d'entree, prive) : un type 'prediction_rejoue_<n>' (n de 1 a 9) garde les donnees
--    d'entree du pari du match rejoue a cote de celles du pari annule ('prediction', jamais ecrase).
-- 5. Colonne reporte (true : pari annule pour REPORT ; false : annule pour annulation ou arret du match, CANC ou
--    ABD ; null : inconnu, lignes anciennes). Un match arrete puis repris n'est jamais un match rejoue. Elle
--    decrit le verdict : comme result, elle peut etre ecrite apres le coup d'envoi (liste « libres » du verrou).
--
-- ORDRE DE MISE EN LIGNE : d'abord le code (le pipeline detecte la colonne et garde l'ancienne cle tant
-- qu'elle n'existe pas ; il ne publie alors aucun pari de match rejoue), PUIS cette migration. Si la
-- migration passe avant le code, l'ancien pipeline (on_conflict=fixture_id) ne peut plus archiver : run au
-- rouge jusqu'a la fusion du code.
-- Essai : supabase/tests/0073_predictions_archive_rejoue.test.sql (base d'essai seulement).
--
-- NE PAS APPLIQUER sans l'accord de Clement.

alter table public.predictions_archive add column if not exists rejoue smallint not null default 0;
alter table public.predictions_archive drop constraint if exists predictions_archive_rejoue_check;
alter table public.predictions_archive add constraint predictions_archive_rejoue_check check (rejoue between 0 and 9);

alter table public.predictions_archive drop constraint if exists predictions_archive_pkey;
alter table public.predictions_archive add constraint predictions_archive_pkey primary key (fixture_id, rejoue);

alter table public.predictions_archive add column if not exists reporte boolean;

alter table public.predictions_archive_corrections add column if not exists rejoue smallint not null default 0;

alter table public.match_snapshots drop constraint if exists match_snapshots_snapshot_type_check;
alter table public.match_snapshots add constraint match_snapshots_snapshot_type_check
  check (snapshot_type in ('prediction', 'closing') or snapshot_type ~ '^prediction_rejoue_[1-9]$');

create or replace function public.predictions_archive_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.published_at := now();
  -- Upsert du pipeline sur une ligne deja archivee (meme match, meme numero rejoue) : c'est une mise a jour,
  -- traitee par predictions_archive_verrou (qui garde l'heure d'origine).
  if exists (select 1 from public.predictions_archive a where a.fixture_id = new.fixture_id and a.rejoue = new.rejoue) then
    return new;
  end if;
  if new.kickoff_at is not null and now() >= new.kickoff_at then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (new.fixture_id, 'INSERT_APRES_COUP_D_ENVOI', null, to_jsonb(new));
  end if;
  -- Match rejoue : la ligne precedente doit etre un pari annule sans avoir ete joue.
  if new.rejoue > 0 and not exists (
    select 1 from public.predictions_archive a
    where a.fixture_id = new.fixture_id and a.rejoue = new.rejoue - 1
      and a.result = 'void' and coalesce(btrim(a.score), '') = ''
  ) then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (new.fixture_id, 'REJOUE_SANS_ANNULATION', null, to_jsonb(new));
  end if;
  return new;
end;
$$;

create or replace function public.predictions_archive_verrou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  libres constant text[] := array['result', 'score', 'resolved_date', 'updated_at', 'reporte'];
  pas_regle constant text[] := array['scheduled', 'pending'];
  avant jsonb;
  apres jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    -- Point 4 (0035) : published_at pose par la base. Pari change avant le coup d'envoi :
    -- nouvelle heure (celle de la base) ; sinon l'heure d'origine, quoi qu'envoie le pipeline.
    if (new.prediction, new.cote, new.market, new.model_probability)
         is distinct from (old.prediction, old.cote, old.market, old.model_probability)
       and (old.kickoff_at is null or now() < old.kickoff_at) then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
    -- Point 5 (0035) : kickoff_at jamais remis a vide ; un deplacement est note.
    if old.kickoff_at is not null and new.kickoff_at is null then
      insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
        values (old.fixture_id, 'UPDATE_KICKOFF_VIDE', to_jsonb(old), to_jsonb(new));
      new.kickoff_at := old.kickoff_at;
    elsif old.kickoff_at is not null and new.kickoff_at is distinct from old.kickoff_at
          and now() < old.kickoff_at then
      insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
        values (old.fixture_id, 'KICKOFF_DEPLACE', to_jsonb(old), to_jsonb(new));
    end if;
  end if;

  if old.kickoff_at is null or now() < old.kickoff_at then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'DELETE', to_jsonb(old), null);
    raise exception 'predictions_archive : pari % (rejoue %) verrouille (coup d''envoi passe), suppression refusee', old.fixture_id, old.rejoue;
  end if;

  avant := to_jsonb(old);
  apres := to_jsonb(new);
  foreach k in array libres loop
    avant := avant - k;
    apres := apres - k;
  end loop;
  if avant is distinct from apres then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'UPDATE', to_jsonb(old), to_jsonb(new));
    -- On garde tout de l'ancienne ligne, sauf le resultat.
    new := jsonb_populate_record(new, avant);
  end if;

  -- Resultat deja regle : il ne change plus, sauf correction publique enregistree
  -- dans cette meme transaction (corriger_resultat_archive), pour CETTE ligne (fixture_id, rejoue).
  if old.result is not null and not (old.result = any(pas_regle))
     and (new.result is distinct from old.result
          or new.score is distinct from old.score
          or new.resolved_date is distinct from old.resolved_date)
     and not exists (
       select 1 from public.predictions_archive_corrections c
       where c.fixture_id = old.fixture_id
         and c.rejoue = old.rejoue
         and c.nouveau_result = new.result
         and c.nouveau_score is not distinct from new.score
         and c.corrige_le = now()
     ) then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'UPDATE_RESULTAT', to_jsonb(old), to_jsonb(new));
    new.result := old.result;
    new.score := old.score;
    new.resolved_date := old.resolved_date;
  end if;
  return new;
end;
$$;

drop function if exists public.corriger_resultat_archive(bigint, text, text, text);
create or replace function public.corriger_resultat_archive(p_fixture_id bigint, p_result text, p_score text, p_raison text, p_rejoue smallint default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.predictions_archive%rowtype;
begin
  if p_raison is null or length(btrim(p_raison)) < 10 then
    raise exception 'corriger_resultat_archive : raison obligatoire (10 caracteres minimum)';
  end if;
  if p_result is null or p_result not in ('win', 'loss', 'void', 'neutral', 'no_signal') then
    raise exception 'corriger_resultat_archive : verdict % invalide', p_result;
  end if;
  select * into l from public.predictions_archive where fixture_id = p_fixture_id and rejoue = coalesce(p_rejoue, 0) for update;
  if not found then
    raise exception 'corriger_resultat_archive : pari % (rejoue %) absent de l''archive', p_fixture_id, coalesce(p_rejoue, 0);
  end if;
  insert into public.predictions_archive_corrections (fixture_id, rejoue, ancien_result, nouveau_result, ancien_score, nouveau_score, raison)
    values (p_fixture_id, coalesce(p_rejoue, 0), l.result, p_result, l.score, p_score, btrim(p_raison));
  update public.predictions_archive
    set result = p_result, score = p_score, resolved_date = coalesce(l.resolved_date, (now() at time zone 'Europe/Paris')::date)
    where fixture_id = p_fixture_id and rejoue = coalesce(p_rejoue, 0);
end;
$$;
revoke all on function public.corriger_resultat_archive(bigint, text, text, text, smallint) from public, anon, authenticated;
