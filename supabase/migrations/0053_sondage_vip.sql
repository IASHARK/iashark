-- 0053 : sondage « VIP Telegram ou directement sur le site ? » en bas de l'accueil.
--
-- Une table à part (pas funnel_events) : le vote est une réponse volontaire,
-- pas du suivi de navigation, il compte donc même sans consentement aux
-- statistiques. Aucun compte, aucune donnée personnelle : un identifiant
-- aléatoire tiré par le navigateur (un vote par navigateur et par sondage,
-- un nouveau clic remplace l'ancien), la langue et le site de la page.
--
-- Accès uniquement par fonctions :
--   - poll_vote(...)        : anon + authenticated, enregistre ou remplace le vote ;
--   - poll_results(poll)    : anon + authenticated, totaux par réponse (affichés
--                             au votant à partir de 20 votes) ;
--   - admin_poll_votes(poll): admin seulement, détail par réponse, langue et site.

create table if not exists public.poll_votes (
  id bigint generated always as identity primary key,
  poll text not null check (poll ~ '^[a-z0-9-]{1,40}$'),
  choice text not null check (choice in ('telegram', 'site')),
  voter text not null check (char_length(voter) between 8 and 64),
  lang text check (lang is null or lang ~ '^[a-z]{2}$'),
  site text check (site is null or char_length(site) <= 10),
  created_at timestamptz not null default now(),
  unique (poll, voter)
);

alter table public.poll_votes enable row level security;
-- Aucune policy : ni lecture ni écriture directes, tout passe par les fonctions.

create or replace function public.poll_vote(p_poll text, p_choice text, p_voter text, p_lang text default null, p_site text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.poll_votes (poll, choice, voter, lang, site)
  values (p_poll, p_choice, p_voter, nullif(lower(left(coalesce(p_lang, ''), 2)), ''), nullif(left(coalesce(p_site, ''), 10), ''))
  on conflict (poll, voter) do update set choice = excluded.choice, created_at = now();
end;
$$;

create or replace function public.poll_results(p_poll text)
returns table (choice text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.choice, count(*)::bigint from public.poll_votes v where v.poll = p_poll group by v.choice
$$;

create or replace function public.admin_poll_votes(p_poll text)
returns table (choice text, lang text, site text, votes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  return query
    select v.choice, coalesce(v.lang, '?'), coalesce(v.site, '?'), count(*)::bigint
    from public.poll_votes v
    where v.poll = p_poll
    group by 1, 2, 3
    order by 4 desc;
end;
$$;

revoke all on function public.poll_vote(text, text, text, text, text) from public;
revoke all on function public.poll_results(text) from public;
revoke all on function public.admin_poll_votes(text) from public;
grant execute on function public.poll_vote(text, text, text, text, text) to anon, authenticated;
grant execute on function public.poll_results(text) to anon, authenticated;
grant execute on function public.admin_poll_votes(text) to authenticated;
