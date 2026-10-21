-- IASHARK — 0055 : relances qui font payer (21/10/2026).
-- Nouvelle campagne checkout_abandoned (paiement commence, aucun abonnement 1 a
-- 3 jours plus tard) dans la selection des destinataires des e-mails automatiques
-- (fonction send-lifecycle-emails, envoi par Brevo).
-- La fin d'essai (trial_ending) n'a besoin d'aucune table nouvelle : la fonction
-- trial-reminder lit public.subscriptions (statut trialing) et note l'envoi dans
-- subscriptions.trial_reminder_sent_at (colonne deja en base).
--
-- STATUT : ECRITE, PAS APPLIQUEE. A appliquer a la mise en route, apres l'accord
-- de Clement (voir le plan en bas de ce fichier). Sans elle, la fonction ne
-- propose jamais checkout_abandoned (la base ne la choisit pas) : rien ne casse.
--
-- « Paiement commence » = l'un de ces evenements de public.funnel_events pour le
-- compte (user_id) :
-- - checkout_started (prevu dans la liste fermee, aucune page ne l'emet encore) ;
-- - clic sur un bouton de paiement actif (event_type click, metadata.kind =
--   checkout, ready different de false : funnel-track.js, meme regle que le
--   tableau de bord admin, migration 0022) ;
-- - visite de la page checkout-annule (page_view ou checkout_cancel_view).
-- Regles (miroir EXACT de lib/lifecycle-email.js decideCampaign,
-- tests/email-relances-paiement.test.js) : consentement marketing obligatoire,
-- jamais la nuit (heure du marche), aucun abonnement actif, en essai ou impaye,
-- ni Pro ni admin, de 1 a 3 jours apres le DERNIER paiement commence, au moins
-- 1 jour apres le dernier e-mail marketing, une seule fois par compte. Prioritaire
-- sur les autres relances (la frequence normale d'un e-mail tous les 3 jours la
-- ferait souvent rater).

-- ---------------------------------------------------------------------------
-- 1. Journal des envois : checkout_abandoned rejoint la liste fermee (0054 : relance).
-- ---------------------------------------------------------------------------
alter table public.email_sends drop constraint if exists email_sends_campaign_check;
alter table public.email_sends add constraint email_sends_campaign_check
  check (campaign = any (array['welcome','free_match','pro_features','checkout_abandoned','inactive_7d','inactive_30d','pro_weekly_summary','relance']));

-- ---------------------------------------------------------------------------
-- 2. Selection des destinataires : + last_checkout_at et la regle checkout_abandoned.
--    Type de retour change : la fonction est recreee (memes droits que 0024).
-- ---------------------------------------------------------------------------
drop function if exists public.lifecycle_email_candidates(timestamptz, integer);
create function public.lifecycle_email_candidates(p_now timestamptz default now(), p_limit integer default 200)
returns table (
  user_id uuid,
  email text,
  plan text,
  role text,
  market text,
  locale text,
  marketing_opt_in boolean,
  notify_weekly_recap boolean,
  has_subscription boolean,
  suppressed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_funnel_at timestamptz,
  last_checkout_at timestamptz,
  last_activity_at timestamptz,
  last_engagement_at timestamptz,
  last_marketing_sent_at timestamptz,
  sent_keys text[],
  campaign text,
  campaign_key text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      u.id as user_id, u.email, u.plan, u.role,
      coalesce(ep.market, 'fr') as market,
      coalesce(ep.locale, 'fr') as locale,
      (coalesce(ep.marketing_opt_in, false) and ep.unsubscribed_at is null) as marketing_opt_in,
      coalesce(up.notify_weekly_recap, true) as notify_weekly_recap,
      exists (select 1 from public.subscriptions s where s.user_id = u.id and s.status in ('active', 'trialing', 'past_due')) as has_subscription,
      exists (select 1 from public.email_sends x where x.user_id = u.id and x.status in ('bounced', 'complained')) as suppressed,
      u.created_at,
      au.last_sign_in_at,
      (select max(f.created_at) from public.funnel_events f where f.user_id = u.id) as last_funnel_at,
      (select max(f.created_at) from public.funnel_events f
        where f.user_id = u.id
          and (f.event_type = 'checkout_started'
            or (f.event_type = 'click' and f.metadata->>'kind' = 'checkout' and coalesce(f.metadata->>'ready', 'true') <> 'false')
            or (f.event_type in ('page_view', 'checkout_cancel_view') and f.page ~ '/checkout-annule(\.html)?$'))) as last_checkout_at,
      (select max(greatest(x.opened_at, x.clicked_at)) from public.email_sends x where x.user_id = u.id) as last_email_engagement_at,
      (select max(x.sent_at) from public.email_sends x where x.user_id = u.id and x.campaign <> 'welcome' and x.status in ('pending', 'sent')) as last_marketing_sent_at,
      coalesce((select array_agg(x.campaign || ':' || x.campaign_key order by x.id) from public.email_sends x where x.user_id = u.id and x.status <> 'failed'), '{}'::text[]) as sent_keys
    from public.users u
    join auth.users au on au.id = u.id
    left join public.email_preferences ep on ep.user_id = u.id
    left join public.user_preferences up on up.user_id = u.id
    where u.email is not null
  ),
  facts as (
    select b.*,
      greatest(b.created_at, coalesce(b.last_sign_in_at, b.created_at), coalesce(b.last_funnel_at, b.created_at)) as last_activity_at,
      (p_now at time zone case b.market
        when 'gb' then 'Europe/London'
        when 'za' then 'Africa/Johannesburg'
        when 'mx' then 'America/Mexico_City'
        else 'Europe/Paris' end) as local_ts
    from base b
  ),
  facts2 as (
    select f.*,
      greatest(f.last_activity_at, coalesce(f.last_email_engagement_at, f.last_activity_at)) as last_engagement_at,
      extract(hour from f.local_ts)::int as local_hour,
      extract(isodow from f.local_ts)::int as local_dow,
      to_char(f.local_ts, 'IYYY-"W"IW') as iso_week,
      to_char(f.last_activity_at at time zone 'UTC', 'YYYY-MM-DD') as episode,
      (f.plan = 'pro' or f.has_subscription or f.role = 'admin') as no_sales
    from facts f
  ),
  decided as (
    select f.*,
      case
        when f.suppressed then null
        when p_now - f.created_at <= interval '3 days' and not ('welcome:' = any (f.sent_keys)) then 'welcome'
        -- Au-dela : emails marketing, consentement obligatoire.
        when not f.marketing_opt_in then null
        when f.local_hour < 9 or f.local_hour >= 21 then null
        -- Paiement commence sans abonnement (prioritaire, 1 jour au moins apres le dernier e-mail marketing).
        when not f.no_sales and f.last_checkout_at is not null
             and p_now - f.last_checkout_at >= interval '1 days' and p_now - f.last_checkout_at < interval '3 days'
             and (f.last_marketing_sent_at is null or p_now - f.last_marketing_sent_at >= interval '1 days')
             and not ('checkout_abandoned:' = any (f.sent_keys)) then 'checkout_abandoned'
        when f.last_marketing_sent_at is not null and p_now - f.last_marketing_sent_at < interval '3 days' then null
        when p_now - f.last_engagement_at > interval '60 days' then null
        when f.no_sales then
          case when f.notify_weekly_recap and f.local_dow in (4, 5, 6)
                 and not (('pro_weekly_summary:' || f.iso_week) = any (f.sent_keys)) then 'pro_weekly_summary' end
        when p_now - f.created_at >= interval '2 days' and p_now - f.created_at < interval '14 days'
             and not ('free_match:' = any (f.sent_keys)) then 'free_match'
        when p_now - f.created_at >= interval '5 days' and p_now - f.created_at < interval '21 days'
             and not ('pro_features:' = any (f.sent_keys)) then 'pro_features'
        when p_now - f.last_activity_at >= interval '30 days' and p_now - f.last_activity_at < interval '60 days'
             and not (('inactive_30d:' || f.episode) = any (f.sent_keys)) then 'inactive_30d'
        when p_now - f.last_activity_at >= interval '7 days' and p_now - f.last_activity_at < interval '30 days'
             and f.local_dow in (4, 5, 6)
             and not (('inactive_7d:' || f.episode) = any (f.sent_keys)) then 'inactive_7d'
      end as campaign
    from facts2 f
  )
  select d.user_id, d.email, d.plan, d.role, d.market, d.locale, d.marketing_opt_in, d.notify_weekly_recap,
    d.has_subscription, d.suppressed, d.created_at, d.last_sign_in_at, d.last_funnel_at, d.last_checkout_at, d.last_activity_at,
    d.last_engagement_at, d.last_marketing_sent_at, d.sent_keys, d.campaign,
    case d.campaign
      when 'inactive_7d' then d.episode
      when 'inactive_30d' then d.episode
      when 'pro_weekly_summary' then d.iso_week
      else '' end as campaign_key
  from decided d
  where d.campaign is not null
  order by d.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.lifecycle_email_candidates(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.lifecycle_email_candidates(timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Mise en route (NON appliquee : etape suivante, apres l'accord de Clement).
--    a) secrets des fonctions : LIFECYCLE_SENDING_ENABLED = true (sans lui,
--       send-lifecycle-emails et trial-reminder n'envoient rien aux clients),
--       COMPANY_OPERATOR_NAME et COMPANY_ADDRESS (identite de l'expediteur),
--       EMAIL_INTERNAL_SECRET (aussi dans Vault sous le nom email_internal_secret) ;
--    b) appliquer CETTE migration ;
--    c) taches horaires, TOUJOURS avec l'en-tete x-region: us-east-2 (Brevo
--       n'accepte que les adresses IP de cette region) :
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'send-lifecycle-emails',
--   '11 * * * *',
--   $$select net.http_post(
--       url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/send-lifecycle-emails',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-region', 'us-east-2',
--         'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
--       ),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 60000
--     )$$
-- );
-- select cron.schedule(
--   'trial-reminder',
--   '17 * * * *',
--   $$select net.http_post(
--       url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/trial-reminder',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-region', 'us-east-2',
--         'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
--       ),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 60000
--     )$$
-- );
