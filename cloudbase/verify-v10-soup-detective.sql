-- A5 汤底侦探 V1 只读核验。执行迁移后再单独运行本文件，每行 ok 均应为 true。
with checks(expected_check,actual,ok) as (
  select 'exactly 20 pilot case cards with 6/10/4 difficulty',
    (select count(*)||' ('||count(*) filter(where difficulty='easy')||'/'||count(*) filter(where difficulty='normal')||'/'||count(*) filter(where difficulty='hard')||')' from public.soup_case_bank_v1 where enabled),
    (select count(*)=20 and count(*) filter(where difficulty='easy')=6 and count(*) filter(where difficulty='normal')=10 and count(*) filter(where difficulty='hard')=4 from public.soup_case_bank_v1 where enabled)
  union all select 'all launch cards remain pilot until real blind tests',
    (select count(*)::text from public.soup_case_bank_v1 where enabled and review_status='approved'),
    (select count(*)=0 from public.soup_case_bank_v1 where enabled and review_status='approved')
  union all select 'every case has 3 to 6 facts 8 to 15 FAQs and two hints',
    (select count(*)::text from public.soup_case_bank_v1 where enabled and jsonb_array_length(key_facts) between 3 and 6 and jsonb_array_length(common_questions) between 8 and 15 and jsonb_array_length(hints)=2),
    (select count(*)=20 from public.soup_case_bank_v1 where enabled and jsonb_array_length(key_facts) between 3 and 6 and jsonb_array_length(common_questions) between 8 and 15 and jsonb_array_length(hints)=2)
  union all select 'five A5 private tables exist',
    (select count(*)::text from pg_class where oid in ('public.soup_case_bank_v1'::regclass,'public.soup_round_secrets_v1'::regclass,'public.soup_drafts_v1'::regclass,'public.soup_feedback_v1'::regclass,'public.soup_actions_v1'::regclass)),
    (select count(*)=5 from pg_class where oid in ('public.soup_case_bank_v1'::regclass,'public.soup_round_secrets_v1'::regclass,'public.soup_drafts_v1'::regclass,'public.soup_feedback_v1'::regclass,'public.soup_actions_v1'::regclass))
  union all select 'six public A5 RPCs exist',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_soup_game_v1','join_soup_game_v1','get_my_soup_round_v1','save_soup_draft_v1','submit_soup_feedback_v1','apply_soup_action_v1')),
    (select count(*)=6 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_soup_game_v1','join_soup_game_v1','get_my_soup_round_v1','save_soup_draft_v1','submit_soup_feedback_v1','apply_soup_action_v1'))
  union all select 'anon can execute all A5 RPCs',
    (has_function_privilege('anon','public.create_soup_game_v1(text,text,text)','execute') and has_function_privilege('anon','public.join_soup_game_v1(text,text,text)','execute') and has_function_privilege('anon','public.get_my_soup_round_v1(text)','execute') and has_function_privilege('anon','public.save_soup_draft_v1(text,text)','execute') and has_function_privilege('anon','public.submit_soup_feedback_v1(text,jsonb)','execute') and has_function_privilege('anon','public.apply_soup_action_v1(text,text,text,text,integer,integer,bigint,jsonb)','execute'))::text,
    has_function_privilege('anon','public.create_soup_game_v1(text,text,text)','execute') and has_function_privilege('anon','public.join_soup_game_v1(text,text,text)','execute') and has_function_privilege('anon','public.get_my_soup_round_v1(text)','execute') and has_function_privilege('anon','public.save_soup_draft_v1(text,text)','execute') and has_function_privilege('anon','public.submit_soup_feedback_v1(text,jsonb)','execute') and has_function_privilege('anon','public.apply_soup_action_v1(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'all A5 private tables use RLS',
    (select bool_and(relrowsecurity)::text from pg_class where oid in ('public.soup_case_bank_v1'::regclass,'public.soup_round_secrets_v1'::regclass,'public.soup_drafts_v1'::regclass,'public.soup_feedback_v1'::regclass,'public.soup_actions_v1'::regclass)),
    (select bool_and(relrowsecurity) from pg_class where oid in ('public.soup_case_bank_v1'::regclass,'public.soup_round_secrets_v1'::regclass,'public.soup_drafts_v1'::regclass,'public.soup_feedback_v1'::regclass,'public.soup_actions_v1'::regclass))
  union all select 'private packet exposes case material only to current host',
    (select (pg_get_functiondef(p.oid) ~ 'case when is_host then secret.bottom else null end')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='soup_v1_private_packet'),
    (select pg_get_functiondef(p.oid) ~ 'case when is_host then secret.bottom else null end' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='soup_v1_private_packet')
  union all select 'drafts are keyed by room session round and player',
    (select exists(select 1 from pg_constraint where conrelid='public.soup_drafts_v1'::regclass and contype='p' and pg_get_constraintdef(oid) ilike '%game_code, session_no, round_no, player_id%')::text),
    (select exists(select 1 from pg_constraint where conrelid='public.soup_drafts_v1'::regclass and contype='p' and pg_get_constraintdef(oid) ilike '%game_code, session_no, round_no, player_id%'))
  union all select 'A5 actions include turn choices judgments limits hints and next bowl',
    (select (pg_get_functiondef(p.oid) ~ 'submit_soup_question' and pg_get_functiondef(p.oid) ~ 'submit_soup_solution' and pg_get_functiondef(p.oid) ~ 'skip_soup_turn' and pg_get_functiondef(p.oid) ~ 'judge_soup_question' and pg_get_functiondef(p.oid) ~ 'judge_soup_solution' and pg_get_functiondef(p.oid) ~ 'extend_soup_limit' and pg_get_functiondef(p.oid) ~ 'next_soup_round')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_soup_action_v1'),
    (select pg_get_functiondef(p.oid) ~ 'submit_soup_question' and pg_get_functiondef(p.oid) ~ 'submit_soup_solution' and pg_get_functiondef(p.oid) ~ 'skip_soup_turn' and pg_get_functiondef(p.oid) ~ 'judge_soup_question' and pg_get_functiondef(p.oid) ~ 'judge_soup_solution' and pg_get_functiondef(p.oid) ~ 'extend_soup_limit' and pg_get_functiondef(p.oid) ~ 'next_soup_round' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_soup_action_v1')
)
select expected_check,actual,ok from checks;
