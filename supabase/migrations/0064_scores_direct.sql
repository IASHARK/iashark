-- 0064 (06/11/2026) : cache des scores en direct (fonction scores-direct).
-- Une seule ligne par jour de Paris : les scores compacts de TOUS les matchs du jour, relus chez API-Sports
-- au plus une fois par minute pour tout le site (jamais un appel par visiteur, cle jamais envoyee au navigateur).
-- Lu et ecrit seulement par la fonction (cle de service) : RLS active, aucune politique.
create table if not exists public.scores_direct (
  jour text primary key,
  donnees jsonb not null default '{}'::jsonb,
  maj timestamptz,
  essai timestamptz
);
alter table public.scores_direct enable row level security;
