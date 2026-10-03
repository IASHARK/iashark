-- IASHARK — robot Telegram (28/09/2026, demande de Clement).
--
-- Le robot (Edge Function telegram-bot) a trois roles :
--   1. Publication sur le canal public @iasharkdata APRES un clic de Clement
--      (chaque message lui arrive d'abord en prive avec « Publier sur le canal »).
--   2. Contact : les gens ecrivent au robot, le message est transfere a Clement,
--      sa reponse (« Repondre » sur le message transfere) repart vers la personne.
--   3. Canal VIP prive, inclus dans Pro : un lien d'entree personnel (1 personne,
--      24 h) par abonne ; quand l'abonnement s'arrete, la personne est retiree.
--
-- Tables ecrites uniquement par le robot (service role). RLS active sans
-- politique : aucun acces depuis le navigateur.

create table if not exists public.telegram_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_vip_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_link text,
  invite_created_at timestamptz,
  telegram_user_id bigint,
  joined_at timestamptz,
  removed_at timestamptz
);
create index if not exists telegram_vip_members_link_idx on public.telegram_vip_members (invite_link);

create table if not exists public.telegram_contact_threads (
  admin_message_id bigint primary key,
  user_chat_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists telegram_contact_threads_user_idx on public.telegram_contact_threads (user_chat_id, created_at desc);

alter table public.telegram_settings enable row level security;
alter table public.telegram_vip_members enable row level security;
alter table public.telegram_contact_threads enable row level security;
