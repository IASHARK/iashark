create extension if not exists pg_cron;

-- Balayage quotidien a 03:07 UTC : coupe l'acces des impayes de plus de
-- 4 jours (voir public.expire_past_due_access, migration 0011).
select cron.unschedule('expire-past-due-access')
 where exists (select 1 from cron.job where jobname = 'expire-past-due-access');

select cron.schedule(
  'expire-past-due-access',
  '7 3 * * *',
  $$select public.expire_past_due_access()$$
);
