-- IASHARK — 0060 : messages de la page Contact (30/10/2026). PREPAREE, PAS APPLIQUEE.
--
-- La page /<version>/contact.html envoie un petit formulaire (e-mail + message).
-- Meme mecanisme que les candidatures Partenaires (0056) : la ligne est ecrite ici,
-- puis scripts/telegram/alerte-contact.mjs (lance par le workflow « Alerte
-- partenaires », toutes les 30 minutes) l'envoie dans la conversation privee de
-- Clement avec le robot et pose owner_notified_at (jamais deux fois).
--
-- Ecriture : visiteurs (anon) et comptes connectes, INSERT seulement, sous controle
-- (longueurs, format d'e-mail). Lecture, modification, suppression : cle de service
-- seulement (aucune politique SELECT/UPDATE/DELETE). Anti-abus : champ piege cote page
-- (jamais envoye), limites de longueur ici, et un plafond par adresse et global
-- (declencheur contact_messages_limite).

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  locale text check (locale is null or char_length(locale) <= 8),
  page_dir text check (page_dir is null or char_length(page_dir) <= 8),
  user_id uuid references auth.users(id) on delete set null,
  owner_notified_at timestamptz
);

comment on table public.contact_messages is
  'Messages envoyes depuis la page Contact ; transmis a Clement sur Telegram par scripts/telegram/alerte-contact.mjs.';
comment on column public.contact_messages.owner_notified_at is
  'Moment ou Clement a ete prevenu sur Telegram (scripts/telegram/alerte-contact.mjs).';

create index if not exists contact_messages_a_signaler
  on public.contact_messages (created_at) where owner_notified_at is null;

alter table public.contact_messages enable row level security;

-- Un visiteur peut deposer un message ; user_id seulement le sien (ou vide).
drop policy if exists contact_messages_insert on public.contact_messages;
create policy contact_messages_insert on public.contact_messages
  for insert to anon, authenticated
  with check (owner_notified_at is null and (user_id is null or user_id = auth.uid()));

grant insert on public.contact_messages to anon, authenticated;

-- Plafonds : 3 messages par adresse e-mail par heure, 60 messages par heure au total.
create or replace function public.contact_messages_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.contact_messages
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'contact_rate_limited' using errcode = 'P0001';
  end if;
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'contact_rate_limited' using errcode = 'P0001';
  end if;
  new.owner_notified_at := null;
  return new;
end;
$$;

drop trigger if exists contact_messages_limite on public.contact_messages;
create trigger contact_messages_limite before insert on public.contact_messages
  for each row execute function public.contact_messages_limite();
