-- V3.2 版本化裁判 RPC 只读核验。
-- 在执行 concurrency-v3-2-versioned-rpc.sql 后运行；每行 ok 均应为 true。

with checks(expected, actual) as (
  values
    ('versioned RPC exists',
      to_regprocedure('public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)') is not null),
    ('versioned RPC owner is cloudbase_postgres',
      pg_get_userbyid((
        select p.proowner from pg_proc p
        where p.oid = 'public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure
      )) = current_user),
    ('anon can execute versioned RPC',
      has_function_privilege('anon', 'public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure, 'EXECUTE')),
    ('authenticated can execute versioned RPC',
      has_function_privilege('authenticated', 'public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure, 'EXECUTE')),
    ('versioned RPC handles blank cards',
      position('role'' = ''blank''' in pg_get_functiondef('public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure)) > 0),
    ('versioned RPC accepts targetPlayerId',
      position('targetPlayerId' in pg_get_functiondef('public.apply_game_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure)) > 0)
)
select expected, actual, expected = actual as ok from checks;
