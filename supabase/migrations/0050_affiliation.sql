-- IASHARK — Programme de partenaires (affiliation), 03/10/2026.
--
-- NON APPLIQUEE. A appliquer apres 0049 (toutes les precedentes sont
-- supposees en place : public.users (0001), subscriptions / billing_customers
-- (0006), admin_is_admin() (0009)). Additive et idempotente : aucune donnee
-- existante modifiee, aucune table existante renommee.
--
-- Decisions de Clement : 40 % de chaque paiement encaisse (semaine, mois,
-- annee), a vie tant que le client reste abonne ; UN SEUL niveau ; pas de
-- « mois offert » ; validation de chaque affilie par Clement d'un clic.
--
-- Ce que cette migration pose :
-- 1) public.users.referred_by (affilie du compte, JAMAIS modifiable par le
--    client, et jamais change une fois pose) + referred_at + referral_source.
-- 2) public.subscriptions.trial_cut_reason / trial_cut_at : essai coupe par
--    le webhook (carte deja utilisee pour un essai ou un abonnement).
-- 3) Tables : affiliates (candidature + statut + versement), affiliate_clicks
--    (informatif), affiliate_commissions (JOURNAL : montants et liens
--    immuables, suppression interdite, statuts qui n'avancent que dans un
--    sens), affiliate_payouts, affiliate_ledger (insertion seule),
--    card_fingerprints (empreinte Stripe de la carte, jamais le numero).
-- 4) RPC affilie (sous JWT) : affiliate_apply, affiliate_me,
--    affiliate_dashboard, affiliate_attach_referral ; anon :
--    affiliate_track_click, affiliate_code_exists.
-- 5) RPC admin (admin_is_admin()) : admin_affiliates,
--    admin_affiliate_set_status, admin_affiliate_commissions,
--    admin_affiliate_mark_paid.
-- 6) Service : affiliate_mature_commissions() (30 jours -> payable),
--    trigger d'inscription (code memorise par le navigateur -> referred_by).
--
-- Ecritures des commissions : fonction Edge stripe-webhook (service role),
-- a partir des factures Stripe payees. Aucune commission n'est jamais creee
-- depuis le navigateur.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'suspended')),
  networks jsonb not null default '[]'::jsonb,
  audience integer not null default 0 check (audience >= 0),
  content_style text,
  country text,
  legal_status text check (legal_status is null or legal_status in ('individual', 'professional')),
  about text,
  accepted_terms_at timestamptz,
  terms_version text,
  reviewed_at timestamptz,
  reviewed_note text,
  stripe_account_id text,
  payout_mode text not null default 'manual' check (payout_mode in ('manual', 'connect')),
  payout_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists affiliates_code_upper_idx on public.affiliates (upper(code));
create index if not exists affiliates_status_idx on public.affiliates (status);

alter table public.users add column if not exists referred_by uuid references public.affiliates(id) on delete set null;
alter table public.users add column if not exists referred_at timestamptz;
alter table public.users add column if not exists referral_source text;
alter table public.users drop constraint if exists users_referral_source_check;
alter table public.users add constraint users_referral_source_check
  check (referral_source is null or referral_source in ('signup', 'checkout', 'manual'));
create index if not exists users_referred_by_idx on public.users (referred_by) where referred_by is not null;
comment on column public.users.referred_by is
  'Affilie (public.affiliates.id) qui a amene ce compte. Pose a l''inscription (code memorise) ou au paiement (code saisi), une seule fois, jamais modifiable par le client.';

alter table public.subscriptions add column if not exists trial_cut_reason text;
alter table public.subscriptions add column if not exists trial_cut_at timestamptz;
alter table public.subscriptions drop constraint if exists subscriptions_trial_cut_reason_check;
alter table public.subscriptions add constraint subscriptions_trial_cut_reason_check
  check (trial_cut_reason is null or trial_cut_reason in ('card_already_used'));

create table if not exists public.affiliate_clicks (
  id bigserial primary key,
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  session_hash text not null,
  dir text,
  created_at timestamptz not null default now(),
  unique (affiliate_id, day, session_hash)
);
create index if not exists affiliate_clicks_aff_day_idx on public.affiliate_clicks (affiliate_id, day desc);

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  customer_user_id uuid,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  kind text not null default 'commission' check (kind in ('commission', 'reversal')),
  parent_id uuid references public.affiliate_commissions(id) on delete restrict,
  currency text not null default 'eur',
  base_cents integer not null default 0 check (base_cents >= 0),
  rate_bp integer not null default 4000 check (rate_bp between 0 and 10000),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('pending', 'payable', 'paid', 'reversed', 'refused')),
  reason text,
  paid_at_stripe timestamptz,
  payable_at timestamptz,
  paid_at timestamptz,
  payout_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists affiliate_commissions_invoice_idx
  on public.affiliate_commissions (stripe_invoice_id) where kind = 'commission' and stripe_invoice_id is not null;
create unique index if not exists affiliate_commissions_refund_idx
  on public.affiliate_commissions (parent_id, stripe_refund_id) where kind = 'reversal' and stripe_refund_id is not null;
create index if not exists affiliate_commissions_aff_idx on public.affiliate_commissions (affiliate_id, created_at desc);
create index if not exists affiliate_commissions_status_idx on public.affiliate_commissions (status, payable_at);

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  currency text not null,
  amount_cents integer not null check (amount_cents > 0),
  mode text not null check (mode in ('connect', 'manual')),
  stripe_transfer_id text unique,
  reference text,
  period_label text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_payouts_aff_idx on public.affiliate_payouts (affiliate_id, created_at desc);

create table if not exists public.affiliate_ledger (
  id bigserial primary key,
  at timestamptz not null default now(),
  affiliate_id uuid,
  event text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists affiliate_ledger_aff_idx on public.affiliate_ledger (affiliate_id, at desc);

-- Empreinte Stripe de la carte (payment_method.card.fingerprint) : une meme
-- carte physique donne la meme empreinte quel que soit le client Stripe. On ne
-- stocke JAMAIS le numero, ni les 4 derniers chiffres, ni l'expiration.
create table if not exists public.card_fingerprints (
  id bigserial primary key,
  fingerprint text not null,
  user_id uuid references auth.users(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_method_id text,
  used_for_trial boolean not null default false,
  brand text,
  created_at timestamptz not null default now(),
  unique (fingerprint, stripe_subscription_id)
);
create index if not exists card_fingerprints_fp_idx on public.card_fingerprints (fingerprint);
create index if not exists card_fingerprints_user_idx on public.card_fingerprints (user_id);

-- ---------------------------------------------------------------------------
-- 2) RLS : l'affilie lit SA ligne et SES chiffres ; aucune ecriture directe
--    depuis le navigateur (tout passe par les RPC ci-dessous ou le service).
-- ---------------------------------------------------------------------------
alter table public.affiliates enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_ledger enable row level security;
alter table public.card_fingerprints enable row level security;

drop policy if exists affiliates_select_own on public.affiliates;
create policy affiliates_select_own on public.affiliates for select to authenticated using (auth.uid() = user_id);
drop policy if exists affiliate_commissions_select_own on public.affiliate_commissions;
create policy affiliate_commissions_select_own on public.affiliate_commissions for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
drop policy if exists affiliate_payouts_select_own on public.affiliate_payouts;
create policy affiliate_payouts_select_own on public.affiliate_payouts for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));

revoke all on public.affiliates from anon;
revoke insert, update, delete on public.affiliates from authenticated;
revoke all on public.affiliate_clicks from anon, authenticated;
revoke all on public.affiliate_commissions from anon;
revoke insert, update, delete on public.affiliate_commissions from authenticated;
revoke all on public.affiliate_payouts from anon;
revoke insert, update, delete on public.affiliate_payouts from authenticated;
revoke all on public.affiliate_ledger from anon, authenticated;
revoke all on public.card_fingerprints from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Verrous (triggers)
-- ---------------------------------------------------------------------------
-- users.referred_by : pose une fois, jamais change ensuite (meme par le
-- service : une correction se fait a la main par le developpeur, trigger
-- desactive, et se justifie dans le journal).
create or replace function public.affiliate_guard_referred_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.referred_by is not null and new.referred_by is distinct from old.referred_by then
    raise exception 'referred_by est fige une fois pose' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.affiliate_guard_referred_by() from public, anon, authenticated;
drop trigger if exists users_referred_by_guard on public.users;
create trigger users_referred_by_guard before update of referred_by on public.users
  for each row execute function public.affiliate_guard_referred_by();

-- affiliates : code fige des que l'affilie est valide (son lien circule).
create or replace function public.affiliate_guard_affiliate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' and upper(new.code) <> upper(old.code) then
    raise exception 'le code d''un affilie valide ne change plus' using errcode = '42501';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'user_id immuable' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.affiliate_guard_affiliate() from public, anon, authenticated;
drop trigger if exists affiliates_guard on public.affiliates;
create trigger affiliates_guard before update on public.affiliates
  for each row execute function public.affiliate_guard_affiliate();

-- affiliate_commissions : JOURNAL. Montants, liens Stripe, type, devise et
-- dates d'origine immuables ; suppression interdite ; statut qui n'avance que
-- dans un sens : pending -> payable -> paid ; pending/payable -> reversed ou
-- refused. refused / paid / reversed : definitifs.
create or replace function public.affiliate_guard_commission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'journal des commissions : suppression interdite' using errcode = '42501';
  end if;
  if new.affiliate_id <> old.affiliate_id or new.customer_user_id is distinct from old.customer_user_id
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.stripe_invoice_id is distinct from old.stripe_invoice_id
     or new.stripe_charge_id is distinct from old.stripe_charge_id
     or new.stripe_refund_id is distinct from old.stripe_refund_id
     or new.kind <> old.kind or new.parent_id is distinct from old.parent_id
     or new.currency <> old.currency or new.base_cents <> old.base_cents
     or new.rate_bp <> old.rate_bp or new.amount_cents <> old.amount_cents
     or new.paid_at_stripe is distinct from old.paid_at_stripe
     or new.created_at <> old.created_at then
    raise exception 'journal des commissions : montants et liens immuables' using errcode = '42501';
  end if;
  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('payable', 'reversed', 'refused'))
      or (old.status = 'payable' and new.status in ('paid', 'reversed', 'refused'))
    ) then
      raise exception 'journal des commissions : passage % -> % interdit', old.status, new.status using errcode = '42501';
    end if;
  elsif new.payout_id is distinct from old.payout_id or new.paid_at is distinct from old.paid_at then
    if old.status <> 'payable' then
      raise exception 'journal des commissions : paiement seulement d''une ligne payable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.affiliate_guard_commission() from public, anon, authenticated;
drop trigger if exists affiliate_commissions_guard on public.affiliate_commissions;
create trigger affiliate_commissions_guard before update or delete on public.affiliate_commissions
  for each row execute function public.affiliate_guard_commission();

-- affiliate_ledger : insertion seule.
create or replace function public.affiliate_guard_ledger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'journal : insertion seule' using errcode = '42501';
end;
$$;
revoke execute on function public.affiliate_guard_ledger() from public, anon, authenticated;
drop trigger if exists affiliate_ledger_guard on public.affiliate_ledger;
create trigger affiliate_ledger_guard before update or delete on public.affiliate_ledger
  for each row execute function public.affiliate_guard_ledger();
drop trigger if exists affiliate_payouts_guard on public.affiliate_payouts;
create trigger affiliate_payouts_guard before update or delete on public.affiliate_payouts
  for each row execute function public.affiliate_guard_ledger();

-- ---------------------------------------------------------------------------
-- 4) Helpers (non exposes)
-- ---------------------------------------------------------------------------
-- Meme regle que _shared/affiliation.ts#normalizeEmail : minuscules, alias
-- « +xxx » retire, points retires et domaine unifie pour gmail / googlemail.
create or replace function public.affiliate_normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text := lower(btrim(coalesce(p_email, '')));
  at_pos int := position('@' in s);
  loc text;
  dom text;
begin
  if at_pos < 2 then return s; end if;
  loc := split_part(s, '@', 1);
  dom := substr(s, at_pos + 1);
  if position('+' in loc) > 1 then loc := split_part(loc, '+', 1); end if;
  if dom = 'googlemail.com' then dom := 'gmail.com'; end if;
  if dom = 'gmail.com' then loc := replace(loc, '.', ''); end if;
  return loc || '@' || dom;
end;
$$;
revoke all on function public.affiliate_normalize_email(text) from public, anon, authenticated;

create or replace function public.affiliate_mask_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when position('@' in btrim(coalesce(p_email, ''))) < 2 then null
    else left(split_part(btrim(p_email), '@', 1),
              case when length(split_part(btrim(p_email), '@', 1)) <= 2 then 1 else 2 end)
      || '***@' || split_part(btrim(p_email), '@', 2)
  end
$$;
revoke all on function public.affiliate_mask_email(text) from public, anon, authenticated;

-- Code valide : 4 a 20 caracteres [A-Z0-9_-], bords alphanumeriques, hors
-- mots reserves (meme regle que _shared/affiliation.ts#normalizeCode).
create or replace function public.affiliate_normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c text := upper(btrim(coalesce(p_code, '')));
begin
  if c !~ '^[A-Z0-9][A-Z0-9_-]{2,18}[A-Z0-9]$' then return null; end if;
  if c in ('IASHARK', 'ADMIN', 'PRO', 'TEST', 'NULL', 'UNDEFINED', 'SHARK', 'FREE', 'GRATUIT') then return null; end if;
  return c;
end;
$$;
revoke all on function public.affiliate_normalize_code(text) from public, anon, authenticated;

create or replace function public.affiliate_log(p_affiliate uuid, p_event text, p_details jsonb)
returns void
language sql
set search_path = public
as $$
  insert into public.affiliate_ledger (affiliate_id, event, details) values (p_affiliate, p_event, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.affiliate_log(uuid, text, jsonb) from public, anon, authenticated;

-- Pose users.referred_by si (et seulement si) la colonne est vide, le code
-- est celui d'un affilie VALIDE, et ce n'est pas la meme personne (compte ou
-- e-mail normalise). Renvoie la raison, ou 'attached'.
create or replace function public.affiliate_try_attach(p_user uuid, p_code text, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := public.affiliate_normalize_code(p_code);
  a record;
  u record;
  aff_email text;
begin
  if c is null then return 'invalid_code'; end if;
  select id, user_id, status into a from public.affiliates where upper(code) = c;
  if not found then return 'unknown_code'; end if;
  if a.status <> 'approved' then return 'affiliate_not_active'; end if;
  select id, email, referred_by into u from public.users where id = p_user;
  if not found then return 'no_user'; end if;
  if u.referred_by is not null then return 'already_referred'; end if;
  if a.user_id = p_user then return 'self_account'; end if;
  select email into aff_email from public.users where id = a.user_id;
  if public.affiliate_normalize_email(aff_email) = public.affiliate_normalize_email(u.email) then return 'self_email'; end if;
  update public.users set referred_by = a.id, referred_at = now(), referral_source = p_source where id = p_user and referred_by is null;
  perform public.affiliate_log(a.id, 'referral_attached', jsonb_build_object('user_id', p_user, 'source', p_source));
  return 'attached';
end;
$$;
revoke all on function public.affiliate_try_attach(uuid, text, text) from public, anon, authenticated;

-- Inscription : le navigateur transmet le code memorise (?ref=CODE, 60 jours,
-- premier clic gagnant) dans raw_user_meta_data.referred_by. Trigger apres
-- on_auth_user_created (ordre alphabetique des triggers : la ligne
-- public.users existe deja).
create or replace function public.affiliate_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := new.raw_user_meta_data->>'referred_by';
begin
  if code is not null and btrim(code) <> '' then
    perform public.affiliate_try_attach(new.id, code, 'signup');
  end if;
  return new;
end;
$$;
revoke execute on function public.affiliate_on_signup() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_referral on auth.users;
create trigger on_auth_user_created_referral
  after insert on auth.users
  for each row execute function public.affiliate_on_signup();

-- ---------------------------------------------------------------------------
-- 5) RPC anon : clics et existence d'un code
-- ---------------------------------------------------------------------------
-- Clic sur un lien partenaire. INFORMATIF seulement (jamais paye) : un clic
-- par session et par jour, code valide obligatoire. Session hachee : rien
-- d'identifiant n'est conserve.
create or replace function public.affiliate_track_click(p_code text, p_session text, p_dir text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c text := public.affiliate_normalize_code(p_code);
  aff uuid;
begin
  if c is null or p_session is null or length(p_session) < 4 or length(p_session) > 120 then return; end if;
  select id into aff from public.affiliates where upper(code) = c and status = 'approved';
  if aff is null then return; end if;
  insert into public.affiliate_clicks (affiliate_id, session_hash, dir)
  values (aff, md5(p_session), left(coalesce(p_dir, ''), 4))
  on conflict do nothing;
end;
$$;
revoke all on function public.affiliate_track_click(text, text, text) from public;
grant execute on function public.affiliate_track_click(text, text, text) to anon, authenticated;

create or replace function public.affiliate_code_exists(p_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.affiliates where upper(code) = public.affiliate_normalize_code(p_code) and status = 'approved');
$$;
revoke all on function public.affiliate_code_exists(text) from public;
grant execute on function public.affiliate_code_exists(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC affilie (JWT)
-- ---------------------------------------------------------------------------
-- Candidature. Une par compte. Statut 'pending' impose. Renvoie
-- { ok, status, code } ou { ok:false, code:<raison>, missing:[...] }.
create or replace function public.affiliate_apply(p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing record;
  c text;
  missing text[] := '{}';
  networks jsonb;
  audience integer;
  style text;
  country text;
  lstatus text;
  new_id uuid;
begin
  if uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select id, status, code into existing from public.affiliates where user_id = uid;
  if found then
    return json_build_object('ok', false, 'code', 'already_applied', 'status', existing.status, 'affiliate_code', existing.code);
  end if;
  c := public.affiliate_normalize_code(p_payload->>'code');
  if c is null then missing := missing || 'code'; end if;
  networks := case when jsonb_typeof(p_payload->'networks') = 'array' then p_payload->'networks' else '[]'::jsonb end;
  if jsonb_array_length(networks) = 0 then missing := missing || 'networks'; end if;
  if coalesce(p_payload->>'audience', '') !~ '^[0-9]{1,9}$' then missing := missing || 'audience'; else audience := (p_payload->>'audience')::integer; end if;
  style := left(coalesce(p_payload->>'content_style', ''), 40);
  if style not in ('analysis', 'tips', 'entertainment', 'education', 'community', 'other') then missing := missing || 'content_style'; end if;
  country := upper(left(coalesce(p_payload->>'country', ''), 2));
  if country !~ '^[A-Z]{2}$' then missing := missing || 'country'; end if;
  lstatus := left(coalesce(p_payload->>'status', ''), 20);
  if lstatus not in ('individual', 'professional') then missing := missing || 'status'; end if;
  if coalesce(p_payload->>'accept_terms', '') <> 'true' then missing := missing || 'accept_terms'; end if;
  if coalesce(p_payload->>'accept_rules', '') <> 'true' then missing := missing || 'accept_rules'; end if;
  if array_length(missing, 1) > 0 then
    return json_build_object('ok', false, 'code', 'invalid', 'missing', to_json(missing));
  end if;
  if exists (select 1 from public.affiliates where upper(code) = c) then
    return json_build_object('ok', false, 'code', 'code_taken');
  end if;
  insert into public.affiliates (user_id, code, status, networks, audience, content_style, country, legal_status, about, accepted_terms_at, terms_version)
  values (uid, c, 'pending', networks, audience, style, country, lstatus, left(coalesce(p_payload->>'about', ''), 1000), now(), left(coalesce(p_payload->>'terms_version', ''), 20))
  returning id into new_id;
  perform public.affiliate_log(new_id, 'applied', jsonb_build_object('code', c, 'country', country));
  return json_build_object('ok', true, 'status', 'pending', 'affiliate_code', c);
end;
$$;
revoke all on function public.affiliate_apply(jsonb) from public, anon;
grant execute on function public.affiliate_apply(jsonb) to authenticated;

-- Ma ligne (sans les champs internes).
create or replace function public.affiliate_me()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'id', a.id, 'code', a.code, 'status', a.status, 'created_at', a.created_at, 'reviewed_at', a.reviewed_at,
    'reviewed_note', case when a.status in ('refused', 'suspended') then a.reviewed_note else null end,
    'payout_mode', a.payout_mode, 'payout_ready', a.payout_ready, 'has_stripe_account', a.stripe_account_id is not null,
    'country', a.country, 'legal_status', a.legal_status
  ) from public.affiliates a where a.user_id = auth.uid();
$$;
revoke all on function public.affiliate_me() from public, anon;
grant execute on function public.affiliate_me() to authenticated;

-- Mes chiffres : clics, inscrits, essais, abonnes payants actifs, soldes par
-- devise, historique (clients masques), versements.
create or replace function public.affiliate_dashboard()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  a record;
  out json;
begin
  select * into a from public.affiliates where user_id = auth.uid();
  if not found then return null; end if;
  select json_build_object(
    'status', a.status,
    'code', a.code,
    'clicks', json_build_object(
      'total', (select count(*) from public.affiliate_clicks c where c.affiliate_id = a.id),
      'days_30', (select count(*) from public.affiliate_clicks c where c.affiliate_id = a.id and c.day >= (now() at time zone 'utc')::date - 30)
    ),
    'signups', (select count(*) from public.users u where u.referred_by = a.id),
    'trials', (select count(distinct s.user_id) from public.subscriptions s join public.users u on u.id = s.user_id where u.referred_by = a.id and s.status = 'trialing'),
    'active_paying', (select count(distinct s.user_id) from public.subscriptions s join public.users u on u.id = s.user_id where u.referred_by = a.id and s.status in ('active', 'past_due')),
    'balances', (
      select coalesce(json_object_agg(b.currency, json_build_object('pending', b.pending, 'payable', b.payable, 'paid', b.paid, 'reversed', b.reversed)), '{}'::json)
      from (
        select currency,
          sum(case when status = 'pending' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as pending,
          sum(case when status = 'payable' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as payable,
          sum(case when status = 'paid' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as paid,
          sum(case when status = 'reversed' then amount_cents else 0 end) as reversed
        from public.affiliate_commissions where affiliate_id = a.id group by currency
      ) b
    ),
    'history', (
      select coalesce(json_agg(json_build_object(
        'at', c.created_at, 'kind', c.kind, 'status', c.status, 'amount_cents', c.amount_cents, 'currency', c.currency,
        'payable_at', c.payable_at, 'paid_at', c.paid_at, 'reason', c.reason,
        'customer', public.affiliate_mask_email(u.email)
      ) order by c.created_at desc), '[]'::json)
      from (select * from public.affiliate_commissions where affiliate_id = a.id order by created_at desc limit 200) c
      left join public.users u on u.id = c.customer_user_id
    ),
    'payouts', (
      select coalesce(json_agg(json_build_object('at', p.created_at, 'amount_cents', p.amount_cents, 'currency', p.currency, 'mode', p.mode, 'reference', coalesce(p.stripe_transfer_id, p.reference), 'period', p.period_label) order by p.created_at desc), '[]'::json)
      from public.affiliate_payouts p where p.affiliate_id = a.id
    ),
    'threshold_cents', 5000,
    'hold_days', 30,
    'rate_bp', 4000
  ) into out;
  return out;
end;
$$;
revoke all on function public.affiliate_dashboard() from public, anon;
grant execute on function public.affiliate_dashboard() to authenticated;

-- Code saisi apres coup (page partenaires d'un filleul, ou page de paiement) :
-- ne pose referred_by que s'il est vide. Jamais de changement.
create or replace function public.affiliate_attach_referral(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  r := public.affiliate_try_attach(auth.uid(), p_code, 'checkout');
  return json_build_object('ok', r = 'attached', 'reason', r);
end;
$$;
revoke all on function public.affiliate_attach_referral(text) from public, anon;
grant execute on function public.affiliate_attach_referral(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Service : maturite (30 jours) des commissions
-- ---------------------------------------------------------------------------
-- pending -> payable quand payable_at est passe ET que l'affilie est valide.
-- Un affilie suspendu garde ses lignes en attente (il ne gagne plus).
create or replace function public.affiliate_mature_commissions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with moved as (
    update public.affiliate_commissions c
    set status = 'payable'
    from public.affiliates a
    where c.affiliate_id = a.id and a.status = 'approved' and c.status = 'pending' and c.payable_at is not null and c.payable_at <= now()
    returning c.id
  )
  select count(*) into n from moved;
  return n;
end;
$$;
revoke all on function public.affiliate_mature_commissions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) RPC admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_affiliates()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.admin_is_admin() then raise exception 'access_denied' using errcode = '42501'; end if;
  return (
    select json_build_object(
      'generated_at', now(),
      'affiliates', coalesce(json_agg(json_build_object(
        'id', a.id, 'code', a.code, 'status', a.status, 'email', u.email, 'created_at', a.created_at, 'reviewed_at', a.reviewed_at,
        'reviewed_note', a.reviewed_note, 'networks', a.networks, 'audience', a.audience, 'content_style', a.content_style,
        'country', a.country, 'legal_status', a.legal_status, 'about', a.about, 'accepted_terms_at', a.accepted_terms_at,
        'payout_mode', a.payout_mode, 'payout_ready', a.payout_ready, 'has_stripe_account', a.stripe_account_id is not null,
        'clicks', (select count(*) from public.affiliate_clicks c where c.affiliate_id = a.id),
        'signups', (select count(*) from public.users x where x.referred_by = a.id),
        'active_paying', (select count(distinct s.user_id) from public.subscriptions s join public.users x on x.id = s.user_id where x.referred_by = a.id and s.status in ('active', 'past_due')),
        'balances', (
          select coalesce(json_object_agg(b.currency, json_build_object('pending', b.pending, 'payable', b.payable, 'paid', b.paid)), '{}'::json)
          from (
            select currency,
              sum(case when status = 'pending' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as pending,
              sum(case when status = 'payable' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as payable,
              sum(case when status = 'paid' then (case when kind = 'reversal' then -1 else 1 end) * amount_cents else 0 end) as paid
            from public.affiliate_commissions where affiliate_id = a.id group by currency
          ) b
        )
      ) order by (a.status = 'pending') desc, a.created_at desc), '[]'::json)
    )
    from public.affiliates a left join public.users u on u.id = a.user_id
  );
end;
$$;
revoke all on function public.admin_affiliates() from public, anon;
grant execute on function public.admin_affiliates() to authenticated;

-- Valider / refuser / suspendre (et revalider). Refus ou suspension : les
-- commissions en attente ou payables passent 'refused' (journal, rien n'est
-- efface), l'affilie ne gagne plus.
create or replace function public.admin_affiliate_set_status(p_id uuid, p_status text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if not public.admin_is_admin() then raise exception 'access_denied' using errcode = '42501'; end if;
  if p_status not in ('approved', 'refused', 'suspended', 'pending') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.affiliates set status = p_status, reviewed_at = now(), reviewed_note = left(coalesce(p_note, ''), 500) where id = p_id;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if p_status in ('refused', 'suspended') then
    with moved as (
      update public.affiliate_commissions set status = 'refused', reason = 'affiliate_' || p_status
      where affiliate_id = p_id and status in ('pending', 'payable') returning id
    ) select count(*) into n from moved;
  end if;
  perform public.affiliate_log(p_id, 'status_' || p_status, jsonb_build_object('by', auth.uid(), 'note', left(coalesce(p_note, ''), 500), 'commissions_refused', n));
  return json_build_object('ok', true, 'status', p_status, 'commissions_refused', n);
end;
$$;
revoke all on function public.admin_affiliate_set_status(uuid, text, text) from public, anon;
grant execute on function public.admin_affiliate_set_status(uuid, text, text) to authenticated;

-- Commissions : lignes d'un mois (YYYY-MM, heure de Paris ; null = mois en
-- cours) + ce qui est a payer maintenant (payable, par affilie et devise,
-- avec le seuil de 50) + versements du mois.
-- (volatile : elle fait d'abord murir les commissions de plus de 30 jours.)
create or replace function public.admin_affiliate_commissions(p_month text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  m text := coalesce(nullif(p_month, ''), to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'));
  d_from timestamptz;
  d_to timestamptz;
begin
  if not public.admin_is_admin() then raise exception 'access_denied' using errcode = '42501'; end if;
  if m !~ '^\d{4}-\d{2}$' then raise exception 'invalid_month' using errcode = '22023'; end if;
  d_from := (m || '-01')::timestamp at time zone 'Europe/Paris';
  d_to := ((m || '-01')::date + interval '1 month') at time zone 'Europe/Paris';
  perform public.affiliate_mature_commissions();
  return json_build_object(
    'month', m,
    'lines', (
      select coalesce(json_agg(json_build_object(
        'id', c.id, 'at', c.created_at, 'affiliate_code', a.code, 'affiliate_email', ua.email, 'customer_email', public.affiliate_mask_email(uc.email),
        'kind', c.kind, 'status', c.status, 'reason', c.reason, 'currency', c.currency, 'base_cents', c.base_cents, 'amount_cents', c.amount_cents,
        'stripe_invoice_id', c.stripe_invoice_id, 'stripe_subscription_id', c.stripe_subscription_id, 'payable_at', c.payable_at, 'paid_at', c.paid_at
      ) order by c.created_at desc), '[]'::json)
      from public.affiliate_commissions c
      join public.affiliates a on a.id = c.affiliate_id
      left join public.users ua on ua.id = a.user_id
      left join public.users uc on uc.id = c.customer_user_id
      where c.created_at >= d_from and c.created_at < d_to
    ),
    'due', (
      select coalesce(json_agg(json_build_object(
        'affiliate_id', t.affiliate_id, 'affiliate_code', t.code, 'affiliate_email', t.email, 'currency', t.currency, 'amount_cents', t.amount,
        'lines', t.n, 'above_threshold', t.amount >= 5000, 'payout_mode', t.payout_mode, 'payout_ready', t.payout_ready
      ) order by t.amount desc), '[]'::json)
      from (
        select c.affiliate_id, a.code, u.email, a.payout_mode, a.payout_ready, c.currency,
          sum((case when c.kind = 'reversal' then -1 else 1 end) * c.amount_cents) as amount, count(*) as n
        from public.affiliate_commissions c
        join public.affiliates a on a.id = c.affiliate_id
        left join public.users u on u.id = a.user_id
        where c.status = 'payable' and a.status = 'approved'
        group by c.affiliate_id, a.code, u.email, a.payout_mode, a.payout_ready, c.currency
      ) t
    ),
    'payouts', (
      select coalesce(json_agg(json_build_object('at', p.created_at, 'affiliate_code', a.code, 'amount_cents', p.amount_cents, 'currency', p.currency, 'mode', p.mode, 'reference', coalesce(p.stripe_transfer_id, p.reference)) order by p.created_at desc), '[]'::json)
      from public.affiliate_payouts p join public.affiliates a on a.id = p.affiliate_id
      where p.created_at >= d_from and p.created_at < d_to
    )
  );
end;
$$;
revoke all on function public.admin_affiliate_commissions(text) from public, anon;
grant execute on function public.admin_affiliate_commissions(text) to authenticated;

-- Versement MANUEL (Connect pas encore active, ou affilie sans compte de
-- versement) : Clement a fait le virement lui-meme, il le marque paye.
-- Toutes les lignes payables de l'affilie dans cette devise passent 'paid'.
create or replace function public.admin_affiliate_mark_paid(p_affiliate_id uuid, p_currency text, p_reference text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  pid uuid;
  cur text := lower(coalesce(p_currency, 'eur'));
begin
  if not public.admin_is_admin() then raise exception 'access_denied' using errcode = '42501'; end if;
  perform public.affiliate_mature_commissions();
  select coalesce(sum((case when kind = 'reversal' then -1 else 1 end) * amount_cents), 0) into total
  from public.affiliate_commissions where affiliate_id = p_affiliate_id and status = 'payable' and currency = cur;
  if total <= 0 then return json_build_object('ok', false, 'code', 'nothing_payable', 'amount_cents', total); end if;
  insert into public.affiliate_payouts (affiliate_id, currency, amount_cents, mode, reference, period_label, created_by)
  values (p_affiliate_id, cur, total, 'manual', left(coalesce(p_reference, ''), 200), to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'), auth.uid())
  returning id into pid;
  update public.affiliate_commissions set status = 'paid', paid_at = now(), payout_id = pid
  where affiliate_id = p_affiliate_id and status = 'payable' and currency = cur;
  perform public.affiliate_log(p_affiliate_id, 'payout_manual', jsonb_build_object('payout_id', pid, 'amount_cents', total, 'currency', cur, 'by', auth.uid()));
  return json_build_object('ok', true, 'payout_id', pid, 'amount_cents', total, 'currency', cur);
end;
$$;
revoke all on function public.admin_affiliate_mark_paid(uuid, text, text) from public, anon;
grant execute on function public.admin_affiliate_mark_paid(uuid, text, text) to authenticated;
