-- IASHARK — 0056 : prevenir Clement de chaque candidature partenaire (28/10/2026).
--
-- Jusqu'ici une candidature n'arrivait que dans l'admin (ecran Partenaires) : personne
-- n'etait prevenu. scripts/telegram/alerte-partenaires.mjs (workflow « Alerte
-- partenaires », toutes les 30 minutes) envoie chaque nouvelle candidature dans la
-- conversation privee de Clement avec le robot, puis pose owner_notified_at pour ne
-- jamais l'envoyer deux fois. Colonne ecrite par la cle de service seulement.

alter table public.affiliates add column if not exists owner_notified_at timestamptz;

comment on column public.affiliates.owner_notified_at is
  'Moment ou Clement a ete prevenu de la candidature sur Telegram (scripts/telegram/alerte-partenaires.mjs).';
