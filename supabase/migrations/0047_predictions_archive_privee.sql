-- IASHARK - 0047 : l'archive des paris n'est plus lisible avec la cle publique
-- (audit V3 du 02/10/2026, point I6 ; decision de Clement : pas d'historique public).
--
-- Avant : la regle predictions_archive_select_settled (0021) laissait anon et
-- authenticated lire tous les paris REGLES, et predictions_archive_corrections
-- (0035) etait lisible par tous. Avec la cle anon (publique, app-client.js),
-- n'importe qui pouvait reconstituer un historique et un taux de reussite par
-- /rest/v1/predictions_archive ou par GraphQL (avertissement Supabase
-- « pg_graphql_anon_table_exposed »).
--
-- Apres : lecture reservee au service role (pipeline update-data.yml, scripts
-- serveur, fonctions Edge avec SUPABASE_SERVICE_ROLE_KEY), qui contourne RLS.
-- Aucune page du site ne lit ces tables (verifie le 02/10/2026 : seuls
-- update-data.yml, lib/match-results.js et lib/pick-freeze.js les lisent, cote
-- serveur, avec la cle service). Les declencheurs de 0035 (verrou au coup
-- d'envoi, journal des corrections) tournent a l'ecriture du service role et
-- ne dependent pas de ces droits.
--
-- A APPLIQUER APRES 0035 (la table predictions_archive_corrections vient de 0035).
-- Idempotente. Retour arriere : voir le bas du fichier.

begin;

-- 1. predictions_archive : plus aucune regle de lecture pour anon / authenticated.
drop policy if exists predictions_archive_select_public on public.predictions_archive;
drop policy if exists predictions_archive_select_settled on public.predictions_archive;
alter table public.predictions_archive enable row level security;
revoke select on public.predictions_archive from anon, authenticated;
revoke insert, update, delete on public.predictions_archive from anon, authenticated;

-- 2. Journal des corrections (0035) : meme regle, service role seulement.
do $$
begin
  if to_regclass('public.predictions_archive_corrections') is not null then
    execute 'drop policy if exists predictions_archive_corrections_lecture on public.predictions_archive_corrections';
    execute 'alter table public.predictions_archive_corrections enable row level security';
    execute 'revoke select, insert, update, delete on public.predictions_archive_corrections from anon, authenticated';
  end if;
end $$;

-- 3. Le service role garde tous ses droits (il contourne RLS, on le rend explicite).
grant select, insert, update on public.predictions_archive to service_role;
do $$
begin
  if to_regclass('public.predictions_archive_corrections') is not null then
    execute 'grant select, insert on public.predictions_archive_corrections to service_role';
  end if;
end $$;

commit;

-- Verification (lecture seule, apres application) : doit renvoyer 0 ligne.
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('predictions_archive', 'predictions_archive_corrections')
--      and grantee in ('anon', 'authenticated');
--
-- Retour arriere (seulement si une page publique en a besoin, avec l'accord
-- de historique-public) : recreer la regle de 0021
--   grant select on public.predictions_archive to anon, authenticated;
--   create policy predictions_archive_select_settled on public.predictions_archive
--     for select to anon, authenticated using (result not in ('scheduled', 'pending'));
