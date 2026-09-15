-- IASHARK — Emails de relance (cycle de vie) : consentement, journal des
-- envois, selection des destinataires, statistiques admin.
--
-- STATUT : MIGRATION NON APPLIQUEE (preparee le 15/09/2026). A appliquer par le
-- proprietaire au moment d'activer Resend (voir supabase/functions/
-- send-lifecycle-emails/index.ts). Aucune donnee n'est ecrite par ce fichier.
--
-- Principes (RGPD/CNIL, UK PECR, MX LFPDPPP, ZA POPIA) :
-- - consentement explicite, jamais pre-coche : marketing_opt_in vaut FALSE par
--   defaut, et un compte SANS ligne ici (tous les comptes existants) est traite
--   comme NON consentant : il ne recoit que des emails transactionnels ;
-- - preuve du consentement : date (posee par le serveur, jamais par le client),
--   source (inscription / Mon compte) et version du texte accepte ;
-- - retrait aussi simple que l'accord : interrupteur dans Mon compte, lien de
--   desinscription en 1 clic (fonction Edge email-unsubscribe, jeton signe) ;
-- - aucun acces anon ; l'utilisateur lit/modifie SA preference ; seul le role
--   service ecrit les envois.
--
-- Les colonnes notify_match_analysis / notify_weekly_recap de
-- public.user_preferences (0010) valent TRUE par defaut : elles ne constituent
-- PAS un consentement et ne declenchent aucun envoi a elles seules.
-- notify_weekly_recap = false sert seulement de refus supplementaire du resume
-- hebdomadaire Pro.

-- ---------------------------------------------------------------------------
-- 1. Preferences email
-- ---------------------------------------------------------------------------
create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  marketing_opt_in boolean not null default false,
  opt_in_at timestamptz,
  opt_in_source text check (opt_in_source in ('signup', 'account')),
  opt_in_text_version text check (opt_in_text_version is null or opt_in_text_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  unsubscribed_at timestamptz,
  unsubscribe_source text check (unsubscribe_source in ('account', 'link', 'one_click', 'complaint', 'support')),
  -- Langue du dictionnaire et repertoire du site (= version du site : fr, en,
  -- es, de, it, pt, gb, za, mx ; config/markets.json#_dirs).
  locale text not null default 'fr' check (locale in ('fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt')),
  market text not null default 'fr' check (market in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_preferences_opt_in_idx on public.email_preferences (marketing_opt_in) where marketing_opt_in;

-- Horodatages poses par le serveur : le client ne peut ni antidater un
-- consentement ni effacer la trace d'un retrait.
create or replace function public.email_preferences_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.opt_in_at := case when new.marketing_opt_in then now() else null end;
    new.unsubscribed_at := null;
    if not new.marketing_opt_in then
      new.opt_in_source := null;
      new.opt_in_text_version := null;
    end if;
    new.unsubscribe_source := null;
    new.created_at := now();
  elsif new.marketing_opt_in is distinct from old.marketing_opt_in then
    if new.marketing_opt_in then
      new.opt_in_at := now();
      new.unsubscribed_at := null;
      new.unsubscribe_source := null;
    else
      new.opt_in_at := old.opt_in_at;
      new.unsubscribed_at := now();
      new.unsubscribe_source := coalesce(new.unsubscribe_source, 'account');
      new.opt_in_source := old.opt_in_source;
      new.opt_in_text_version := old.opt_in_text_version;
    end if;
  else
    new.opt_in_at := old.opt_in_at;
    new.unsubscribed_at := old.unsubscribed_at;
    new.unsubscribe_source := old.unsubscribe_source;
    new.opt_in_source := old.opt_in_source;
    new.opt_in_text_version := old.opt_in_text_version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.email_preferences_stamp() from public, anon, authenticated;

drop trigger if exists email_preferences_stamp on public.email_preferences;
create trigger email_preferences_stamp
  before insert or update on public.email_preferences
  for each row execute function public.email_preferences_stamp();

alter table public.email_preferences enable row level security;

drop policy if exists email_preferences_select_own on public.email_preferences;
drop policy if exists email_preferences_insert_own on public.email_preferences;
drop policy if exists email_preferences_update_own on public.email_preferences;

create policy email_preferences_select_own on public.email_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy email_preferences_insert_own on public.email_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy email_preferences_update_own on public.email_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Aucun acces anon. authenticated : lecture de sa ligne et colonnes choisies
-- par l'utilisateur uniquement (jamais les horodatages).
revoke all on public.email_preferences from anon, authenticated;
grant select on public.email_preferences to authenticated;
grant insert (user_id, marketing_opt_in, opt_in_source, opt_in_text_version, locale, market) on public.email_preferences to authenticated;
-- user_id figure dans le grant d'update uniquement parce qu'un upsert
-- supabase-js reecrit toutes les colonnes envoyees ; la policy ci-dessus
-- interdit de le changer pour un autre compte.
grant update (user_id, marketing_opt_in, opt_in_source, opt_in_text_version, locale, market) on public.email_preferences to authenticated;

-- Ligne creee a l'inscription depuis les metadonnees posees par la case a
-- cocher de inscription.html (auth-pages.js, options.data de signUp). Absente
-- ou autre valeur que "true" = pas de consentement. Declencheur distinct de
-- handle_new_user (0001), qu'il ne modifie pas.
create or replace function public.handle_new_user_email_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_opt boolean := coalesce(meta->>'iashark_marketing_opt_in', '') = 'true';
  v_locale text := meta->>'iashark_locale';
  v_market text := meta->>'iashark_market';
  v_version text := meta->>'iashark_marketing_text_version';
begin
  if v_locale is null or v_locale not in ('fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt') then v_locale := 'fr'; end if;
  if v_market is null or v_market not in ('fr', 'en', 'es', 'de', 'it', 'pt', 'gb', 'za', 'mx') then v_market := 'fr'; end if;
  if v_version is null or v_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v_version := null; end if;
  insert into public.email_preferences (user_id, marketing_opt_in, opt_in_source, opt_in_text_version, locale, market)
  values (new.id, v_opt, case when v_opt then 'signup' else null end, case when v_opt then v_version else null end, v_locale, v_market)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user_email_preferences() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_email_preferences on auth.users;
create trigger on_auth_user_created_email_preferences
  after insert on auth.users
  for each row execute function public.handle_new_user_email_preferences();

-- ---------------------------------------------------------------------------
-- 2. Journal des envois (jamais deux fois le meme email)
-- ---------------------------------------------------------------------------
create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign text not null check (campaign in ('welcome', 'free_match', 'pro_features', 'inactive_7d', 'inactive_30d', 'pro_weekly_summary')),
  -- '' pour un email unique ; date de derniere activite pour une relance
  -- d'inactivite (un nouvel episode = une nouvelle cle) ; semaine ISO locale
  -- (2026-W38) pour le resume hebdomadaire.
  campaign_key text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'bounced', 'complained')),
  attempts integer not null default 1,
  market text,
  sent_at timestamptz not null default now(),
  message_id text,
  error text,
  opened_at timestamptz,
  clicked_at timestamptz,
  unique (user_id, campaign, campaign_key)
);

create index if not exists email_sends_user_idx on public.email_sends (user_id, sent_at desc);
create index if not exists email_sends_campaign_idx on public.email_sends (campaign, sent_at desc);
create index if not exists email_sends_message_idx on public.email_sends (message_id) where message_id is not null;

alter table public.email_sends enable row level security;
-- Aucune policy : ni anon ni authenticated n'y accedent ; le role service
-- (fonctions Edge) contourne RLS.
revoke all on public.email_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Selection des destinataires (miroir de lib/lifecycle-email.js
--    decideCampaign ; tests/email-lifecycle-migration.test.js verifie les
--    regles cles). Fuseau = celui du marche de la version du site.
-- ---------------------------------------------------------------------------
create or replace function public.lifecycle_email_candidates(p_now timestamptz default now(), p_limit integer default 200)
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
revoke all on function public.lifecycle_email_candidates(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.lifecycle_email_candidates(timestamptz, integer) to service_role;

-- Reservation atomique AVANT l'appel a Resend : une seconde execution
-- concurrente du cron ne peut pas reserver le meme (user, campagne, cle).
-- Un envoi en echec est retente au plus 3 fois.
create or replace function public.email_reserve_send(p_user_id uuid, p_campaign text, p_campaign_key text, p_market text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.email_sends (user_id, campaign, campaign_key, market, status, attempts, sent_at)
  values (p_user_id, p_campaign, coalesce(p_campaign_key, ''), p_market, 'pending', 1, now())
  on conflict (user_id, campaign, campaign_key) do update
    set status = 'pending', attempts = public.email_sends.attempts + 1, sent_at = now(), error = null
    where public.email_sends.status = 'failed' and public.email_sends.attempts < 3
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.email_reserve_send(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.email_reserve_send(uuid, text, text, text) to service_role;

create or replace function public.email_complete_send(p_id bigint, p_status text, p_message_id text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.email_sends
     set status = p_status, message_id = coalesce(p_message_id, message_id), error = left(p_error, 200), sent_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.email_complete_send(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.email_complete_send(bigint, text, text, text) to service_role;

-- Desinscription par lien signe (fonction Edge email-unsubscribe, qui a deja
-- verifie la signature du jeton). Idempotente.
create or replace function public.email_unsubscribe(p_user_id uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opt boolean;
begin
  if p_source not in ('link', 'one_click', 'complaint', 'support') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    return 'no_account';
  end if;
  select marketing_opt_in into v_opt from public.email_preferences where user_id = p_user_id;
  if not found then
    insert into public.email_preferences (user_id, marketing_opt_in) values (p_user_id, false);
    return 'already_unsubscribed';
  end if;
  if not v_opt then
    return 'already_unsubscribed';
  end if;
  update public.email_preferences set marketing_opt_in = false, unsubscribe_source = p_source where user_id = p_user_id;
  return 'unsubscribed';
end;
$$;
revoke all on function public.email_unsubscribe(uuid, text) from public, anon, authenticated;
grant execute on function public.email_unsubscribe(uuid, text) to service_role;

-- Evenements Resend (webhook a brancher plus tard : email.opened,
-- email.clicked, email.bounced, email.complained). Une plainte ou un rebond
-- arrete tout envoi de relance a cette adresse ; une plainte retire aussi le
-- consentement.
create or replace function public.email_record_event(p_message_id text, p_event text, p_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if p_event not in ('opened', 'clicked', 'bounced', 'complained') then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  update public.email_sends
     set opened_at = case when p_event = 'opened' then coalesce(opened_at, p_at) else opened_at end,
         clicked_at = case when p_event = 'clicked' then coalesce(clicked_at, p_at) else clicked_at end,
         status = case when p_event in ('bounced', 'complained') then p_event else status end
   where message_id = p_message_id
   returning user_id into v_user;
  if v_user is null then
    return false;
  end if;
  if p_event = 'complained' then
    update public.email_preferences set marketing_opt_in = false, unsubscribe_source = 'complaint'
     where user_id = v_user and marketing_opt_in;
  end if;
  return true;
end;
$$;
revoke all on function public.email_record_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.email_record_event(text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Tableau de bord (admin, LECTURE SEULE, agregats uniquement : aucun email)
-- ---------------------------------------------------------------------------
create or replace function public.admin_email_stats(p_days integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 400));
  v_since timestamptz := now() - make_interval(days => v_days);
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  return json_build_object(
    'period_days', v_days,
    'generated_at', now(),
    'consent', json_build_object(
      'accounts_total', (select count(*) from public.users),
      'opted_in', (select count(*) from public.email_preferences where marketing_opt_in),
      'opted_in_signup', (select count(*) from public.email_preferences where marketing_opt_in and opt_in_source = 'signup'),
      'opted_in_account', (select count(*) from public.email_preferences where marketing_opt_in and opt_in_source = 'account'),
      'no_preference_row', (select count(*) from public.users u where not exists (select 1 from public.email_preferences e where e.user_id = u.id)),
      'new_opt_ins_period', (select count(*) from public.email_preferences where marketing_opt_in and opt_in_at >= v_since)
    ),
    'unsubscribes_period', (
      select coalesce(json_object_agg(src, cnt), '{}'::json)
      from (select coalesce(unsubscribe_source, 'unknown') as src, count(*) as cnt
            from public.email_preferences where unsubscribed_at >= v_since group by 1) t
    ),
    'opted_in_by_market', (
      select coalesce(json_object_agg(market, cnt), '{}'::json)
      from (select market, count(*) as cnt from public.email_preferences where marketing_opt_in group by market) t
    ),
    'campaigns', (
      select coalesce(json_agg(c order by c.campaign), '[]'::json)
      from (
        select campaign,
          count(*) filter (where status in ('sent', 'bounced', 'complained')) as sent,
          count(*) filter (where status = 'pending') as pending,
          count(*) filter (where status = 'failed') as failed,
          count(*) filter (where opened_at is not null) as opened,
          count(*) filter (where clicked_at is not null) as clicked,
          count(*) filter (where status = 'bounced') as bounced,
          count(*) filter (where status = 'complained') as complained
        from public.email_sends
        where sent_at >= v_since
        group by campaign
      ) c
    ),
    'sends_by_day', (
      select coalesce(json_agg(d order by d.day), '[]'::json)
      from (
        select to_char(date_trunc('day', sent_at), 'YYYY-MM-DD') as day, count(*) filter (where status <> 'failed') as sent, count(*) filter (where status = 'failed') as failed
        from public.email_sends where sent_at >= v_since group by 1
      ) d
    ),
    'tracking_note', 'opened/clicked restent a 0 tant que le webhook Resend n''appelle pas public.email_record_event.'
  );
end;
$$;
revoke all on function public.admin_email_stats(integer) from public, anon;
grant execute on function public.admin_email_stats(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Planification proposee (NON appliquee : a decommenter apres avoir
--    configure Resend, les secrets et le secret interne dans Vault).
-- ---------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select vault.create_secret('<EMAIL_INTERNAL_SECRET>', 'email_internal_secret');
-- select cron.unschedule('send-lifecycle-emails')
--  where exists (select 1 from cron.job where jobname = 'send-lifecycle-emails');
-- select cron.schedule(
--   'send-lifecycle-emails',
--   '11 * * * *',
--   $$select net.http_post(
--       url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/send-lifecycle-emails',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
--       ),
--       body := '{}'::jsonb,
--       timeout_milliseconds := 60000
--     )$$
-- );
