-- Messages Telegram programmes a l'heure exacte, envoyes a Clement pour validation d'un clic, sans ordinateur.
-- Le passage de chaque minute (pg_cron + pg_net, job telegram-programme) est pose en base : il porte une cle, il n'est pas dans ce depot public.
create table if not exists public.telegram_programme (
  id bigint generated always as identity primary key,
  heure timestamptz not null,
  nom text not null unique,
  texte_url text not null,
  image_url text not null default '',
  envoye_le timestamptz,
  erreur text
);
alter table public.telegram_programme enable row level security;
create index if not exists telegram_programme_a_envoyer on public.telegram_programme (heure) where envoye_le is null;
