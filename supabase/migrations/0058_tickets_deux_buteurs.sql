-- IASHARK - tickets_du_jour : DEUX buteurs du jour, remplacement joueur par joueur.
--
-- Regle de Clement du 28/10/2026 : « ticket de buteur du jour : on en donne 2, a ne pas jouer en combine, en paris
-- simples ». Le ticket « buteur » contient desormais les champs du 1er joueur au premier niveau (inchanges, comme
-- avant) ET buteurs: [joueur 1, joueur 2] (deux matchs differents ; lib/tickets-du-jour.js#calculerDuJour). La regle
-- de Clement du 04/10/2026, 20 h (« seule exception : les buteurs, si le joueur n'est pas dans la composition »)
-- vaut pour CHACUN des deux joueurs.
--
-- Prerequis : 0050_tickets_du_jour.sql et 0051_tickets_buteur_remplacement.sql. Cette migration REMPLACE seulement la
-- fonction de gel public.tickets_du_jour_gel() (meme declencheur, meme nom) :
--
-- 1. Ancien ticket « buteur » (un seul joueur, sans buteurs) : EXACTEMENT la regle de 0051 (aucun changement).
-- 2. Ticket « buteur » a deux joueurs (old.contenu.buteurs est une liste) : un joueur ABSENT peut etre remplace, un a la
--    fois, a ces conditions (toutes) :
--      a. new.etats.remplacements = old.etats.remplacements (ou []) + UNE entree, la derniere, avec
--         motif = 'absent_composition', 'absent_annonce' ou 'hors_effectif', ancien = old.contenu (trace EXACTE) et
--         rang = place du joueur remplace dans buteurs (0 ou 1) ;
--      b. new.contenu.buteurs a la meme longueur ; seule la case « rang » change ; les autres joueurs sont identiques ;
--      c. nouveau joueur lisible : joueur (texte non vide), fixture_id, coup_envoi_ms (nombre) ; jamais le meme joueur ;
--         jamais un joueur du match d'un autre buteur du ticket (deux matchs differents) ;
--      d. son coup d'envoi est posterieur a l'heure de la base (remplacement avant SON match) ;
--      e. les champs du premier niveau sont exactement ceux de buteurs[0] (le 1er joueur, lu par les anciens ecrans) ;
--      f. premier_coup_envoi devient le plus tot des coups d'envoi des joueurs ; l'heure du remplacement est posee par
--         la base (remplace_a de la derniere entree).
--    Toute autre tentative : contenu et premier_coup_envoi remis a l'ancienne valeur (comme en 0050).
-- 3. Comme en 0051 : jour, type, regle_version, meta, publie_a et pipeline_sha ne changent jamais ; la trace des
--    remplacements ne s'efface jamais ; les autres etats (match reporte / annule, joueur retire : etats.joueur et
--    etats.buteurs) evoluent ; suppression refusee.
--
-- Sans cette migration (0051 seule), le calcul quotidien ne plante pas : 0051 ne connait qu'un joueur ; elle ACCEPTE le
-- remplacement du 1er joueur d'un ticket a deux joueurs (le premier niveau change, sa regle est remplie) mais REFUSE
-- celui du 2e (premier niveau inchange) : contenu inchange apres l'ecriture, le calcul ecrit un avertissement et
-- marque ce joueur « retire ».
-- Essai : supabase/tests/0058_tickets_deux_buteurs.test.sql (base d'essai seulement).
--
-- NE PAS APPLIQUER sans l'accord de Clement.

create or replace function public.tickets_du_jour_gel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  anciens  jsonb;
  nouveaux jsonb;
  derniere jsonb;
  ko_txt   text;
  ko       timestamptz;
  premier  timestamptz;
  valide   boolean := false;
  deux     boolean := false;
  ob       jsonb;
  nb       jsonb;
  nj       jsonb;
  rang     int;
  n        int;
  i        int;
begin
  if tg_op = 'DELETE' then
    raise exception 'tickets_du_jour : ticket % du % publie, suppression refusee', old.type, old.jour;
  end if;

  anciens := coalesce(old.etats -> 'remplacements', '[]'::jsonb);
  if jsonb_typeof(anciens) <> 'array' then anciens := '[]'::jsonb; end if;
  nouveaux := new.etats -> 'remplacements';
  -- Jamais NULL (un ancien contenu sans buteurs suit la regle de 0051).
  deux := case when coalesce(jsonb_typeof(old.contenu -> 'buteurs'), '') = 'array' then jsonb_array_length(old.contenu -> 'buteurs') > 0 else false end;

  if old.type = 'buteur'
     and new.contenu is distinct from old.contenu
     and jsonb_typeof(new.contenu) = 'object'
     and jsonb_typeof(nouveaux) = 'array'
     and jsonb_array_length(nouveaux) = jsonb_array_length(anciens) + 1
     and (nouveaux - (jsonb_array_length(nouveaux) - 1)) = anciens then
    derniere := nouveaux -> (jsonb_array_length(nouveaux) - 1);

    if not deux then
      -- 1. Ancien ticket a un joueur : regle de 0051, mot pour mot.
      ko_txt := new.contenu ->> 'coup_envoi_ms';
      if ko_txt ~ '^[0-9]+(\.[0-9]+)?$' then
        ko := to_timestamp(ko_txt::numeric / 1000.0);
      end if;
      valide := jsonb_typeof(derniere) = 'object'
        and derniere ->> 'motif' in ('absent_composition', 'absent_annonce', 'hors_effectif')
        and derniere -> 'ancien' = old.contenu
        and coalesce(btrim(new.contenu ->> 'joueur'), '') <> ''
        and new.contenu -> 'fixture_id' is not null
        and ko is not null
        and ko > now()
        and not (coalesce(new.contenu ->> 'joueur_id', '') = coalesce(old.contenu ->> 'joueur_id', '')
                 and coalesce(new.contenu ->> 'joueur', '') = coalesce(old.contenu ->> 'joueur', ''));
      premier := ko;
    else
      -- 2. Deux joueurs : seul le joueur « rang » change.
      ob := old.contenu -> 'buteurs';
      nb := new.contenu -> 'buteurs';
      n := jsonb_array_length(ob);
      if coalesce(jsonb_typeof(nb), '') <> 'array' then
        nb := '[]'::jsonb;
      end if;
      if jsonb_array_length(nb) = n
         and coalesce(jsonb_typeof(derniere), '') = 'object'
         and coalesce(derniere ->> 'rang', '') ~ '^[0-9]+$' then
        rang := (derniere ->> 'rang')::int;
        if rang < n then
          nj := nb -> rang;
          ko_txt := nj ->> 'coup_envoi_ms';
          if ko_txt ~ '^[0-9]+(\.[0-9]+)?$' then
            ko := to_timestamp(ko_txt::numeric / 1000.0);
          end if;
          valide := jsonb_typeof(nj) = 'object'
            and derniere ->> 'motif' in ('absent_composition', 'absent_annonce', 'hors_effectif')
            and derniere -> 'ancien' = old.contenu
            and coalesce(btrim(nj ->> 'joueur'), '') <> ''
            and nj -> 'fixture_id' is not null
            and ko is not null
            and ko > now()
            and not (coalesce(nj ->> 'joueur_id', '') = coalesce(ob -> rang ->> 'joueur_id', '')
                     and coalesce(nj ->> 'joueur', '') = coalesce(ob -> rang ->> 'joueur', ''))
            and (new.contenu - 'buteurs') = (nb -> 0);
          if valide then
            for i in 0 .. n - 1 loop
              if i <> rang and ((nb -> i) is distinct from (ob -> i) or (nb -> i ->> 'fixture_id') = (nj ->> 'fixture_id')) then
                valide := false;
              end if;
            end loop;
          end if;
          if valide then
            select min(to_timestamp(((e ->> 'coup_envoi_ms')::numeric) / 1000.0)) into premier
              from jsonb_array_elements(nb) e
              where (e ->> 'coup_envoi_ms') ~ '^[0-9]+(\.[0-9]+)?$';
            valide := premier is not null;
          end if;
        end if;
      end if;
    end if;
  end if;

  if valide then
    new.premier_coup_envoi := premier;
    new.etats := jsonb_set(new.etats, array['remplacements', (jsonb_array_length(nouveaux) - 1)::text, 'remplace_a'], to_jsonb(now()));
  else
    new.contenu := old.contenu;
    new.premier_coup_envoi := old.premier_coup_envoi;
    -- Trace des remplacements jamais effacee ni reecrite.
    if jsonb_array_length(anciens) > 0 then
      new.etats := jsonb_set(coalesce(new.etats, '{}'::jsonb), '{remplacements}', anciens);
    elsif new.etats ? 'remplacements' then
      new.etats := new.etats - 'remplacements';
    end if;
  end if;

  -- Toujours figes.
  new.jour := old.jour;
  new.type := old.type;
  new.regle_version := old.regle_version;
  new.meta := old.meta;
  new.publie_a := old.publie_a;
  new.pipeline_sha := old.pipeline_sha;
  return new;
end;
$$;
revoke execute on function public.tickets_du_jour_gel() from public, anon, authenticated;

-- Le declencheur de 0050 appelle deja cette fonction (before update or delete) : il est repose a l'identique pour
-- qu'une base ou il manquerait soit protegee.
drop trigger if exists tickets_du_jour_gel on public.tickets_du_jour;
create trigger tickets_du_jour_gel
  before update or delete on public.tickets_du_jour
  for each row execute function public.tickets_du_jour_gel();
