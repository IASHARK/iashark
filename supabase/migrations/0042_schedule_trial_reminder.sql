-- IASHARK — tache planifiee du rappel de fin d'essai (2 jours avant la fin).
--
-- ECRITE, PAS APPLIQUEE. Ordre de mise en route (Clement, ou avec son accord) :
--   1. appliquer 0041_pro_accueil.sql (colonne trial_reminder_sent_at) ;
--   2. mettre en ligne la fonction trial-reminder ;
--   3. verifier que les secrets RESEND_API_KEY, EMAIL_FROM et
--      EMAIL_INTERNAL_SECRET existent (memes que les autres e-mails), et que
--      le secret interne est dans Vault sous le nom 'email_internal_secret'
--      (deja fait pour send-lifecycle-emails, 0024) ;
--   4. appliquer CETTE migration ;
--   5. seulement ensuite : mettre en ligne create-checkout-session,
--      stripe-webhook et sync-subscription de la branche essai-7-jours.
--      Depuis le 02/10/2026, TRIAL_DAYS absent = 7 jours
--      (create-checkout-session/trial.ts) : l'essai s'ouvre des que la
--      fonction est en ligne. Secret TRIAL_DAYS = 0 pour le recouper sans
--      redeploiement.
--
-- Sans danger si elle est appliquee trop tot : fonction absente = erreur 404
-- dans les journaux, Resend absent = aucun envoi (trial-reminder/handler.ts),
-- et aucun essai n'existe tant que create-checkout-session n'est pas en ligne.
--
-- Toutes les heures, a h + 17. La fonction ne prend que les essais dont la
-- fin tombe dans 36 a 60 heures, et n'envoie qu'une fois par abonnement.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('trial-reminder')
 where exists (select 1 from cron.job where jobname = 'trial-reminder');

select cron.schedule(
  'trial-reminder',
  '17 * * * *',
  $$select net.http_post(
      url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/trial-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )$$
);
