-- IASHARK — forward_odds_timeline (Market Lab Phase 2.5, 2026-09-05)
--
-- BROUILLON DE MIGRATION - PAS ENCORE APPLIQUE en base au moment ou ce
-- fichier est commite (voir le retour de session correspondant). Prepare
-- le schema en attendant une confirmation explicite avant application,
-- une modification de schema Supabase live n'etant pas prise a la legere.
--
-- Pourquoi une nouvelle table plutot que reutiliser odds_snapshots ou
-- match_snapshots :
--   - odds_snapshots stocke un blob JSONB BRUT par (fixture, phase) -
--     jamais une ligne canonicalisee par bookmaker/marche/selection,
--     jamais de time_to_kickoff, jamais de canonical_market_id.
--   - match_snapshots ECRASE 'prediction'/'closing' a chaque run
--     (primary key (fixture_id, snapshot_type)) - structurellement
--     PAS append-only, l'historique des revisions n'est pas conserve.
-- forward_odds_timeline est ADDITIF UNIQUEMENT (jamais d'UPDATE en
-- place, jamais de suppression d'une ligne deja ecrite) : une ligne =
-- une offre d'UN bookmaker, sur UN marche canonique V1, a UN instant de
-- collecte precis, jamais fusionnee avec une autre.
create table if not exists forward_odds_timeline (
  id bigint generated always as identity primary key,
  fixture_id bigint not null,
  league_id integer not null,
  kickoff timestamptz not null,
  -- FIRST_SEEN/T72/T24/T6/CLOSE deja collectes en pratique. T1 est ajoute
  -- au vocabulaire du schema par anticipation (utile pour les decisions
  -- proches du coup d'envoi et les compositions confirmees) mais n'est
  -- pas encore produit par la collecte reelle aujourd'hui - voir
  -- lib/market-lab/forward-odds-dataset.js pour le detail de cadence.
  snapshot_phase text not null check (snapshot_phase in ('FIRST_SEEN', 'T72', 'T24', 'T6', 'T1', 'CLOSE')),
  collected_at timestamptz not null,
  time_to_kickoff_hours numeric not null,
  bookmaker_id text,
  bookmaker_name text,
  canonical_market_id text not null,
  selection text not null,
  decimal_odds numeric not null,
  raw_payload_hash text not null,
  inserted_at timestamptz not null default now(),
  -- Idempotence d'insertion (pas une contrainte metier) : rejouer le
  -- meme payload brut pour le meme (fixture, phase, bookmaker, marche,
  -- selection) ne doit jamais dupliquer une ligne - "ON CONFLICT DO
  -- NOTHING" cote application, jamais un UPDATE qui effacerait la valeur
  -- deja ecrite (append-only veut dire : la premiere valeur ecrite fait
  -- foi, jamais remplacee).
  unique (fixture_id, snapshot_phase, bookmaker_id, canonical_market_id, selection)
);

create index if not exists forward_odds_timeline_fixture_idx on forward_odds_timeline (fixture_id);
create index if not exists forward_odds_timeline_market_idx on forward_odds_timeline (canonical_market_id);
create index if not exists forward_odds_timeline_collected_idx on forward_odds_timeline (collected_at);

alter table forward_odds_timeline enable row level security;

-- Meme discipline que match_snapshots (0004) : aucune policy anon/
-- authenticated, ecriture/lecture uniquement via SUPABASE_SERVICE_ROLE_KEY.
revoke all on forward_odds_timeline from anon, authenticated;
