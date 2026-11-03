-- Robots aspirateurs vus depuis le 02/11 : navigateur d'ordinateur regle en chinois, sans lien d'origine ni campagne,
-- une seule page, aucun clic, adresse tournante (Singapour, Hong Kong, Mexique, USA). Ecartes des statistiques seulement.
create or replace function public.admin_internal_reason(md jsonb)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when md is null or jsonb_typeof(md) <> 'object' then null
    when md->>'admin_excluded' = 'true' then 'excluded'
    when md->>'internal' = 'true' then 'internal'
    when md->>'qa' = 'true' or coalesce(md->>'utm_source', '') ilike 'qa%' then 'qa'
    when md->>'bot' = 'true' then 'bot'
    when md->>'os' in ('macOS', 'Windows')
      and (case when md->>'screen_w' ~ '^[0-9]{1,5}$' then (md->>'screen_w')::int between 1 and 599 else false end)
      then 'emulated'
    when coalesce(md->>'tz', '') ~ '^(Etc/[A-Za-z0-9+-]{1,16}|UTC|UCT|GMT0?|Universal|Zulu|Greenwich)$'
      and (md->>'os' in ('Android', 'iOS')
        or (md->>'os' in ('Windows', 'macOS', 'Linux', 'ChromeOS') and md->>'screen_w' = '800'))
      then 'headless'
    when md->>'lang' ilike 'zh%' and md->>'device' = 'desktop'
      and coalesce(md->>'ref', '') = '' and coalesce(md->>'utm_source', '') = ''
      then 'headless'
  end
$function$;
