-- 离谱法堂 V1.6.1 内容与二十一轮避重核验。预期每一行 ok 均为 true。

with restart_def as (
  select pg_get_functiondef(to_regprocedure('public.court_v6_restart(jsonb,bigint)')) body
), restart_sample as (
  select public.court_v6_restart(
    '{"sessionNo":7,"players":[],"previousSessionCaseIds":["c01","c02","c03","c04","c05","c06","c07","c08","c09","c10","c11","c12","c13","c14","c15","c16","c17","c18","c19","c20","c21"],"usedCaseIds":["c22","c23","c24"]}'::jsonb,
    0
  ) state
), checks(expected_check,actual) as (
  select 'at least 30 enabled case packs',(select (count(*)>=30)::text from public.court_case_packs where enabled and reference_statement is not null and reference_response is not null)
  union all select 'all live reference lines fit quick input',(select (bool_and(length(reference_statement)<=42 and length(reference_response)<=42))::text from public.court_case_packs where enabled)
  union all select 'formal AI phrases removed from live references',(select (not bool_or((reference_statement||reference_response) ~ '风险评估|统一基线|治理方案|保障工作|独立性|预判|效率选择|定义顺序|响应时间'))::text from public.court_case_packs where enabled)
  union all select 'confusing borrowed charger case disabled',coalesce((select (not enabled)::text from public.court_case_packs where id='borrowed-charger'),'false')
  union all select 'restart keeps a rolling 21-case history',coalesce((select (body ~ 'limit 21' and body ~ 'previousSessionCaseIds' and body ~ 'usedCaseIds')::text from restart_def),'false')
  union all select 'sample restart drops the oldest three cases',coalesce((select (jsonb_array_length(state->'previousSessionCaseIds')=21 and state->'previousSessionCaseIds'->>0='c04' and state->'previousSessionCaseIds'->>20='c24')::text from restart_sample),'false')
)
select expected_check,actual,(actual='true')::text ok from checks;
