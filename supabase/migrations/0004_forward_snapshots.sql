-- IASHARK — match_snapshots (infrastructure de collecte forward)
--
-- Pourquoi cette table existe : plusieurs features prevues pour le moteur V2.1
-- (lineups confirmes, blessures a T-1h, mouvement des cotes/closing line,
-- force d'equipe dynamique) NE PEUVENT PAS etre validees par backtest sur
-- l'historique existant, parce que les donnees brutes qui les nourrissent
-- n'ont jamais ete enregistrees par l'ancien pipeline (seul le resultat final
-- calcule etait ecrit dans data.json/historique.json, pas les inputs bruts).
--
-- Cette table demarre la collecte MAINTENANT, sans attendre que le moteur qui
-- les consomme soit fini. Voir IASHARK_V2_EXECUTION_STATE.md, section
-- FORWARD_VALIDATION_ONLY : la valeur de ces snapshots ne sera mesurable
-- qu'apres plusieurs semaines/mois de collecte reelle (walk-forward), jamais
-- fabriquee a partir de zero donnee.
--
-- snapshot_type distingue deux moments de capture pour le meme fixture_id :
--   'prediction' : au moment ou le pipeline quotidien genere la prediction
--                  (plusieurs heures/jours avant le coup d'envoi) — capture
--                  odds/injuries/lineups/team_stats tels que connus a cet instant.
--   'closing'    : juste avant le coup d'envoi (voir
--                  .github/workflows/closing-odds.yml) — capture uniquement
--                  les cotes, pour calculer le closing line value (CLV), un
--                  des signaux de calibration les plus fiables en paris
--                  sportifs (une prediction qui bat systematiquement la cote
--                  de cloture a plus de valeur qu'une prediction qui bat
--                  seulement la cote d'ouverture).
--
-- Un seul upsert par (fixture_id, snapshot_type) : si le pipeline tourne
-- plusieurs fois avant le verrouillage d'un match (cache matchCache), on
-- ecrase le snapshot 'prediction' avec la version la plus recente plutot que
-- d'empiler des doublons - c'est l'etat des inputs au moment de la DERNIERE
-- generation qui compte pour expliquer une prediction verrouillee.

create table if not exists match_snapshots (
  fixture_id bigint not null,
  snapshot_type text not null check (snapshot_type in ('prediction', 'closing')),
  captured_at timestamptz not null default now(),
  model_version text,
  pipeline_sha text,
  raw_inputs jsonb not null,
  primary key (fixture_id, snapshot_type)
);

create index if not exists match_snapshots_fixture_idx on match_snapshots (fixture_id);
create index if not exists match_snapshots_captured_idx on match_snapshots (captured_at);

alter table match_snapshots enable row level security;

-- Meme discipline que match_premium_data (0002) : aucune policy anon/authenticated,
-- ecriture/lecture uniquement via SUPABASE_SERVICE_ROLE_KEY (pipeline +, plus
-- tard, le job d'analyse de backtest). Le REVOKE retire le grant SELECT par
-- defaut que Postgres accorde a anon/authenticated sur toute nouvelle table.
revoke all on match_snapshots from anon, authenticated;
