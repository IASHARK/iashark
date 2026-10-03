-- IASHARK : messages Pro EN PRIVE, un a un (02/10/2026, decision de Clement : plus de canal Pro commun).
-- A APPLIQUER A LA MAIN apres 0040_canal_pro.sql et 0043_telegram_langues.sql (jamais applique
-- automatiquement). Sans cette migration, les envois marchent quand meme : le journal detaille
-- (statut, message) et le choix des competitions ne sont simplement pas enregistres.
--
-- 1. Journal des envois prives : public.pro_envois existe deja (une cle par envoi, posee AVANT
--    l'envoi : jamais deux fois le meme message a la meme personne ; cle « pro:<message>:<user_id> »).
--    On y ajoute, pour chaque message prive d'un abonne : qui, le resultat et l'identifiant Telegram.
alter table public.pro_envois add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.pro_envois add column if not exists statut text
  check (statut is null or statut in ('envoye', 'bloque', 'incertain'));
alter table public.pro_envois add column if not exists message_id bigint;
alter table public.pro_envois add column if not exists envoye_at timestamptz;
create index if not exists pro_envois_user_idx on public.pro_envois (user_id, created_at desc) where user_id is not null;

comment on column public.pro_envois.statut is
  'Message prive Pro : envoye ; bloque (l''abonne a bloque le robot, telegram_abonnes.bloque = true) ; incertain (reponse de Telegram illisible : jamais renvoye).';

-- 2. Competitions choisies par l'abonne (parcours d'accueil du robot ; a ajouter au questionnaire du
--    site plus tard). Vide = toutes. Codes des championnats de la regle VIP (canal-pro.mjs#COMPETITIONS).
--    Filtre seulement ses messages PERSONNELS (programme perso, alertes) quand il suit ses choix ;
--    le programme commun reste le meme pour tous.
alter table public.pro_preferences add column if not exists competitions text[] not null default '{}'
  check (competitions <@ array['F1','SP1','D1','I1','N1','P1']::text[]);

-- 3. Plus de canal Pro : la table telegram_vip_members (liens d'entree au canal, 0033) et les reglages
--    vip_chat_id / vip_chat_title de telegram_settings ne sont plus lus ni ecrits. Ils sont laisses en
--    place (aucune suppression de donnees) ; a supprimer plus tard si Clement le decide.
