-- IASHARK : heure d'envoi choisie pour TOUS les messages Pro prives (02/10/2026).
-- A APPLIQUER A LA MAIN apres 0045_pro_messages_prives.sql (jamais applique automatiquement).
-- Sans cette migration, tout marche quand meme : seule la note « differe » du journal n'est pas
-- enregistree (la cle d'envoi, elle, est bien posee : jamais de doublon).
--
-- Un abonne qui a choisi une heure (pro_preferences.heure_envoi, 0044) ne recoit pas le programme
-- du jour avant elle : sa cle d'envoi (pro_envois, « pro:<message>:<user_id> ») est posee avec le
-- statut « differe » (jamais envoye tel quel), puis le robot lui envoie le programme commun a son
-- heure, une seule fois, sans les matchs deja commences (supabase/functions/_shared/canal-pro-diffusion.mjs).
alter table public.pro_envois drop constraint if exists pro_envois_statut_check;
alter table public.pro_envois add constraint pro_envois_statut_check
  check (statut is null or statut in ('envoye', 'bloque', 'incertain', 'differe'));

comment on column public.pro_envois.statut is
  'Message prive Pro : envoye ; bloque (l''abonne a bloque le robot, telegram_abonnes.bloque = true) ; incertain (reponse de Telegram illisible : jamais renvoye) ; differe (retenu jusqu''a l''heure d''envoi choisie : le programme commun lui est envoye a son heure, sans les matchs commences).';
