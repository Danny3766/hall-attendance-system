create or replace function public.health_check()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('status', 'ok');
$$;

revoke execute on function public.health_check() from public;
grant execute on function public.health_check() to anon;
