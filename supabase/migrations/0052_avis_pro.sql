-- IASHARK — avis des abonnes Pro (note de 1 a 5 + phrase facultative), 03/10/2026.
--
-- NON APPLIQUEE. A appliquer apres 0049 (numero 0052 : 0050 et 0051 sont
-- pris par la branche « affiliation »). Additive et idempotente.
--
-- Decision de Clement (03/10/2026) : le badge « note + avatars » au-dessus du
-- defile de videos n'affiche QUE de vrais avis. On demande une note simple aux
-- abonnes Pro dans l'espace Pro, apres 7 jours d'abonnement ; le badge
-- n'apparait qu'a partir de 20 avis reels, avec la moyenne reelle et le nombre
-- reel d'inscrits (arrondi vers le bas, cote site : assets/ugc-reel.js).
--
-- Ce que cette migration pose :
-- 1) public.avis_pro : un avis par compte (modifiable par son auteur).
-- 2) avis_pro_etat()      (connecte) : la personne peut-elle donner son avis ? son avis actuel.
-- 3) avis_pro_envoyer()   (connecte) : enregistre l'avis SI l'abonnement Pro est actif
--                                      depuis au moins 7 jours (verifie ici, jamais par le navigateur).
-- 4) avis_pro_resume()    (public)   : nombre d'avis, moyenne, nombre d'inscrits ;
--                                      rien d'autre que « visible = false » sous 20 avis.
-- Aucune ecriture directe dans la table depuis le navigateur (pas de politique insert/update).

create table if not exists public.avis_pro (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note smallint not null check (note between 1 and 5),
  texte text check (texte is null or char_length(texte) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.avis_pro is
  'Avis des abonnes Pro (1 a 5 etoiles + phrase facultative). Ecrit seulement par avis_pro_envoyer() (abonnement actif depuis 7 jours). Agrege par avis_pro_resume() pour le badge public (>= 20 avis).';

alter table public.avis_pro enable row level security;
drop policy if exists avis_pro_select_own on public.avis_pro;
create policy avis_pro_select_own on public.avis_pro for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.avis_pro from anon, authenticated;

-- Abonnement Pro actif depuis au moins 7 jours (essai compris dans l'anciennete :
-- l'essai de 7 jours se termine avant que la demande apparaisse).
create or replace function public.avis_pro_eligible(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status = 'active'
      and s.created_at <= now() - interval '7 days'
  );
$$;
revoke all on function public.avis_pro_eligible(uuid) from public, anon, authenticated;

create or replace function public.avis_pro_etat()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'eligible', auth.uid() is not null and public.avis_pro_eligible(auth.uid()),
    'avis', (select json_build_object('note', a.note, 'texte', a.texte, 'updated_at', a.updated_at)
             from public.avis_pro a where a.user_id = auth.uid())
  );
$$;
revoke all on function public.avis_pro_etat() from public, anon;
grant execute on function public.avis_pro_etat() to authenticated;

create or replace function public.avis_pro_envoyer(p_note integer, p_texte text default null)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_texte text := nullif(btrim(coalesce(p_texte, '')), '');
begin
  if v_user is null then
    raise exception 'non connecte' using errcode = '28000';
  end if;
  if not public.avis_pro_eligible(v_user) then
    raise exception 'abonnement Pro actif depuis 7 jours requis' using errcode = '42501';
  end if;
  if p_note is null or p_note < 1 or p_note > 5 then
    raise exception 'note entre 1 et 5' using errcode = '22023';
  end if;
  if v_texte is not null and char_length(v_texte) > 280 then
    raise exception 'phrase de 280 caracteres au plus' using errcode = '22023';
  end if;
  insert into public.avis_pro (user_id, note, texte)
  values (v_user, p_note, v_texte)
  on conflict (user_id) do update set note = excluded.note, texte = excluded.texte, updated_at = now();
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.avis_pro_envoyer(integer, text) from public, anon;
grant execute on function public.avis_pro_envoyer(integer, text) to authenticated;

-- Resume public : sous 20 avis, on ne dit RIEN (ni le nombre, ni la moyenne).
-- Tous les avis comptent (un avis reste reel meme apres une resiliation) ;
-- aucun avis n'est filtre selon sa note. Moyenne arrondie vers le bas au
-- dixieme : jamais embellie.
create or replace function public.avis_pro_resume()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with a as (select count(*)::int as n, avg(note)::numeric as m from public.avis_pro),
       u as (select count(*)::int as inscrits from public.users)
  select case when a.n >= 20 then json_build_object(
           'visible', true,
           'avis', a.n,
           'moyenne', floor(a.m * 10) / 10,
           'inscrits', u.inscrits)
         else json_build_object('visible', false) end
  from a, u;
$$;
revoke all on function public.avis_pro_resume() from public;
grant execute on function public.avis_pro_resume() to anon, authenticated;
