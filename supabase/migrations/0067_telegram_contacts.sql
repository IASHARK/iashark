-- Telegram laisse par chaque compte (fenetre « Tes pronos sur Telegram », 06/11/2026, demande de Clement).
-- Un compte = une ligne. Le compte (gratuit ou Pro) se retrouve par user_id -> users (plan) et auth.users (e-mail).
-- Le robot ne peut pas ecrire le premier a un pseudo : la liaison du robot (telegram_abonnes.chat_id) reste a part.
create table if not exists public.telegram_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 4 and 40),
  langue text,
  langue_navigateur text,
  page text,
  plan_au_moment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_contacts enable row level security;

drop policy if exists telegram_contacts_lire_le_sien on public.telegram_contacts;
create policy telegram_contacts_lire_le_sien on public.telegram_contacts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists telegram_contacts_ecrire_le_sien on public.telegram_contacts;
create policy telegram_contacts_ecrire_le_sien on public.telegram_contacts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists telegram_contacts_modifier_le_sien on public.telegram_contacts;
create policy telegram_contacts_modifier_le_sien on public.telegram_contacts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.telegram_contacts to authenticated;
