-- V1.11 只读核验：执行完 concurrency-v11-undercover-manual-host.sql 后再运行。
with checks(expected_check, actual, ok) as (
  values
    (
      'V3.4 join RPC exists',
      (to_regprocedure('public.join_game_v34(text,text,text)') is not null)::text,
      to_regprocedure('public.join_game_v34(text,text,text)') is not null
    ),
    (
      'V3.4 action RPC exists',
      (to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text,
      to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)') is not null
    ),
    (
      'anon can execute both V3.4 RPCs',
      (
        has_function_privilege('anon', 'public.join_game_v34(text,text,text)', 'EXECUTE')
        and has_function_privilege('anon', 'public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)', 'EXECUTE')
      )::text,
      has_function_privilege('anon', 'public.join_game_v34(text,text,text)', 'EXECUTE')
        and has_function_privilege('anon', 'public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)', 'EXECUTE')
    ),
    (
      'manual host is excluded from room capacity',
      (position('hostOnly' in pg_get_functiondef(to_regprocedure('public.join_game_v34(text,text,text)'))) > 0)::text,
      position('hostOnly' in pg_get_functiondef(to_regprocedure('public.join_game_v34(text,text,text)'))) > 0
    ),
    (
      'lobby settings count actual players only',
      (position('v_player_count' in pg_get_functiondef(to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)'))) > 0)::text,
      position('v_player_count' in pg_get_functiondef(to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)'))) > 0
    ),
    (
      'V3.4 delegates established game actions to V3.1',
      (position('apply_game_action_v31' in pg_get_functiondef(to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)'))) > 0)::text,
      position('apply_game_action_v31' in pg_get_functiondef(to_regprocedure('public.apply_game_action_v34(text,text,text,text,integer,integer,bigint,jsonb)'))) > 0
    )
)
select expected_check, actual, ok from checks;
