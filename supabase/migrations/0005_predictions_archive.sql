-- IASHARK — predictions_archive (Archives du modèle, MASTER V2.1 §15)
--
-- Corrige un vrai bug de perte de données : le pipeline (update-data.yml)
-- fait `histo.predictions.slice(0,300)` sur CHAQUE run, ce qui supprime
-- définitivement toute prédiction au-delà des 300 plus récentes dans
-- historique.json. Le MASTER l'interdit explicitement (§15.3 : "Ne jamais
-- slice(0,300) comme suppression définitive. Utiliser pagination DB.").
--
-- Cette table devient la source de vérité complète, non plafonnée
-- (§1.5 : "Supabase/Postgres = source de vérité structurée"). `historique.json`
-- reste un cache de lecture rapide (§1.5 : "Les fichiers JSON publics ne
-- sont que : caches de lecture") limité aux prédictions récentes pour la
-- taille de page (§33), mais plus aucune prédiction n'est perdue : le
-- pipeline écrit ici en plus d'écrire dans historique.json, sans plafond.
--
-- Donnée publique par nature (déjà visible de tous sur historique.html,
-- FREE incluse) : lecture publique autorisée, contrairement à
-- match_premium_data/match_snapshots qui restent service-role only.
-- Écriture réservée au pipeline (service role) uniquement.

create table if not exists predictions_archive (
  fixture_id bigint primary key,
  match_label text,
  home text,
  away text,
  prediction text,
  cote text,
  model_probability numeric,
  reliability jsonb,
  -- conf/conf_bucket : alias deprecies conserves pour compatibilite avec
  -- l'historique existant genere avant model_probability/reliability (voir
  -- IASHARK_V2_EXECUTION_STATE.md, section conf deprecie).
  conf numeric,
  conf_bucket text,
  market text,
  league text,
  league_key text,
  sport text default 'football',
  elo_diff numeric,
  has_pinnacle boolean default false,
  has_elo boolean default false,
  date date not null,
  result text not null default 'scheduled' check (result in ('scheduled', 'pending', 'win', 'loss', 'void', 'neutral', 'no_signal')),
  type text not null default 'single',
  score text,
  resolved_date date,
  pipeline_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists predictions_archive_date_idx on predictions_archive (date desc);
create index if not exists predictions_archive_result_idx on predictions_archive (result);
create index if not exists predictions_archive_market_idx on predictions_archive (market);

alter table predictions_archive enable row level security;

-- Lecture publique (donnee deja publique sur historique.html pour tous les
-- visiteurs, FREE compris) - mais AUCUNE ecriture cote client.
create policy predictions_archive_select_public on predictions_archive
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on predictions_archive from anon, authenticated;

create or replace function predictions_archive_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function predictions_archive_set_updated_at() from public, anon, authenticated;

drop trigger if exists predictions_archive_updated_at on predictions_archive;
create trigger predictions_archive_updated_at
  before update on predictions_archive
  for each row execute function predictions_archive_set_updated_at();
