-- IASHARK — 0077 : « Pro offert 1 mois » : le clic sur notre lien Lolly Bet devient obligatoire (17/11/2026).
--
-- Constat du 17/11 : un visiteur a cree son compte puis envoye le formulaire en 7 secondes, sans jamais
-- passer par /go/lolly/site. Sa demande est restee « en attente » et il n'existe pas chez les affilies Lolly.
--
-- Parcours desormais :
--   1. la page (lib/lolly-page.js), compte connecte, demande un jeton : pro_offert_clic_preparer() ;
--   2. le bouton mene a /go/lolly/site?c=<jeton> ; la redirection (netlify/edge-functions/go.ts) appelle
--      pro_offert_clic_marquer(<jeton>) AVANT de renvoyer chez Lolly Bet : le clic est note ici, cote serveur ;
--   3. sans clic note, le declencheur de pro_offert_demandes refuse la demande (pro_offert_sans_clic).
-- Exception voulue par Clement : « J'ai deja clique » (les personnes venues par le lien direct de l'e-mail).
-- pro_offert_clic_declarer() ouvre le formulaire, et la demande porte clic = 'declare' : l'admin affiche
-- « clic non vu » pour qu'elle soit verifiee de plus pres. La validation reste faite a la main.

create table if not exists public.pro_offert_clics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partenaire text not null default 'lolly' check (partenaire in ('lolly')),
  created_at timestamptz not null default now(),
  clique_le timestamptz,
  declare_le timestamptz,
  unique (user_id, partenaire)
);
comment on table public.pro_offert_clics is
  'Un jeton par compte : id = jeton porte par /go/lolly/site?c=. clique_le = passage reel par notre redirection ; declare_le = « J''ai deja clique » (e-mail).';

alter table public.pro_offert_clics enable row level security;
revoke all on public.pro_offert_clics from public, anon, authenticated;

-- Etat du clic pour la page : 'vu', 'declare' ou null.
create or replace function public.pro_offert_clic_etat_de(c public.pro_offert_clics) returns text
language sql immutable as $$
  select case when c.clique_le is not null then 'vu' when c.declare_le is not null then 'declare' else null end;
$$;
revoke all on function public.pro_offert_clic_etat_de(public.pro_offert_clics) from public, anon, authenticated;

-- Jeton du compte connecte (cree au besoin) et etat du clic.
create or replace function public.pro_offert_clic_preparer()
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  c public.pro_offert_clics%rowtype;
begin
  if auth.uid() is null then
    raise exception 'pro_offert_compte' using errcode = '42501';
  end if;
  insert into public.pro_offert_clics (user_id, partenaire) values (auth.uid(), 'lolly')
    on conflict (user_id, partenaire) do nothing;
  select * into c from public.pro_offert_clics where user_id = auth.uid() and partenaire = 'lolly';
  return json_build_object('jeton', c.id, 'clic', public.pro_offert_clic_etat_de(c));
end;
$$;
revoke all on function public.pro_offert_clic_preparer() from public, anon;
grant execute on function public.pro_offert_clic_preparer() to authenticated;

-- Appelee par la redirection /go/lolly/... (cle publique) : note le premier passage. Le jeton est un uuid
-- connu du seul compte ; un jeton inconnu ne fait rien.
create or replace function public.pro_offert_clic_marquer(p_jeton uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  update public.pro_offert_clics set clique_le = coalesce(clique_le, now()) where id = p_jeton;
  return found;
end;
$$;
revoke all on function public.pro_offert_clic_marquer(uuid) from public;
grant execute on function public.pro_offert_clic_marquer(uuid) to anon, authenticated;

-- « J'ai deja clique » : la personne declare etre passee par notre lien ailleurs (e-mail).
create or replace function public.pro_offert_clic_declarer()
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  c public.pro_offert_clics%rowtype;
begin
  if auth.uid() is null then
    raise exception 'pro_offert_compte' using errcode = '42501';
  end if;
  insert into public.pro_offert_clics (user_id, partenaire, declare_le) values (auth.uid(), 'lolly', now())
    on conflict (user_id, partenaire) do update set declare_le = coalesce(public.pro_offert_clics.declare_le, now());
  select * into c from public.pro_offert_clics where user_id = auth.uid() and partenaire = 'lolly';
  return json_build_object('jeton', c.id, 'clic', public.pro_offert_clic_etat_de(c));
end;
$$;
revoke all on function public.pro_offert_clic_declarer() from public, anon;
grant execute on function public.pro_offert_clic_declarer() to authenticated;

-- La demande garde la trace du clic : 'vu' (note par notre redirection) ou 'declare'.
-- Les demandes d'avant le 17/11/2026 restent a null.
alter table public.pro_offert_demandes add column if not exists clic text check (clic is null or clic in ('vu', 'declare'));
alter table public.pro_offert_demandes add column if not exists clic_le timestamptz;

-- Meme controle qu'en 0074, plus : aucune demande sans clic prealable.
create or replace function public.pro_offert_demandes_controle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c public.pro_offert_clics%rowtype;
begin
  if new.user_id is null or new.user_id is distinct from auth.uid() then
    raise exception 'pro_offert_compte' using errcode = '42501';
  end if;
  new.identifiant := btrim(new.identifiant);
  new.created_at := now();
  new.statut := 'en_attente';
  new.decide_le := null; new.decide_par := null; new.note := null;
  new.plan_avant := null; new.pro_jusqu_au := null; new.fin_appliquee_le := null;
  select * into c from public.pro_offert_clics where user_id = new.user_id and partenaire = new.partenaire;
  if not found or (c.clique_le is null and c.declare_le is null) then
    raise exception 'pro_offert_sans_clic' using errcode = 'P0001';
  end if;
  new.clic := public.pro_offert_clic_etat_de(c);
  new.clic_le := coalesce(c.clique_le, c.declare_le);
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

-- Admin : la liste dit si le clic a ete vu.
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
        d.fin_appliquee_le, d.clic, d.clic_le, u.email, u.plan, u.created_at as inscrit_le,
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
