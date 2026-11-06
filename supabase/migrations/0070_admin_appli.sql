-- Admin en appli (07/11/2026, demande de Clement : « une appli admin de monstre », « ultra clair quand quelqu'un se
-- desabonne », notifications, reseaux). Tout est en lecture admin seulement (admin_is_admin), jamais anon.
-- Comptes admin et de test (admin_internal_account) toujours retires.
--  1. admin_abonnements()   : etat des abonnes + tout ce qui s'est passe (essais, paiements, arrets, departs, raisons) ;
--  2. admin_personne(uuid)  : la fiche complete d'un inscrit ;
--  3. reseaux_abonnes       : abonnes Telegram / X / TikTok jour par jour, admin_reseaux() ;
--  4. alertes sur le telephone : admin_push (telephones abonnes), admin_alertes (file + historique), declencheurs
--     sur billing_events / users / telegram_contacts. Un declencheur ne fait JAMAIS echouer l'ecriture d'origine
--     (paiement Stripe, inscription) : toute erreur est avalee.

-- ---------------------------------------------------------------------------------------------------------------
-- Libelles des raisons de depart donnees chez Stripe.
create or replace function public.admin_raison_depart(p_code text)
returns text language sql immutable set search_path = public as $$
  select case p_code
    when 'too_expensive' then 'Trop cher'
    when 'missing_features' then 'Il manque des choses'
    when 'switched_service' then 'Parti ailleurs'
    when 'unused' then 'Ne s''en sert pas'
    when 'customer_service' then 'Service client'
    when 'too_complex' then 'Trop compliqué'
    when 'low_quality' then 'Pas assez bon'
    when 'other' then 'Autre raison'
    else null end
$$;

-- Evenements Stripe lisibles, une ligne par evenement utile (sert a l'ecran Argent, a la fiche et aux alertes).
create or replace function public.admin_evenements_stripe(p_depuis timestamptz)
returns table (
  event_id text, at timestamptz, quoi text, uid uuid, email text, interne boolean, sub_id text,
  montant_cents integer, devise text, essai boolean, debut_abonnement timestamptz, raison text, motif text
)
language sql stable security definer set search_path = public as $$
  with ev as (
    select e.stripe_event_id as eid_, coalesce(to_timestamp((e.payload->>'created')::bigint), e.processed_at) as at_,
      e.event_type, e.payload->'data'->'object' as o, e.payload->'data'->'previous_attributes' as prev
    from public.billing_events e
    where e.processed_at >= p_depuis
  ),
  cl as (
    select ev.*,
      case
        when ev.event_type = 'customer.subscription.created' then case when ev.o->>'status' = 'trialing' then 'essai' else 'nouveau' end
        when ev.event_type = 'invoice.paid' and coalesce((ev.o->>'amount_paid')::int, 0) > 0
          then case when ev.o->>'billing_reason' = 'subscription_create' then 'premier_paiement' else 'paiement' end
        when ev.event_type = 'invoice.payment_failed' then 'paiement_rate'
        when ev.event_type = 'customer.subscription.updated' and ev.prev ? 'cancel_at_period_end'
          and coalesce((ev.o->>'cancel_at_period_end')::boolean, false) and not coalesce((ev.prev->>'cancel_at_period_end')::boolean, false) then 'arret_demande'
        when ev.event_type = 'customer.subscription.updated' and ev.prev ? 'cancel_at_period_end'
          and not coalesce((ev.o->>'cancel_at_period_end')::boolean, false) and coalesce((ev.prev->>'cancel_at_period_end')::boolean, false) then 'reprise'
        when ev.event_type = 'customer.subscription.deleted' then 'parti'
      end as quoi_,
      case when ev.event_type like 'invoice.%'
        then coalesce(ev.o->>'subscription', ev.o->'parent'->'subscription_details'->>'subscription', ev.o->'lines'->'data'->0->'parent'->'subscription_item_details'->>'subscription')
        else ev.o->>'id' end as sub_
    from ev
  )
  select cl.eid_, cl.at_, cl.quoi_, u.id, u.email, public.admin_internal_account(u.email, u.role), cl.sub_,
    case when cl.event_type like 'invoice.%' then coalesce(nullif((cl.o->>'amount_paid')::int, 0), (cl.o->>'amount_due')::int)
         else (cl.o->'items'->'data'->0->'price'->>'unit_amount')::int end,
    upper(coalesce(cl.o->>'currency', cl.o->'items'->'data'->0->'price'->>'currency', 'eur')),
    case when cl.event_type like 'customer.subscription.%' then cl.o->>'status' = 'trialing'
         or (cl.event_type = 'customer.subscription.deleted' and coalesce((cl.o->>'trial_end')::bigint, 0) >= coalesce((cl.o->>'canceled_at')::bigint, (cl.o->>'ended_at')::bigint, 0)) end,
    case when cl.o ? 'start_date' then to_timestamp((cl.o->>'start_date')::bigint) end,
    public.admin_raison_depart(coalesce(cl.o->'cancellation_details'->>'feedback', (
      select e2.payload->'data'->'object'->'cancellation_details'->>'feedback' from public.billing_events e2
      where e2.event_type like 'customer.subscription.%' and e2.payload->'data'->'object'->>'id' = cl.sub_
        and e2.payload->'data'->'object'->'cancellation_details'->>'feedback' is not null
      order by e2.processed_at desc limit 1))),
    nullif(btrim(coalesce(cl.o->'cancellation_details'->>'comment', '')), '')
  from cl
  left join public.billing_customers bc on bc.stripe_customer_id = cl.o->>'customer'
  left join public.users u on u.id = bc.user_id
  where cl.quoi_ is not null
$$;
revoke all on function public.admin_evenements_stripe(timestamptz) from public, anon, authenticated;

-- 1. Abonnements : etat du moment + evenements.
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
    )
    select json_build_object(
      'generated_at', now(),
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
          'paye_cents', coalesce(p.total_cents, 0)
        ) order by s.created_at desc)
        from subs s left join paye p on p.uid = s.user_id
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
-- 2. Fiche d'un inscrit.
create or replace function public.admin_personne(p_user uuid)
returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    with u as (
      select pu.id, pu.email, pu.plan, pu.role, pu.created_at, pu.referral_source, pu.referred_by,
        au.last_sign_in_at, au.raw_user_meta_data->>'tracking_opt_out' as opt_out
      from public.users pu left join auth.users au on au.id = pu.id where pu.id = p_user
    ),
    fe as (
      select e.* from public.funnel_events e where e.user_id = p_user
    ),
    sess as (
      select e.session_id from public.funnel_events e where e.user_id = p_user and e.session_id is not null group by e.session_id
    ),
    toutes as (
      select e.* from public.funnel_events e where e.session_id in (select session_id from sess)
    )
    select json_build_object(
      'user', (select json_build_object('id', id, 'email', email, 'email_masked', public.admin_mask_email(email), 'plan', plan,
        'inscrit_le', created_at, 'derniere_connexion', last_sign_in_at, 'source_parrainage', referral_source,
        'parrain', (select public.admin_mask_email(p.email) from public.users p where p.id = u.referred_by),
        'refuse_suivi', coalesce(opt_out, '') = 'true', 'interne', public.admin_internal_account(email, role)) from u),
      'telegram', (select json_build_object('pseudo', c.pseudo, 'sans', c.sans_telegram, 'langue', c.langue, 'marche', c.marche,
        'langue_tel', c.langue_navigateur, 'le', c.updated_at) from public.telegram_contacts c where c.user_id = p_user),
      'robot_telegram', (select json_build_object('lie', t.chat_id is not null, 'le', t.lie_at, 'bloque', t.bloque)
        from public.telegram_abonnes t where t.user_id = p_user),
      'abonnements', coalesce((select json_agg(json_build_object('statut', s.status, 'arret_prevu', s.cancel_at_period_end,
        'debut', s.created_at, 'fin_periode', s.current_period_end, 'rythme', s.billing_interval, 'retard_depuis', s.past_due_since)
        order by s.created_at desc) from public.subscriptions s where s.user_id = p_user), '[]'::json),
      'stripe', coalesce((select json_agg(json_build_object('at', e.at, 'quoi', e.quoi, 'montant_cents', e.montant_cents,
        'devise', e.devise, 'essai', e.essai, 'raison', e.raison, 'commentaire', e.motif) order by e.at desc)
        from public.admin_evenements_stripe('2000-01-01'::timestamptz) e where e.uid = p_user), '[]'::json),
      'emails', coalesce((select json_agg(json_build_object('campagne', m.campaign, 'statut', m.status, 'envoye', m.sent_at,
        'ouvert', m.opened_at, 'clique', m.clicked_at) order by m.sent_at desc nulls last)
        from (select * from public.email_sends where user_id = p_user order by sent_at desc nulls last limit 40) m), '[]'::json),
      'suivi', json_build_object(
        'visites', (select count(*) from sess),
        'premiere_visite', (select min(created_at) from toutes),
        'derniere_visite', (select max(created_at) from toutes),
        'pages', (select count(*) from toutes where event_type = 'page_view'),
        'temps_actif_sec', (select coalesce(sum(least(3600, greatest(0, (metadata->>'sec')::numeric))), 0)::int from toutes
          where event_type = 'page_leave' and metadata->>'sec' ~ '^[0-9]+(\.[0-9]+)?$'),
        'matchs', (select count(distinct metadata->>'match_id') from toutes where event_type = 'page_view' and metadata->>'match_id' ~ '^[0-9]{1,12}$'),
        'copies', (select count(*) from toutes where event_type = 'click' and metadata->>'kind' = 'copie'),
        'partages', (select count(*) from toutes where event_type = 'click' and metadata->>'kind' = 'partage'),
        'appareils', (select json_agg(distinct metadata->>'device') from toutes where event_type = 'page_view' and metadata->>'device' is not null),
        'villes', (select json_agg(distinct concat_ws(', ', metadata->>'geo_city', metadata->>'geo_country')) from toutes
          where event_type = 'page_view' and metadata->>'geo_country' is not null),
        'premiere_source', (select json_build_object('utm_source', metadata->>'utm_source', 'utm_campaign', metadata->>'utm_campaign',
          'ref', metadata->>'ref', 'page', page, 'at', created_at) from toutes where event_type = 'page_view' order by created_at limit 1)
      )
    )
  );
end;
$$;
revoke all on function public.admin_personne(uuid) from public, anon;
grant execute on function public.admin_personne(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Abonnes des reseaux, un releve par jour et par reseau.
create table if not exists public.reseaux_abonnes (
  jour date not null,
  reseau text not null check (reseau in ('telegram', 'x', 'tiktok', 'youtube', 'instagram')),
  abonnes integer not null check (abonnes >= 0),
  source text,
  releve_at timestamptz not null default now(),
  primary key (jour, reseau)
);
alter table public.reseaux_abonnes enable row level security;

create or replace function public.admin_reseaux(p_jours integer default 90)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object('generated_at', now(), 'series', coalesce((
    select json_agg(json_build_object('reseau', r.reseau, 'jour', r.jour, 'abonnes', r.abonnes, 'source', r.source) order by r.reseau, r.jour)
    from public.reseaux_abonnes r where r.jour > current_date - greatest(1, least(coalesce(p_jours, 90), 400))), '[]'::json));
end;
$$;
revoke all on function public.admin_reseaux(integer) from public, anon;
grant execute on function public.admin_reseaux(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Alertes sur le telephone.
create table if not exists public.admin_push (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  types text[] not null default array['pro', 'paiement', 'arret', 'paiement_rate', 'inscrit', 'telegram', 'panne', 'foule'],
  appareil text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dernier_envoi_at timestamptz,
  derniere_erreur text
);
alter table public.admin_push enable row level security;

create table if not exists public.admin_alertes (
  id bigserial primary key,
  type text not null,
  titre text not null,
  texte text not null,
  url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  envoye_at timestamptz,
  envois integer,
  erreur text
);
alter table public.admin_alertes enable row level security;
create index if not exists admin_alertes_created_idx on public.admin_alertes (created_at desc);

create table if not exists public.admin_alertes_etat (
  cle text primary key,
  valeur jsonb not null default '{}'::jsonb,
  maj timestamptz not null default now()
);
alter table public.admin_alertes_etat enable row level security;

-- Telephone de l'admin : enregistrer, changer les alertes voulues, retirer.
create or replace function public.admin_push_enregistrer(p_endpoint text, p_p256dh text, p_auth text, p_types text[], p_appareil text default null)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'endpoint invalide' using errcode = '22023';
  end if;
  insert into public.admin_push (endpoint, user_id, p256dh, auth, types, appareil)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, coalesce(p_types, array['pro', 'paiement', 'arret', 'paiement_rate', 'inscrit', 'telegram', 'panne', 'foule']), left(p_appareil, 80))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    types = excluded.types, appareil = coalesce(excluded.appareil, public.admin_push.appareil), updated_at = now(), derniere_erreur = null;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_push_enregistrer(text, text, text, text[], text) from public, anon;
grant execute on function public.admin_push_enregistrer(text, text, text, text[], text) to authenticated;

create or replace function public.admin_push_retirer(p_endpoint text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.admin_push where endpoint = p_endpoint;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_push_retirer(text) from public, anon;
grant execute on function public.admin_push_retirer(text) to authenticated;

create or replace function public.admin_alertes_liste(p_endpoint text default null, p_limit integer default 40)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object(
    'telephones', (select count(*) from public.admin_push),
    'ce_telephone', (select json_build_object('types', p.types, 'depuis', p.created_at, 'erreur', p.derniere_erreur)
      from public.admin_push p where p.endpoint = p_endpoint),
    'alertes', coalesce((select json_agg(json_build_object('id', a.id, 'type', a.type, 'titre', a.titre, 'texte', a.texte,
      'url', a.url, 'at', a.created_at, 'envoye_at', a.envoye_at, 'envois', a.envois, 'erreur', a.erreur) order by a.created_at desc)
      from (select * from public.admin_alertes order by created_at desc limit greatest(1, least(coalesce(p_limit, 40), 200))) a), '[]'::json)
  );
end;
$$;
revoke all on function public.admin_alertes_liste(text, integer) from public, anon;
grant execute on function public.admin_alertes_liste(text, integer) to authenticated;

-- Cree une alerte et reveille la fonction d'envoi (admin-alertes). La fonction ne recoit que le numero de l'alerte :
-- elle relit la ligne elle-meme, rien d'autre ne peut etre envoye par cet appel.
create or replace function public.admin_alerte_creer(p_type text, p_titre text, p_texte text, p_url text default null, p_meta jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint;
begin
  insert into public.admin_alertes (type, titre, texte, url, meta)
  values (p_type, left(p_titre, 120), left(p_texte, 400), p_url, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;
  begin
    perform net.http_post(
      url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/admin-alertes',
      body := jsonb_build_object('id', v_id),
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8'),
      timeout_milliseconds := 8000);
  exception when others then null;
  end;
  return v_id;
end;
$$;
revoke all on function public.admin_alerte_creer(text, text, text, text, jsonb) from public, anon, authenticated;

-- Raison de depart la plus recente d'un abonnement (lue par la fonction d'envoi quelques secondes apres la demande
-- d'arret : Stripe envoie la raison dans un second evenement).
create or replace function public.admin_alerte_raison(p_sub text)
returns text language sql stable security definer set search_path = public as $$
  select public.admin_raison_depart(e.payload->'data'->'object'->'cancellation_details'->>'feedback')
  from public.billing_events e
  where e.event_type like 'customer.subscription.%' and e.payload->'data'->'object'->>'id' = p_sub
    and e.payload->'data'->'object'->'cancellation_details'->>'feedback' is not null
  order by e.processed_at desc limit 1
$$;
revoke all on function public.admin_alerte_raison(text) from public, anon, authenticated;

create or replace function public.admin_euros(p_cents integer, p_devise text)
returns text language sql immutable as $$
  select case when p_cents is null then null
    else replace(to_char(p_cents / 100.0, 'FM999990.00'), '.', ',') || ' ' || case upper(coalesce(p_devise, 'EUR')) when 'EUR' then '€' when 'GBP' then '£' when 'USD' then '$' else upper(p_devise) end end
$$;

-- Declencheur : evenement Stripe -> alerte.
create or replace function public.admin_alerte_stripe()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_depuis text; v_qui text;
begin
  begin
    select * into r from public.admin_evenements_stripe(new.processed_at - interval '1 second') e
    where e.event_id = new.stripe_event_id limit 1;
    if r.quoi is null or coalesce(r.interne, false) then return new; end if;
    v_qui := coalesce(public.admin_mask_email(r.email), 'Un client');
    v_depuis := case when r.debut_abonnement is not null
      then ' (' || case when r.essai then 'en essai' else 'abonné' end || ' depuis ' || greatest(0, (now()::date - r.debut_abonnement::date)) || ' j)' else '' end;
    if r.quoi = 'essai' then
      perform public.admin_alerte_creer('pro', 'Nouvel essai Pro', v_qui || ' a commencé son essai Pro.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    elsif r.quoi = 'nouveau' then
      perform public.admin_alerte_creer('pro', 'Nouveau Pro', v_qui || ' est passé Pro.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    elsif r.quoi in ('premier_paiement', 'paiement') then
      perform public.admin_alerte_creer('paiement', 'Paiement reçu : ' || coalesce(public.admin_euros(r.montant_cents, r.devise), ''),
        v_qui || case when r.quoi = 'premier_paiement' then ' a payé son premier mois.' else ' a renouvelé.' end, '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    elsif r.quoi = 'paiement_rate' then
      perform public.admin_alerte_creer('paiement_rate', 'Paiement raté', v_qui || ' : ' || coalesce(public.admin_euros(r.montant_cents, r.devise), 'montant inconnu') || ' refusé par la banque.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    elsif r.quoi = 'arret_demande' then
      perform public.admin_alerte_creer('arret', 'Désabonnement demandé', v_qui || ' a demandé à arrêter' || v_depuis || '.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid, 'sub', r.sub_id));
    elsif r.quoi = 'reprise' then
      perform public.admin_alerte_creer('arret', 'Abonnement repris', v_qui || ' a annulé sa demande d''arrêt : il reste Pro.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    elsif r.quoi = 'parti' then
      perform public.admin_alerte_creer('arret', case when r.essai then 'Essai terminé sans payer' else 'Abonné parti' end,
        v_qui || case when r.essai then ' n''est pas passé Pro' else ' n''est plus Pro' end || v_depuis || coalesce('. Raison : ' || r.raison, '') || '.', '/admin.html#ecran-argent', jsonb_build_object('uid', r.uid));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists admin_alerte_stripe on public.billing_events;
create trigger admin_alerte_stripe after insert on public.billing_events for each row execute function public.admin_alerte_stripe();

-- Declencheur : nouvel inscrit.
create or replace function public.admin_alerte_inscrit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if not public.admin_internal_account(new.email, new.role) then
      perform public.admin_alerte_creer('inscrit', 'Nouvel inscrit', coalesce(public.admin_mask_email(new.email), 'Quelqu''un') || ' vient de créer un compte.', '/admin.html#ecran-inscrits', jsonb_build_object('uid', new.id));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists admin_alerte_inscrit on public.users;
create trigger admin_alerte_inscrit after insert on public.users for each row execute function public.admin_alerte_inscrit();

-- Declencheur : Telegram laisse.
create or replace function public.admin_alerte_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text; v_role text; v_plan text;
begin
  begin
    if new.sans_telegram or new.pseudo is null then return new; end if;
    if tg_op = 'UPDATE' and old.pseudo is not distinct from new.pseudo then return new; end if;
    select email, role, plan into v_email, v_role, v_plan from public.users where id = new.user_id;
    if public.admin_internal_account(v_email, v_role) then return new; end if;
    perform public.admin_alerte_creer('telegram', 'Telegram laissé', new.pseudo || ' (' || case when v_plan in ('pro', 'famille') then 'Pro' else 'gratuit' end || ', ' || coalesce(public.admin_mask_email(v_email), '?') || ').', '/admin.html#ecran-inscrits', jsonb_build_object('uid', new.user_id));
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists admin_alerte_telegram on public.telegram_contacts;
create trigger admin_alerte_telegram after insert or update on public.telegram_contacts for each row execute function public.admin_alerte_telegram();

-- Veille (toutes les 10 minutes, pg_cron) : la fonction d'envoi verifie le site, les visiteurs et releve les abonnes.
-- Visiteurs humains actifs sur 10 minutes (memes exclusions que le tableau de bord : appareil interne, tests, robots).
create or replace function public.admin_veille_foule()
returns json language sql stable security definer set search_path = public as $$
  with fenetres as (
    select date_bin('10 minutes', e.created_at, '2026-01-01'::timestamptz) as f, count(distinct e.session_id) as n
    from public.funnel_events e
    where e.created_at > now() - interval '7 days' and e.event_type = 'page_view'
      and coalesce(e.metadata->>'internal', '') <> 'true' and coalesce(e.metadata->>'qa', '') <> 'true'
      and coalesce(e.metadata->>'bot', '') in ('', 'false') and coalesce(e.metadata->>'tz', '') not in ('UTC', 'Etc/UTC')
    group by 1
  )
  select json_build_object(
    'maintenant', coalesce((select count(distinct e.session_id) from public.funnel_events e
      where e.created_at > now() - interval '10 minutes' and e.event_type = 'page_view'
        and coalesce(e.metadata->>'internal', '') <> 'true' and coalesce(e.metadata->>'qa', '') <> 'true'
        and coalesce(e.metadata->>'bot', '') in ('', 'false') and coalesce(e.metadata->>'tz', '') not in ('UTC', 'Etc/UTC')), 0),
    'habituel', coalesce((select percentile_cont(0.9) within group (order by n) from fenetres), 0)
  )
$$;
revoke all on function public.admin_veille_foule() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'admin-alertes-veille';
exception when others then null;
end $$;
select cron.schedule('admin-alertes-veille', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/admin-alertes',
    body := '{"mode":"veille"}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8"}'::jsonb,
    timeout_milliseconds := 20000)
$cron$);
