-- IASHARK — 0055 : suite courte d'e-mails des comptes gratuits (27/10/2026).
--
-- STATUT : MIGRATION NON APPLIQUEE. Rien ne change en ligne tant qu'elle n'est pas
-- appliquee ET que la suite n'est pas demandee (variable du depot EMAILS_SUITE_ACTIVE).
--
-- Contenu :
-- 1. nouvelle campagne « results_recap » (bilan d'hier, gagnes ET perdus, depuis
--    public.predictions_archive, + l'offre d'essai) dans la contrainte de email_sends ;
-- 2. lifecycle_email_candidates recoit p_sequence (faux par defaut = regles d'avant,
--    identiques a 0024). Vrai : J+1 match offert, J+3 bilan d'hier, J+6 offre Pro.
--    La frequence maximale (1 e-mail marketing tous les 3 jours, promise par la case
--    d'inscription, version 2026-09-15) reste la regle : en pratique J+1, J+4, J+7.
--    Consentement obligatoire (marketing_opt_in), jamais la nuit, jamais a un abonne.
--    Miroir EXACT de lib/lifecycle-email.js#decideCampaign(..., { sequence: true }),
--    verifie par tests/email-suite-gratuite.test.js.
--
-- Ordre d'activation (a faire par Clement, rien n'est fait par ce fichier) :
--   a. appliquer cette migration ;
--   b. essai a blanc : Actions > E-mails cycle de vie > mode essai, case « suite » cochee ;
--   c. gh variable set EMAILS_SUITE_ACTIVE --body true --repo IASHARK/iashark
-- Couper : gh variable set EMAILS_SUITE_ACTIVE --body false --repo IASHARK/iashark

alter table public.email_sends drop constraint if exists email_sends_campaign_check;
alter table public.email_sends add constraint email_sends_campaign_check
  check (campaign = any (array['welcome','free_match','pro_features','inactive_7d','inactive_30d','pro_weekly_summary','relance','results_recap']));

-- Ancienne signature (2 arguments) retiree : sinon un appel a 2 arguments serait ambigu.
drop function if exists public.lifecycle_email_candidates(timestamptz, integer);

create or replace function public.lifecycle_email_candidates(p_now timestamptz default now(), p_limit integer default 200, p_sequence boolean default false)
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
        when f.last_marketing_sent_at is not null and p_now - f.last_marketing_sent_at < interval '3 days' then null
        when p_now - f.last_engagement_at > interval '60 days' then null
        when f.no_sales then
          case when f.notify_weekly_recap and f.local_dow in (4, 5, 6)
                 and not (('pro_weekly_summary:' || f.iso_week) = any (f.sent_keys)) then 'pro_weekly_summary' end
        -- Suite courte des comptes gratuits (p_sequence, lib/lifecycle-email.js RULES.sequence).
        when p_sequence and p_now - f.created_at >= interval '1 days' and p_now - f.created_at < interval '3 days'
             and not ('free_match:' = any (f.sent_keys)) then 'free_match'
        when p_sequence and p_now - f.created_at >= interval '3 days' and p_now - f.created_at < interval '8 days'
             and not ('results_recap:' = any (f.sent_keys)) then 'results_recap'
        when p_sequence and p_now - f.created_at >= interval '6 days' and p_now - f.created_at < interval '12 days'
             and not ('pro_features:' = any (f.sent_keys)) then 'pro_features'
        -- Regles d'avant (suite non demandee) : J2 match offert, J5 Pro.
        when not p_sequence and p_now - f.created_at >= interval '2 days' and p_now - f.created_at < interval '14 days'
             and not ('free_match:' = any (f.sent_keys)) then 'free_match'
        when not p_sequence and p_now - f.created_at >= interval '5 days' and p_now - f.created_at < interval '21 days'
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
    d.has_subscription, d.suppressed, d.created_at, d.last_sign_in_at, d.last_funnel_at, d.last_activity_at,
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
revoke all on function public.lifecycle_email_candidates(timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.lifecycle_email_candidates(timestamptz, integer, boolean) to service_role;
