-- IASHARK - tickets_du_jour : tickets x5 / x10, Selection en or et buteur du jour,
-- figes a leur publication (demande de Clement du 04/10/2026 ; regles du trader de
-- cotes, regles-tickets.md §4.1).
--
-- Numero 0050 : les numeros 0040 a 0049 sont deja pris par des migrations d'autres
-- branches (canal Pro, rappels d'essai, langues...) qui peuvent etre appliquees en
-- production ; 0036-0039 sont evites pour la meme raison.
--
-- 1. Une ligne par jour de Paris et par type (x5, x10, or, buteur), ecrite UNE fois par
--    le pipeline (.github/workflows/update-data.yml -> lib/tickets-du-jour.js) avec la
--    cle service role, par un insert « on conflict do nothing » (jamais un upsert qui
--    ecrase). Lue uniquement par la fonction Edge tickets-du-jour (service role), qui
--    decide elle-meme ce que chaque niveau (sans compte, compte gratuit, Pro) recoit.
-- 2. GEL : une fois la ligne ecrite, jour, type, regle_version, meta, contenu,
--    premier_coup_envoi, publie_a et pipeline_sha ne changent plus (toute tentative est
--    annulee : l'ancienne valeur est remise). Seuls etats (match reporte / annule,
--    buteur retire) et resultat (interne) evoluent. Suppression refusee.
-- 3. PREUVE « PUBLIE AVANT LE MATCH » : publie_a est pose par la base (now()), la valeur
--    envoyee est ignoree ; un ticket dont le premier match a deja commence est REFUSE
--    (premier_coup_envoi obligatoire et posterieur a l'heure de la base).
-- 4. Aucune policy, revoke pour anon et authenticated : contenu jamais lisible par un
--    visiteur directement (les vrais matchs ne partent jamais vers quelqu'un qui n'y a
--    pas droit). Meme modele que match_premium_data (0002).
-- 5. tickets_du_jour_calculs : statut du dernier calcul du jour (publie, aucun, non_go,
--    indisponible) pour que la fonction dise « aucun ticket aujourd'hui » plutot que
--    « en preparation ». Aucun pari dedans.
-- Essai : supabase/tests/0050_tickets_du_jour.test.sql (base d'essai seulement).
--
-- NE PAS APPLIQUER sans l'accord de Clement.

create table if not exists public.tickets_du_jour (
  jour               date        not null,
  type               text        not null check (type in ('x5', 'x10', 'or', 'buteur')),
  regle_version      text        not null,
  meta               jsonb       not null,
  contenu            jsonb       not null,
  etats              jsonb       not null default '{}'::jsonb,
  resultat           text,
  premier_coup_envoi timestamptz not null,
  publie_a           timestamptz not null default now(),
  pipeline_sha       text,
  primary key (jour, type)
);
alter table public.tickets_du_jour enable row level security;
revoke all on public.tickets_du_jour from anon, authenticated;

create table if not exists public.tickets_du_jour_calculs (
  jour             date        primary key,
  dernier_calcul_a timestamptz not null,
  statuts          jsonb       not null default '{}'::jsonb,
  pipeline_sha     text
);
alter table public.tickets_du_jour_calculs enable row level security;
revoke all on public.tickets_du_jour_calculs from anon, authenticated;

-- Point 3 : heure posee par la base, ticket refuse apres le premier coup d'envoi.
create or replace function public.tickets_du_jour_publication()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.publie_a := now();
  if new.premier_coup_envoi is null or now() >= new.premier_coup_envoi then
    raise exception 'tickets_du_jour : ticket % du % refuse (premier match deja commence ou heure inconnue)', new.type, new.jour;
  end if;
  return new;
end;
$$;
revoke execute on function public.tickets_du_jour_publication() from public, anon, authenticated;

drop trigger if exists tickets_du_jour_publication on public.tickets_du_jour;
create trigger tickets_du_jour_publication
  before insert on public.tickets_du_jour
  for each row execute function public.tickets_du_jour_publication();

-- Point 2 : gel. Seuls etats et resultat changent ; suppression refusee.
create or replace function public.tickets_du_jour_gel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'tickets_du_jour : ticket % du % publie, suppression refusee', old.type, old.jour;
  end if;
  new.jour := old.jour;
  new.type := old.type;
  new.regle_version := old.regle_version;
  new.meta := old.meta;
  new.contenu := old.contenu;
  new.premier_coup_envoi := old.premier_coup_envoi;
  new.publie_a := old.publie_a;
  new.pipeline_sha := old.pipeline_sha;
  return new;
end;
$$;
revoke execute on function public.tickets_du_jour_gel() from public, anon, authenticated;

drop trigger if exists tickets_du_jour_gel on public.tickets_du_jour;
create trigger tickets_du_jour_gel
  before update or delete on public.tickets_du_jour
  for each row execute function public.tickets_du_jour_gel();
