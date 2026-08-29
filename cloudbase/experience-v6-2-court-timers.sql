-- 离谱法堂 V1.6.2 节奏增量。
-- 首次陈词与当庭补述各 5 分钟，双项投票 2 分钟；全员确认后的即时推进保持不变。
-- 只替换 V5/V6 内部阶段辅助函数，不修改公共 RPC、表、选票、计分或房间成员。

create or replace function public.court_v6_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  expected jsonb;
  statuses jsonb;
  selected public.court_case_packs%rowtype;
begin
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb) into expected
  from jsonb_array_elements(v_state->'players') as player_rows(player)
  where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false) and coalesce((player->>'eligibleFromRound')::integer,1)<=p_round;
  if jsonb_array_length(expected)<2 then
    v_state := jsonb_set(v_state,'{status}','"finished"');
    return jsonb_set(v_state,'{phaseDeadlineAt}','null');
  end if;
  select * into selected from public.court_case_packs where enabled and reference_statement is not null and reference_response is not null
    and not (coalesce(v_state->'usedCaseIds','[]'::jsonb) ? id) and not (coalesce(v_state->'previousSessionCaseIds','[]'::jsonb) ? id) order by random() limit 1;
  if not found then select * into selected from public.court_case_packs where enabled and reference_statement is not null and reference_response is not null and not (coalesce(v_state->'usedCaseIds','[]'::jsonb) ? id) order by random() limit 1; end if;
  if not found then select * into selected from public.court_case_packs where enabled and reference_statement is not null and reference_response is not null order by random() limit 1; end if;
  if not found then raise exception '没有可用的完整案件包'; end if;
  select coalesce(jsonb_object_agg(id,'writing'),'{}'::jsonb) into statuses from jsonb_array_elements_text(expected) as expected_rows(id);
  v_state := jsonb_set(v_state,'{status}','"statement"');
  v_state := jsonb_set(v_state,'{round}',to_jsonb(p_round));
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+300000));
  v_state := jsonb_set(v_state,'{caseId}',to_jsonb(selected.id));
  v_state := jsonb_set(v_state,'{caseTitle}',to_jsonb(selected.title));
  v_state := jsonb_set(v_state,'{charge}',to_jsonb(selected.charge));
  v_state := jsonb_set(v_state,'{evidenceTitle}',to_jsonb(selected.evidence_title));
  v_state := jsonb_set(v_state,'{evidence}',to_jsonb(selected.evidence));
  v_state := jsonb_set(v_state,'{verdictTemplate}',to_jsonb(selected.verdict_template));
  v_state := jsonb_set(v_state,'{usedCaseIds}',coalesce(v_state->'usedCaseIds','[]'::jsonb)||jsonb_build_array(selected.id));
  v_state := jsonb_set(v_state,'{expectedPlayerIds}',expected);
  v_state := jsonb_set(v_state,'{statementStatuses}',statuses);
  v_state := jsonb_set(v_state,'{responseStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{voteStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{statementConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{responseConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{voteConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicEntries}','[]'::jsonb);
  return v_state;
end $$;

create or replace function public.court_v5_open_response(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  statuses jsonb;
  v_session_no integer := (p_state->>'sessionNo')::integer;
  v_round_no integer := (p_state->>'round')::integer;
begin
  select coalesce(jsonb_object_agg(member_id,to_jsonb(next_status)),'{}'::jsonb)
  into statuses
  from (
    select expected_id member_id,
      case
        when coalesce((player->>'away')::boolean,false) then 'away'
        when exists(select 1 from public.court_v5_submissions submission
          where submission.game_code=p_code and submission.session_no=v_session_no
            and submission.round_no=v_round_no and submission.player_id=expected_id
            and submission.statement_confirmed_at is not null) then 'writing'
        else 'unconfirmed'
      end next_status
    from jsonb_array_elements_text(state->'expectedPlayerIds') as expected_rows(expected_id)
    left join lateral (
      select player from jsonb_array_elements(state->'players') as player_rows(player) where player->>'id'=expected_id
    ) matched on true
  ) values_to_set;
  state := jsonb_set(state,'{responseStatuses}',statuses);
  state := jsonb_set(state,'{status}','"response"');
  return jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+300000));
end $$;

create or replace function public.court_v6_open_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  entries jsonb;
  response_statuses jsonb;
  vote_statuses jsonb;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
  reference_id text := 'cv6-'||substr(md5(p_code||(p_state->>'sessionNo')||(p_state->>'round')||(p_state->>'caseId')||'reference'),1,24);
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb) into response_statuses from jsonb_each_text(coalesce(v_state->'responseStatuses','{}'::jsonb));
  select coalesce(jsonb_object_agg(expected_id,case when coalesce((player->>'away')::boolean,false) then 'away' else 'unvoted' end),'{}'::jsonb) into vote_statuses
  from jsonb_array_elements_text(v_state->'expectedPlayerIds') as expected_rows(expected_id)
  left join lateral (select player from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=expected_id) matched on true;
  select coalesce(jsonb_agg(jsonb_build_object('submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),'statement',statement,'response',response) order by seq),'[]'::jsonb) into entries
  from (
    select candidate.*,row_number() over(order by md5(submission_id)) seq from (
      select submission_id,statement,case when response_confirmed_at is null then null else response end response
      from public.court_v5_submissions where game_code=p_code and session_no=v_session and round_no=v_round and statement_confirmed_at is not null
      union all
      select reference_id,reference_statement,reference_response from public.court_case_packs where id=v_state->>'caseId'
    ) candidate
  ) ordered_candidates;
  v_state := jsonb_set(v_state,'{responseStatuses}',response_statuses);
  v_state := jsonb_set(v_state,'{voteStatuses}',vote_statuses);
  v_state := jsonb_set(v_state,'{publicEntries}',entries);
  v_state := jsonb_set(v_state,'{status}','"voting"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
end $$;

revoke all on function public.court_v6_begin_round(text,jsonb,integer,bigint) from public;
revoke all on function public.court_v5_open_response(text,jsonb,bigint) from public;
revoke all on function public.court_v6_open_voting(text,jsonb,bigint) from public;
