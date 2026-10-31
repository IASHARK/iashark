-- 0061 : envoi automatique de l'e-mail « semaine Pro offerte » le samedi 31/10/2026 a 9 h, heure de
-- Paris (08:00 UTC), demande de Clement. Meme circuit que 0057 (relance du 28/10).
--
-- A APPLIQUER SEULEMENT APRES la validation de l'apercu par Clement ET la fusion de la PR (la fusion
-- reinstalle la fonction relance-emails depuis main). Tant que cette migration n'est pas appliquee,
-- rien n'est programme : aucun declencheur GitHub ne remplace cette tache.
--
-- Securite (comme 0057) :
-- - le jeton est tire au hasard ICI (jamais ecrit dans le depot public), garde dans relance_planifiee
--   (RLS sans regle, droits retires) ; la fonction relance-emails le relit avec sa cle service et ne
--   l'accepte QUE pour { mode: "envoi", planifie: true } ;
-- - la fonction refuse un envoi planifie un autre jour que le 31/10/2026, apres 15:00 UTC, ou si la
--   PR n'est pas fusionnee (fonction de main d'une autre campagne) ;
-- - une personne n'est servie qu'une fois (email_reserve_send, cle « semaine-offerte-31-10 ») ;
-- - la cle « anon » ci-dessous est la cle publique du site (deja dans auth-header.js) : elle ne
--   donne aucun droit, elle passe seulement la verification de jeton de la passerelle Supabase.
-- Annuler l'envoi : select cron.unschedule('semaine-offerte-2026-10-31');

create extension if not exists pg_net;

-- Ancienne tache du 28/10 : terminee, retiree (elle reviendrait chaque annee le 28/10).
select cron.unschedule('relance-2026-10-28')
 where exists (select 1 from cron.job where jobname = 'relance-2026-10-28');

insert into public.relance_planifiee (cle, jeton)
values ('2026-10-31', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (cle) do nothing;

select cron.unschedule('semaine-offerte-2026-10-31')
 where exists (select 1 from cron.job where jobname = 'semaine-offerte-2026-10-31');

select cron.schedule(
  'semaine-offerte-2026-10-31',
  '0 8 31 10 *',
  $job$
  select net.http_post(
    url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/relance-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8',
      'x-region', 'us-east-2',
      'x-relance-jeton', (select jeton from public.relance_planifiee where cle = '2026-10-31')
    ),
    body := jsonb_build_object('mode', 'envoi', 'confirmation', 'ENVOYER LA RELANCE', 'planifie', true),
    timeout_milliseconds := 300000
  )
  where (now() at time zone 'utc')::date = date '2026-10-31';
  $job$
);
