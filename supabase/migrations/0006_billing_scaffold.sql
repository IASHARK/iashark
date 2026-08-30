-- IASHARK — Scaffold de facturation Stripe, DÉSACTIVÉ par défaut (MASTER §3.2, §23)
--
-- "Le code de facturation Stripe doit être préparé et sécurisé, mais aucun
-- vrai paiement ne doit être exécuté sans clés réelles." Ces tables et la
-- fonction Edge associée (supabase/functions/stripe-webhook/) existent pour
-- que le branchement final ne consiste qu'à renseigner les secrets Stripe
-- et basculer BILLING_MODE=stripe — AUCUNE clé Stripe n'est configurée ici,
-- AUCUN paiement réel ne peut être déclenché par ce schéma seul.
--
-- billing_customers : mapping user Supabase <-> customer Stripe (créé au
-- premier essai de checkout, pas avant).
-- subscriptions : état réel de l'abonnement, reflète Stripe (jamais
-- modifiable par le client — seul le webhook, via service role, écrit ici).
-- billing_events : journal des événements webhook Stripe reçus, avec
-- déduplication par event_id Stripe (idempotence explicite du MASTER §3.2 :
-- un même événement webhook peut être renvoyé plusieurs fois par Stripe,
-- ne doit jamais être traité deux fois).

create table if not exists billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on subscriptions (user_id);
create index if not exists subscriptions_status_idx on subscriptions (status);

create table if not exists billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb
);

alter table billing_customers enable row level security;
alter table subscriptions enable row level security;
alter table billing_events enable row level security;

-- Un utilisateur peut lire SON PROPRE mapping/abonnement (pour afficher son
-- statut dans compte.html), jamais celui d'un autre, jamais le modifier
-- (seul le webhook, via service role qui contourne RLS, écrit ici).
create policy billing_customers_select_own on billing_customers
  for select to authenticated
  using (auth.uid() = user_id);

create policy subscriptions_select_own on subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on billing_customers from anon, authenticated;
revoke insert, update, delete on subscriptions from anon, authenticated;
revoke all on billing_events from anon, authenticated;

create or replace function billing_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function billing_set_updated_at() from public, anon, authenticated;

drop trigger if exists subscriptions_updated_at on subscriptions;
create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function billing_set_updated_at();
