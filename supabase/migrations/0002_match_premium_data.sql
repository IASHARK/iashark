-- IASHARK — match_premium_data
-- Stocke les champs reserves au plan Pro (kelly, edge, verdict_shark, facteur_x,
-- dropping_odds) hors du fichier public data.json. Ecrit uniquement par le
-- pipeline (.github/workflows/update-data.yml, via SUPABASE_SERVICE_ROLE_KEY,
-- qui contourne RLS) et lu uniquement par l'Edge Function match-data
-- (supabase/functions/match-data/index.ts), elle aussi via le service role
-- apres verification explicite du plan de l'utilisateur.
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
  updated_at timestamptz not null default now()
);

alter table match_premium_data enable row level security;

-- Aucune policy pour anon/authenticated : cette table n'est accessible qu'via
-- un client service-role (pipeline en ecriture, Edge Function en lecture),
-- qui contourne RLS par definition. C'est intentionnel - ne pas ajouter de
-- policy select "publique" ici, meme restreinte : le but de cette table est
-- justement de ne jamais etre interrogeable directement par le navigateur.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists match_premium_data_updated_at on match_premium_data;
create trigger match_premium_data_updated_at
  before update on match_premium_data
  for each row execute function set_updated_at();
