-- IASHARK — plan « famille » : l'acces complet, offert, sans etre un abonne payant.
--
-- Demande du proprietaire (20/09/2026) : Leila et Patrick doivent voir tout le
-- site comme un abonne Pro, mais ils ne paient pas. Jusqu'ici la seule facon de
-- leur donner l'acces etait de mettre plan = 'pro', ce qui les melangeait aux
-- vrais abonnes : le tableau de bord les comptait comme des clients, et les
-- emails de vente leur etaient adresses.
--
-- DEUX PIEGES QUE CETTE MIGRATION FERME :
--
-- 1. Le plan etait limite a 'free' et 'pro' par une contrainte CHECK. Elle
--    accepte desormais 'famille'.
--
-- 2. SURTOUT : sync-subscription (appelee a CHAQUE ouverture de la page compte)
--    et stripe-webhook ecrivent plan = 'free' quand le compte n'a aucun
--    abonnement Stripe actif. Un compte famille, qui n'en a evidemment aucun,
--    aurait donc perdu son acces a sa prochaine visite. Le declencheur
--    ci-dessous ignore cette retrogradation : une mise a jour qui essaie de
--    passer un compte 'famille' a 'free' le laisse en 'famille'.
--    Un vrai achat ('pro') reste possible et prime.
--
-- POUR RETIRER QUELQU'UN DU PLAN FAMILLE, dans la meme transaction :
--   select set_config('iashark.allow_plan_change', 'on', true);
--   update public.users set plan = 'free' where email = '...';

alter table public.users drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check check (plan = any (array['free'::text, 'pro'::text, 'famille'::text]));

create or replace function public.users_keep_famille_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seule la retrogradation automatique est ignoree ; tout le reste passe.
  if old.plan = 'famille'
     and new.plan = 'free'
     and coalesce(current_setting('iashark.allow_plan_change', true), '') <> 'on' then
    new.plan := 'famille';
  end if;
  return new;
end;
$$;
revoke execute on function public.users_keep_famille_plan() from public, anon, authenticated;

drop trigger if exists users_keep_famille_plan on public.users;
create trigger users_keep_famille_plan
  before update of plan on public.users
  for each row
  execute function public.users_keep_famille_plan();

comment on constraint users_plan_check on public.users is
  'free | pro | famille. famille = acces complet offert (proches), jamais un abonne payant : ni dans le chiffre d''affaires, ni dans les emails de vente.';
comment on function public.users_keep_famille_plan() is
  'Empeche sync-subscription et stripe-webhook de retrograder un compte famille en free faute d''abonnement Stripe. Contournable dans une transaction avec set_config(''iashark.allow_plan_change'',''on'',true).';
