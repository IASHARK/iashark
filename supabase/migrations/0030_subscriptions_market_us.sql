-- IASHARK - marche "us" (offre USD de la version /en/, decision du
-- proprietaire du 19/09/2026 : 19,99 USD par mois).
-- NON APPLIQUEE : a coller dans le SQL Editor APRES 0026 et AVANT le
-- deploiement de stripe-webhook / sync-subscription contenant "us" dans
-- BILLING_MARKETS (sinon un abonnement USD echouerait sur la contrainte
-- subscriptions_market_check et l'acces Pro ne serait pas ouvert).
-- Ne pas rejouer 0026 apres celle-ci (0026 recree la contrainte sans "us").
--
-- Additive et idempotente : la colonne est creee si besoin (sans effet si 0026
-- est deja appliquee), la contrainte est recreee avec la liste des cles de
-- marche de config/markets.json (fr, gb, mx, za, us). Aucune donnee modifiee,
-- aucun droit change, users.plan intact.

alter table public.subscriptions add column if not exists market text;

alter table public.subscriptions drop constraint if exists subscriptions_market_check;
alter table public.subscriptions add constraint subscriptions_market_check
  check (market is null or market in ('fr', 'gb', 'mx', 'za', 'us'));

comment on column public.subscriptions.market is
  'Marche resolu cote serveur (fr|gb|mx|za|us), metadata Stripe market posee par create-checkout-session. us = offre USD de /en/.';
