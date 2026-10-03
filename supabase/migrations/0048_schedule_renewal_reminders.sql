-- IASHARK - 0048 : rappels de renouvellement par e-mail, une tache par regle
-- (audit V3 du 02/10/2026, point I7).
--
-- POURQUOI :
--   - France, formule annuelle : information avant reconduction tacite
--     obligatoire (Code de la consommation, art. L215-1 : entre 3 mois et 1 mois
--     avant l'echeance) -> rappel 45 jours avant ;
--   - Mexique : promesse des CGV mx (annuel 30 et 7 jours avant, mensuel 7 jours
--     avant, hebdomadaire 2 jours avant) ;
--   - Royaume-Uni, annuel : 30 jours avant (bonne pratique).
--   Chaque e-mail est envoye dans la langue du repertoire ou l'abonne a paye
--   (gabarit annuel en 7 langues ; rappel mensuel/hebdomadaire MX en espagnol),
--   avec le montant EXACT relu chez Stripe (send-transactional-email).
--
-- ECRITE, PAS APPLIQUEE. Ordre (Clement, ou avec son accord) :
--   1. appliquer 0024 (e-mails) et 0026 (colonnes market / billing_interval) ;
--   2. secrets Supabase RESEND_API_KEY, EMAIL_FROM, EMAIL_INTERNAL_SECRET,
--      STRIPE_SECRET_KEY, COMPANY_OPERATOR_NAME, COMPANY_ADDRESS (sinon aucun
--      envoi : « blocked_decision_placeholders ») ;
--   3. Vault : secret 'email_internal_secret' (meme valeur que EMAIL_INTERNAL_SECRET) ;
--   4. extensions pg_cron et pg_net ;
--   5. mettre en ligne send-transactional-email avec --no-verify-jwt ;
--   6. appliquer CETTE migration.
--
-- Sans danger si appliquee trop tot : fonction absente = 404 dans les journaux,
-- Resend absent = aucun envoi. Chaque tache tourne une fois par jour et ne
-- prend que les abonnements dont l'echeance tombe exactement N jours plus tard
-- (jour local du marche) ; Resend deduplique 24 h sur une cle par abonnement,
-- echeance et delai : pas de double envoi.
--
-- Pour arreter un rappel : select cron.unschedule('<nom de la tache>');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  regle record;
begin
  for regle in
    select * from (values
      ('renouvellement-fr-annuel-j45', '23 7 * * *', '{"type":"renewal_reminder_scan","market":"fr","interval":"year","daysBefore":45}'),
      ('renouvellement-gb-annuel-j30', '27 7 * * *', '{"type":"renewal_reminder_scan","market":"gb","interval":"year","daysBefore":30}'),
      ('renouvellement-mx-annuel-j30', '31 13 * * *', '{"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":30}'),
      ('renouvellement-mx-annuel-j7', '33 13 * * *', '{"type":"renewal_reminder_scan","market":"mx","interval":"year","daysBefore":7}'),
      ('renouvellement-mx-mensuel-j7', '35 13 * * *', '{"type":"renewal_reminder_scan","market":"mx","interval":"month","daysBefore":7}'),
      ('renouvellement-mx-hebdo-j2', '37 13 * * *', '{"type":"renewal_reminder_scan","market":"mx","interval":"week","daysBefore":2}')
    ) as t(nom, horaire, corps)
  loop
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = regle.nom;
    perform cron.schedule(
      regle.nom,
      regle.horaire,
      format(
        $f$select net.http_post(
            url := 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/send-transactional-email',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')
            ),
            body := %L::jsonb,
            timeout_milliseconds := 60000
          )$f$,
        regle.corps
      )
    );
  end loop;
end $$;

-- Verification (lecture seule) :
--   select jobname, schedule from cron.job where jobname like 'renouvellement-%' order by jobname;
-- Les horaires sont en UTC : 7 h 2x UTC = 9 h 2x a Paris (8 h 2x a Londres),
-- 13 h 3x UTC = 7 h 3x a Mexico.
