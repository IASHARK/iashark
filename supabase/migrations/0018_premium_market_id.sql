-- IASHARK - market_id et marche nomment le marche recommande : ils sont
-- premium comme pari_rec (audit QA du 14/09/2026 : ils restaient lisibles dans
-- data.json public). Le pipeline les ecrit ici et les retire du fichier
-- public ; la fonction match-data les renvoie aux abonnes uniquement.
alter table public.match_premium_data add column if not exists market_id text;
alter table public.match_premium_data add column if not exists marche text;
