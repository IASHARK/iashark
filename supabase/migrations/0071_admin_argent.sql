-- 0071 (07/11/2026) : ecran Argent refait, une seule source pour l'argent.
-- Clement : « l'argent 61 c'est pas a jour », « c'est en deux fois ». L'ancien bloc comptait les essais et son propre
-- abonnement de test comme du revenu. admin_abonnements renvoie maintenant aussi :
--   encaisse : argent vraiment recu (paiements Stripe, comptes admin et de test retires), par devise :
--              total, mois en cours (Paris), 30 jours, aujourd'hui ;
--   par_mois : argent recu mois par mois ;
--   en_cours : prix de chaque abonnement (montant_cents, devise), trie par prochaine echeance.
create or replace function public.admin_abonnements(p_jours integer default 90)
returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    with subs as (
      select s.*, u.email from public.subscriptions s join public.users u on u.id = s.user_id
      where not public.admin_internal_account(u.email, u.role)
    ),
    ev as (
      select * from public.admin_evenements_stripe(now() - make_interval(days => greatest(1, least(coalesce(p_jours, 90), 400))))
      where not coalesce(interne, false)
    ),
    paye as (
      select uid, sum(montant_cents) filter (where quoi in ('premier_paiement', 'paiement')) as total_cents
      from public.admin_evenements_stripe('2000-01-01'::timestamptz) where not coalesce(interne, false) group by uid
    ),
    prix as (
      select s.stripe_subscription_id as sid,
        (select (e.payload->'data'->'object'->'items'->'data'->0->'price'->>'unit_amount')::int from public.billing_events e
          where e.event_type like 'customer.subscription.%' and e.payload->'data'->'object'->>'id' = s.stripe_subscription_id
          order by e.processed_at desc limit 1) as montant_cents,
        (select upper(e.payload->'data'->'object'->'items'->'data'->0->'price'->>'currency') from public.billing_events e
          where e.event_type like 'customer.subscription.%' and e.payload->'data'->'object'->>'id' = s.stripe_subscription_id
          order by e.processed_at desc limit 1) as devise
      from subs s
    ),
    recu as (
      select at, devise, montant_cents from public.admin_evenements_stripe('2000-01-01'::timestamptz)
      where not coalesce(interne, false) and quoi in ('premier_paiement', 'paiement') and coalesce(montant_cents, 0) > 0
    ),
    bornes as (
      select (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') as jour0,
             (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') as mois0
    )
    select json_build_object(
      'generated_at', now(),
      'encaisse', coalesce((select json_agg(json_build_object(
          'devise', r.devise,
          'total_cents', r.total, 'mois_cents', r.mois, 'jours30_cents', r.j30, 'aujourdhui_cents', r.auj, 'paiements', r.n
        ) order by r.total desc) from (
          select devise, sum(montant_cents) total, count(*) n,
            coalesce(sum(montant_cents) filter (where at >= (select mois0 from bornes)), 0) mois,
            coalesce(sum(montant_cents) filter (where at >= now() - interval '30 days'), 0) j30,
            coalesce(sum(montant_cents) filter (where at >= (select jour0 from bornes)), 0) auj
          from recu group by devise) r), '[]'::json),
      'par_mois', coalesce((select json_agg(json_build_object('mois', m.mois, 'devise', m.devise, 'cents', m.cents) order by m.mois, m.devise) from (
          select to_char(at at time zone 'Europe/Paris', 'YYYY-MM') mois, devise, sum(montant_cents) cents from recu group by 1, 2) m), '[]'::json),
      'etat', json_build_object(
        'payants', (select count(*) from subs where status = 'active' and not coalesce(cancel_at_period_end, false)),
        'payants_qui_arretent', (select count(*) from subs where status = 'active' and coalesce(cancel_at_period_end, false)),
        'essais', (select count(*) from subs where status = 'trialing' and not coalesce(cancel_at_period_end, false)),
        'essais_qui_arretent', (select count(*) from subs where status = 'trialing' and coalesce(cancel_at_period_end, false)),
        'en_retard', (select count(*) from subs where status in ('past_due', 'unpaid')),
        'partis', (select count(*) from subs where status in ('canceled', 'incomplete_expired'))
      ),
      'en_cours', coalesce((select json_agg(json_build_object(
          'uid', s.user_id, 'email', s.email, 'email_masked', public.admin_mask_email(s.email),
          'statut', s.status, 'arret_prevu', coalesce(s.cancel_at_period_end, false), 'fin_periode', s.current_period_end,
          'debut', s.created_at, 'retard_depuis', s.past_due_since, 'rythme', s.billing_interval,
          'paye_cents', coalesce(p.total_cents, 0), 'montant_cents', px.montant_cents, 'devise', coalesce(px.devise, 'EUR')
        ) order by s.current_period_end nulls last)
        from subs s left join paye p on p.uid = s.user_id left join prix px on px.sid = s.stripe_subscription_id
        where s.status in ('active', 'trialing', 'past_due', 'unpaid')), '[]'::json),
      'evenements', coalesce((select json_agg(json_build_object(
          'at', e.at, 'quoi', e.quoi, 'uid', e.uid, 'email', e.email, 'email_masked', public.admin_mask_email(e.email),
          'montant_cents', e.montant_cents, 'devise', e.devise, 'essai', e.essai, 'debut', e.debut_abonnement,
          'raison', e.raison, 'commentaire', e.motif, 'paye_cents', coalesce(p.total_cents, 0)
        ) order by e.at desc)
        from ev e left join paye p on p.uid = e.uid), '[]'::json)
    )
  );
end;
$$;
revoke all on function public.admin_abonnements(integer) from public, anon;
grant execute on function public.admin_abonnements(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- admin_business (ecran Aujourd'hui) : l'argent encaisse ne compte plus les paiements des comptes admin et de test,
-- et on separe ceux qui paient (paying) de ceux qui sont en essai (trialing).
create or replace function public.admin_business(
  p_days integer default 7,
  p_from date default null,
  p_to date default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return (
    with base as (
      select (now() at time zone 'Europe/Paris')::date as today,
        greatest(1, least(coalesce(p_days, 7), 395)) as days
    ),
    bounds as (
      select
        case when p_from is null then b.today - (b.days - 1)
             else least(p_from, coalesce(p_to, p_from), b.today) end as from_d,
        least(case when p_from is null then b.today
                   else greatest(p_from, coalesce(p_to, p_from)) end, b.today) as to_d
      from base b
    ),
    params as (
      select bo.from_d, bo.to_d,
        bo.from_d::timestamp at time zone 'Europe/Paris' as cur_start,
        least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') as cur_end,
        (bo.from_d - (bo.to_d - bo.from_d + 1))::timestamp at time zone 'Europe/Paris' as prev_start,
        ((least(now(), (bo.to_d + 1)::timestamp at time zone 'Europe/Paris') at time zone 'Europe/Paris')
          - make_interval(days => (bo.to_d - bo.from_d + 1))) at time zone 'Europe/Paris' as prev_end
      from bounds bo
    ),
    new_users as (
      select u.id, u.plan, u.created_at, s.locale, fp.source_group
      from public.users u
      cross join params p
      left join lateral (
        select e.session_id, e.locale from public.funnel_events e
        where e.user_id = u.id and e.event_type = 'signup_completed'
        order by e.created_at limit 1
      ) s on true
      left join lateral (
        select public.admin_source_group(f.metadata->>'utm_source', f.metadata->>'ref', f.metadata->>'browser') as source_group
        from public.funnel_events f
        where s.session_id is not null and f.session_id = s.session_id and f.event_type = 'page_view'
        order by f.created_at, f.id limit 1
      ) fp on true
      where not public.admin_internal_account(u.email, u.role)
        and u.created_at >= p.cur_start and u.created_at <= p.cur_end
    ),
    ext_users as (
      select u.id, u.plan, u.created_at from public.users u
      where not public.admin_internal_account(u.email, u.role)
    ),
    ext_subs as (
      select s.* from public.subscriptions s
      where not exists (select 1 from public.users u
        where u.id = s.user_id and public.admin_internal_account(u.email, u.role))
    ),
    pay as (
      select be.event_type, be.processed_at,
        be.payload->'data'->'object' as obj
      from public.billing_events be, params p
      where be.processed_at >= p.cur_start and be.processed_at <= p.cur_end
        and jsonb_typeof(be.payload->'data'->'object') = 'object'
        -- 0071 : paiements des comptes admin et de test retires (comme partout ailleurs).
        and not exists (select 1 from public.billing_customers bc join public.users u on u.id = bc.user_id
          where bc.stripe_customer_id = be.payload->'data'->'object'->>'customer' and public.admin_internal_account(u.email, u.role))
    ),
    first_payments as (
      select lower(left(obj->>'currency', 8)) as currency,
        count(*) as payments,
        sum(case when obj->>'amount_total' ~ '^[0-9]{1,12}$' then (obj->>'amount_total')::bigint else 0 end) as amount_cents
      from pay
      where event_type = 'checkout.session.completed'
        and coalesce(obj->>'payment_status', 'paid') = 'paid'
        and obj->>'amount_total' ~ '^[0-9]{1,12}$' and (obj->>'amount_total')::bigint > 0 -- 0071 : un essai a 0 n'est pas un paiement
      group by 1
    ),
    renewals as (
      select lower(left(r.currency, 8)) as currency, count(*) as payments, sum(r.amount) as amount_cents
      from (
        select distinct on (obj->>'id') obj->>'currency' as currency,
          case when obj->>'amount_paid' ~ '^[0-9]{1,12}$' then (obj->>'amount_paid')::bigint else 0 end as amount
        from pay
        where event_type in ('invoice.paid', 'invoice.payment_succeeded')
          and obj->>'billing_reason' = 'subscription_cycle'
          and obj->>'id' is not null
        order by obj->>'id', processed_at
      ) r
      group by 1
    )
    select json_build_object(
      'range', (select json_build_object('from', p.from_d, 'to', p.to_d, 'cur_start', p.cur_start, 'cur_end', p.cur_end) from params p),
      'users', json_build_object(
        'total', (select count(*) from ext_users),
        'free', (select count(*) from ext_users where plan = 'free'),
        'pro', (select count(*) from ext_users where plan = 'pro'),
        'admins', (select count(*) from public.users where role = 'admin'),
        'internal', (select count(*) from public.users u where public.admin_internal_account(u.email, u.role))
      ),
      'accounts_created', (select count(*) from new_users),
      'accounts_created_prev', (select count(*) from ext_users u, params p
        where u.created_at >= p.prev_start and u.created_at <= p.prev_end),
      'subscriptions', json_build_object(
        'active', (select count(*) from ext_subs where status in ('active', 'trialing')),
        'paying', (select count(*) from ext_subs where status = 'active'),
        'trialing', (select count(*) from ext_subs where status = 'trialing'),
        'past_due', (select count(*) from ext_subs where status = 'past_due'),
        'cancel_pending', (select count(*) from ext_subs where status in ('active', 'trialing') and cancel_at_period_end),
        'new_in_period', (select count(*) from ext_subs s, params p where s.created_at >= p.cur_start and s.created_at <= p.cur_end),
        'new_prev_period', (select count(*) from ext_subs s, params p where s.created_at >= p.prev_start and s.created_at <= p.prev_end),
        'ended_in_period', (select count(*) from ext_subs s, params p
          where s.status in ('canceled', 'unpaid', 'incomplete_expired') and s.updated_at >= p.cur_start and s.updated_at <= p.cur_end)
      ),
      'first_payments', (select coalesce(json_agg(t order by t.amount_cents desc), '[]'::json) from first_payments t),
      'renewals', (select coalesce(json_agg(t order by t.amount_cents desc), '[]'::json) from renewals t),
      'signups_by_site', (select coalesce(json_agg(t order by t.signups desc), '[]'::json)
        from (select locale as site, count(*) as signups from new_users group by 1) t),
      'signups_by_source', (select coalesce(json_agg(t order by t.signups desc), '[]'::json)
        from (select source_group, count(*) as signups from new_users group by 1) t),
      'generated_at', now()
    )
  );
end;
$$;
