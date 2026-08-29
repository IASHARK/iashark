-- IASHARK — Tracking interne minimal du tunnel de conversion (MASTER V2.1 §21)
--
-- Demande explicite de l'utilisateur : "tracking interne minimal en base si
-- possible sans vendor externe". Cette table remplace un outil d'analytics
-- tiers (aucun script/cookie/pixel externe, voir funnel-track.js) par un
-- simple journal d'evenements de parcours, ecrit directement via la cle
-- anon publique deja utilisee partout ailleurs sur le site.
--
-- event_type est contraint a une liste fermee (etapes reelles du tunnel
-- decrit par l'utilisateur : visiteur -> compte FREE -> usage -> decouverte
-- PRO -> page PRO -> checkout -> retour compte) plutot que du texte libre,
-- pour eviter que la table ne se remplisse de valeurs incoherentes au fil
-- du temps.
--
-- Limite connue et acceptee, documentee ici plutot que silencieuse :
-- l'ecriture est ouverte a `anon` (comme n'importe quelle table publique
-- utilisant la cle anon, deja exposee cote client sur tout le site) - un
-- acteur malveillant pourrait spammer des lignes. Impact limite a la
-- qualite des metriques internes (aucune donnee sensible n'est exposee ni
-- lisible par anon/authenticated - voir policies plus bas), pas un risque
-- de securite. Pas de rate limiting dedie construit pour ce chantier
-- (hors scope, a construire si un abus reel est observe).
create table if not exists funnel_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_type text not null check (event_type in (
    'landing_view',
    'signup_started',
    'signup_completed',
    'login_completed',
    'onboarding_dismissed',
    'tool_page_view',
    'paywall_view',
    'checkout_started',
    'checkout_unavailable',
    'checkout_success_view',
    'checkout_cancel_view'
  )),
  page text,
  locale text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists funnel_events_type_idx on funnel_events (event_type);
create index if not exists funnel_events_created_idx on funnel_events (created_at);
create index if not exists funnel_events_user_idx on funnel_events (user_id) where user_id is not null;

alter table funnel_events enable row level security;

-- Ecriture seule (insert), jamais de lecture pour anon/authenticated - ce
-- n'est pas un journal personnel consultable, seulement un flux d'evenements
-- agreges consultable par le service role (dashboard interne futur, hors
-- scope ici). user_id ne peut etre renseigne que par un utilisateur
-- authentifie pour SA PROPRE ligne (jamais celui d'un tiers) ; un visiteur
-- anonyme ne peut inserer qu'avec user_id NULL.
create policy funnel_events_insert_anon on funnel_events
  for insert to anon
  with check (user_id is null);

create policy funnel_events_insert_own on funnel_events
  for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

revoke select, update, delete on funnel_events from anon, authenticated;
