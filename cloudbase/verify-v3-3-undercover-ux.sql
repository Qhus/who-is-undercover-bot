with checks(expected_check, actual, ok) as (
  select
    'create RPC validates 24 character player names',
    (pg_get_functiondef('public.create_game(text,text,jsonb)'::regprocedure) ~ 'between 1 and 24')::text,
    pg_get_functiondef('public.create_game(text,text,jsonb)'::regprocedure) ~ 'between 1 and 24'
  union all
  select
    'join RPC validates 24 character player names',
    (pg_get_functiondef('public.join_game(text,text,text)'::regprocedure) ~ 'between 1 and 24')::text,
    pg_get_functiondef('public.join_game(text,text,text)'::regprocedure) ~ 'between 1 and 24'
  union all
  select
    'join RPC no longer truncates names to 12 characters',
    (pg_get_functiondef('public.join_game(text,text,text)'::regprocedure) !~ 'left\s*\(\s*trim\(p_nickname\)\s*,\s*12\s*\)')::text,
    pg_get_functiondef('public.join_game(text,text,text)'::regprocedure) !~ 'left\s*\(\s*trim\(p_nickname\)\s*,\s*12\s*\)'
  union all
  select
    'anon can execute create and join RPCs',
    (has_function_privilege('anon', 'public.create_game(text,text,jsonb)', 'execute') and has_function_privilege('anon', 'public.join_game(text,text,text)', 'execute'))::text,
    has_function_privilege('anon', 'public.create_game(text,text,jsonb)', 'execute') and has_function_privilege('anon', 'public.join_game(text,text,text)', 'execute')
)
select * from checks;
