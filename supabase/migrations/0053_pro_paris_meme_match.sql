-- Canal Pro (03/10/2026) : famille « meme_match » = pari « meme match » pris dans un marche combine
-- du bookmaker (Result/Total Goals, Results/Both Teams Score, Total Goals/Both Teams To Score du flux
-- API-Football), cote du bookmaker de reference (bet365). A appliquer AVANT d'ajouter un de ces marches
-- dans config/marches-valides.json. Ne change rien aux paris existants.
alter table public.pro_paris drop constraint if exists pro_paris_famille_check;
alter table public.pro_paris add constraint pro_paris_famille_check
  check (famille = any (array['simple'::text, 'combine'::text, 'buteur'::text, 'meme_match'::text, 'fun10'::text, 'fun25'::text, 'reve'::text]));
