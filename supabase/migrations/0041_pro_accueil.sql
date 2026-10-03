-- IASHARK — espace Pro (V3) : journal de paris du tableau de bord, essai de
-- 7 jours.
--
-- ECRITE, PAS APPLIQUEE. A appliquer par Clement (ou avec son accord) apres
-- relecture. Idempotente (if not exists / drop ... if exists) : peut etre
-- relancee.
--
-- NUMERO 0041 (30/09/2026) : l'ancienne 0033_pro_accueil.sql portait le meme
-- numero que 0033_telegram.sql (branche telegram-canal) et 0033_odds_compare.sql
-- (branche comparateur). Numeros deja pris dans les copies : 0033, 0034, 0035,
-- 0040. Cette migration vient APRES 0040_canal_pro.sql, dont elle depend.
--
-- CONTRAT DES TABLES PRO (source de verite : 0040_canal_pro.sql, branche
-- canal-pro). L'espace Pro n'a PLUS de tables a lui :
--   - preferences de l'abonne  -> public.pro_preferences (0040), ecrite par
--     l'abonne Pro sur SA ligne, lue par le robot Telegram ;
--   - programme du jour        -> public.pro_programmes + public.pro_paris
--     (0040), ecrits par le robot du Canal Pro, lus par l'abonne Pro une fois
--     publies et envoyes ;
--   - tickets notes au robot   -> public.pro_tickets (0040).
-- Les anciennes tables preferences_pro, alertes_pro et contenus_pro (premier
-- jet de 0033) sont ABANDONNEES : personne ne les aurait remplies.
--
-- Ce que fait cette migration :
--   1. public.betting_decisions (journal existant, 0010) : colonnes du
--      tableau de bord (source du pari, bookmaker, famille, reference du pari
--      publie). Le journal devient accessible aux comptes gratuits (decision
--      du 29/09 : le tableau de bord gratuit contient « son journal de
--      paris »), toujours ligne a ligne. estimated_probability n'a plus
--      qu'un sens, pose par la base : 100 / cote (declencheur
--      betting_decisions_proba_de_la_cote).
--   2. public.subscriptions : trial_reminder_sent_at (rappel 2 jours avant la
--      fin de l'essai, envoye une seule fois). La tache planifiee est dans
--      0042_schedule_trial_reminder.sql.
--
-- Rien ici n'expose le bilan public d'IASHARK : le tableau de bord ne montre
-- que les paris de l'abonne (regle du 29/09 : bilan public seulement apres
-- les tests, tire de l'archive verifiee).

-- ---------------------------------------------------------------------------
-- 1. Journal de paris (betting_decisions, 0010)
-- ---------------------------------------------------------------------------
-- source : 'site' = note a la main sur le site ; 'programme' = note depuis un
-- pari publie du Canal Pro (bouton « J'ai joue ») ; 'robot' = ligne ecrite
-- par le robot Telegram (telegram-bot, cle de service) pour un ticket avec
-- mise (contre-controle, ronde 4.2 : sans ce mot, la base refuserait la
-- ligne du robot le jour ou il l'ecrit ; libelle pro_space.source_robot deja
-- present dans les 7 langues). Tant que le robot ecrit sans source, sa ligne
-- prend 'site' par defaut ; le site la reconnait quand meme (ticket relie :
-- pro_tickets.decision_id) et l'affiche « robot ». L'abonne regle lui-meme
-- le resultat, comme pour un pari note a la main. Seul le robot (cle de
-- service) ecrit 'robot' : la politique d'ajout ci-dessous le refuse a
-- l'abonne.
alter table public.betting_decisions add column if not exists source text not null default 'site';
alter table public.betting_decisions drop constraint if exists betting_decisions_source_check;
alter table public.betting_decisions add constraint betting_decisions_source_check
  check (source in ('site', 'programme', 'robot'));
-- Cle du bookmaker (meme cle que pro_preferences.bookmakers et pro_paris.cotes).
alter table public.betting_decisions add column if not exists bookmaker text
  check (bookmaker is null or bookmaker ~ '^[a-z0-9_]{1,40}$');
-- Familles du contrat (pro_paris.famille, 0040) + 'perso' (pari hors programme).
alter table public.betting_decisions add column if not exists famille text
  check (famille is null or famille in ('sure', 'valeur', 'nuls', 'perso'));
-- Numero du pari publie dans le Canal Pro (« PRO-114 »), s'il en vient.
alter table public.betting_decisions add column if not exists programme_ref text
  check (programme_ref is null or programme_ref ~ '^PRO-[0-9]{1,9}$');

create index if not exists betting_decisions_user_kickoff_idx
  on public.betting_decisions (user_id, kickoff_at desc);

-- estimated_probability (0010, obligatoire) : UN SEUL sens (contre-controle,
-- ronde 4, 30/09). Avant : le site y mettait 100 / cote (marge du bookmaker
-- comprise), le robot Telegram la chance Pinnacle du pari publie. Desormais
-- la BASE pose elle-meme la chance implicite de la cote notee :
--   estimated_probability = 100 / odds, en %, arrondie au dixieme, entre 1 et 99
-- (meme calcul que lib/pro-dashboard-model.js#probaDeLaCote), quel que soit
-- celui qui ecrit (site ou robot) : aucune ligne n'est refusee, la valeur
-- envoyee est remplacee. Ce n'est PAS une probabilite du modele : jamais pour
-- la calibration, la valeur de cloture ni l'avantage du modele. La chance du
-- pari publie reste dans pro_paris.proba (reliee par pro_tickets.pari_id ou
-- betting_decisions.programme_ref). Lignes d'avant cette migration : non
-- recalculees (rien d'efface) ; leur valeur n'a pas de sens garanti.
-- Retour arriere : drop trigger betting_decisions_proba_de_la_cote.
create or replace function public.betting_decisions_proba_de_la_cote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.odds is not null and new.odds > 0 then
    new.estimated_probability := least(99, greatest(1, round(1000 / new.odds) / 10));
  end if;
  return new;
end;
$$;
drop trigger if exists betting_decisions_proba_de_la_cote on public.betting_decisions;
create trigger betting_decisions_proba_de_la_cote
  before insert or update of odds, estimated_probability on public.betting_decisions
  for each row execute function public.betting_decisions_proba_de_la_cote();

-- Journal pour tous les comptes connectes (gratuit compris), toujours
-- limite a SES lignes. Les anciennes politiques « _pro » sont remplacees.
drop policy if exists betting_decisions_insert_pro on public.betting_decisions;
drop policy if exists betting_decisions_update_pro on public.betting_decisions;
drop policy if exists betting_decisions_delete_pro on public.betting_decisions;
drop policy if exists betting_decisions_insert_own on public.betting_decisions;
drop policy if exists betting_decisions_update_own on public.betting_decisions;
drop policy if exists betting_decisions_delete_own on public.betting_decisions;
-- L'abonne ajoute SES lignes, avec la source 'site' ou 'programme' (jamais
-- 'robot', reservee au robot Telegram, qui ecrit avec la cle de service).
create policy betting_decisions_insert_own on public.betting_decisions
  for insert to authenticated with check (source in ('site', 'programme') and (select auth.uid()) = user_id);
create policy betting_decisions_update_own on public.betting_decisions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy betting_decisions_delete_own on public.betting_decisions
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Colonnes que l'abonne peut ecrire (nommees une a une). La source et la
-- reference du pari publie ne changent plus apres l'ajout.
revoke insert, update on public.betting_decisions from authenticated;
grant insert (user_id, fixture_id, match_label, market, odds, estimated_probability, stake, status, result_pnl, kickoff_at, source, bookmaker, famille, programme_ref)
  on public.betting_decisions to authenticated;
grant update (match_label, market, odds, estimated_probability, stake, status, result_pnl, kickoff_at, bookmaker, famille)
  on public.betting_decisions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Essai de 7 jours : rappel envoye une seule fois
-- ---------------------------------------------------------------------------
alter table public.subscriptions add column if not exists trial_reminder_sent_at timestamptz;
create index if not exists subscriptions_trial_scan_idx
  on public.subscriptions (current_period_end)
  where status = 'trialing' and trial_reminder_sent_at is null;
