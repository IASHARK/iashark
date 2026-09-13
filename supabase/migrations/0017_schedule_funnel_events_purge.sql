create extension if not exists pg_cron;

-- Purge automatique des donnees de visite (funnel_events) de plus de 13 mois,
-- conformement a la duree annoncee dans les pages cookies / confidentialite.
-- Chaque lundi a 03:17 UTC, via public.purge_old_funnel_events() (migration
-- 0015_admin_analytics).
select cron.unschedule('purge-old-funnel-events')
 where exists (select 1 from cron.job where jobname = 'purge-old-funnel-events');

select cron.schedule(
  'purge-old-funnel-events',
  '17 3 * * 1',
  $$select public.purge_old_funnel_events()$$
);
