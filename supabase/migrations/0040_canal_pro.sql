-- IASHARK — Canal Pro et robot personnel Telegram (V3, 30/09/2026 ; MENU du Canal Pro
-- branche le 30/09 : simples, combine du jour, meme match avec buteur, tickets du week-end).
-- A APPLIQUER PLUS TARD (pas encore appliquee). Depend de 0033_telegram.sql.
-- Numero 0040 : laisse de la place aux migrations des autres branches V3
-- (pro-accueil, comparateur) ; a renumeroter a la fusion si besoin.
--
-- Qui ecrit : le robot planifie (scripts/canal-pro/tourner.mjs, cle service)
-- et l'Edge Function telegram-bot (cle service). Le navigateur (espace Pro)
-- ecrit seulement SA ligne de pro_preferences ; il lit les paris PUBLIES du
-- Canal Pro ouvert, l'etat PUBLIE du programme du jour (colonnes listees) et
-- ses propres tickets, en nommant les colonnes (jamais « select * »).
--
-- CONTRAT DES TABLES (source de verite pour les autres branches, dont l'espace
-- Pro) : CONTRAT-TABLES-PRO.md, dans le dossier « IASHARK CLAUDE CODE » a cote
-- des copies. Ce fichier-ci fait foi ; le contrat doit lui rester identique.

-- 0. Preferences de l'abonne Pro (formulaire de l'espace Pro). Une ligne par
--    abonne, ecrite par LUI (RLS), lue par le robot (cle service). Pas de ligne =
--    valeurs par defaut. UNE SEULE SOURCE : les clics de /reglages dans le robot
--    Telegram ecrivent aussi ici (cle service) ; telegram_abonnes.reglages n'est
--    plus lu (un ancien clic ne passe jamais par-dessus le site).
create table if not exists public.pro_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Seul 'fr' est ouvert (bookmakers agrees ANJ) ; les autres recoivent « pays pas encore ouvert ».
  pays text not null default 'fr' check (pays in ('fr','gb','mx','za','autre')),
  -- Cles des bookmakers agrees du pays (supabase/functions/_shared/canal-pro.mjs, BOOKMAKERS_AGREES).
  bookmakers text[] not null default '{}'
    check (cardinality(bookmakers) <= 30 and array_to_string(bookmakers, ',') ~ '^[a-z0-9_,]*$'),
  strategie text not null default 'iashark' check (strategie in ('iashark','perso')),
  -- Types du menu que l'abonne suit (strategie 'perso') : simple, combine, buteur, fun (les tickets).
  -- Les anciennes cles (sure, valeur, nuls) restent acceptees le temps que le formulaire de l'espace
  -- Pro passe aux nouvelles ; le robot les ignore.
  familles text[] not null default '{simple,combine,buteur,fun}'
    check (familles <@ array['simple','combine','buteur','fun','sure','valeur','nuls']::text[]),
  cote_min_perso numeric check (cote_min_perso is null or (cote_min_perso > 1 and cote_min_perso <= 50)),
  -- Garde-fou : nombre de paris notes par jour ; 0 = plus rien de la journee.
  limite_paris_jour int not null default 5 check (limite_paris_jour between 0 and 50),
  programme_prive boolean not null default true,
  alertes text[] not null default '{seuil,hausse,compositions,meteo}'
    check (alertes <@ array['seuil','hausse','compositions','meteo','nuit']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.pro_preferences_maj() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists pro_preferences_maj on public.pro_preferences;
create trigger pro_preferences_maj before update on public.pro_preferences
  for each row execute function public.pro_preferences_maj();

-- 1. Programme du jour : un par jour, valide par Clement avant 12 h.
create table if not exists public.pro_programmes (
  jour date primary key,
  statut text not null default 'prepare'
    check (statut in ('prepare','attente','valide','reporte','publie','annule','expire')),
  mode text check (mode in ('rodage','ouvert')),
  -- Texte public d'un jour sans pari (MOTIFS_VIDE dans canal-pro.mjs).
  motif_vide text check (motif_vide is null or motif_vide in ('regles','regles_partiel','aucun_match','controle','retires')),
  -- [{ match, famille, raison, donnees? }] ; donnees = true : ecarte faute de donnee (pas un refus des regles).
  ecartes jsonb not null default '[]'::jsonb,
  -- Matchs examines, et ceux qui n'ont pas pu etre evalues (cotes incompletes, API-Football en panne) :
  -- jamais comptes comme « ne passent pas nos regles ». Notes internes : jamais lisibles par le navigateur.
  matchs_vus int check (matchs_vus is null or matchs_vus >= 0),
  non_evalues jsonb not null default '[]'::jsonb,
  prepare_at timestamptz not null default now(),
  validation_message_id bigint,
  demande_at timestamptz,
  rappel_at timestamptz,
  valide_at timestamptz,
  annule_at timestamptz,
  publie_at timestamptz,
  canal_message_id bigint,
  updated_at timestamptz not null default now()
);

-- 2. Paris du Canal Pro. Archive : une fois publie (publie_at renseigne), plus
--    aucune retouche des champs du pari (trigger ci-dessous) ; seuls le
--    reglement et les voyants (composition, meteo) s'ajoutent.
create table if not exists public.pro_paris (
  id uuid primary key default gen_random_uuid(),
  jour date not null references public.pro_programmes(jour) on delete cascade,
  rang int not null,
  numero int unique,
  -- Menu du Canal Pro (REGLE-VIP.md) : simple, combine (du jour), buteur (meme match avec buteur),
  -- fun10, fun25 (tickets du week-end), reve (ticket 50-100 du 1er week-end du mois).
  famille text not null check (famille in ('simple','combine','buteur','fun10','fun25','reve')),
  regles text not null,
  event_id text,
  sport_key text,
  fixture_id bigint,
  ligue text,
  dom text not null,
  ext text not null,
  coup_envoi timestamptz not null,
  -- Dernier coup d'envoi du pari (= coup_envoi pour un simple ou le buteur ; le dernier match d'un
  -- combine ou d'un ticket) : le pari se regle apres lui.
  fin_coup_envoi timestamptz not null,
  marche text not null,
  ligne numeric,
  selection text not null,
  -- Combine et tickets : [{ match_id, fixture_id, event_id, sport_key, ligue, dom, ext, coup_envoi, marche,
  -- selection, proba, q_marche, cote_moy, cote (cote prise chez meilleur_bookmaker, a la publication) }].
  -- Buteur : [{ type: 'buteur', equipe, cote_equipe, joueur, joueur_id, p_joueur, p_gagne, p_grille, modele }].
  selections jsonb not null default '[]'::jsonb,
  -- Chance calculee par IASHARK et affichee (moteur v3 ; buteur : arrondie vers le bas a 5 points, 45 % au plus).
  proba numeric not null check (proba > 0 and proba < 1),
  source_proba text,
  -- Plus jamais affichee (decision de Clement) : reste vide pour le menu.
  cote_min numeric check (cote_min is null or cote_min > 1),
  -- Cote prise (meilleure cote relevee chez les agrees suivis a la publication) ; vide pour le buteur
  -- (pas de cote buteur : « sans preuve »).
  meilleure_cote numeric check (meilleure_cote is null or meilleure_cote > 1),
  meilleur_bookmaker text,
  cotes jsonb not null default '{}'::jsonb,
  cote_vue_at timestamptz,
  explication text not null,
  composantes jsonb not null default '{}'::jsonb,
  retire boolean not null default false,
  -- publication : mode (rodage = chez Clement seul, jamais de numero PRO) et
  -- destination (canal) enregistres pour chaque pari ; publie_at est pose par
  -- la BASE (trigger), canal_message_id prouve l'envoi reel.
  mode text check (mode in ('rodage','ouvert')),
  destination text,
  publie_at timestamptz,
  canal_message_id bigint,
  envoye_at timestamptz,
  envoi_echec_at timestamptz,
  -- Ecrit AVANT chaque envoi, remis a vide si Telegram refuse. Rempli sans canal_message_id au tour
  -- suivant = envoi incertain : jamais renvoye tout seul (pas de doublon), Clement verifie.
  envoi_tente_at timestamptz,
  empreinte text,
  empreinte_precedente text,
  -- apres publication
  compo_voyant text,
  compo_at timestamptz,
  meteo text,
  meteo_at timestamptz,
  score_dom int,
  score_ext int,
  resultat text check (resultat in ('gagne','perdu','rembourse','moitie_gagne','moitie_perdu','retire','annule')),
  cote_fin numeric,
  pinnacle_cote_fin numeric,
  pinnacle_proba_fin numeric,
  -- Heure du releve Pinnacle retenu : un releve de plus de 30 min avant le match ne compte pas dans la CLV.
  pinnacle_fin_at timestamptz,
  faits jsonb,
  regle_at timestamptz,
  debrief text,
  created_at timestamptz not null default now(),
  unique (jour, rang),
  check (fin_coup_envoi >= coup_envoi),
  check (famille = 'buteur' or (meilleure_cote is not null and meilleur_bookmaker is not null and cote_vue_at is not null)),
  check (publie_at is null or publie_at < coup_envoi),
  check (numero is null or mode = 'ouvert')
);
create index if not exists pro_paris_coup_envoi_idx on public.pro_paris (coup_envoi);
create index if not exists pro_paris_fin_coup_envoi_idx on public.pro_paris (fin_coup_envoi);
create index if not exists pro_paris_publie_idx on public.pro_paris (publie_at) where publie_at is not null;

-- publie_at : pose par la base (a la milliseconde), jamais par le script.
-- Heure limite (70 min avant le coup d'envoi, avant les compositions ; PREUVE_LIMITE_MIN dans
-- canal-pro.mjs), SANS EXCEPTION, meme avec la cle de service, a l'insertion comme a la mise a jour :
--  - aucun pari n'est archive (publie_at) apres l'heure limite ;
--  - aucune preuve d'envoi (canal_message_id) n'est ecrite apres l'heure limite, pari archive ou non.
-- Sinon, en connaissant les compositions, on pourrait choisir quels paris comptent (contre-controle
-- ronde 4.1, sim8-preuve-tardive : archivage + preuve dans la meme commande, ou insertion d'un pari
-- deja prouve). Heure de reference : la plus tot des deux (ancienne et nouvelle) si coup_envoi change
-- dans la meme commande. Le robot n'envoie plus rien 75 min avant le match.
create or replace function public.pro_paris_heure_publication() returns trigger
language plpgsql as $$
declare
  ko timestamptz := new.coup_envoi;
begin
  if tg_op = 'UPDATE' then ko := least(old.coup_envoi, new.coup_envoi); end if;
  if (tg_op = 'INSERT' and new.publie_at is not null)
     or (tg_op = 'UPDATE' and old.publie_at is null and new.publie_at is not null) then
    if now() >= ko - interval '70 minutes' then
      raise exception 'pro_paris : archivage refuse apres l''heure limite, 70 min avant le coup d''envoi (numero %)', new.numero;
    end if;
    new.publie_at := date_trunc('milliseconds', now());
  end if;
  if new.canal_message_id is not null and (tg_op = 'INSERT' or old.canal_message_id is null)
     and now() >= ko - interval '70 minutes' then
    raise exception 'pro_paris : preuve d''envoi refusee apres l''heure limite, 70 min avant le coup d''envoi (numero %)', new.numero;
  end if;
  return new;
end $$;
drop trigger if exists pro_paris_heure_publication on public.pro_paris;
create trigger pro_paris_heure_publication before insert or update on public.pro_paris
  for each row execute function public.pro_paris_heure_publication();

-- Archive figee : une fois publie, les champs du pari ne changent plus ; les
-- champs de suivi ne passent qu'une fois de « vide » a « valeur ».
create or replace function public.pro_paris_archive_figee() returns trigger
language plpgsql as $$
declare
  figes text[] := array['numero','jour','famille','regles','event_id','sport_key','fixture_id','ligue','dom','ext','coup_envoi',
    'fin_coup_envoi','marche','ligne','selection','selections','proba','source_proba','cote_min','meilleure_cote','meilleur_bookmaker','cotes','composantes',
    'cote_vue_at','explication','retire','mode','destination','publie_at'];
  une_fois text[] := array['empreinte','empreinte_precedente','canal_message_id','envoye_at','envoi_echec_at','compo_voyant','compo_at',
    'meteo','meteo_at','score_dom','score_ext','resultat','cote_fin','pinnacle_cote_fin','pinnacle_proba_fin','pinnacle_fin_at','faits','regle_at','debrief'];
  c text; a jsonb := to_jsonb(old); b jsonb := to_jsonb(new);
begin
  if old.publie_at is null then return new; end if;
  foreach c in array figes loop
    if (a -> c) is distinct from (b -> c) then
      raise exception 'pro_paris : pari publie, archive figee (numero %, champ %)', old.numero, c;
    end if;
  end loop;
  foreach c in array une_fois loop
    if (a -> c) is not null and (a -> c) <> 'null'::jsonb and (a -> c) is distinct from (b -> c) then
      raise exception 'pro_paris : champ % deja renseigne (numero %), il ne change plus', c, old.numero;
    end if;
  end loop;
  -- Preuve d'envoi : seulement AVANT l'heure limite, 70 min avant le coup d'envoi (avant les
  -- compositions ; PREUVE_LIMITE_MIN dans canal-pro.mjs). Sinon, en connaissant les compositions, le
  -- mouvement des cotes ou le resultat, on pourrait choisir quels paris comptent. Aucune exception,
  -- meme pour la cle de service (envoye_at peut etre ecrit par n'importe qui) : le robot n'envoie
  -- plus rien 75 min avant le match, et ecrit la preuve dans les secondes qui suivent l'envoi.
  -- (Meme regle, et celle de l'archivage, pour TOUS les chemins : pro_paris_heure_publication.)
  if old.canal_message_id is null and new.canal_message_id is not null and now() >= old.coup_envoi - interval '70 minutes' then
    raise exception 'pro_paris : preuve d''envoi refusee apres l''heure limite, 70 min avant le coup d''envoi (numero %)', old.numero;
  end if;
  return new;
end $$;
drop trigger if exists pro_paris_archive_figee on public.pro_paris;
create trigger pro_paris_archive_figee before update on public.pro_paris
  for each row execute function public.pro_paris_archive_figee();
create or replace function public.pro_paris_pas_de_suppression() returns trigger
language plpgsql as $$
begin
  if old.publie_at is not null then raise exception 'pro_paris : pari publie, suppression interdite'; end if;
  return old;
end $$;
drop trigger if exists pro_paris_pas_de_suppression on public.pro_paris;
create trigger pro_paris_pas_de_suppression before delete on public.pro_paris
  for each row execute function public.pro_paris_pas_de_suppression();

-- 3. Releves de cotes des paris publies (guetteur de cotes). Le comparateur
--    (branche comparateur) peut ecrire ici aussi : meme format.
-- Une ligne 'pinnacle' par releve garde aussi la chance sans marge de Pinnacle
-- (proba_sans_marge) : c'est la matiere de la CLV (critere des regles figees).
-- Ajout seulement : ni modification, ni suppression (source de la cote de fin).
create table if not exists public.pro_cotes_releves (
  id bigserial primary key,
  pari_id uuid not null references public.pro_paris(id) on delete restrict,
  -- Selection (0, 1, 2…) d'un combine ou d'un ticket ; vide pour un simple.
  jambe smallint check (jambe is null or jambe >= 0),
  bookmaker text not null,
  cote numeric not null check (cote > 1),
  proba_sans_marge numeric check (proba_sans_marge is null or (proba_sans_marge > 0 and proba_sans_marge < 1)),
  releve_at timestamptz not null default now()
);
create index if not exists pro_cotes_releves_pari_idx on public.pro_cotes_releves (pari_id, releve_at desc);
create or replace function public.ajout_seulement() returns trigger
language plpgsql as $$
begin
  raise exception '% : ajout seulement, aucune modification ni suppression', tg_table_name;
end $$;
drop trigger if exists pro_cotes_releves_ajout_seulement on public.pro_cotes_releves;
create trigger pro_cotes_releves_ajout_seulement before update or delete on public.pro_cotes_releves
  for each row execute function public.ajout_seulement();

-- 3 bis. Sortie du jour du moteur v3 (contrat 1.1), reduite aux 6 championnats du menu. Deposee
--    chaque matin par le workflow « Update IASHARK Daily » (scripts/canal-pro/deposer-sortie-v3.mjs),
--    lue par le robot du Canal Pro. PRIVEE : cle de service seulement (aucune lecture du navigateur).
create table if not exists public.moteur_v3_sorties (
  genere_le timestamptz primary key,
  moteur_version text not null,
  contrat_version text not null,
  sortie jsonb not null,
  depose_at timestamptz not null default now()
);

-- 4. Memoire des envois (un message = une cle unique : jamais deux fois).
create table if not exists public.pro_envois (
  cle text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

-- 5. Abonnes relies au robot personnel.
create table if not exists public.telegram_abonnes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_liaison text unique,
  code_cree_at timestamptz,
  chat_id bigint unique,
  prenom text,
  lie_at timestamptz,
  reglages jsonb not null default '{}'::jsonb,
  bloque boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 6. Tickets notes par l'abonne (texte, photo, cote du tabac).
create table if not exists public.pro_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  jour date not null,
  source text not null check (source in ('texte','photo')),
  texte text,
  pari_id uuid references public.pro_paris(id) on delete set null,
  match_label text,
  selection text,
  cote numeric check (cote > 1 and cote < 1000),
  mise numeric check (mise > 0),
  bookmaker text,
  combine boolean not null default false,
  statut text not null default 'a_confirmer' check (statut in ('a_confirmer','note','annule')),
  decision_id uuid references public.betting_decisions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pro_tickets_user_jour_idx on public.pro_tickets (user_id, jour);

-- 7. Duel « la foule contre l'IA » (canal gratuit).
create table if not exists public.duel_manches (
  jour date primary key,
  fixture_id bigint,
  dom text not null,
  ext text not null,
  competition text,
  coup_envoi timestamptz not null,
  choix_ia text not null check (choix_ia in ('1','N','2')),
  sel text not null,
  empreinte text not null,
  statut text not null default 'propose' check (statut in ('propose','ouvert','revele','regle','refuse')),
  message_id bigint,
  chat_id text,
  resultat text check (resultat in ('1','N','2')),
  score text,
  created_at timestamptz not null default now()
);
-- Duel : le choix scelle ne change jamais ; le resultat passe une fois de vide a valeur.
create or replace function public.duel_manches_scelle() returns trigger
language plpgsql as $$
begin
  if new.choix_ia is distinct from old.choix_ia or new.sel is distinct from old.sel or new.empreinte is distinct from old.empreinte
     or new.dom is distinct from old.dom or new.ext is distinct from old.ext or new.coup_envoi is distinct from old.coup_envoi
     or new.fixture_id is distinct from old.fixture_id
     or (old.resultat is not null and new.resultat is distinct from old.resultat) then
    raise exception 'duel_manches : choix scelle, il ne change pas (jour %)', old.jour;
  end if;
  return new;
end $$;
drop trigger if exists duel_manches_scelle on public.duel_manches;
create trigger duel_manches_scelle before update on public.duel_manches
  for each row execute function public.duel_manches_scelle();

create table if not exists public.duel_votes (
  jour date not null references public.duel_manches(jour) on delete cascade,
  telegram_user_id bigint not null,
  prenom text,
  username text,
  choix text not null check (choix in ('1','N','2')),
  vote_at timestamptz not null default now(),
  primary key (jour, telegram_user_id)
);

-- 8. Loto Foot : grilles relevees (liste des matchs avec leur numero FDJ,
--    cotes, repartition des joueurs, heure de cloture, heure du releve).
create table if not exists public.loto_foot_grilles (
  id text primary key,
  nom text not null,
  premier_match_at timestamptz not null,
  cloture_at timestamptz,
  matchs jsonb not null,
  cagnotte_eur numeric,
  source text,
  releve_at timestamptz not null default now()
);

alter table public.pro_preferences enable row level security;
alter table public.pro_programmes enable row level security;
alter table public.pro_paris enable row level security;
alter table public.pro_cotes_releves enable row level security;
alter table public.pro_envois enable row level security;
alter table public.telegram_abonnes enable row level security;
alter table public.pro_tickets enable row level security;
alter table public.duel_manches enable row level security;
alter table public.duel_votes enable row level security;
alter table public.loto_foot_grilles enable row level security;
alter table public.moteur_v3_sorties enable row level security;

-- Espace Pro (navigateur) :
--  - pro_preferences : l'abonne Pro lit et ecrit SA ligne (un compte gratuit ne peut rien y ecrire) ;
--  - pro_paris : un abonne Pro lit les paris PUBLIES ET ENVOYES du Canal Pro ouvert (jamais le rodage),
--    colonnes de l'archive et du reglement seulement ;
--  - pro_programmes : un abonne Pro lit l'etat PUBLIE du programme (jour, statut, mode, motif du jour
--    sans pari, heure), jamais les notes internes (ecartes, non_evalues) ;
--  - pro_tickets : ses propres tickets.
-- Rien d'autre depuis le navigateur (releves de cotes, Loto Foot, duel : robot seulement).
drop policy if exists pro_preferences_lecture_soi on public.pro_preferences;
drop policy if exists pro_preferences_ajout_soi on public.pro_preferences;
drop policy if exists pro_preferences_modif_soi on public.pro_preferences;
drop policy if exists pro_preferences_suppression_soi on public.pro_preferences;
create policy pro_preferences_lecture_soi on public.pro_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy pro_preferences_ajout_soi on public.pro_preferences for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.plan in ('pro','famille') or u.role = 'admin')));
create policy pro_preferences_modif_soi on public.pro_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.plan in ('pro','famille') or u.role = 'admin')));
create policy pro_preferences_suppression_soi on public.pro_preferences for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists pro_paris_lecture_pro on public.pro_paris;
create policy pro_paris_lecture_pro on public.pro_paris for select to authenticated using (
  publie_at is not null and mode = 'ouvert' and canal_message_id is not null
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.plan in ('pro','famille') or u.role = 'admin'))
);
drop policy if exists pro_programmes_lecture_pro on public.pro_programmes;
create policy pro_programmes_lecture_pro on public.pro_programmes for select to authenticated using (
  statut = 'publie' and mode = 'ouvert'
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and (u.plan in ('pro','famille') or u.role = 'admin'))
);
drop policy if exists pro_tickets_lecture_soi on public.pro_tickets;
create policy pro_tickets_lecture_soi on public.pro_tickets for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pro_preferences, public.pro_programmes, public.pro_paris, public.pro_cotes_releves, public.pro_envois, public.telegram_abonnes,
  public.pro_tickets, public.duel_manches, public.duel_votes, public.loto_foot_grilles, public.moteur_v3_sorties from anon, authenticated;
grant select, insert, update, delete on public.pro_preferences to authenticated;
-- (toutes les colonnes de l'empreinte y sont : chacun peut recalculer la chaine, CHAMPS_ARCHIVE)
grant select (id, numero, jour, famille, regles, event_id, fixture_id, ligue, dom, ext, coup_envoi, fin_coup_envoi, marche, ligne, selection, selections, proba, source_proba,
  cote_min, meilleure_cote, meilleur_bookmaker, cotes, cote_vue_at, explication, publie_at, empreinte, empreinte_precedente,
  compo_voyant, meteo, score_dom, score_ext, resultat, cote_fin, regle_at) on public.pro_paris to authenticated;
grant select (jour, statut, mode, motif_vide, publie_at) on public.pro_programmes to authenticated;
grant select on public.pro_tickets to authenticated;
