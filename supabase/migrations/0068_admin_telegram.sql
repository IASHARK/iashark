-- Admin, ecran Inscrits : bloc « Telegram laisses » (06/11/2026, demande de Clement :
-- « dans mon admin je dois le voir, comme ca je vois qui remplit quoi »).
-- Lecture seule, admin uniquement (admin_is_admin), jamais anon.
-- Renvoie : nombre d'inscrits (hors comptes internes), nombre qui ont laisse leur Telegram,
-- fois ou la fenetre a ete montree (funnel_events gate_view, gate = telegram_demande),
-- et une ligne par Telegram laisse : date, e-mail, offre ACTUELLE du compte, Telegram, langue.
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
                  where not public.admin_internal_account(u.email, u.role)),
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
          'langue', c.langue,
          'is_internal', public.admin_internal_account(u.email, u.role)
        ) order by c.updated_at desc)
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
