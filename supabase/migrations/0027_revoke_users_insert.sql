-- 0027 - Plus aucun INSERT client sur public.users (audit securite du 18/09/2026).
--
-- Constat : 0001_users_table.sql accordait INSERT (toutes colonnes) au role
-- authenticated, et la politique users_insert_own (0007) l'autorisait pour
-- id = auth.uid(). Un compte SANS ligne public.users (cas prevu par
-- stripe-webhook, qui la recree au besoin) pouvait donc s'inserer lui-meme
-- avec plan = 'pro' et role = 'admin'. Aucun compte n'etait dans ce cas au
-- 18/09/2026 (verifie : 0 compte auth.users sans ligne public.users).
--
-- Aucun code client n'insere dans public.users : la ligne est creee par le
-- trigger on_auth_user_created -> public.handle_new_user() (security definer,
-- n'a pas besoin de ce droit), et les fonctions Edge utilisent la cle
-- service_role. Retirer le droit ne change donc rien au fonctionnement.
--
-- Retour arriere (si jamais necessaire) :
--   grant insert on public.users to authenticated;

revoke insert on public.users from authenticated;
revoke insert on public.users from anon;
