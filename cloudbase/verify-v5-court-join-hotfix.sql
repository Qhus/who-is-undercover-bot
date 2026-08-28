-- V5 加入房间热修复只读核验。预期每一行 ok 均为 true。

with function_info as (
  select
    to_regprocedure('public.join_court_game_v5(text,text,text)') as proc,
    pg_get_functiondef(to_regprocedure('public.join_court_game_v5(text,text,text)')) as body
), checks(expected_check,expected,actual) as (
  select 'join RPC exists', 'true', (proc is not null)::text from function_info
  union all
  select 'join RPC writes the local v_state variable', 'true', coalesce((body ~ 'update public\.games set state\s*=\s*v_state')::text,'false') from function_info
  union all
  select 'join RPC contains no invalid function-qualified state reference', 'true', coalesce((body !~ 'join_court_game_v5\.state')::text,'false') from function_info
  union all
  select 'anon can execute join RPC', 'true', has_function_privilege('anon','public.join_court_game_v5(text,text,text)','execute')::text
)
select
  expected_check,
  actual,
  (actual=expected)::text as ok
from checks;
