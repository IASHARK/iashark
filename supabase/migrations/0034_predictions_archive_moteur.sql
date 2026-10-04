-- IASHARK - predictions_archive : quel moteur a publie chaque pari
-- (avocat du diable, 29/09/2026, condition C2 du moteur v3).
--
-- Le nouveau moteur (v3) doit avoir son historique a part : sans ce marquage,
-- impossible de separer ses paris de ceux de l'ancien moteur. Le pipeline
-- (update-data.yml, updateHistorique) ecrit desormais sur chaque pari archive :
--   moteur          'v3' ou 'ancien'
--   moteur_version  version du moteur v3 (sortie du moteur), ou version de
--                   l'ancien moteur (MODEL_VERSION du pipeline)
-- Les lignes deja archivees restent a null : elles viennent toutes de l'ancien
-- moteur (le v3 n'a jamais ete allume avant cette migration).
--
-- Si cette migration n'est pas appliquee, le pipeline archive quand meme les
-- paris (sans ces deux colonnes) et met le run au rouge pour le signaler.

alter table public.predictions_archive add column if not exists moteur text;
alter table public.predictions_archive add column if not exists moteur_version text;

alter table public.predictions_archive drop constraint if exists predictions_archive_moteur_check;
alter table public.predictions_archive add constraint predictions_archive_moteur_check
  check (moteur is null or moteur in ('v3', 'ancien'));

create index if not exists predictions_archive_moteur_idx on public.predictions_archive (moteur);
