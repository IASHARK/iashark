-- IASHARK — le PARI RECOMMANDE devient une donnee premium.
--
-- Faille corrigee le 03/09/2026. L'architecture de protection existait deja
-- (match_premium_data + Edge Function match-data qui verifie le plan), mais
-- elle ne couvrait que des metriques secondaires : kelly, edge, verdict_shark,
-- facteur_x, dropping_odds, player_markets.
--
-- Le produit lui-meme - le marche recommande, sa cote et la probabilite du
-- modele - n'a jamais ete classe premium. Il partait donc en clair dans
-- https://iashark.com/data.json, fichier public de 18 Mo accessible sans
-- compte, et se retrouvait aussi dans le HTML des pages match payantes.
-- La serrure fonctionnait ; elle etait posee sur la mauvaise porte.
--
-- Ces quatre colonnes accueillent desormais ces champs. Le pipeline les ecrit
-- ici au lieu de data.json, sauf pour le match gratuit du jour (is_free), qui
-- reste public par construction : c'est l'offre d'appel.
--
-- conf (indice de confiance 0-10) reste PUBLIC volontairement : sans le marche
-- recommande, c'est une amorce, pas le produit. Il alimente les cartes
-- verrouillees de la page d'accueil.

alter table match_premium_data
  add column if not exists pari_rec text,
  add column if not exists cote_rec numeric,
  add column if not exists model_probability numeric,
  add column if not exists markets_compared jsonb;

comment on column match_premium_data.pari_rec is
  'Marche recommande par le modele. Premium : jamais dans data.json public, sauf pour le match gratuit du jour.';
comment on column match_premium_data.cote_rec is
  'Cote du marche recommande. Premium, meme regle que pari_rec.';
comment on column match_premium_data.model_probability is
  'Probabilite du modele sur le marche recommande. Premium, meme regle.';
comment on column match_premium_data.markets_compared is
  'Comparatif modele/marche par marche. Premium, meme regle.';
