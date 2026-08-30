-- IASHARK — Corrections suite audit Supabase Advisors (QA finale, item 12)
--
-- 1) Perf (auth_rls_initplan) : `auth.uid()` dans une policy RLS est
--    ré-évalué à CHAQUE ligne. Le remplacer par `(select auth.uid())`
--    permet au planner de l'évaluer une seule fois par requête.
--    https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
--
-- 2) Sécurité (pg_graphql_anon_table_exposed) : `billing_customers` et
--    `subscriptions` ne doivent jamais être visibles par le rôle `anon`,
--    même si la policy RLS bloque déjà les lignes (defense in depth —
--    ces tables ne doivent pas apparaître dans le schema GraphQL public).
--    `predictions_archive` reste volontairement lisible par `anon` : ce
--    sont des données publiques (déjà affichées sans compte sur
--    historique.html), donc pas de changement pour cette table.

-- users
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users for select using ((select auth.uid()) = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users for insert with check ((select auth.uid()) = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- billing_customers
drop policy if exists billing_customers_select_own on billing_customers;
create policy billing_customers_select_own on billing_customers
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke select on billing_customers from anon;

-- subscriptions
drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke select on subscriptions from anon;
