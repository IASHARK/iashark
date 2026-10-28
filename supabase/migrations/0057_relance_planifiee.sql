-- 0057 : envoi automatique de la relance e-mail du mercredi 28/10/2026 a 11 h, heure de Paris
-- (10:00 UTC), demande de Clement.
--
-- Pourquoi dans la base : les taches planifiees GitHub de ce depot partent avec 3 a 6 h de retard
-- (constate le 27/10 : « toutes les 30 min » lance en realite toutes les 4 a 6 h). pg_cron part a
-- l'heure exacte. Le workflow relance-emails.yml garde un declencheur GitHub de secours.
--
-- Securite :
-- - le jeton est tire au hasard ICI (jamais ecrit dans le depot public), garde dans une table sans
--   aucun acces pour les visiteurs (RLS sans regle, droits retires) ; la fonction relance-emails le
--   relit avec sa cle service et ne l'accepte QUE pour { mode: "envoi", planifie: true } ;
-- - la fonction refuse un envoi planifie un autre jour que le 28/10/2026, apres 15:00 UTC, ou si la
--   PR n'est pas fusionnee (banniere absente du site et de main) : la fusion reste le feu vert ;
-- - une personne n'est servie qu'une fois (email_reserve_send) ;
-- - la cle « anon » ci-dessous est la cle publique du site (deja dans auth-header.js) : elle ne
--   donne aucun droit, elle passe seulement la verification de jeton de la passerelle Supabase.
-- Annuler l'envoi : select cron.unschedule('relance-2026-10-28');

create extension if not exists pg_net;

create table if not exists public.relance_planifiee (
  cle text primary key,
  jeton text not null,
  cree_le timestamptz not null default now()
);
alter table public.relance_planifiee enable row level security;
revoke all on public.relance_planifiee from anon, authenticated;

insert into public.relance_planifiee (cle, jeton)
values ('2026-10-28', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (cle) do nothing;

select cron.unschedule('relance-2026-10-28')
 where exists (select 1 from cron.job where jobname = 'relance-2026-10-28');

select cron.schedule(
  'relance-2026-10-28',
  '0 10 28 10 *',
  $job$
  select net.http_post(
    url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/relance-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8',
      'x-region', 'us-east-2',
      'x-relance-jeton', (select jeton from public.relance_planifiee where cle = '2026-10-28')
    ),
    body := jsonb_build_object('mode', 'envoi', 'confirmation', 'ENVOYER LA RELANCE', 'planifie', true),
    timeout_milliseconds := 300000
  )
  where (now() at time zone 'utc')::date = date '2026-10-28';
  $job$
);
