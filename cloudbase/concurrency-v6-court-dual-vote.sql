-- 离谱法堂 Draft 0.3 / V6 增量迁移。
-- 依赖已部署的 V5；复用 court_v5_submissions，新增 V6 双项选票、幂等记录和版本化 RPC。
-- 不删除或覆盖 V5 函数、表和既有房间。

alter table public.court_case_packs add column if not exists reference_statement text;
alter table public.court_case_packs add column if not exists reference_response text;

update public.court_case_packs as pack
set reference_statement=seed.reference_statement,reference_response=seed.reference_response
from (values
  ('friday-overtime','我只要求大家把风险点说清楚，并没有要求任何人留下。','我离开是去线下找供应商确认，火锅照片就是另一处工作现场。'),
  ('reply-all','我是在帮助发件人一次性确认送达范围，避免逐个追问。','悬停八秒说明我经过风险评估，回复全部是审慎后的效率选择。'),
  ('final-final-file','“最终版”描述的是当时状态，后缀负责记录后续需求变化。','七个版本证明需求持续演进，“真的最终版”是内部验证稿而非交付稿。'),
  ('meeting-last-question','我问的是还有没有遗漏，不是邀请大家重新开一场会。','关闭摄像头是节省带宽，下班表情是在提醒大家控制讨论时长。'),
  ('yellow-excel','这份表每个字段都会影响结论，所以不存在可以忽略的非重点。','先全选是建立统一基线，后续本应再分级，只是会议提前开始了。'),
  ('quick-sync-lunch','我按五分钟准备了议程，是现场新增问题把会议延长了。','取消午餐说明我预判了风险，但没有权限替其他人取消订单。'),
  ('ticket-no-detail','我先提交工单占住响应时间，详细信息原计划随后补充。','详情页包含敏感信息，我停留两分钟正是在判断哪些内容可以上传。'),
  ('restaurant-anything','“随便”表示我接受合格选项，不代表所有候选都自动合格。','私下推荐只是提供样本，没有影响公开投票的独立性。'),
  ('borrowed-charger','我先归还了对方当时急用的数据线，充电头准备单独交接。','放进抽屉是为了防止混入公共物品，点头表示我记住了存放位置。'),
  ('busy-lunch-survey','午餐统计是团队保障工作，逐个确认是为了提高最终到餐率。','第一条回复让我意识到询问会打断同事，所以才及时设置忙碌减少回流。'),
  ('monitor-reboot','显示器重启用于排除本地显示异常，是网络排查中的对照实验。','屏幕关闭仍能听到消息提示，因此我根据声音确认网络已经恢复。'),
  ('ppt-transitions','动画用于区分信息层级，页数少不代表信息节点少。','搜索“眼前一亮”是视觉目标，不代表四十七种动画都计划投入生产。'),
  ('unread-reminder','未读标记持续存在，说明提醒机制没有失效。','截图转发是建立备份提醒，“晚点”只定义顺序，没有承诺具体日期。'),
  ('meeting-room-charge','我预约的是不受打扰的电话会议，不需要开启电视。','手机是参会设备，持续快充是在保障会议连接而不是占用会议室。'),
  ('single-side-print','材料需要逐页批注，单面打印是为了保留背面书写空间。','记住设置是为同类批注任务提效，缺纸属于耗材预警没有及时补充。'),
  ('wrong-group-all','我发现提醒对象范围不准确，所以立即声明发错群并终止扩散。','没有再次发送说明原事项已经通过其他渠道解决，无需制造第二次打扰。'),
  ('mute-meeting','那句话是对会议时间管理的即时风险提示，并非私下抱怨。','我主动按键说明本意是静音，解除静音属于界面状态反馈不清。'),
  ('search-share','搜索内容用于准备会议治理方案，帮助大家减少未来的临时会议。','我发起这次会议正是为了让大家畅所欲言，共同讨论如何拒绝下一次。')
) as seed(id,reference_statement,reference_response)
where pack.id=seed.id;

create table if not exists public.court_v6_votes (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  best_submission_id text not null,
  truth_submission_id text not null,
  confirmed_at timestamptz not null default now(),
  primary key (game_code,session_no,round_no,player_id)
);

create table if not exists public.court_v6_actions (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  action_id text not null,
  actor_player_id text not null,
  action_type text not null,
  round_no integer not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_code,session_no,action_id)
);

alter table public.court_v6_votes enable row level security;
alter table public.court_v6_actions enable row level security;

create or replace function public.create_court_game_v6(p_code text,p_owner_player_id text,p_owner_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 12 then raise exception '称呼须为 1–12 字'; end if;
  v_state := jsonb_build_object(
    'code',p_code,'gameType','absurd_court','courtVersion',6,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false,'eligibleFromRound',1)),
    'playerLimit',8,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,'totalRounds',3,
    'phaseDeadlineAt',null,'caseId',null,'caseTitle',null,'charge',null,'evidenceTitle',null,'evidence',null,'verdictTemplate',null,
    'usedCaseIds','[]'::jsonb,'previousSessionCaseIds','[]'::jsonb,'expectedPlayerIds','[]'::jsonb,
    'statementStatuses','{}'::jsonb,'responseStatuses','{}'::jsonb,'voteStatuses','{}'::jsonb,
    'statementConfirmedCount',0,'responseConfirmedCount',0,'voteConfirmedCount',0,
    'publicEntries','[]'::jsonb,'roundResults','[]'::jsonb,'totalBestScores','{}'::jsonb,'totalTruthScores','{}'::jsonb
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,v_state,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return v_state;
end $$;

create or replace function public.join_court_game_v6(p_code text,p_player_id text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  players jsonb;
  existing_id text;
  eligible_round integer;
  ver bigint;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)),0) not between 1 and 12 then raise exception '称呼须为 1–12 字'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>6 then raise exception '离谱法堂 V6 房间不存在'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  players := coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(players)>=coalesce((g.state->>'playerLimit')::integer,8) then raise exception '房间已满'; end if;
  eligible_round := case when g.state->>'status'='lobby' then 1 else coalesce((g.state->>'round')::integer,0)+1 end;
  players := players || jsonb_build_array(jsonb_build_object('id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(players)+1,'alive',true,'cardReady',false,'away',false,'eligibleFromRound',eligible_round));
  ver := g.version+1;
  v_state := jsonb_set(g.state,'{players}',players);
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;

create or replace function public.get_my_court_submission_v6(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  v_state jsonb;
  row_data public.court_v5_submissions%rowtype;
  v_session integer;
  v_round integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select g.state into v_state from public.games g where g.code=upper(p_code) and g.expires_at>now();
  if v_state is null or v_state->>'gameType'<>'absurd_court' or coalesce((v_state->>'courtVersion')::integer,0)<>6 then raise exception '离谱法堂 V6 房间不存在'; end if;
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  v_round := coalesce((v_state->>'round')::integer,0);
  select * into row_data from public.court_v5_submissions where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
  if not found then return jsonb_build_object('sessionNo',v_session,'round',v_round,'submissionId',null,'statement','','statementConfirmed',false,'response','','responseConfirmed',false); end if;
  return jsonb_build_object('sessionNo',v_session,'round',v_round,'submissionId',row_data.submission_id,'statement',coalesce(row_data.statement,''),'statementConfirmed',row_data.statement_confirmed_at is not null,'response',coalesce(row_data.response,''),'responseConfirmed',row_data.response_confirmed_at is not null);
end $$;

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
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
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
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+30000));
end $$;

create or replace function public.court_v6_finish_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  entries jsonb;
  statuses jsonb;
  best_winners jsonb := '[]'::jsonb;
  truth_winners jsonb := '[]'::jsonb;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
  best_max integer := 0;
  truth_max integer := 0;
  reference_id text := 'cv6-'||substr(md5(p_code||(p_state->>'sessionNo')||(p_state->>'round')||(p_state->>'caseId')||'reference'),1,24);
  score_row record;
begin
  select coalesce(jsonb_object_agg(key,case when value='unvoted' then 'unconfirmed' else value end),'{}'::jsonb) into statuses from jsonb_each_text(coalesce(v_state->'voteStatuses','{}'::jsonb));
  select coalesce(max(best_score),0),coalesce(max(truth_score),0) into best_max,truth_max from (
    select entry->>'submissionId' submission_id,
      (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId')::integer best_score,
      (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')::integer truth_score
    from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
  ) scores;
  if best_max>0 then
    select coalesce(jsonb_agg(submission_id),'[]'::jsonb) into best_winners from (
      select entry->>'submissionId' submission_id from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
      where (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId')=best_max
    ) winners;
  end if;
  if truth_max>0 then
    select coalesce(jsonb_agg(submission_id),'[]'::jsonb) into truth_winners from (
      select entry->>'submissionId' submission_id from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
      where (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')=truth_max
    ) winners;
  end if;
  for score_row in
    select submission.player_id,
      (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=submission.submission_id)::integer best_score,
      (select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=submission.submission_id)::integer truth_score
    from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.statement_confirmed_at is not null
  loop
    v_state := jsonb_set(v_state,array['totalBestScores',score_row.player_id],to_jsonb(coalesce((v_state->'totalBestScores'->>score_row.player_id)::integer,0)+score_row.best_score),true);
    v_state := jsonb_set(v_state,array['totalTruthScores',score_row.player_id],to_jsonb(coalesce((v_state->'totalTruthScores'->>score_row.player_id)::integer,0)+score_row.truth_score),true);
  end loop;
  select coalesce(jsonb_agg(entry || jsonb_build_object(
    'isReference',(entry->>'submissionId')=reference_id,
    'authorId',case when (entry->>'submissionId')=reference_id then null else (select submission.player_id from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=entry->>'submissionId') end,
    'authorName',case when (entry->>'submissionId')=reference_id then '卷宗参考答辩' else (select player->>'name' from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=(select submission.player_id from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=entry->>'submissionId')) end,
    'bestVotes',(select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId'),
    'truthVotes',(select count(*) from public.court_v6_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')
  ) order by entry->>'displayCode'),'[]'::jsonb) into entries from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry);
  v_state := jsonb_set(v_state,'{voteStatuses}',statuses);
  v_state := jsonb_set(v_state,'{publicEntries}',entries);
  v_state := jsonb_set(v_state,'{roundResults}',coalesce(v_state->'roundResults','[]'::jsonb)||jsonb_build_array(jsonb_build_object('round',v_round,'bestWinnerSubmissionIds',best_winners,'truthWinnerSubmissionIds',truth_winners,'bestHighestVotes',best_max,'truthHighestVotes',truth_max)));
  v_state := jsonb_set(v_state,'{status}','"result"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.court_v6_restart(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  players jsonb;
begin
  select coalesce(jsonb_agg(jsonb_set(player,'{eligibleFromRound}','1'::jsonb) order by (player->>'seat')::integer),'[]'::jsonb) into players from jsonb_array_elements(v_state->'players') as player_rows(player);
  v_state := jsonb_set(v_state,'{sessionNo}',to_jsonb((v_state->>'sessionNo')::integer+1));
  v_state := jsonb_set(v_state,'{status}','"lobby"');
  v_state := jsonb_set(v_state,'{round}','0'::jsonb);
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
  v_state := jsonb_set(v_state,'{players}',players);
  v_state := jsonb_set(v_state,'{previousSessionCaseIds}',coalesce(v_state->'usedCaseIds','[]'::jsonb));
  v_state := jsonb_set(v_state,'{usedCaseIds}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{expectedPlayerIds}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{statementStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{responseStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{voteStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{statementConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{responseConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{voteConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicEntries}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{roundResults}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{totalBestScores}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{totalTruthScores}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{caseId}','null');
  v_state := jsonb_set(v_state,'{caseTitle}','null');
  v_state := jsonb_set(v_state,'{charge}','null');
  v_state := jsonb_set(v_state,'{evidenceTitle}','null');
  v_state := jsonb_set(v_state,'{evidence}','null');
  v_state := jsonb_set(v_state,'{verdictTemplate}','null');
  return v_state;
end $$;

create or replace function public.apply_court_action_v6(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,
  p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  actor text;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint;
  v_round integer;
  v_session integer;
  action_session integer;
  deadline bigint;
  body text;
  best_target text;
  truth_target text;
  desired_away boolean;
  players jsonb;
  n integer;
  eligible integer;
  actor_status text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_action_id)),0)<8 then raise exception 'invalid action id'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>6 then raise exception '离谱法堂 V6 房间不存在'; end if;
  v_state := g.state;
  v_round := coalesce((v_state->>'round')::integer,0);
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  action_session := p_expected_session;
  if exists(select 1 from public.court_v6_actions where game_code=g.code and session_no=action_session and action_id=p_action_id) then
    return jsonb_build_object('outcome','duplicate','code','ALREADY_APPLIED','message','操作已经完成','state',v_state,'version',g.version);
  end if;
  if p_expected_status is distinct from v_state->>'status' or p_expected_round is distinct from v_round or p_expected_session is distinct from v_session or p_expected_version is distinct from g.version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','message','状态已更新，请重试','state',v_state,'version',g.version);
  end if;
  deadline := coalesce((v_state->>'phaseDeadlineAt')::bigint,0);

  if p_action_type='start_court_game' then
    if v_state->>'status'<>'lobby' or v_state->>'ownerId'<>actor then raise exception '只有房主可以开始'; end if;
    select count(*) into n
    from jsonb_array_elements(v_state->'players') as player_rows(player)
    where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false);
    if n<2 then raise exception '至少需要 2 名未暂离成员'; end if;
    v_state := public.court_v6_begin_round(g.code,v_state,1,now_ms);
  elsif p_action_type='confirm_court_statement' then
    if v_state->>'status'<>'statement' then raise exception '当前不是首次陈词阶段'; end if;
    if not (v_state->'expectedPlayerIds' ? actor) or coalesce((select (player->>'away')::boolean from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=actor),false) then raise exception '本轮无需提交'; end if;
    if v_state->'statementStatuses'->>actor='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','首次陈词已经确认','state',v_state,'version',g.version); end if;
    body := trim(coalesce(p_payload->>'statement',''));
    if length(body) not between 1 and 80 then raise exception '首次陈词须为 1–80 字'; end if;
    insert into public.court_v5_submissions(game_code,session_no,round_no,player_id,submission_id,statement,statement_confirmed_at) values(g.code,v_session,v_round,actor,'cv6-'||substr(md5(random()::text||clock_timestamp()::text||actor),1,24),body,now());
    v_state := jsonb_set(v_state,array['statementStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'statementStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'statementStatuses') where value<>'away';
    v_state := jsonb_set(v_state,'{statementConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v5_reveal_statements(g.code,v_state,now_ms); end if;
  elsif p_action_type='confirm_court_response' then
    if v_state->>'status'<>'response' then raise exception '当前不是当庭补述阶段'; end if;
    actor_status := v_state->'responseStatuses'->>actor;
    if actor_status is distinct from 'writing' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','当庭补述已经确认','state',v_state,'version',g.version); end if;
      raise exception '本轮无需提交';
    end if;
    body := trim(coalesce(p_payload->>'response',''));
    if length(body) not between 1 and 80 then raise exception '当庭补述须为 1–80 字'; end if;
    update public.court_v5_submissions set response=body,response_confirmed_at=now() where game_code=g.code and session_no=v_session and round_no=v_round and player_id=actor and statement_confirmed_at is not null and response_confirmed_at is null;
    if not found then raise exception '首次陈词未确认或当庭补述已经确认'; end if;
    v_state := jsonb_set(v_state,array['responseStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'responseStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'responseStatuses') where value not in ('away','unconfirmed');
    v_state := jsonb_set(v_state,'{responseConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v6_open_voting(g.code,v_state,now_ms); end if;
  elsif p_action_type='confirm_court_vote' then
    if v_state->>'status'<>'voting' then raise exception '当前不是陪审团表决阶段'; end if;
    actor_status := v_state->'voteStatuses'->>actor;
    if actor_status is distinct from 'unvoted' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','双项选票已经确认','state',v_state,'version',g.version); end if;
      raise exception '本轮无需投票';
    end if;
    best_target := coalesce(p_payload->>'bestSubmissionId','');
    truth_target := coalesce(p_payload->>'truthSubmissionId','');
    if not exists(select 1 from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry) where entry->>'submissionId'=best_target)
      or exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=best_target and submission.player_id=actor) then raise exception '“最会狡辩”不能投自己或无效陈述'; end if;
    if not exists(select 1 from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry) where entry->>'submissionId'=truth_target)
      or exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=truth_target and submission.player_id=actor) then raise exception '“最像真的”不能投自己或无效陈述'; end if;
    insert into public.court_v6_votes(game_code,session_no,round_no,player_id,best_submission_id,truth_submission_id) values(g.code,v_session,v_round,actor,best_target,truth_target);
    v_state := jsonb_set(v_state,array['voteStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'voteStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'voteStatuses') where value<>'away';
    v_state := jsonb_set(v_state,'{voteConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v6_finish_voting(g.code,v_state,now_ms); end if;
  elsif p_action_type='change_court_presence' then
    desired_away := coalesce((p_payload->>'away')::boolean,false);
    select coalesce(jsonb_agg(case when player->>'id'=actor then jsonb_set(player,'{away}',to_jsonb(desired_away)) else player end order by (player->>'seat')::integer),'[]'::jsonb) into players from jsonb_array_elements(v_state->'players') as player_rows(player);
    v_state := jsonb_set(v_state,'{players}',players);
    if v_state->>'status'='statement' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['statementStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'confirmed' else 'writing' end),true);
      select count(*) into n from jsonb_each_text(v_state->'statementStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'statementStatuses') where value<>'away';
      v_state := jsonb_set(v_state,'{statementConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v5_reveal_statements(g.code,v_state,now_ms); end if;
    elsif v_state->>'status'='response' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['responseStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.response_confirmed_at is not null) then 'confirmed' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'writing' else 'unconfirmed' end),true);
      select count(*) into n from jsonb_each_text(v_state->'responseStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'responseStatuses') where value not in ('away','unconfirmed');
      v_state := jsonb_set(v_state,'{responseConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v6_open_voting(g.code,v_state,now_ms); end if;
    elsif v_state->>'status'='voting' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['voteStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v6_votes vote where vote.game_code=g.code and vote.session_no=v_session and vote.round_no=v_round and vote.player_id=actor) then 'confirmed' else 'unvoted' end),true);
      select count(*) into n from jsonb_each_text(v_state->'voteStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'voteStatuses') where value<>'away';
      v_state := jsonb_set(v_state,'{voteConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v6_finish_voting(g.code,v_state,now_ms); end if;
    end if;
  elsif p_action_type='advance_court_phase' then
    if now_ms<deadline then raise exception '当前阶段尚未结束'; end if;
    if v_state->>'status'='statement' then v_state := public.court_v5_reveal_statements(g.code,v_state,now_ms);
    elsif v_state->>'status'='statement_reveal' then v_state := public.court_v5_open_evidence(v_state,now_ms);
    elsif v_state->>'status'='evidence' then v_state := public.court_v5_open_response(g.code,v_state,now_ms);
    elsif v_state->>'status'='response' then v_state := public.court_v6_open_voting(g.code,v_state,now_ms);
    elsif v_state->>'status'='voting' then v_state := public.court_v6_finish_voting(g.code,v_state,now_ms);
    elsif v_state->>'status'='result' then
      if v_round>=3 then v_state := jsonb_set(v_state,'{status}','"finished"'); v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
      else v_state := public.court_v6_begin_round(g.code,v_state,v_round+1,now_ms); end if;
    else raise exception '当前阶段无需推进'; end if;
  elsif p_action_type='end_court_game' then
    if v_state->>'ownerId'<>actor then raise exception '只有房主可以结束'; end if;
    v_state := jsonb_set(v_state,'{status}','"finished"'); v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
  elsif p_action_type='restart_court_game' then
    if v_state->>'status'<>'finished' or v_state->>'ownerId'<>actor then raise exception '只有房主可以再来一局'; end if;
    v_state := public.court_v6_restart(v_state,now_ms);
  else raise exception 'unsupported court action'; end if;

  ver := g.version+1;
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.court_v6_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result) values(g.code,action_session,p_action_id,actor,p_action_type,v_round,jsonb_build_object('outcome','applied','code','OK'));
  return jsonb_build_object('outcome','applied','code','OK','message','操作成功','state',v_state,'version',ver);
end $$;

revoke all on public.court_v6_votes,public.court_v6_actions from anon,authenticated;
revoke all on function public.court_v6_begin_round(text,jsonb,integer,bigint) from public;
revoke all on function public.court_v6_open_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v6_finish_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v6_restart(jsonb,bigint) from public;
revoke all on function public.create_court_game_v6(text,text,text) from public;
revoke all on function public.join_court_game_v6(text,text,text) from public;
revoke all on function public.get_my_court_submission_v6(text) from public;
revoke all on function public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.create_court_game_v6(text,text,text) to anon,authenticated;
grant execute on function public.join_court_game_v6(text,text,text) to anon,authenticated;
grant execute on function public.get_my_court_submission_v6(text) to anon,authenticated;
grant execute on function public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated;
