-- IASHARK — Offre Pro unique vendue sous 3 durees (semaine, mois, annee).
-- Decision du proprietaire du 16/09/2026.
-- NON APPLIQUEE : a appliquer AVANT le deploiement des fonctions
-- create-checkout-session, stripe-webhook, sync-subscription et
-- send-transactional-email (elles ecrivent / lisent les colonnes ci-dessous).
-- Numero 0026 : 0023 n'est pas utilise, 0024 et 0025 existent deja.
--
-- Modele :
-- - public.users.plan reste 'free' | 'pro' (contrainte users_plan_check de
--   0001 inchangee) : l'acces est IDENTIQUE quelle que soit la duree.
-- - La duree payee vit dans public.subscriptions, ecrite uniquement par les
--   fonctions stripe-webhook et sync-subscription (service role) a partir du
--   Price Stripe reel (price.recurring.interval), jamais a partir d'une valeur
--   envoyee par le navigateur.
-- - market : marche resolu cote serveur par create-checkout-session
--   (metadata Stripe "market"), utilise par les rappels de renouvellement.
--
-- Additive et idempotente : aucune donnee existante modifiee. Les lignes deja
-- presentes restent a NULL jusqu'au prochain evenement Stripe ou au prochain
-- appel de sync-subscription (ouverture de la page compte).

alter table public.subscriptions add column if not exists billing_interval text;
alter table public.subscriptions add column if not exists billing_interval_count integer;
alter table public.subscriptions add column if not exists market text;

alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_check
  check (billing_interval is null or billing_interval in ('week', 'month', 'year'));

alter table public.subscriptions drop constraint if exists subscriptions_billing_interval_count_check;
alter table public.subscriptions add constraint subscriptions_billing_interval_count_check
  check (billing_interval_count is null or billing_interval_count >= 1);

alter table public.subscriptions drop constraint if exists subscriptions_market_check;
alter table public.subscriptions add constraint subscriptions_market_check
  check (market is null or market in ('fr', 'gb', 'mx', 'za'));

-- Rappels de renouvellement (send-transactional-email, type
-- renewal_reminder_scan) : selection par marche, duree et date d'echeance.
create index if not exists subscriptions_renewal_scan_idx
  on public.subscriptions (market, billing_interval, current_period_end)
  where status in ('active', 'trialing') and cancel_at_period_end = false;

comment on column public.subscriptions.billing_interval is
  'Duree de facturation du Price Stripe (week|month|year). Ecrite par stripe-webhook / sync-subscription. Aucun effet sur les droits : users.plan reste pro pour toutes les durees (seule la tolerance d''impaye change : 1 jour pour week).';
comment on column public.subscriptions.market is
  'Marche resolu cote serveur (fr|gb|mx|za), metadata Stripe market posee par create-checkout-session.';

-- Tolerance d'impaye (0011) : 1 jour pour l'hebdomadaire (decision du
-- 16/09/2026 : 4 jours representaient plus de la moitie d'une periode de
-- 7 jours), 4 jours inchanges pour le mensuel, l'annuel et les lignes dont la
-- duree n'est pas encore synchronisee (NULL = abonnements mensuels existants).
-- Meme regle que grantsProAccess() dans stripe-webhook et sync-subscription.
create or replace function public.expire_past_due_access()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  update public.users u
     set plan = 'free'
   where u.plan = 'pro'
     and u.role is distinct from 'admin'
     and exists (
       select 1 from public.subscriptions s
        where s.user_id = u.id
          and s.status = 'past_due'
          and s.current_period_end is not null
          and s.current_period_end < now() - (case when s.billing_interval = 'week' then interval '1 day' else interval '4 days' end)
     )
     -- Jamais couper quelqu'un qui a par ailleurs un abonnement sain
     -- (re-souscription, changement de duree).
     and not exists (
       select 1 from public.subscriptions s2
        where s2.user_id = u.id
          and s2.status in ('active', 'trialing')
     );
  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.expire_past_due_access() from public, anon, authenticated;

comment on function public.expire_past_due_access() is
  'Coupe l''acces Pro des comptes en impaye Stripe depuis plus de 1 jour (abonnement hebdomadaire) ou 4 jours (mensuel, annuel). Executee chaque nuit par pg_cron (job expire-past-due-access, 0012).';

-- Lecture par l'abonne (compte.html) : la policy subscriptions_select_own de
-- 0006 couvre deja les nouvelles colonnes ; aucune ecriture client (revoke de
-- 0006 inchange).
