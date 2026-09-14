-- IASHARK — Journal des e-mails transactionnels (confirmation d'achat sur
-- support durable, rappel de renouvellement Mexique, echec de paiement).
-- Ecrit par supabase/functions/_shared/email/ (appele par stripe-webhook) avec
-- la cle service_role. Voir EMAILS.md.
--
-- - idempotency_key UNIQUE : un re-essai Stripe ou deux evenements pour le
--   meme achat (checkout.session.completed + invoice.paid) ne produisent
--   jamais deux e-mails. La meme cle est transmise a Resend (Idempotency-Key).
-- - status : pending (reserve, envoi en cours) | sent | skipped
--   (EMAIL_PROVIDER=disabled : ce qui aurait ete envoye est journalise) |
--   failed (erreur, re-tentee au prochain evenement portant la meme cle) |
--   missing (signale par la verification quotidienne ci-dessous).
-- - render_data : variables exactes utilisees pour le rendu (preuve du contenu
--   de la confirmation, re-rendu possible). Contient l'adresse e-mail du client :
--   duree de conservation a valider par le juriste (EMAILS.md).
-- - RLS active SANS aucune policy + revoke : seul service_role (qui contourne
--   RLS) lit et ecrit. Aucun acces anon/authenticated.
--
-- NE PAS appliquer sans validation du lead (aucune DDL appliquee par l'agent).

create table if not exists public.transactional_emails (
  id bigint generated always as identity primary key,
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 256),
  kind text not null check (kind in ('purchase_confirmation', 'renewal_reminder_mx', 'payment_failed')),
  status text not null check (status in ('pending', 'sent', 'skipped', 'failed', 'missing')),
  provider text not null default 'disabled' check (provider in ('resend', 'disabled', 'none')),
  attempts integer not null default 0 check (attempts >= 0),
  user_id uuid references auth.users(id) on delete set null,
  stripe_event_id text,
  stripe_event_type text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  market text,
  regime text check (regime is null or regime in ('eu', 'uk', 'za', 'mx')),
  locale text,
  to_email text,
  subject text,
  template_version text,
  render_data jsonb,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactional_emails_status_idx on public.transactional_emails (status, updated_at);
create index if not exists transactional_emails_subscription_idx on public.transactional_emails (stripe_subscription_id);
create index if not exists transactional_emails_user_idx on public.transactional_emails (user_id);

alter table public.transactional_emails enable row level security;

revoke all on public.transactional_emails from public, anon, authenticated;
grant select, insert, update, delete on public.transactional_emails to service_role;
grant usage, select on sequence public.transactional_emails_id_seq to service_role;

-- updated_at sert aussi de jeton de concurrence optimiste (reprise d'un envoi
-- echoue par un seul appel). Fonction existante (migration 0006).
drop trigger if exists transactional_emails_updated_at on public.transactional_emails;
create trigger transactional_emails_updated_at
  before update on public.transactional_emails
  for each row execute function billing_set_updated_at();

comment on table public.transactional_emails is
  'Journal idempotent des e-mails transactionnels (stripe-webhook -> _shared/email). service_role uniquement.';

-- ---------------------------------------------------------------------------
-- Filet Mexique (LFPC art. 76 Bis, DOF 12/12/2025) : avis au moins 5 jours
-- naturels avant chaque renouvellement automatique.
--
-- L'envoi reel ne peut PAS partir de Postgres sans y stocker un secret (cle
-- Resend ou service_role pour appeler une fonction Edge) : cette tache ne
-- fait donc que DETECTER. Chaque jour, elle insere une ligne status='missing'
-- pour tout abonnement MX actif qui se renouvelle dans la fenetre sans rappel
-- journalise. La cle est identique a celle du webhook
-- ("renewal_reminder_mx:<abonnement>:<AAAA-MM-JJ>") : si invoice.upcoming
-- arrive ensuite, le webhook reprend la ligne et envoie. Sinon, la ligne
-- reste visible pour le suivi (EMAILS.md : requete de controle).
--
-- Marche : public.subscriptions n'a pas de colonne market ; il est lu dans les
-- metadata des evenements Stripe deja journalises (billing_events, 0006).
-- Fenetre par defaut 6 jours : avec un reglage Stripe "Evenements de
-- renouvellement a venir" >= 7 jours, l'evenement est normalement deja traite.
create or replace function public.flag_missing_mx_renewal_reminders(p_window interval default interval '6 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  flagged integer;
begin
  insert into public.transactional_emails (idempotency_key, kind, status, provider, attempts, user_id, stripe_subscription_id, market, last_error)
  select
    'renewal_reminder_mx:' || s.stripe_subscription_id || ':' || to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD'),
    'renewal_reminder_mx',
    'missing',
    'none',
    0,
    s.user_id,
    s.stripe_subscription_id,
    'mx',
    'no invoice.upcoming reminder logged ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') ||
      ' for renewal ' || to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')
  from public.subscriptions s
  where s.status in ('active', 'trialing')
    and s.cancel_at_period_end = false
    and s.current_period_end > now()
    and s.current_period_end <= now() + p_window
    and exists (
      select 1 from public.billing_events e
       where lower(e.payload -> 'data' -> 'object' -> 'metadata' ->> 'market') = 'mx'
         and (e.payload -> 'data' -> 'object' ->> 'id' = s.stripe_subscription_id
              or e.payload -> 'data' -> 'object' ->> 'subscription' = s.stripe_subscription_id)
    )
  on conflict (idempotency_key) do nothing;
  get diagnostics flagged = row_count;
  return flagged;
end;
$$;

revoke all on function public.flag_missing_mx_renewal_reminders(interval) from public, anon, authenticated;

comment on function public.flag_missing_mx_renewal_reminders(interval) is
  'Signale (status=missing) les rappels MX de renouvellement non journalises. Detection seule, aucun envoi. Job pg_cron flag-missing-mx-renewal-reminders.';

create extension if not exists pg_cron;

select cron.unschedule('flag-missing-mx-renewal-reminders')
 where exists (select 1 from cron.job where jobname = 'flag-missing-mx-renewal-reminders');

select cron.schedule(
  'flag-missing-mx-renewal-reminders',
  '17 6 * * *',
  $$select public.flag_missing_mx_renewal_reminders()$$
);
