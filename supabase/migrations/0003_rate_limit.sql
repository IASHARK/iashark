-- IASHARK — rate limiting reel pour la connexion
-- Backe par Postgres (pas par la memoire d'une instance Edge Function
-- serverless, qui ne tient pas la charge en production multi-instance).
-- Utilise par supabase/functions/login-guard/index.ts.

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);
alter table rate_limit_buckets enable row level security;
-- Aucune policy anon/authenticated : uniquement accessible via service role
-- (l'Edge Function), jamais directement depuis le navigateur.

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row rate_limit_buckets;
begin
  select * into v_row from rate_limit_buckets where bucket_key = p_key for update;
  if not found then
    insert into rate_limit_buckets(bucket_key, count, window_start) values (p_key, 1, now());
    return true;
  end if;
  if now() - v_row.window_start > (p_window_seconds || ' seconds')::interval then
    update rate_limit_buckets set count = 1, window_start = now() where bucket_key = p_key;
    return true;
  end if;
  if v_row.count >= p_limit then
    return false;
  end if;
  update rate_limit_buckets set count = count + 1 where bucket_key = p_key;
  return true;
end;
$$;
revoke execute on function check_rate_limit(text,int,int) from public, anon, authenticated;
