-- IASHARK - predictions_archive : preuve « publie avant le match » et verrou
-- apres le coup d'envoi (historique-public, 29/09/2026).
--
-- 1. published_at : heure de publication du pari (gel, lib/pick-freeze.js) ;
--    kickoff_at   : coup d'envoi du match. L'archive prouve seule que le pari a
--    ete publie avant le match (published_at < kickoff_at).
-- 2. VERROU : une fois le coup d'envoi passe (now() >= kickoff_at), plus rien ne
--    change sur la ligne, SAUF son resultat (result, score, resolved_date,
--    updated_at). Toute autre modification est annulee (la valeur d'origine est
--    remise) et la tentative est notee dans predictions_archive_refus. On annule
--    plutot que de refuser le lot entier : le pipeline reecrit ses lignes par lots
--    de 200, un refus bloquerait l'archivage des autres paris.
--    Une ligne ne peut plus etre supprimee apres le coup d'envoi.
-- 3. RESULTAT ECRIT UNE SEULE FOIS (contre-controle de l'avocat du diable et
--    historique-public, 30/09/2026) : le resultat passe librement de « pas encore
--    regle » (scheduled, pending) a un verdict. Une fois le pari regle (win, loss,
--    void, neutral, no_signal), le verdict, le score et la date de reglement ne
--    changent plus : un perdu ne peut plus devenir « rembourse » en silence. La
--    tentative est annulee et notee dans predictions_archive_refus.
--    Seule exception, visible de tous : corriger_resultat_archive(), qui ecrit
--    d'abord la correction et sa raison dans le journal PUBLIC
--    predictions_archive_corrections (ajout seulement), dans la meme transaction.
-- 4. HEURE POSEE PAR LA BASE (contre-controle ronde 4, 30/09/2026) : published_at
--    n'est plus declare par le pipeline (qui pouvait l'antidater). La base le pose
--    elle-meme : now() a l'ajout de la ligne, puis now() a chaque changement du pari
--    (prediction, cote, marche, probabilite) AVANT le coup d'envoi ; sinon il ne
--    bouge plus. La valeur envoyee par le pipeline est ignoree.
--    Un pari ajoute APRES son coup d'envoi garde sa vraie heure (published_at >=
--    kickoff_at : il ne prouve rien) et la tentative est notee dans
--    predictions_archive_refus. Pas de contrainte qui refuse la ligne : un refus
--    bloquerait tout le lot de 200 (arret du 09/09).
-- 5. kickoff_at ne peut plus etre remis a vide (la ligne sortirait du verrou) :
--    l'ancienne valeur est remise et la tentative notee. Un coup d'envoi deplace
--    (match reporte) reste possible avant le match, mais il est note aussi.
--    ATTENTION (ronde 4.2, 30/09/2026) : aujourd'hui le pipeline ecrit kickoff_at une
--    seule fois (a l'ajout du pari) et n'envoie jamais le nouveau coup d'envoi d'un
--    match reporte : cette note n'arrive donc pas en pratique. La ligne reste verrouillee
--    a l'heure d'origine, et le pari local ne se realigne plus apres cette heure non plus
--    (lib/pick-freeze.js#alignPendingPrediction) : base et historique gardent le meme pari.
-- Les lignes deja archivees (avant cette migration) ont kickoff_at null : elles
-- restent hors verrou. Tous les paris archives a partir de maintenant (donc tous
-- ceux du moteur v3) portent leur coup d'envoi et sont verrouilles.
-- Essai du verrou : supabase/tests/0035_predictions_archive_verrou.test.sql (a lancer
-- sur une base d'essai, jamais sur la vraie ; tout est annule a la fin).
--
-- NE PAS APPLIQUER sans l'accord de Clement.

alter table public.predictions_archive add column if not exists published_at timestamptz;
alter table public.predictions_archive add column if not exists kickoff_at timestamptz;

-- published_at est pose par la base (point 4) : plus de contrainte qui refuserait
-- une ligne (et tout son lot).
alter table public.predictions_archive drop constraint if exists predictions_archive_publie_avant_match;

create table if not exists public.predictions_archive_refus (
  id bigserial primary key,
  fixture_id bigint not null,
  operation text not null,
  avant jsonb,
  tentative jsonb,
  refuse_le timestamptz not null default now()
);
alter table public.predictions_archive_refus enable row level security;
-- Aucune policy : lecture et ecriture reservees au service role (et au trigger).

-- Journal public des corrections de resultat : lisible par tous, ajout seulement.
create table if not exists public.predictions_archive_corrections (
  id bigserial primary key,
  fixture_id bigint not null,
  ancien_result text,
  nouveau_result text not null,
  ancien_score text,
  nouveau_score text,
  raison text not null check (length(btrim(raison)) >= 10),
  corrige_le timestamptz not null default now()
);
alter table public.predictions_archive_corrections enable row level security;
drop policy if exists predictions_archive_corrections_lecture on public.predictions_archive_corrections;
create policy predictions_archive_corrections_lecture on public.predictions_archive_corrections
  for select to anon, authenticated using (true);

create or replace function public.predictions_archive_corrections_ajout_seulement()
returns trigger
language plpgsql
as $$
begin
  raise exception 'predictions_archive_corrections : journal public, ajout seulement (ni modification ni suppression)';
end;
$$;
drop trigger if exists predictions_archive_corrections_ajout_seulement on public.predictions_archive_corrections;
create trigger predictions_archive_corrections_ajout_seulement
  before update or delete on public.predictions_archive_corrections
  for each row execute function public.predictions_archive_corrections_ajout_seulement();

-- Point 4 : a l'ajout, published_at = heure de la base (jamais celle du pipeline).
create or replace function public.predictions_archive_publication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.published_at := now();
  -- Upsert du pipeline sur une ligne deja archivee : c'est une mise a jour, traitee
  -- par predictions_archive_verrou (qui garde l'heure d'origine).
  if exists (select 1 from public.predictions_archive a where a.fixture_id = new.fixture_id) then
    return new;
  end if;
  if new.kickoff_at is not null and now() >= new.kickoff_at then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (new.fixture_id, 'INSERT_APRES_COUP_D_ENVOI', null, to_jsonb(new));
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_archive_publication on public.predictions_archive;
create trigger predictions_archive_publication
  before insert on public.predictions_archive
  for each row execute function public.predictions_archive_publication();

create or replace function public.predictions_archive_verrou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  libres constant text[] := array['result', 'score', 'resolved_date', 'updated_at'];
  pas_regle constant text[] := array['scheduled', 'pending'];
  avant jsonb;
  apres jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    -- Point 4 : published_at pose par la base. Pari change avant le coup d'envoi :
    -- nouvelle heure (celle de la base) ; sinon l'heure d'origine, quoi qu'envoie le pipeline.
    if (new.prediction, new.cote, new.market, new.model_probability)
         is distinct from (old.prediction, old.cote, old.market, old.model_probability)
       and (old.kickoff_at is null or now() < old.kickoff_at) then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
    -- Point 5 : kickoff_at jamais remis a vide ; un deplacement est note.
    if old.kickoff_at is not null and new.kickoff_at is null then
      insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
        values (old.fixture_id, 'UPDATE_KICKOFF_VIDE', to_jsonb(old), to_jsonb(new));
      new.kickoff_at := old.kickoff_at;
    elsif old.kickoff_at is not null and new.kickoff_at is distinct from old.kickoff_at
          and now() < old.kickoff_at then
      insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
        values (old.fixture_id, 'KICKOFF_DEPLACE', to_jsonb(old), to_jsonb(new));
    end if;
  end if;

  if old.kickoff_at is null or now() < old.kickoff_at then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'DELETE', to_jsonb(old), null);
    raise exception 'predictions_archive : pari % verrouille (coup d''envoi passe), suppression refusee', old.fixture_id;
  end if;

  avant := to_jsonb(old);
  apres := to_jsonb(new);
  foreach k in array libres loop
    avant := avant - k;
    apres := apres - k;
  end loop;
  if avant is distinct from apres then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'UPDATE', to_jsonb(old), to_jsonb(new));
    -- On garde tout de l'ancienne ligne, sauf le resultat.
    new := jsonb_populate_record(new, avant);
  end if;

  -- Resultat deja regle : il ne change plus, sauf correction publique enregistree
  -- dans cette meme transaction (corriger_resultat_archive).
  if old.result is not null and not (old.result = any(pas_regle))
     and (new.result is distinct from old.result
          or new.score is distinct from old.score
          or new.resolved_date is distinct from old.resolved_date)
     and not exists (
       select 1 from public.predictions_archive_corrections c
       where c.fixture_id = old.fixture_id
         and c.nouveau_result = new.result
         and c.nouveau_score is not distinct from new.score
         and c.corrige_le = now()
     ) then
    insert into public.predictions_archive_refus (fixture_id, operation, avant, tentative)
      values (old.fixture_id, 'UPDATE_RESULTAT', to_jsonb(old), to_jsonb(new));
    new.result := old.result;
    new.score := old.score;
    new.resolved_date := old.resolved_date;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_archive_verrou on public.predictions_archive;
create trigger predictions_archive_verrou
  before update or delete on public.predictions_archive
  for each row execute function public.predictions_archive_verrou();

-- Correction d'un resultat deja regle (erreur de score de la source, par exemple) :
-- UNIQUEMENT par cette fonction, avec une raison, et toujours visible dans le
-- journal public. Reservee au service role (jamais au site ni aux visiteurs).
create or replace function public.corriger_resultat_archive(p_fixture_id bigint, p_result text, p_score text, p_raison text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.predictions_archive%rowtype;
begin
  if p_raison is null or length(btrim(p_raison)) < 10 then
    raise exception 'corriger_resultat_archive : raison obligatoire (10 caracteres minimum)';
  end if;
  if p_result is null or p_result not in ('win', 'loss', 'void', 'neutral', 'no_signal') then
    raise exception 'corriger_resultat_archive : verdict % invalide', p_result;
  end if;
  select * into l from public.predictions_archive where fixture_id = p_fixture_id for update;
  if not found then
    raise exception 'corriger_resultat_archive : pari % absent de l''archive', p_fixture_id;
  end if;
  insert into public.predictions_archive_corrections (fixture_id, ancien_result, nouveau_result, ancien_score, nouveau_score, raison)
    values (p_fixture_id, l.result, p_result, l.score, p_score, btrim(p_raison));
  update public.predictions_archive
    set result = p_result, score = p_score, resolved_date = coalesce(l.resolved_date, (now() at time zone 'Europe/Paris')::date)
    where fixture_id = p_fixture_id;
end;
$$;
revoke all on function public.corriger_resultat_archive(bigint, text, text, text) from public, anon, authenticated;
