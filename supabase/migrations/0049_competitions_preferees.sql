-- IASHARK : competitions preferees des abonnes Pro (03/10/2026, decision de Clement).
-- A APPLIQUER A LA MAIN apres 0045_pro_messages_prives.sql (jamais applique automatiquement).
--
-- Les paris sont les MEMES pour tous. Les competitions preferees servent SEULEMENT a l'information :
-- a la fin du programme du jour, les matchs du jour de SES competitions (lien vers l'analyse), et le
-- lendemain matin leurs resultats. Une seule liste pour le site et le robot Telegram, generee depuis
-- config/leagues.json (scripts/sync-competitions-pro.js) : cles « premier », « ligue1 », « mls »...
-- (les memes que les etoiles du site, user_metadata.fav_leagues). Vide = toutes (pas de liste a part).
--
-- 0045 n'acceptait que les codes du moteur (F1, SP1, D1, I1, N1, P1) : la contrainte est remplacee par
-- un controle de forme (la liste exacte vit dans la config, elle peut grandir sans migration ; le site
-- et le robot n'ecrivent que des cles de la liste) ; les anciens codes deja enregistres sont convertis.

create or replace function public.pro_competitions_valides(c text[])
returns boolean language sql immutable as $$
  select coalesce(array_length(c, 1), 0) <= 60
     and not exists (select 1 from unnest(c) x where x !~ '^[a-z0-9_]{1,40}$')
$$;

alter table public.pro_preferences drop constraint if exists pro_preferences_competitions_check;

update public.pro_preferences set competitions = array(
  select case x when 'F1' then 'ligue1' when 'SP1' then 'laliga' when 'D1' then 'bundesliga'
                when 'I1' then 'seriea' when 'N1' then 'eredivisie' when 'P1' then 'primeira' else x end
  from unnest(competitions) x)
where competitions && array['F1','SP1','D1','I1','N1','P1']::text[];

alter table public.pro_preferences add constraint pro_preferences_competitions_check
  check (public.pro_competitions_valides(competitions));

comment on column public.pro_preferences.competitions is
  'Competitions preferees (cles de config/leagues.json, liste de scripts/sync-competitions-pro.js) : information seulement (matchs du jour, resultats). Vide = toutes. Les paris sont les memes pour tous.';
