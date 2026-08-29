-- IASHARK — public.users
-- Reconcilie le schema versionne avec la table REELLE deja en production
-- (creee hors de tout controle de version en mars 2026, 5 comptes reels au
-- moment de cette migration, dont un admin). Idempotent par construction :
-- peut etre rejoue sans risque sur une base qui a deja cette table.
--
-- Cette table est interrogee directement par le frontend (auth-header.js,
-- compte.html, pro.html, match.html) via sb.from('users').select('plan,role,capital').
--
-- NOTE HISTORIQUE : `supabase list_migrations` montre 2 migrations
-- anterieures a ce depot (2026-07-22, "lock_down_users_table_client_grants"
-- et "add_capital_column_with_scoped_grant") deja appliquees sur le projet
-- avant que ce fichier n'existe - leur contenu SQL exact n'est pas
-- recuperable a posteriori (aucun outil ne l'expose). C'est justement pour
-- ca que ce fichier est ecrit pour etre idempotent et reconciliant plutot
-- que de supposer une table vide au depart : il produit le meme etat final
-- correct qu'il soit rejoue sur une base neuve ou sur celle-ci.
-- Ne pas renommer sans mettre a jour ces 4 fichiers en meme temps.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  role text not null default 'customer',
  capital numeric,
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists updated_at timestamptz not null default now();

-- Bug pre-existant corrige : role valait 'free' (une valeur de plan, pas de
-- role) par defaut sur les comptes crees avant cette migration. Neutre en
-- pratique (le code ne verifie que role==='admin'), corrige pour que la
-- contrainte CHECK ci-dessous soit valide sans casser les lignes existantes.
update public.users set role = 'customer' where role = 'free';
alter table public.users alter column role set default 'customer';
alter table public.users alter column plan set default 'free';

alter table public.users drop constraint if exists users_plan_check;
alter table public.users add constraint users_plan_check check (plan in ('free','pro'));
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('customer','admin'));

alter table public.users enable row level security;

drop policy if exists "users can read own data" on public.users;
drop policy if exists "users can update own data" on public.users;
drop policy if exists "users_select_own" on public.users;
drop policy if exists "users_insert_own" on public.users;
drop policy if exists "users_update_own" on public.users;

create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

-- plan/role jamais modifiables par le client, meme si la policy ci-dessus
-- l'autoriserait au niveau ligne (self-privilege-escalation sinon) :
-- restriction au niveau colonne. Seul un role service (webhook de paiement
-- futur, action admin manuelle) pourra changer plan/role.
revoke select, insert, update, delete, references, trigger on public.users from anon;
revoke update on public.users from authenticated;
grant select, insert on public.users to authenticated;
grant update (email, capital, updated_at) on public.users to authenticated;

-- Auto-creation d'une ligne users a l'inscription. search_path fixe et
-- EXECUTE retire de anon/authenticated/public : cette fonction ne doit
-- jamais etre appelable directement (ex. /rest/v1/rpc/handle_new_user),
-- seulement declenchee par le trigger ci-dessous.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
