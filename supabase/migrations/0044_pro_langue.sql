-- IASHARK : espace Pro personnalise et langue du compte partout (02/10/2026).
--
-- ECRITE, PAS APPLIQUEE. A appliquer A LA MAIN, apres 0040_canal_pro.sql,
-- 0041_pro_accueil.sql et 0043_telegram_langues.sql. Idempotente (if not
-- exists / drop ... if exists / on conflict do nothing) : peut etre relancee.
-- Le questionnaire Pro (accueil-pro.html, interrupteur
-- window.IASHARK_OUVERTURE.reglagesPro) ne s'ouvre qu'apres 0040 ET 0044.
-- Avant 0044, le site relit et enregistre sans les deux nouvelles colonnes
-- (lib/pro-preferences.js#COLONNES_0044) : rien ne casse.
--
-- 1. public.pro_preferences (0040) :
--    - pays : Belgique ('be'), Suisse ('ch') et Espagne ('es') en plus. Aucun
--      bookmaker n'y est encore propose (config/bookmakers-agrees.json : listes
--      vides, jamais un operateur non agree) : l'abonne y lit « pas encore
--      disponible dans votre pays ». Le robot les traite comme un pays non
--      ouvert (BOOKMAKERS_AGREES n'a pas ces cles : aucun bookmaker) ;
--    - marches : les types de paris que l'abonne prefere (mis en avant dans son
--      espace Pro : detecteur d'ecarts et combine). N'agit sur aucun calcul ni
--      sur le choix du pari : seulement l'ordre et le reperage a l'ecran ;
--    - heure_envoi : heure de Paris a partir de laquelle le robot Telegram lui
--      envoie son programme du matin (vide = des qu'il est publie). Un pari
--      n'est jamais envoye apres le debut de son match.
-- 2. public.user_preferences (0010) : la langue du compte (language) est LA
--    source unique (site, espace Pro, e-mails, robot Telegram). A l'inscription,
--    la base cree la ligne avec la langue de la page ou la personne s'est
--    inscrite (metadonnee iashark_locale, deja envoyee par auth-pages.js ;
--    'es-mx' -> 'es'). Comptes deja inscrits sans ligne : meme langue, tiree
--    de email_preferences.locale (0024) quand elle existe. Jamais ecrase : une
--    ligne existante garde sa langue.

-- ---------------------------------------------------------------------------
-- 1. pro_preferences
-- ---------------------------------------------------------------------------
alter table public.pro_preferences drop constraint if exists pro_preferences_pays_check;
alter table public.pro_preferences add constraint pro_preferences_pays_check
  check (pays in ('fr', 'be', 'ch', 'es', 'gb', 'mx', 'za', 'autre'));

alter table public.pro_preferences add column if not exists marches text[] not null default '{}';
alter table public.pro_preferences drop constraint if exists pro_preferences_marches_check;
alter table public.pro_preferences add constraint pro_preferences_marches_check
  check (marches <@ array['resultat', 'buts', 'btts', 'mi_temps', 'corners_cartons', 'tirs', 'buteur']::text[]);

alter table public.pro_preferences add column if not exists heure_envoi smallint;
alter table public.pro_preferences drop constraint if exists pro_preferences_heure_envoi_check;
alter table public.pro_preferences add constraint pro_preferences_heure_envoi_check
  check (heure_envoi is null or heure_envoi between 8 and 22);

comment on column public.pro_preferences.marches is
  'Types de paris preferes (lib/pro-preferences.js#MARCHES) : mis en avant a l''ecran, aucun effet sur le choix du pari.';
comment on column public.pro_preferences.heure_envoi is
  'Heure de Paris a partir de laquelle le programme du matin part dans Telegram (vide = des sa publication).';

-- ---------------------------------------------------------------------------
-- 2. Langue du compte a l'inscription
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user_language()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := lower(split_part(coalesce(new.raw_user_meta_data ->> 'iashark_locale', ''), '-', 1));
begin
  if v not in ('fr', 'en', 'es', 'de', 'it', 'pt') then v := 'fr'; end if;
  -- Jamais bloquer une inscription pour une preference : avertissement et compte cree.
  begin
    insert into public.user_preferences (user_id, language) values (new.id, v)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user_language: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;
revoke execute on function public.handle_new_user_language() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_language on auth.users;
create trigger on_auth_user_created_language
  after insert on auth.users
  for each row execute function public.handle_new_user_language();

-- Comptes deja inscrits sans ligne user_preferences : langue de la page
-- d'inscription (email_preferences.locale, si la table 0024 existe).
do $$
begin
  if to_regclass('public.email_preferences') is not null then
    insert into public.user_preferences (user_id, language)
    select ep.user_id, split_part(ep.locale, '-', 1)
    from public.email_preferences ep
    where split_part(ep.locale, '-', 1) in ('fr', 'en', 'es', 'de', 'it', 'pt')
      and not exists (select 1 from public.user_preferences up where up.user_id = ep.user_id)
    on conflict (user_id) do nothing;
  end if;
end $$;
