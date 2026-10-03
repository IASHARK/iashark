-- IASHARK : langue du robot Telegram (02/10/2026).
-- A APPLIQUER A LA MAIN apres 0040_canal_pro.sql (jamais applique automatiquement).
--
-- La langue d'un abonne est d'abord user_preferences.language (la meme que le site ;
-- /langue dans le robot l'ecrit la). Quand le compte n'a pas encore de ligne
-- user_preferences, le robot se replie sur la langue de l'application Telegram de
-- l'abonne, notee ici au moment ou il relie son compte. Sans cette colonne, le robot
-- marche quand meme (repli : francais).
alter table public.telegram_abonnes
  add column if not exists langue_telegram text
  check (langue_telegram is null or langue_telegram in ('fr','en','es','de','it','pt'));

comment on column public.telegram_abonnes.langue_telegram is
  'Langue de l''application Telegram de l''abonne (repli quand user_preferences.language est absent).';
