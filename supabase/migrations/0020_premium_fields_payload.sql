-- IASHARK - champs premium etendus (audit fuite de donnees du 14/09/2026).
--
-- data.json, data-home.json, match/<id>.json et les pages match publiaient
-- pour TOUS les matchs les sorties du modele : probabilites 1X2/buts/BTTS
-- (p1, pn, p2, po25, btts), buts attendus du modele (lambda_h/lambda_a),
-- scores simules (mc_scores), copie du pari recommande (paris_safe : marche,
-- cote, probabilite), valeur (vbet/val/hot), fiabilite detaillee, textes
-- d'analyse et buteurs probables. La fonction match-data les renvoyait aussi
-- a un visiteur anonyme.
--
-- Liste de reference : lib/premium-fields.js (PREMIUM_PAYLOAD_FIELDS). Le
-- pipeline retire ces champs des fichiers publics (sauf match offert) et les
-- ecrit ici, dans un seul objet JSON ; match-data les rend aux abonnes Pro.
--
-- Tant que cette migration n'est pas appliquee, le pipeline range le meme
-- objet dans raw_response.premium_fields (repli automatique) et match-data
-- le relit depuis la : aucun abonne ne perd de donnee pendant la transition.
alter table public.match_premium_data add column if not exists premium_fields jsonb;

comment on column public.match_premium_data.premium_fields is
  'Sorties premium du modele sans colonne dediee (probabilites, scores simules, analyse, buteurs probables). Jamais dans un fichier public, sauf match offert. Liste : lib/premium-fields.js.';
