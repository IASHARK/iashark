-- IASHARK - predictions_archive : moteur fige a la premiere publication et journal
-- des vraies revisions d'un pari avant son coup d'envoi (integrite des empreintes,
-- 23/10/2026).
--
-- Constat de l'enquete du 23/10 : le 21/10, le pipeline a reecrit deux fois la
-- version du moteur (moteur, moteur_version) de 4 paris deja publies (19/10 et
-- 20/10), avant leur coup d'envoi, alors que le pari lui-meme n'avait pas change.
-- Le verrou de la migration 0035 ne protege la ligne qu'APRES le coup d'envoi.
-- Le pipeline ne le fait plus (lib/pick-freeze.js#alignPendingPrediction) ; cette
-- migration pose la meme regle dans la base :
-- 1. Pari identique (prediction, cote, market, model_probability) : moteur et
--    moteur_version ne changent plus une fois poses. La tentative est annulee
--    (anciennes valeurs remises) et notee dans predictions_archive_refus
--    (MOTEUR_REECRIT_PARI_IDENTIQUE). Une ligne ancienne sans moteur (null) peut
--    encore le recevoir.
-- 2. Pari qui change VRAIMENT avant le coup d'envoi (exception au gel, buteur absent
--    de la composition...) : la modification passe, mais l'ancien et le nouveau pari
--    sont d'abord ecrits dans predictions_archive_revisions (ajout seulement). Ce
--    journal reste reserve au service role : avant le match, le pari est payant.
--    Le detail public est publie apres le coup d'envoi dans preuves/corrections.json.
-- Ce declencheur s'execute avant predictions_archive_verrou (ordre alphabetique des
-- noms) ; le verrou d'apres coup d'envoi (0035) reste inchange.
--
-- NE PAS APPLIQUER sans l'accord de Clement.

create table if not exists public.predictions_archive_revisions (
  id bigserial primary key,
  fixture_id bigint not null,
  avant jsonb not null,
  apres jsonb not null,
  revise_le timestamptz not null default now()
);
alter table public.predictions_archive_revisions enable row level security;
-- Aucune policy : lecture et ecriture reservees au service role (et au declencheur).

create or replace function public.predictions_archive_revisions_ajout_seulement()
returns trigger
language plpgsql
as $$
begin
  raise exception 'predictions_archive_revisions : journal, ajout seulement (ni modification ni suppression)';
end;
$$;
drop trigger if exists predictions_archive_revisions_ajout_seulement on public.predictions_archive_revisions;
create trigger predictions_archive_revisions_ajout_seulement
  before update or delete on public.predictions_archive_revisions
  for each row execute function public.predictions_archive_revisions_ajout_seulement();

create or replace function public.predictions_archive_moteur_fige()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.prediction, new.cote, new.market, new.model_probability)
       is not distinct from (old.prediction, old.cote, old.market, old.model_probability) then
    -- Point 1 : pari identique, moteur fige.
    if old.moteur is not null
       and (new.moteur, new.moteur_version) is distinct from (old.moteur, old.moteur_version) then
      insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
        values (old.fixture_id, 'MOTEUR_REECRIT_PARI_IDENTIQUE', to_jsonb(old), to_jsonb(new));
      new.moteur := old.moteur;
      new.moteur_version := old.moteur_version;
    end if;
  elsif old.prediction is not null and (old.kickoff_at is null or now() < old.kickoff_at) then
    -- Point 2 : vraie revision avant le coup d'envoi, jamais en silence.
    insert into public.predictions_archive_revisions (fixture_id, avant, apres)
      values (
        old.fixture_id,
        jsonb_build_object('prediction', old.prediction, 'cote', old.cote, 'market', old.market,
          'model_probability', old.model_probability, 'moteur', old.moteur, 'moteur_version', old.moteur_version,
          'published_at', old.published_at),
        jsonb_build_object('prediction', new.prediction, 'cote', new.cote, 'market', new.market,
          'model_probability', new.model_probability, 'moteur', new.moteur, 'moteur_version', new.moteur_version)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_archive_moteur_fige on public.predictions_archive;
create trigger predictions_archive_moteur_fige
  before update on public.predictions_archive
  for each row execute function public.predictions_archive_moteur_fige();
