-- 0054 : campagne « relance » (relance par e-mail des inscrits, 20/10/2026, decision de Clement).
-- email_sends garde la trace d'un envoi par personne (cle d'idempotence : user_id, campagne, cle).
alter table public.email_sends drop constraint if exists email_sends_campaign_check;
alter table public.email_sends add constraint email_sends_campaign_check
  check (campaign = any (array['welcome','free_match','pro_features','inactive_7d','inactive_30d','pro_weekly_summary','relance']));
