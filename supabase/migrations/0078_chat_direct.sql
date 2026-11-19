-- Chat du site : conversations gardees et reprise en direct par Clement (20/11/2026).
-- Demande de Clement : « je dois savoir tout ce que les gens ecrivent », « des qu'on dit parler a un humain,
-- ca m'envoie une alerte et je reprends la main ; si je ne reponds pas dans les 5 min, ca dit qu'on est occupes ».
--
-- Visiteur (navigateur, cle publique) : seulement par les fonctions chat_* ci-dessous, avec l'identifiant de sa
-- conversation ET sa cle secrete (tiree au hasard dans son navigateur, gardee hachee ici). Il ne lit jamais que
-- les reponses de l'equipe de SA conversation. Admin : fonctions admin_chat_* (admin_is_admin()).
-- Tables sans politique RLS : aucune lecture ni ecriture directe.

create table if not exists public.chat_conversations (
  id uuid primary key,
  cle_hash text not null,
  user_id uuid,
  profil text,
  langue text,
  page text,
  etat text not null default 'robot' check (etat in ('robot', 'attente', 'humain', 'occupe')),
  humain_demande_at timestamptz,
  humain_pris_at timestamptz,
  alerte_at timestamptz,
  nb_messages int not null default 0,
  lu_admin_at timestamptz,
  created_at timestamptz not null default now(),
  dernier_message_at timestamptz not null default now()
);
create index if not exists chat_conversations_dernier on public.chat_conversations (dernier_message_at desc);

create table if not exists public.chat_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  auteur text not null check (auteur in ('visiteur', 'robot', 'humain', 'systeme')),
  texte text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conv on public.chat_messages (conversation_id, id);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;

-- Conversation du visiteur (creee au premier appel). Renvoie null si la cle ne correspond pas.
create or replace function public.chat_conv(p_conv uuid, p_cle text, p_profil text, p_langue text, p_page text)
returns public.chat_conversations
language plpgsql security definer set search_path = public, extensions as $$
declare c public.chat_conversations; h text;
begin
  if p_conv is null or coalesce(length(p_cle), 0) < 16 or length(p_cle) > 100 then return null; end if;
  h := encode(digest(p_cle, 'sha256'), 'hex');
  select * into c from public.chat_conversations where id = p_conv;
  if not found then
    insert into public.chat_conversations (id, cle_hash, user_id, profil, langue, page)
    values (p_conv, h, auth.uid(), left(p_profil, 20), left(p_langue, 5), left(p_page, 200))
    returning * into c;
  elsif c.cle_hash <> h then
    return null;
  end if;
  return c;
end $$;
revoke all on function public.chat_conv(uuid, text, text, text, text) from public, anon, authenticated;

-- Le navigateur envoie ce qui a ete dit : [{"a":"visiteur"|"robot","t":"..."}], 30 au plus par appel,
-- 600 messages au plus par conversation, 1 000 caracteres au plus par message.
create or replace function public.chat_ecrire(p_conv uuid, p_cle text, p_profil text, p_langue text, p_page text, p_messages jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare c public.chat_conversations; m jsonb; n int := 0;
begin
  c := public.chat_conv(p_conv, p_cle, p_profil, p_langue, p_page);
  if c.id is null then return json_build_object('ok', false); end if;
  if jsonb_typeof(p_messages) <> 'array' then return json_build_object('ok', false); end if;
  for m in select value from jsonb_array_elements(p_messages) limit 30 loop
    exit when c.nb_messages + n >= 600;
    if (m->>'a') in ('visiteur', 'robot') and length(trim(coalesce(m->>'t', ''))) > 0 then
      insert into public.chat_messages (conversation_id, auteur, texte) values (c.id, m->>'a', left(m->>'t', 1000));
      n := n + 1;
    end if;
  end loop;
  update public.chat_conversations set nb_messages = nb_messages + n, dernier_message_at = now(),
    profil = coalesce(left(p_profil, 20), profil), user_id = coalesce(user_id, auth.uid())
  where id = c.id;
  return json_build_object('ok', true, 'n', n);
end $$;

-- « Je veux parler a quelqu'un » : alerte sur le telephone de Clement (type « chat »), une fois par 10 minutes.
create or replace function public.chat_humain(p_conv uuid, p_cle text, p_profil text, p_langue text, p_page text)
returns json
language plpgsql security definer set search_path = public as $$
declare c public.chat_conversations; dernier text; resume text;
begin
  c := public.chat_conv(p_conv, p_cle, p_profil, p_langue, p_page);
  if c.id is null then return json_build_object('ok', false); end if;
  if c.etat = 'humain' then return json_build_object('ok', true, 'etat', 'humain'); end if;
  update public.chat_conversations set etat = 'attente', humain_demande_at = now(), dernier_message_at = now() where id = c.id;
  insert into public.chat_messages (conversation_id, auteur, texte) values (c.id, 'systeme', 'Demande à parler à quelqu''un');
  if c.alerte_at is null or c.alerte_at < now() - interval '10 minutes' then
    select texte into dernier from public.chat_messages
      where conversation_id = c.id and auteur = 'visiteur' order by id desc limit 1;
    resume := coalesce(case c.profil when 'pro' then 'Un Pro' when 'membre' then 'Un inscrit gratuit' else 'Un visiteur' end, 'Un visiteur')
      || ' (' || coalesce(upper(c.langue), '?') || ')' || coalesce(' : « ' || left(dernier, 160) || ' »', '') || '. Réponds dans les 5 minutes.';
    perform public.admin_alerte_creer('chat', 'Quelqu''un veut te parler', resume,
      '/admin.html#ecran-chat', jsonb_build_object('conversation', c.id));
    update public.chat_conversations set alerte_at = now() where id = c.id;
  end if;
  return json_build_object('ok', true, 'etat', 'attente');
end $$;

-- Lecture par le visiteur : etat + reponses de l'equipe apres p_apres. Sans reponse 5 minutes apres la
-- demande : « occupe » (le navigateur affiche le mail et Telegram).
create or replace function public.chat_lire(p_conv uuid, p_cle text, p_apres bigint)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare c public.chat_conversations;
begin
  select * into c from public.chat_conversations where id = p_conv;
  if not found or c.cle_hash <> encode(digest(coalesce(p_cle, ''), 'sha256'), 'hex') then return json_build_object('ok', false); end if;
  if c.etat = 'attente' and c.humain_pris_at is null and c.humain_demande_at < now() - interval '5 minutes' then
    update public.chat_conversations set etat = 'occupe' where id = c.id;
    insert into public.chat_messages (conversation_id, auteur, texte) values (c.id, 'systeme', 'Pas de réponse en 5 minutes : mail et Telegram proposés');
    c.etat := 'occupe';
  end if;
  return json_build_object('ok', true, 'etat', c.etat, 'messages', coalesce((
    select json_agg(json_build_object('id', id, 't', texte, 'at', created_at) order by id)
    from public.chat_messages where conversation_id = c.id and auteur = 'humain' and id > coalesce(p_apres, 0)), '[]'::json));
end $$;

grant execute on function public.chat_ecrire(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.chat_humain(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.chat_lire(uuid, text, bigint) to anon, authenticated;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_chat_liste(p_limit int default 60)
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select json_agg(x order by x.attente desc, x.dernier desc) from (
    select c.id, c.profil, c.langue, c.page, c.etat, c.nb_messages as n, c.created_at as debut, c.dernier_message_at as dernier,
      c.humain_demande_at as demande, (c.etat = 'attente') as attente,
      (c.lu_admin_at is null or c.lu_admin_at < c.dernier_message_at) as nouveau,
      (select u.email from public.users u where u.id = c.user_id) as email,
      (select left(m.texte, 140) from public.chat_messages m where m.conversation_id = c.id and m.auteur = 'visiteur' order by m.id desc limit 1) as dernier_texte
    from public.chat_conversations c
    where c.nb_messages > 0 or c.etat <> 'robot'
    order by c.dernier_message_at desc
    limit greatest(1, least(coalesce(p_limit, 60), 300))) x), '[]'::json);
end $$;

create or replace function public.admin_chat_messages(p_conv uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.chat_conversations set lu_admin_at = now() where id = p_conv;
  return json_build_object(
    'conversation', (select row_to_json(c) from (select id, profil, langue, page, etat, created_at, humain_demande_at, humain_pris_at,
      (select u.email from public.users u where u.id = chat_conversations.user_id) as email
      from public.chat_conversations where id = p_conv) c),
    'messages', coalesce((select json_agg(json_build_object('id', id, 'a', auteur, 't', texte, 'at', created_at) order by id)
      from public.chat_messages where conversation_id = p_conv), '[]'::json));
end $$;

create or replace function public.admin_chat_repondre(p_conv uuid, p_texte text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_texte, ''))) = 0 then return json_build_object('ok', false); end if;
  insert into public.chat_messages (conversation_id, auteur, texte) values (p_conv, 'humain', left(trim(p_texte), 2000));
  update public.chat_conversations set etat = 'humain', humain_pris_at = coalesce(humain_pris_at, now()),
    dernier_message_at = now(), lu_admin_at = now(), nb_messages = nb_messages + 1 where id = p_conv;
  return json_build_object('ok', true);
end $$;

-- Rendre la main au robot.
create or replace function public.admin_chat_rendre(p_conv uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.chat_conversations set etat = 'robot' where id = p_conv;
  insert into public.chat_messages (conversation_id, auteur, texte) values (p_conv, 'systeme', 'Conversation rendue au robot');
  return json_build_object('ok', true);
end $$;

revoke all on function public.admin_chat_liste(int), public.admin_chat_messages(uuid), public.admin_chat_repondre(uuid, text), public.admin_chat_rendre(uuid) from public, anon;
grant execute on function public.admin_chat_liste(int), public.admin_chat_messages(uuid), public.admin_chat_repondre(uuid, text), public.admin_chat_rendre(uuid) to authenticated;

-- Le telephone de Clement recoit les alertes du chat (il l'a demande le 20/11).
update public.admin_push set types = array_append(types, 'chat') where not ('chat' = any(types));
