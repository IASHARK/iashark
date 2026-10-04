-- IASHARK - tickets_du_jour : remplacement du buteur du jour absent de son match.
--
-- Regle de Clement du 04/10/2026, 20 h : « Chaque decision affichee ne doit plus jamais changer,
-- qu'elle soit pour aujourd'hui ou pour demain. Seule exception : les buteurs, si le joueur n'est pas
-- dans la composition. »
--
-- Prerequis : 0050_tickets_du_jour.sql (table, declencheurs). Cette migration REMPLACE seulement la
-- fonction de gel public.tickets_du_jour_gel() (meme declencheur, meme nom) :
--
-- 1. Tout reste fige comme en 0050 : jour, type, regle_version, meta, publie_a et pipeline_sha ne
--    changent jamais ; contenu et premier_coup_envoi non plus, SAUF dans le cas 2. Suppression refusee.
-- 2. SEULE EXCEPTION : une ligne de type « buteur » dont le joueur est absent de son match (verifie
--    par le calcul, lib/buteurs-figes.js#absenceDe : pas titulaire dans la composition officielle,
--    absence annoncee par API-Football pour ce match, ou hors de l'effectif convoque d'une selection)
--    peut recevoir un nouveau joueur, a ces conditions (toutes) :
--      a. new.etats.remplacements = old.etats.remplacements (ou []) + UNE entree, la derniere, avec
--         motif = 'absent_composition', 'absent_annonce' ou 'hors_effectif' et ancien = old.contenu
--         (trace EXACTE de l'ancien joueur) ;
--      b. nouveau contenu lisible : joueur (texte non vide), fixture_id, coup_envoi_ms (nombre) ;
--         jamais le meme joueur ;
--      c. coup d'envoi du nouveau joueur posterieur a l'heure de la base (remplacement avant son
--         match) ; premier_coup_envoi devient ce coup d'envoi ;
--      d. l'heure du remplacement est posee par la base (remplace_a de la derniere entree).
--    Toute autre tentative : contenu et premier_coup_envoi remis a l'ancienne valeur (comme en 0050).
-- 3. La trace des remplacements ne s'efface jamais : hors remplacement valide, etats.remplacements
--    est remis a l'ancienne valeur (les autres etats, match reporte / annule, joueur retire,
--    continuent d'evoluer comme en 0050).
--
-- Sans cette migration, le calcul quotidien ne plante pas : il voit que le contenu n'a pas change,
-- ecrit un avertissement et marque le joueur « retire » (pas de remplacant).
-- Essai : supabase/tests/0051_tickets_buteur_remplacement.test.sql (base d'essai seulement).
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
  valide   boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'tickets_du_jour : ticket % du % publie, suppression refusee', old.type, old.jour;
  end if;

  anciens := coalesce(old.etats -> 'remplacements', '[]'::jsonb);
  if jsonb_typeof(anciens) <> 'array' then anciens := '[]'::jsonb; end if;
  nouveaux := new.etats -> 'remplacements';

  -- 2. Remplacement du buteur du jour absent de la composition officielle.
  if old.type = 'buteur'
     and new.contenu is distinct from old.contenu
     and jsonb_typeof(new.contenu) = 'object'
     and jsonb_typeof(nouveaux) = 'array'
     and jsonb_array_length(nouveaux) = jsonb_array_length(anciens) + 1
     and (nouveaux - (jsonb_array_length(nouveaux) - 1)) = anciens then
    derniere := nouveaux -> (jsonb_array_length(nouveaux) - 1);
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
  end if;

  if valide then
    new.premier_coup_envoi := ko;
    new.etats := jsonb_set(new.etats, array['remplacements', (jsonb_array_length(nouveaux) - 1)::text, 'remplace_a'], to_jsonb(now()));
  else
    new.contenu := old.contenu;
    new.premier_coup_envoi := old.premier_coup_envoi;
    -- 3. Trace des remplacements jamais effacee ni reecrite.
    if jsonb_array_length(anciens) > 0 then
      new.etats := jsonb_set(coalesce(new.etats, '{}'::jsonb), '{remplacements}', anciens);
    elsif new.etats ? 'remplacements' then
      new.etats := new.etats - 'remplacements';
    end if;
  end if;

  -- 1. Toujours figes.
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

-- Le declencheur de 0050 appelle deja cette fonction (before update or delete) : il est repose a
-- l'identique pour qu'une base ou il manquerait soit protegee.
drop trigger if exists tickets_du_jour_gel on public.tickets_du_jour;
create trigger tickets_du_jour_gel
  before update or delete on public.tickets_du_jour
  for each row execute function public.tickets_du_jour_gel();
