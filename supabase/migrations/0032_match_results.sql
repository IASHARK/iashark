-- IASHARK — public.match_results : la PREUVE publique des resultats
-- (onglet « Hier », docs/SPEC_RESULTATS_HIER.md, decision du proprietaire du
-- 20/09/2026).
--
-- POURQUOI CES DONNEES SONT PUBLIQUES, alors que le pari d'un match a venir
-- est le produit payant lui-meme :
--
--   Un pari n'a de valeur marchande que tant que le match peut encore etre
--   joue. Une fois le match TERMINE, le pari retenu ne se joue plus : il ne
--   reste qu'un constat date, verifiable, qui sert de preuve au visiteur
--   (« voici ce qu'on avait retenu hier, voici ce que ca a donne, pertes
--   comprises »). C'est exactement la meme logique que
--   0021_predictions_archive_hide_pending.sql, qui n'ouvre a anon que les
--   predictions deja reglees.
--
--   Cette table ne contient donc, par construction, QUE des lignes de matchs
--   dont l'API a renvoye un statut definitif : FT/AET/PEN (joue jusqu'au bout)
--   ou PST/CANC/ABD (reporte, annule, abandonne — mise remboursee). Le
--   declencheur est le statut reel de l'API, jamais une heure estimee cote
--   client (§2 de la specification).
--
--   La garantie n'est PAS seulement une policy RLS (qu'une erreur de
--   relecture pourrait affaiblir) : la contrainte CHECK match_results_termine
--   ci-dessous REFUSE l'insertion d'une ligne sans resolved_at. Une ligne
--   portant le pari d'un match non termine ne peut pas exister dans cette
--   table, meme par erreur de code.
--
-- CE QUI N'EST PAS ICI : la probabilite du modele, la fiabilite, les textes
-- d'analyse, Kelly, l'ecart — ils restent premium (match_premium_data), meme
-- apres la fin du match. Seuls le marche retenu, sa cote, la source de la cote
-- et le verdict sont publies, parce que ce sont eux qui font la preuve.
--
-- ECRITURE : job .github/workflows/results-refresh.yml (service role), en
-- upsert sur fixture_id. Aucune ecriture cote client.

create table if not exists public.match_results (
  -- Un match = une ligne. Upsert idempotent : rejouer un passage du job ne
  -- duplique jamais et n'ecrit pas deux verdicts differents pour un match.
  fixture_id bigint primary key,
  -- Jour de la selection (heure de Paris) : celui de la prediction publiee,
  -- pas celui du coup d'envoi converti en UTC. C'est la cle de regroupement de
  -- l'onglet « Hier » et des pages /resultats/<date>.html.
  day date not null,
  home text,
  away text,
  league text,
  league_key text,
  -- Coup d'envoi au format public du site (« YYYY-MM-DD HH:MM », heure de
  -- Paris), identique a data-home.json / match/<id>.json : les pages
  -- l'affichent tel quel, sans reconversion de fuseau cote client.
  kickoff text,
  -- Score REGLEMENTAIRE 90 minutes (« 2-1 »), celui qui rend le verdict.
  -- null pour un match reporte/annule. Voir lib/resolvers.js#extractRegulationScore :
  -- aucun marche publie par IASHARK n'est un marche « apres prolongation ».
  score text,
  -- Le marche retenu et PUBLIE avant le coup d'envoi (gel, lib/pick-freeze.js),
  -- jamais un pari recalcule apres coup.
  pick text,
  market_id text,
  cote numeric,
  -- Source REELLE de la cote (§6) : « pinnacle » uniquement quand la donnee le
  -- dit (has_pinnacle / pinnacle_snapshot / market_source), sinon « moyenne ».
  -- Jamais devine : la contrainte interdit toute autre valeur.
  odds_source text check (odds_source is null or odds_source in ('pinnacle', 'moyenne')),
  -- Verdict. 'pending' = match termine mais pari NON reglable (marche non
  -- resolvable, statistiques absentes, pari non relu depuis l'archive) : il
  -- reste « en attente », jamais « perdu » par defaut (§5).
  result text not null check (result in ('win', 'loss', 'void', 'pending')),
  -- Buteur du jour de ce match (les 3 buteurs de la veille de l'accueil).
  -- Le nom n'est ecrit qu'une fois le match termine, comme le reste.
  scorer_player text,
  scorer_goals integer check (scorer_goals is null or scorer_goals >= 0),
  scorer_result text check (scorer_result is null or scorer_result in ('win', 'loss', 'void', 'pending')),
  -- Instant ou l'API a dit que ce match etait termine (ou annule). Obligatoire :
  -- c'est la preuve que le declencheur autorise a bien eu lieu.
  resolved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- GARDE STRUCTURELLE : pas de resolved_at, pas de ligne. Une ligne de match
  -- non termine est impossible, donc aucun pari payant ne peut fuiter par
  -- cette table, meme si une policy etait un jour mal reecrite.
  constraint match_results_termine check (resolved_at is not null)
);

-- Lecture par jour (onglet « Hier », pages /resultats/<date>.html).
create index if not exists match_results_day_idx on public.match_results (day desc);

alter table public.match_results enable row level security;

-- Lecture publique : la preuve n'a d'interet que si tout le monde peut la
-- verifier, abonne comme visiteur (§1 : tout est publie, pertes comprises).
drop policy if exists match_results_select_public on public.match_results;
create policy match_results_select_public on public.match_results
  for select
  to anon, authenticated
  using (true);

-- Aucune ecriture cote client : seul le job de resolution (service role, qui
-- contourne RLS) ecrit ici.
revoke insert, update, delete on public.match_results from anon, authenticated;

create or replace function public.match_results_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.match_results_set_updated_at() from public, anon, authenticated;

drop trigger if exists match_results_updated_at on public.match_results;
create trigger match_results_updated_at
  before update on public.match_results
  for each row
  execute function public.match_results_set_updated_at();

comment on table public.match_results is
  'Resultats publies des marches retenus. Uniquement des matchs dont l''API a renvoye un statut definitif (FT/AET/PEN, ou PST/CANC/ABD) : contrainte match_results_termine. Ecriture service_role (results-refresh.yml), lecture anon.';
comment on column public.match_results.result is
  'win | loss | void | pending. pending = match termine mais pari non reglable : jamais compte comme perdu.';
comment on column public.match_results.odds_source is
  'Source reelle de la cote : pinnacle | moyenne. Jamais devinee (specification §6).';
comment on column public.match_results.resolved_at is
  'Instant du statut final renvoye par l''API. Sa presence est la condition d''existence de la ligne.';
