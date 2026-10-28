-- IASHARK - repli_coupes_blanc : CALCUL A BLANC du repli des matchs de coupe sans pari (lib/repli-forme.js,
-- demande de Clement du 28/10/2026 ; controles du meme jour : mathematicien ROUGE, trader et ingenieur donnees ORANGE).
--
-- Numero 0059 : 0058 est reserve par une autre branche.
--
-- 1. Une ligne par match et par variante (« forme », « marche ») : la decision que le repli AURAIT publiee, ecrite UNE
--    fois par le pipeline (.github/workflows/update-data.yml) avec la cle service role, par un insert « on conflict do
--    nothing » (jamais un upsert qui ecrase). RIEN n'est publie : ni data.json, ni data-home.json, ni les pages, ni
--    Telegram, ni les tickets, ni predictions_archive (config/verdicts-maths.json#repli_coupes = NO-GO).
-- 2. PREUVE « DECIDE AVANT LE MATCH » : decide_a est pose par la base (now()), la valeur envoyee est ignoree ; une ligne
--    dont le coup d'envoi est passe est REFUSEE ; l'heure du releve de la cote (cote_releve_a, captured_at du flux, jamais
--    une cote de cloture) est obligatoire et anterieure a la decision.
-- 3. GEL : une fois ecrite, seuls resultat, score_90 et regle_a changent, et une seule fois (reglement sur le score a
--    90 minutes) ; suppression refusee.
-- 4. Aucune policy, revoke pour anon et authenticated : table jamais lisible par un visiteur (RLS fermee).
--
-- NE PAS APPLIQUER sans l'accord de Clement.

create table if not exists public.repli_coupes_blanc (
  fixture_id      bigint      not null,
  voie            text        not null check (voie = 'repli_forme'),
  variante        text        not null check (variante in ('forme', 'marche')),
  league_key      text        not null,
  home            text        not null,
  away            text        not null,
  coup_envoi      timestamptz not null,
  market_id       text        not null,
  marche          text        not null,
  pari            text        not null,
  cote            numeric     not null check (cote >= 1.40),
  cote_source     text        not null check (cote_source in ('anj', 'marche')),
  bookmaker       text,
  cote_releve_a   timestamptz not null,
  chance          numeric     not null check (chance > 0 and chance < 100),
  chance_calculee numeric,
  details         jsonb       not null default '{}'::jsonb,
  regle_version   text        not null,
  pipeline_sha    text,
  decide_a        timestamptz not null default now(),
  resultat        text        check (resultat in ('gagne', 'perdu', 'annule')),
  score_90        text,
  regle_a         timestamptz,
  primary key (fixture_id, variante)
);
alter table public.repli_coupes_blanc enable row level security;
revoke all on public.repli_coupes_blanc from anon, authenticated;

-- Point 2 : heure de decision posee par la base ; refus apres le coup d'envoi ou sans heure de releve anterieure.
create or replace function public.repli_coupes_blanc_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.decide_a := now();
  new.resultat := null;
  new.score_90 := null;
  new.regle_a := null;
  if now() >= new.coup_envoi then
    raise exception 'repli_coupes_blanc : match % refuse (coup d''envoi passe)', new.fixture_id;
  end if;
  if new.cote_releve_a is null or new.cote_releve_a > now() then
    raise exception 'repli_coupes_blanc : match % refuse (heure du releve de la cote inconnue ou future)', new.fixture_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.repli_coupes_blanc_decision() from public, anon, authenticated;

drop trigger if exists repli_coupes_blanc_decision on public.repli_coupes_blanc;
create trigger repli_coupes_blanc_decision
  before insert on public.repli_coupes_blanc
  for each row execute function public.repli_coupes_blanc_decision();

-- Point 3 : gel. Seul le reglement change, une seule fois ; suppression refusee.
create or replace function public.repli_coupes_blanc_gel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'repli_coupes_blanc : decision du match % archivee, suppression refusee', old.fixture_id;
  end if;
  if old.resultat is not null then
    return old;
  end if;
  new.fixture_id := old.fixture_id; new.voie := old.voie; new.variante := old.variante; new.league_key := old.league_key;
  new.home := old.home; new.away := old.away; new.coup_envoi := old.coup_envoi;
  new.market_id := old.market_id; new.marche := old.marche; new.pari := old.pari;
  new.cote := old.cote; new.cote_source := old.cote_source; new.bookmaker := old.bookmaker; new.cote_releve_a := old.cote_releve_a;
  new.chance := old.chance; new.chance_calculee := old.chance_calculee; new.details := old.details;
  new.regle_version := old.regle_version; new.pipeline_sha := old.pipeline_sha; new.decide_a := old.decide_a;
  return new;
end;
$$;
revoke execute on function public.repli_coupes_blanc_gel() from public, anon, authenticated;

drop trigger if exists repli_coupes_blanc_gel on public.repli_coupes_blanc;
create trigger repli_coupes_blanc_gel
  before update or delete on public.repli_coupes_blanc
  for each row execute function public.repli_coupes_blanc_gel();
