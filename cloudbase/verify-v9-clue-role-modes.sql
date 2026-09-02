-- A3 提示大王 V3 只读核验。期望每行 ok 均为 true。
with metrics as (
  select
    (select count(*) from public.clue_word_bank_v3 where enabled) as word_count,
    (select count(*) from public.clue_word_bank_v3 where enabled and difficulty='easy') as easy_count,
    (select count(*) from public.clue_word_bank_v3 where enabled and difficulty='normal') as normal_count,
    (select count(*) from public.clue_word_bank_v3 where enabled and difficulty='hard') as hard_count,
    (select count(*) from public.clue_public_rule_bank_v3 where enabled) as rule_count,
    (select count(*) from public.clue_role_bank_v3 where enabled) as role_count,
    (select count(*) from public.clue_word_bank_v3 where enabled and jsonb_array_length(allowed_role_ids)>=9) as compatible_role_words,
    (select count(*) from public.clue_word_bank_v3 where enabled and jsonb_array_length(allowed_public_rule_ids)>=8) as compatible_rule_words
), defs as (
  select
    pg_get_functiondef('public.clue_v3_begin_round(text,jsonb,integer,bigint)'::regprocedure) as begin_def,
    pg_get_functiondef('public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure) as action_def
), checks(expected_check,actual,ok) as (
  select 'exactly 120 enabled words with 40 per difficulty',
    (word_count||' ('||easy_count||'/'||normal_count||'/'||hard_count||')')::text,
    word_count=120 and easy_count=40 and normal_count=40 and hard_count=40 from metrics
  union all select '11 public rules and 12 private roles',
    (rule_count||'/'||role_count)::text, rule_count=11 and role_count=12 from metrics
  union all select 'every word has enough compatible roles and public rules',
    (compatible_role_words||'/'||compatible_rule_words)::text,
    compatible_role_words=word_count and compatible_rule_words=word_count from metrics
  union all select 'five V3 private tables use RLS', count(*)::text, count(*)=5
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('clue_word_bank_v3','clue_public_rule_bank_v3','clue_role_bank_v3','clue_v3_round_secrets','clue_v3_role_assignments') and c.relrowsecurity
  union all select 'four V3 public RPCs exist',
    ((to_regprocedure('public.create_clue_game_v3(text,text,text,text,text)') is not null
      and to_regprocedure('public.join_clue_game_v3(text,text,text)') is not null
      and to_regprocedure('public.get_my_clue_round_v3(text)') is not null
      and to_regprocedure('public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text),
    to_regprocedure('public.create_clue_game_v3(text,text,text,text,text)') is not null
      and to_regprocedure('public.join_clue_game_v3(text,text,text)') is not null
      and to_regprocedure('public.get_my_clue_round_v3(text)') is not null
      and to_regprocedure('public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb)') is not null
  union all select 'anon can execute V3 RPCs',
    ((has_function_privilege('anon','public.create_clue_game_v3(text,text,text,text,text)','execute')
      and has_function_privilege('anon','public.join_clue_game_v3(text,text,text)','execute')
      and has_function_privilege('anon','public.get_my_clue_round_v3(text)','execute')
      and has_function_privilege('anon','public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb)','execute'))::text),
    has_function_privilege('anon','public.create_clue_game_v3(text,text,text,text,text)','execute')
      and has_function_privilege('anon','public.join_clue_game_v3(text,text,text)','execute')
      and has_function_privilege('anon','public.get_my_clue_round_v3(text)','execute')
      and has_function_privilege('anon','public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'rooms support two players and three guesses',
    ((position('n<2' in replace(action_def,' ',''))>0 and position('v_attempts>=3' in replace(action_def,' ',''))>0)::text),
    position('n<2' in replace(action_def,' ',''))>0 and position('v_attempts>=3' in replace(action_def,' ',''))>0 from defs
  union all select 'unsolved result may be skipped',
    (position('skip_clue_result' in action_def)>0)::text, position('skip_clue_result' in action_def)>0 from defs
  union all select 'recent 21 words are excluded',
    ((position('recentWordIds' in begin_def)>0 and position('21' in begin_def)>0)::text),
    position('recentWordIds' in begin_def)>0 and position('21' in begin_def)>0 from defs
  union all select 'roles honor compatibility and avoid immediate repeats',
    ((position('allowed_role_ids' in begin_def)>0 and position('lastRoleByPlayer' in begin_def)>0 and position('v_used_roles' in begin_def)>0)::text),
    position('allowed_role_ids' in begin_def)>0 and position('lastRoleByPlayer' in begin_def)>0 and position('v_used_roles' in begin_def)>0 from defs
)
select expected_check,actual,ok from checks;
