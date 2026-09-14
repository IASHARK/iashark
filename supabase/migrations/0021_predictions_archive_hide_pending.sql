-- IASHARK - predictions_archive : plus aucun pari a venir lisible par anon
-- (audit fuite de donnees du 14/09/2026).
--
-- La policy predictions_archive_select_public (migration 0005) autorisait
-- anon et authenticated a lire TOUTES les lignes. Or le pipeline archive
-- chaque prediction des sa publication (result = 'scheduled') avec le pari
-- (prediction), sa cote et la probabilite du modele. La cle anon etant
-- publique (app-client.js), n'importe qui pouvait lire les paris du jour de
-- tous les matchs payants via /rest/v1/predictions_archive.
--
-- Nouvelle regle : seules les predictions reglees (win, loss, void, neutral,
-- no_signal) restent lisibles cote client. Les predictions en attente ne sont
-- lisibles que par le service role (pipeline). Aucune page du site ne lit
-- cette table aujourd'hui (verifie le 14/09/2026).
drop policy if exists predictions_archive_select_public on public.predictions_archive;

create policy predictions_archive_select_settled on public.predictions_archive
  for select
  to anon, authenticated
  using (result not in ('scheduled', 'pending'));
