-- Fenetre Telegram (07/11/2026, demande de Clement) :
--  1. lien « Je n'ai pas Telegram » : la personne est notee (sans_telegram = true, pas de pseudo)
--     et la fenetre ne revient plus ;
--  2. le site ou elle se trouve (marche : fr, en, es, gb, mx, za) pour savoir dans quelle langue lui ecrire.
alter table public.telegram_contacts add column if not exists sans_telegram boolean not null default false;
alter table public.telegram_contacts add column if not exists marche text;
alter table public.telegram_contacts alter column pseudo drop not null;
alter table public.telegram_contacts drop constraint if exists telegram_contacts_pseudo_check;
alter table public.telegram_contacts drop constraint if exists telegram_contacts_pseudo_ou_sans;
alter table public.telegram_contacts add constraint telegram_contacts_pseudo_ou_sans check (
  (sans_telegram and pseudo is null)
  or (not sans_telegram and pseudo is not null and char_length(pseudo) between 4 and 40)
);

create or replace function public.admin_telegram()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.admin_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select json_build_object(
      'generated_at', now(),
      'inscrits', (select count(*) from public.users u where not public.admin_internal_account(u.email, u.role)),
      'laisses', (select count(*) from public.telegram_contacts c join public.users u on u.id = c.user_id
                  where not c.sans_telegram and not public.admin_internal_account(u.email, u.role)),
      'sans', (select count(*) from public.telegram_contacts c join public.users u on u.id = c.user_id
                  where c.sans_telegram and not public.admin_internal_account(u.email, u.role)),
      'vues', (select count(*) from public.funnel_events e
               where e.event_type = 'gate_view' and e.metadata->>'gate' = 'telegram_demande'),
      'vues_sessions', (select count(distinct e.session_id) from public.funnel_events e
               where e.event_type = 'gate_view' and e.metadata->>'gate' = 'telegram_demande'),
      'lignes', coalesce((
        select json_agg(json_build_object(
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'email', coalesce(u.email, au.email),
          'email_masked', public.admin_mask_email(coalesce(u.email, au.email)),
          'plan', case when u.plan in ('pro', 'famille') then 'pro' else 'free' end,
          'plan_au_moment', c.plan_au_moment,
          'pseudo', c.pseudo,
          'sans_telegram', c.sans_telegram,
          'langue', c.langue,
          'marche', c.marche,
          'langue_navigateur', c.langue_navigateur,
          'is_internal', public.admin_internal_account(u.email, u.role)
        ) order by c.sans_telegram, c.updated_at desc)
        from public.telegram_contacts c
        left join public.users u on u.id = c.user_id
        left join auth.users au on au.id = c.user_id
      ), '[]'::json)
    )
  );
end;
$$;

revoke all on function public.admin_telegram() from public, anon;
grant execute on function public.admin_telegram() to authenticated;
