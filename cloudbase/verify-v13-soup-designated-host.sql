-- V1.13 增量迁移后的只读核验，所有 ok 应为 true。
with defs as (
  select pg_get_functiondef(to_regprocedure('public.apply_soup_action_v13(text,text,text,text,integer,integer,bigint,jsonb)')) action_def,
    pg_get_functiondef(to_regprocedure('public.soup_v13_begin_round(jsonb,bigint,text)')) helper_def
), checks(expected_check,ok) as (
  select 'V13 action and helper exist', action_def is not null and helper_def is not null from defs
  union all select 'host is explicitly required, never randomly selected', position('p_payload->''hostId''' in action_def)>0 and position('random()' in helper_def)=0 from defs
  union all select 'owner, phase, version and actor-bound retries are checked', position('仅负责人' in action_def)>0 and position('STALE_STATE' in action_def)>0 and position('prior.actor_uid' in action_def)>0 from defs
  union all select 'host membership and minimum player count are checked', position('active_count<2' in helper_def)>0 and position('指定的汤主不在当前可参与成员中' in helper_def)>0 from defs
  union all select 'private helper cannot be called by participants', not has_function_privilege('anon','public.soup_v13_begin_round(jsonb,bigint,text)','execute') and not has_function_privilege('authenticated','public.soup_v13_begin_round(jsonb,bigint,text)','execute')
  union all select 'participants can call the guarded action RPC', has_function_privilege('anon','public.apply_soup_action_v13(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'question and private-data interfaces remain compatible', position('apply_soup_action_v12' in action_def)>0 and to_regprocedure('public.get_my_soup_round_v12(text)') is not null from defs
) select expected_check,ok from checks;
