-- IASHARK — Tolerance impaye de 4 jours (decision produit explicite du
-- 02/09/2026), complement des fonctions Edge stripe-webhook et
-- sync-subscription.
--
-- Regle : quand le prelevement du renouvellement echoue, Stripe passe
-- l'abonnement en "past_due" et relance pendant plusieurs jours. On garde
-- l'acces Pro 4 jours apres la fin de la periode payee, puis on coupe.
--
-- Les fonctions Edge appliquent deja cette regle a chaque evenement Stripe
-- et a chaque ouverture de la page compte. Cette tache planifiee est le
-- filet : sans elle, un client dont plus aucun evenement n'arrive et qui
-- n'ouvre jamais sa page compte garderait l'acces au-dela des 4 jours.

create or replace function public.expire_past_due_access()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  update public.users u
     set plan = 'free'
   where u.plan = 'pro'
     and u.role is distinct from 'admin'
     and exists (
       select 1 from public.subscriptions s
        where s.user_id = u.id
          and s.status = 'past_due'
          and s.current_period_end is not null
          and s.current_period_end < now() - interval '4 days'
     )
     -- Jamais couper quelqu'un qui a par ailleurs un abonnement sain
     -- (re-souscription, changement d'offre).
     and not exists (
       select 1 from public.subscriptions s2
        where s2.user_id = u.id
          and s2.status in ('active', 'trialing')
     );
  get diagnostics touched = row_count;
  return touched;
end;
$$;

revoke all on function public.expire_past_due_access() from public, anon, authenticated;

comment on function public.expire_past_due_access() is
  'Coupe l''acces Pro des comptes en impaye Stripe depuis plus de 4 jours. Executee chaque nuit par pg_cron (job expire-past-due-access).';
