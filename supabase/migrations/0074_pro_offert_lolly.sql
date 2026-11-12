-- IASHARK — 0074 : « Pro offert 1 mois » contre une inscription chez Lolly Bet par notre lien
-- (decision de Clement du 11/11/2026, 23 h). PREPAREE, PAS APPLIQUEE.
--
-- Parcours : la personne (connectee a son compte IASHARK) clique sur notre lien Lolly Bet
-- (/go/lolly/site), s'inscrit chez Lolly, puis revient sur /<version>/lolly.html declarer l'e-mail
-- ou le login utilise chez Lolly. La ligne arrive ici « en_attente ». Clement verifie dans l'espace
-- partenaire Lolly (rapport « User management » : e-mail et login des joueurs venus par nos liens),
-- puis Valide ou Refuse dans l'admin (admin.html, ecran Partenaires).
--
-- JAMAIS D'AUTO-VALIDATION : seule admin_pro_offert_decider (role admin) peut changer un statut.
--
-- Comment le Pro est ouvert : par le plan « famille » (migration 0032), le mecanisme deja utilise pour
-- l'acces complet offert. Il est reconnu partout comme Pro (match-data, tickets-du-jour, app-client,
-- auth-header), n'est jamais compte comme client payant, et sync-subscription / stripe-webhook ne
-- peuvent pas le retrograder. La fin du mois offert est posee ici (pro_jusqu_au) et appliquee chaque
-- nuit par pro_offert_fin() (pg_cron) : retour en « free » SEULEMENT si le compte etait « free » au
-- moment de la validation (plan_avant) et est toujours « famille ». Un vrai abonnement pris entre-temps
-- (plan « pro ») n'est jamais touche ; un proche deja en « famille » non plus.
--
-- Securite :
-- - RLS : une personne connectee voit et ajoute SEULEMENT sa propre ligne ; aucune modification ni
--   suppression ; les visiteurs sans compte n'ont aucun droit ;
-- - le declencheur force statut = en_attente et vide tout champ de decision a l'insertion ;
-- - une seule demande ouverte ou validee par compte, 3 demandes au plus par compte (apres un refus,
--   on peut corriger son login), 200 demandes par heure au total.

create table if not exists public.pro_offert_demandes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partenaire text not null default 'lolly' check (partenaire in ('lolly')),
  identifiant text not null check (char_length(btrim(identifiant)) between 3 and 120),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'refuse')),
  decide_le timestamptz,
  decide_par uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  plan_avant text,
  pro_jusqu_au timestamptz,
  fin_appliquee_le timestamptz
);

comment on table public.pro_offert_demandes is
  'Pro offert 1 mois contre une inscription chez Lolly Bet par le lien IASHARK. Validee a la main dans admin.html (admin_pro_offert_decider), jamais automatiquement.';
comment on column public.pro_offert_demandes.identifiant is 'E-mail ou login declare par la personne, tel qu''elle l''a utilise chez Lolly Bet.';
comment on column public.pro_offert_demandes.plan_avant is 'Plan du compte au moment de la validation : la fin du mois offert ne retrograde que les comptes qui etaient free.';

create index if not exists pro_offert_demandes_user on public.pro_offert_demandes (user_id, created_at desc);
create index if not exists pro_offert_demandes_attente on public.pro_offert_demandes (created_at) where statut = 'en_attente';
create index if not exists pro_offert_demandes_fin on public.pro_offert_demandes (pro_jusqu_au)
  where statut = 'valide' and fin_appliquee_le is null;

alter table public.pro_offert_demandes enable row level security;

drop policy if exists pro_offert_demandes_select on public.pro_offert_demandes;
create policy pro_offert_demandes_select on public.pro_offert_demandes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pro_offert_demandes_insert on public.pro_offert_demandes;
create policy pro_offert_demandes_insert on public.pro_offert_demandes
  for insert to authenticated
  with check (user_id = auth.uid() and statut = 'en_attente' and decide_le is null and decide_par is null
    and pro_jusqu_au is null and fin_appliquee_le is null and plan_avant is null);

revoke all on public.pro_offert_demandes from public, anon, authenticated;
grant select (id, created_at, user_id, partenaire, identifiant, statut, decide_le, pro_jusqu_au) on public.pro_offert_demandes to authenticated;
grant insert (identifiant, partenaire) on public.pro_offert_demandes to authenticated;

-- Insertion : champs de decision toujours vides, limites par compte et globale.
create or replace function public.pro_offert_demandes_controle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null or new.user_id is distinct from auth.uid() then
    raise exception 'pro_offert_compte' using errcode = '42501';
  end if;
  new.identifiant := btrim(new.identifiant);
  new.created_at := now();
  new.statut := 'en_attente';
  new.decide_le := null; new.decide_par := null; new.note := null;
  new.plan_avant := null; new.pro_jusqu_au := null; new.fin_appliquee_le := null;
  if exists (select 1 from public.pro_offert_demandes d
             where d.user_id = new.user_id and d.partenaire = new.partenaire and d.statut in ('en_attente', 'valide')) then
    raise exception 'pro_offert_deja_demande' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pro_offert_demandes d where d.user_id = new.user_id) >= 3 then
    raise exception 'pro_offert_trop_de_demandes' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pro_offert_demandes d where d.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'pro_offert_trop_de_demandes' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.pro_offert_demandes_controle() from public, anon, authenticated;

drop trigger if exists pro_offert_demandes_controle on public.pro_offert_demandes;
create trigger pro_offert_demandes_controle before insert on public.pro_offert_demandes
  for each row execute function public.pro_offert_demandes_controle();

-- ---------------------------------------------------------------------------------------------------------------
-- Admin : la liste (en attente d'abord) et la decision.
create or replace function public.admin_pro_offert_demandes()
returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object(
    'generated_at', now(),
    'demandes', coalesce((select json_agg(x order by x.ordre, x.created_at desc) from (
      select d.id, d.created_at, d.partenaire, d.identifiant, d.statut, d.decide_le, d.note, d.pro_jusqu_au,
        d.fin_appliquee_le, u.email, u.plan, u.created_at as inscrit_le,
        (select count(*) from public.pro_offert_demandes d2
          where lower(d2.identifiant) = lower(d.identifiant) and d2.user_id <> d.user_id) as meme_identifiant_ailleurs,
        case d.statut when 'en_attente' then 0 else 1 end as ordre
      from public.pro_offert_demandes d
      left join public.users u on u.id = d.user_id
      order by case d.statut when 'en_attente' then 0 else 1 end, d.created_at desc
      limit 300
    ) x), '[]'::json)
  );
end;
$$;
revoke all on function public.admin_pro_offert_demandes() from public, anon;
grant execute on function public.admin_pro_offert_demandes() to authenticated;

-- p_statut : 'valide' (ouvre le Pro 1 mois) ou 'refuse'. Seulement sur une demande en attente.
create or replace function public.admin_pro_offert_decider(p_id uuid, p_statut text, p_note text default null)
returns json language plpgsql volatile security definer set search_path = public, auth as $$
declare
  d public.pro_offert_demandes%rowtype;
  v_plan text;
  v_fin timestamptz;
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_statut not in ('valide', 'refuse') then
    raise exception 'statut_invalide' using errcode = '22023';
  end if;
  select * into d from public.pro_offert_demandes where id = p_id for update;
  if not found or d.statut <> 'en_attente' then
    raise exception 'demande_introuvable' using errcode = 'P0002';
  end if;
  if p_statut = 'refuse' then
    update public.pro_offert_demandes
       set statut = 'refuse', decide_le = now(), decide_par = auth.uid(), note = nullif(left(btrim(coalesce(p_note, '')), 300), '')
     where id = p_id;
    return json_build_object('ok', true, 'statut', 'refuse');
  end if;
  select plan into v_plan from public.users where id = d.user_id for update;
  v_fin := now() + interval '1 month';
  -- Ouvre le Pro par le plan « famille » seulement si le compte est gratuit : un abonne payant garde
  -- son abonnement, un proche garde son acces.
  update public.users set plan = 'famille' where id = d.user_id and plan = 'free';
  update public.pro_offert_demandes
     set statut = 'valide', decide_le = now(), decide_par = auth.uid(), plan_avant = coalesce(v_plan, 'free'),
         pro_jusqu_au = v_fin, note = nullif(left(btrim(coalesce(p_note, '')), 300), '')
   where id = p_id;
  return json_build_object('ok', true, 'statut', 'valide', 'pro_jusqu_au', v_fin, 'plan_avant', coalesce(v_plan, 'free'));
end;
$$;
revoke all on function public.admin_pro_offert_decider(uuid, text, text) from public, anon;
grant execute on function public.admin_pro_offert_decider(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Fin du mois offert, chaque nuit.
create or replace function public.pro_offert_fin()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  -- Autorise le passage famille -> free (declencheur users_keep_famille_plan, migration 0032),
  -- pour cette transaction seulement.
  perform set_config('iashark.allow_plan_change', 'on', true);
  for r in select id, user_id, plan_avant from public.pro_offert_demandes
            where statut = 'valide' and fin_appliquee_le is null and pro_jusqu_au < now()
            for update loop
    if r.plan_avant = 'free' then
      update public.users set plan = 'free' where id = r.user_id and plan = 'famille';
      if found then n := n + 1; end if;
    end if;
    update public.pro_offert_demandes set fin_appliquee_le = now() where id = r.id;
  end loop;
  return n;
end;
$$;
revoke all on function public.pro_offert_fin() from public, anon, authenticated;

comment on function public.pro_offert_fin() is
  'Termine les mois Pro offerts (Lolly Bet) arrives a echeance : famille -> free seulement pour les comptes qui etaient free a la validation. Executee chaque nuit par pg_cron (job pro-offert-fin).';

create extension if not exists pg_cron;
select cron.unschedule('pro-offert-fin')
 where exists (select 1 from cron.job where jobname = 'pro-offert-fin');
select cron.schedule('pro-offert-fin', '20 3 * * *', $job$ select public.pro_offert_fin(); $job$);
