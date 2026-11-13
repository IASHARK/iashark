-- 0075 : MOTEUR « SCENARIO » (plan valide par Clement le 13/11/2026).
-- Tables PRIVEES (aucune politique : seule la cle de service du robot lit et ecrit).
--   scenario_matchs   : un match joue = une ligne, recupere UNE fois chez API-Sports (statistiques, cartons, arbitre,
--                       titulaires) ; le moteur n'y lit que les matchs joues avant le coup d'envoi du match a predire.
--   scenario_equipes  : date du dernier releve des matchs d'une equipe (pour ne pas redemander trop souvent).
--   scenario_paris    : chaque pari publie par le moteur, ce qu'on attendait, puis ce qui s'est passe (suivi par famille).
--   scenario_familles : etat de chaque famille (fermee toute seule sous la moitie sur ses 50 derniers paris).
create table if not exists public.scenario_matchs (
  id bigint primary key,
  joue_le timestamptz not null,
  ligue integer,
  saison integer,
  dom integer not null,
  ext integer not null,
  arbitre text,
  statut text,
  donnees jsonb not null,
  ajoute_le timestamptz not null default now()
);
create index if not exists scenario_matchs_dom_idx on public.scenario_matchs (dom, joue_le desc);
create index if not exists scenario_matchs_ext_idx on public.scenario_matchs (ext, joue_le desc);
create index if not exists scenario_matchs_arbitre_idx on public.scenario_matchs (arbitre, joue_le desc) where arbitre is not null;
alter table public.scenario_matchs enable row level security;

create table if not exists public.scenario_equipes (
  equipe integer primary key,
  vu_le timestamptz not null
);
alter table public.scenario_equipes enable row level security;

create table if not exists public.scenario_paris (
  fixture_id bigint primary key,
  publie_le timestamptz not null,
  coup_envoi timestamptz,
  code text not null,
  market_id text,
  famille text not null,
  sous_famille text,
  chance numeric,
  note numeric,
  cote numeric,
  attendus jsonb,
  version text,
  resultat text check (resultat is null or resultat in ('gagne', 'perdu', 'rembourse', 'annule')),
  regle_le timestamptz
);
create index if not exists scenario_paris_famille_idx on public.scenario_paris (famille, publie_le desc);
alter table public.scenario_paris enable row level security;

create table if not exists public.scenario_familles (
  famille text primary key,
  fermee boolean not null default false,
  total integer not null default 0,
  gagnes integer not null default 0,
  motif text,
  -- Les paris ne comptent que s'ils sont publies apres « depuis ». Rouvrir une famille : fermee = false ET depuis = now().
  depuis timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
alter table public.scenario_familles enable row level security;
