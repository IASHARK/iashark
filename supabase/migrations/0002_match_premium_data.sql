-- IASHARK — match_premium_data
-- Stocke les champs reserves au plan Pro (kelly, edge, verdict_shark, facteur_x,
-- dropping_odds) hors du fichier public data.json. Ecrit uniquement par le
-- pipeline (.github/workflows/update-data.yml, via SUPABASE_SERVICE_ROLE_KEY,
-- qui contourne RLS) et lu uniquement par l'Edge Function match-data
-- (supabase/functions/match-data/index.ts), elle aussi via le service role
-- apres verification explicite du plan de l'utilisateur.
--
-- raw_response/pipeline_sha : tracabilite/reproductibilite (voir
-- IASHARK_PIPELINE_AUDIT.md §7) - la reponse brute du modele et le commit
-- SHA du pipeline qui l'a produite, pour pouvoir expliquer une prediction
-- a posteriori sans devoir fouiller des logs GitHub Actions qui expirent.
--
-- A appliquer sur le projet Supabase (dashboard SQL editor, ou `supabase db push`)
-- AVANT d'ajouter le secret SUPABASE_SERVICE_ROLE_KEY au repo GitHub Actions -
-- sinon le pipeline log un avertissement et n'ecrit ces champs nulle part
-- (comportement de repli volontaire, voir writePremiumData() dans le pipeline).

create table if not exists match_premium_data (
  fixture_id bigint primary key,
  kelly text,
  edge text,
  verdict_shark text,
  facteur_x text,
  dropping_odds jsonb,
  raw_response jsonb,
  pipeline_sha text,
  updated_at timestamptz not null default now()
);

alter table match_premium_data enable row level security;

-- Aucune policy pour anon/authenticated : cette table n'est accessible qu'via
-- un client service-role (pipeline en ecriture, Edge Function en lecture),
-- qui contourne RLS par definition. C'est intentionnel - ne pas ajouter de
-- policy select "publique" ici, meme restreinte. Le REVOKE ci-dessous retire
-- en plus le GRANT SELECT que Postgres accorde par defaut a anon/authenticated
-- sur toute nouvelle table (RLS bloquait deja les lignes, mais le grant au
-- niveau table etait une exposition inutile signalee par l'auditeur Supabase).
revoke all on match_premium_data from anon, authenticated;

create or replace function match_premium_data_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function match_premium_data_set_updated_at() from public, anon, authenticated;

drop trigger if exists match_premium_data_updated_at on match_premium_data;
create trigger match_premium_data_updated_at
  before update on match_premium_data
  for each row execute function match_premium_data_set_updated_at();
