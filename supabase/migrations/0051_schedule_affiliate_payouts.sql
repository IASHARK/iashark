-- IASHARK — tache planifiee du versement mensuel des commissions partenaires.
--
-- ECRITE, PAS APPLIQUEE. Ordre de mise en route (Clement, ou avec son accord) :
--   1. appliquer 0050_affiliation.sql ;
--   2. mettre en ligne les fonctions affiliate-payouts, affiliate-connect,
--      stripe-webhook et create-checkout-session de la branche affiliation ;
--   3. verifier que le secret interne est dans Vault sous le nom
--      'email_internal_secret' (deja fait pour send-lifecycle-emails, 0024 ;
--      c'est le meme secret EMAIL_INTERNAL_SECRET des fonctions) ;
--   4. appliquer CETTE migration.
--
-- Sans danger si elle est appliquee trop tot : fonction absente = erreur 404
-- dans les journaux ; sans AFFILIATE_CONNECT=on, la fonction ne vire rien et
-- se contente de faire murir les commissions (mode manuel : export CSV et
-- bouton « Marquer paye » dans admin.html).
--
-- Le 5 de chaque mois a 09:00 UTC : commissions payables (30 jours passes)
-- des affilies valides, seuil 50 par devise, un virement Stripe Connect par
-- affilie et par devise.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('affiliate-payouts')
 where exists (select 1 from cron.job where jobname = 'affiliate-payouts');

select cron.schedule(
  'affiliate-payouts',
  '0 9 5 * *',
  $$select net.http_post(
      url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/affiliate-payouts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )$$
);
