-- 离谱法堂 Draft 0.2 / V5 增量迁移。
-- 新建 V5 对象，不覆盖或删除已经部署的 V2、V3、V3.1、V4 与 V4.1 对象。

create table if not exists public.court_case_packs (
  id text primary key,
  title text not null,
  charge text not null,
  evidence_title text not null,
  evidence text not null,
  verdict_template text not null,
  category text not null check (category in ('meeting','document','message','equipment','daily')),
  enabled boolean not null default true
);

create table if not exists public.court_v5_submissions (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  submission_id text not null unique,
  statement text,
  statement_confirmed_at timestamptz,
  response text,
  response_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (game_code, session_no, round_no, player_id)
);

create table if not exists public.court_v5_votes (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  submission_id text not null,
  confirmed_at timestamptz not null default now(),
  primary key (game_code, session_no, round_no, player_id)
);

create table if not exists public.court_v5_actions (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  action_id text not null,
  actor_player_id text not null,
  action_type text not null,
  round_no integer not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_code, session_no, action_id)
);

alter table public.court_case_packs enable row level security;
alter table public.court_v5_submissions enable row level security;
alter table public.court_v5_votes enable row level security;
alter table public.court_v5_actions enable row level security;

insert into public.court_case_packs(id,title,charge,evidence_title,evidence,verdict_template,category,enabled) values
('friday-overtime','周五加班案','被控在周五 17:59 说“只耽误五分钟”，最终让全组加班到晚上九点半。','门禁记录与公开照片','你本人 18:02 离开公司，并于 18:30 发布了一张火锅照片。','虽然离谱，但逻辑勉强闭环。','meeting',true),
('reply-all','全员收到案','被控对公司群发邮件使用“回复全部”，内容只有两个字：“收到”。','邮件服务器记录','系统显示你在发送前曾把“回复”按钮悬停了八秒，最后主动选择了“回复全部”。','一次慎重考虑后的全员打扰。','message',true),
('final-final-file','最终版迷宫案','被控提交文件“最终版_最终版2_这次真不改了.xlsx”，导致所有人用错版本。','文件修改历史','你电脑里同时存在另外七个带“最终”字样的版本，最新一个名为“真的最终版”。','文件名没有说谎，只是没有说完。','document',true),
('meeting-last-question','散会追问案','被控在领导宣布散会时突然问“还有吗？”，让会议又延长了四十分钟。','会议录音','录音显示你提问后立刻关闭摄像头，并在聊天框里发了一个下班表情。','发问很积极，撤退也很及时。','meeting',true),
('yellow-excel','全表重点案','被控把 Excel 所有单元格标成黄色，并解释“黄色代表重点”。','格式操作记录','操作历史显示你先全选了整张工作表，然后才点击黄色填充。','当全部都是重点时，重点获得了平等。','document',true),
('quick-sync-lunch','午休对齐案','被控在午休时间发起名为“快速对齐一下”的会议，持续了六十七分钟。','日历与外卖记录','会议开始三分钟前，你取消了自己的午餐订单，但没有通知任何参会人。','信息已经对齐，血糖尚未对齐。','meeting',true),
('ticket-no-detail','系统有问题案','被控提交故障工单只写“系统有问题”，没有截图、时间或操作步骤。','浏览器访问记录','提交工单前，你已经打开过完整的错误详情页面，并停留了两分钟。','问题很具体，描述十分克制。','equipment',true),
('restaurant-anything','随便吃什么案','被控在聚餐投票中选择“随便”，随后否决了所有候选餐厅。','聊天记录','投票开始前，你已经私下向三个人推荐了同一家火锅店。','随便是一种态度，也可能是一家店。','daily',true),
('borrowed-charger','充电器缩水案','被控借走同事的一整套充电器，归还时只剩一根数据线。','工位监控截图','画面显示你归还前曾把充电头放进自己的抽屉，并认真地点了点头。','归还动作完整，归还物品略有精简。','equipment',true),
('busy-lunch-survey','忙碌状态案','被控把在线状态设为“忙碌”，随后逐个询问大家中午吃什么。','状态变更日志','日志显示“忙碌”状态是在第一位同事回复“有事吗”之后才设置的。','忙于工作，具体工作是统计午饭。','message',true),
('monitor-reboot','重启显示器案','被控在网络中断时连续重启显示器三次，并声称是在排查故障。','设备与网络日志','网络恢复时你的显示器仍处于关闭状态，但你立即宣布“果然修好了”。','因果关系大胆，恢复结果真实。','equipment',true),
('ppt-transitions','四十七种动画案','被控为五页汇报 PPT 添加四十七种切换动画，导致汇报像综艺片头。','模板下载记录','你在制作前搜索并下载了“让领导眼前一亮的动画大全”。','领导确实眼前一亮，时间也确实不够。','document',true),
('unread-reminder','三周未读案','被控故意保留一条未读消息作为提醒，三周后仍然没有打开。','消息转发记录','第二天你曾把该消息截图发给自己，并配文“晚点一定看”。','提醒机制运行稳定，执行模块暂未上线。','message',true),
('meeting-room-charge','会议室充电案','被控预约会议室两小时，实际只在里面给手机充电。','会议室设备记录','会议电视从未开启，但桌上插座在两小时内持续输出快充功率。','会议没有召开，电量达成共识。','equipment',true),
('single-side-print','八十页单面案','被控打印八十页材料时选择单面打印，使打印机当场缺纸。','打印设置截图','打印窗口默认勾选双面，而你曾手动取消并点击“记住此设置”。','纸张承担了本不该承担的留白。','document',true),
('wrong-group-all','发错群案','被控在群里发出“@所有人”，随后解释“抱歉，发错群了”。','草稿与群聊记录','同样的内容没有出现在任何其他群里，你也没有再次发送。','群可能发错了，提醒倒是准确送达。','message',true),
('mute-meeting','忘记静音案','被控在会议中忘记静音，并清晰说出“这个会怎么还没结束”。','快捷键记录','系统记录显示你在说话前刚按过一次静音键，但按成了解除静音。','操作意图明确，执行方向相反。','meeting',true),
('search-share','共享搜索记录案','被控共享屏幕时暴露搜索记录：“如何礼貌拒绝临时会议”。','会议邀请记录','发起这场临时会议的人正是你，而且标题写着“大家畅所欲言”。','礼貌已经搜索到，拒绝尚未执行。','meeting',true)
on conflict(id) do update set
  title=excluded.title,
  charge=excluded.charge,
  evidence_title=excluded.evidence_title,
  evidence=excluded.evidence,
  verdict_template=excluded.verdict_template,
  category=excluded.category,
  enabled=excluded.enabled;

create or replace function public.create_court_game_v5(p_code text,p_owner_player_id text,p_owner_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 12 then raise exception '称呼须为 1–12 字'; end if;
  state := jsonb_build_object(
    'code',p_code,'gameType','absurd_court','courtVersion',5,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false,'eligibleFromRound',1)),
    'playerLimit',8,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,'totalRounds',3,
    'phaseDeadlineAt',null,'caseId',null,'caseTitle',null,'charge',null,'evidenceTitle',null,'evidence',null,'verdictTemplate',null,
    'usedCaseIds','[]'::jsonb,'previousSessionCaseIds','[]'::jsonb,'expectedPlayerIds','[]'::jsonb,
    'statementStatuses','{}'::jsonb,'responseStatuses','{}'::jsonb,'voteStatuses','{}'::jsonb,
    'statementConfirmedCount',0,'responseConfirmedCount',0,'voteConfirmedCount',0,
    'publicEntries','[]'::jsonb,'roundResults','[]'::jsonb,'totalScores','{}'::jsonb
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version)
  values(p_code,auth.uid(),p_owner_player_id,state,1);
  insert into public.game_members(game_code,user_uid,player_id)
  values(p_code,auth.uid(),p_owner_player_id);
  return state;
end $$;

create or replace function public.join_court_game_v5(p_code text,p_player_id text,p_nickname text)
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
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>5 then raise exception '离谱法堂房间不存在'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  players := coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(players)>=coalesce((g.state->>'playerLimit')::integer,8) then raise exception '房间已满'; end if;
  eligible_round := case when g.state->>'status'='lobby' then 1 else coalesce((g.state->>'round')::integer,0)+1 end;
  players := players || jsonb_build_array(jsonb_build_object(
    'id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(players)+1,
    'alive',true,'cardReady',false,'away',false,'eligibleFromRound',eligible_round
  ));
  ver := g.version+1;
  v_state := jsonb_set(g.state,'{players}',players);
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;

create or replace function public.get_my_court_submission_v5(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  state jsonb;
  row_data public.court_v5_submissions%rowtype;
  v_session_no integer;
  v_round_no integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select g.state into state from public.games g where g.code=upper(p_code) and g.expires_at>now();
  if state is null or state->>'gameType'<>'absurd_court' then raise exception '离谱法堂房间不存在'; end if;
  v_session_no := coalesce((state->>'sessionNo')::integer,1);
  v_round_no := coalesce((state->>'round')::integer,0);
  select * into row_data from public.court_v5_submissions
  where game_code=upper(p_code) and court_v5_submissions.session_no=v_session_no
    and court_v5_submissions.round_no=v_round_no and player_id=actor;
  if not found then
    return jsonb_build_object('sessionNo',v_session_no,'round',v_round_no,'submissionId',null,'statement','','statementConfirmed',false,'response','','responseConfirmed',false);
  end if;
  return jsonb_build_object(
    'sessionNo',v_session_no,'round',v_round_no,'submissionId',row_data.submission_id,
    'statement',coalesce(row_data.statement,''),'statementConfirmed',row_data.statement_confirmed_at is not null,
    'response',coalesce(row_data.response,''),'responseConfirmed',row_data.response_confirmed_at is not null
  );
end $$;

create or replace function public.court_v5_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  expected jsonb;
  statuses jsonb;
  selected public.court_case_packs%rowtype;
begin
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb)
  into expected
  from jsonb_array_elements(state->'players') as player_rows(player)
  where coalesce((player->>'alive')::boolean,true)
    and not coalesce((player->>'away')::boolean,false)
    and coalesce((player->>'eligibleFromRound')::integer,1)<=p_round;
  if jsonb_array_length(expected)<3 then
    state := jsonb_set(state,'{status}','"finished"');
    return jsonb_set(state,'{phaseDeadlineAt}','null');
  end if;
  select * into selected from public.court_case_packs
  where enabled and not (coalesce(state->'usedCaseIds','[]'::jsonb) ? id)
    and not (coalesce(state->'previousSessionCaseIds','[]'::jsonb) ? id)
  order by random() limit 1;
  if not found then
    select * into selected from public.court_case_packs
    where enabled and not (coalesce(state->'usedCaseIds','[]'::jsonb) ? id)
    order by random() limit 1;
  end if;
  if not found then select * into selected from public.court_case_packs where enabled order by random() limit 1; end if;
  select coalesce(jsonb_object_agg(id,'writing'),'{}'::jsonb)
  into statuses from jsonb_array_elements_text(expected) as expected_rows(id);
  state := jsonb_set(state,'{status}','"statement"');
  state := jsonb_set(state,'{round}',to_jsonb(p_round));
  state := jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
  state := jsonb_set(state,'{caseId}',to_jsonb(selected.id));
  state := jsonb_set(state,'{caseTitle}',to_jsonb(selected.title));
  state := jsonb_set(state,'{charge}',to_jsonb(selected.charge));
  state := jsonb_set(state,'{evidenceTitle}',to_jsonb(selected.evidence_title));
  state := jsonb_set(state,'{evidence}',to_jsonb(selected.evidence));
  state := jsonb_set(state,'{verdictTemplate}',to_jsonb(selected.verdict_template));
  state := jsonb_set(state,'{usedCaseIds}',coalesce(state->'usedCaseIds','[]'::jsonb)||jsonb_build_array(selected.id));
  state := jsonb_set(state,'{expectedPlayerIds}',expected);
  state := jsonb_set(state,'{statementStatuses}',statuses);
  state := jsonb_set(state,'{responseStatuses}','{}'::jsonb);
  state := jsonb_set(state,'{voteStatuses}','{}'::jsonb);
  state := jsonb_set(state,'{statementConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{responseConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{voteConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{publicEntries}','[]'::jsonb);
  return state;
end $$;

create or replace function public.court_v5_reveal_statements(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  entries jsonb;
  statuses jsonb;
  v_session_no integer := (p_state->>'sessionNo')::integer;
  v_round_no integer := (p_state->>'round')::integer;
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb)
  into statuses from jsonb_each_text(coalesce(state->'statementStatuses','{}'::jsonb));
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),
    'statement',statement,'response',null
  ) order by seq),'[]'::jsonb)
  into entries
  from (
    select submission_id,statement,row_number() over(order by md5(submission_id)) seq
    from public.court_v5_submissions
    where game_code=p_code and court_v5_submissions.session_no=v_session_no
      and court_v5_submissions.round_no=v_round_no and statement_confirmed_at is not null
  ) confirmed;
  state := jsonb_set(state,'{statementStatuses}',statuses);
  state := jsonb_set(state,'{publicEntries}',entries);
  state := jsonb_set(state,'{status}','"statement_reveal"');
  return jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+5000));
end $$;

create or replace function public.court_v5_open_evidence(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  p_state := jsonb_set(p_state,'{status}','"evidence"');
  return jsonb_set(p_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+5000));
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
  return jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
end $$;

create or replace function public.court_v5_open_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  entries jsonb;
  response_statuses jsonb;
  vote_statuses jsonb;
  v_session_no integer := (p_state->>'sessionNo')::integer;
  v_round_no integer := (p_state->>'round')::integer;
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb)
  into response_statuses from jsonb_each_text(coalesce(state->'responseStatuses','{}'::jsonb));
  select coalesce(jsonb_object_agg(expected_id,case when coalesce((player->>'away')::boolean,false) then 'away' else 'unvoted' end),'{}'::jsonb)
  into vote_statuses
  from jsonb_array_elements_text(state->'expectedPlayerIds') as expected_rows(expected_id)
  left join lateral (
    select player from jsonb_array_elements(state->'players') as player_rows(player) where player->>'id'=expected_id
  ) matched on true;
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),
    'statement',statement,'response',case when response_confirmed_at is null then null else response end
  ) order by seq),'[]'::jsonb)
  into entries
  from (
    select submission_id,statement,response,response_confirmed_at,row_number() over(order by md5(submission_id)) seq
    from public.court_v5_submissions
    where game_code=p_code and court_v5_submissions.session_no=v_session_no
      and court_v5_submissions.round_no=v_round_no and statement_confirmed_at is not null
  ) confirmed;
  state := jsonb_set(state,'{responseStatuses}',response_statuses);
  state := jsonb_set(state,'{voteStatuses}',vote_statuses);
  state := jsonb_set(state,'{publicEntries}',entries);
  state := jsonb_set(state,'{status}','"voting"');
  return jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+30000));
end $$;

create or replace function public.court_v5_finish_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  entries jsonb;
  statuses jsonb;
  winners jsonb := '[]'::jsonb;
  v_session_no integer := (p_state->>'sessionNo')::integer;
  v_round_no integer := (p_state->>'round')::integer;
  max_score integer := 0;
  score_row record;
begin
  select coalesce(jsonb_object_agg(key,case when value='unvoted' then 'unconfirmed' else value end),'{}'::jsonb)
  into statuses from jsonb_each_text(coalesce(state->'voteStatuses','{}'::jsonb));
  select coalesce(max(score),0) into max_score
  from (
    select submission.submission_id,count(vote.player_id)::integer score
    from public.court_v5_submissions submission
    left join public.court_v5_votes vote
      on vote.game_code=submission.game_code and vote.session_no=submission.session_no
      and vote.round_no=submission.round_no and vote.submission_id=submission.submission_id
    where submission.game_code=p_code and submission.session_no=v_session_no
      and submission.round_no=v_round_no and submission.statement_confirmed_at is not null
    group by submission.submission_id
  ) scores;
  if max_score>0 then
    select coalesce(jsonb_agg(player_id),'[]'::jsonb) into winners
    from (
      select submission.player_id,count(vote.player_id)::integer score
      from public.court_v5_submissions submission
      left join public.court_v5_votes vote
        on vote.game_code=submission.game_code and vote.session_no=submission.session_no
        and vote.round_no=submission.round_no and vote.submission_id=submission.submission_id
      where submission.game_code=p_code and submission.session_no=v_session_no
        and submission.round_no=v_round_no and submission.statement_confirmed_at is not null
      group by submission.player_id
    ) scores where score=max_score;
  end if;
  for score_row in
    select submission.player_id,count(vote.player_id)::integer score
    from public.court_v5_submissions submission
    left join public.court_v5_votes vote
      on vote.game_code=submission.game_code and vote.session_no=submission.session_no
      and vote.round_no=submission.round_no and vote.submission_id=submission.submission_id
    where submission.game_code=p_code and submission.session_no=v_session_no
      and submission.round_no=v_round_no and submission.statement_confirmed_at is not null
    group by submission.player_id
  loop
    state := jsonb_set(state,array['totalScores',score_row.player_id],
      to_jsonb(coalesce((state->'totalScores'->>score_row.player_id)::integer,0)+score_row.score),true);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),
    'statement',statement,'response',case when response_confirmed_at is null then null else response end,
    'authorId',player_id,'authorName',author_name,'roundVotes',round_votes
  ) order by seq),'[]'::jsonb)
  into entries
  from (
    select submission.*,row_number() over(order by md5(submission.submission_id)) seq,
      (select player->>'name' from jsonb_array_elements(state->'players') as player_rows(player) where player->>'id'=submission.player_id) author_name,
      (select count(*) from public.court_v5_votes vote where vote.game_code=p_code
        and vote.session_no=v_session_no and vote.round_no=v_round_no
        and vote.submission_id=submission.submission_id) round_votes
    from public.court_v5_submissions submission
    where submission.game_code=p_code and submission.session_no=v_session_no
      and submission.round_no=v_round_no and submission.statement_confirmed_at is not null
  ) revealed;
  state := jsonb_set(state,'{voteStatuses}',statuses);
  state := jsonb_set(state,'{publicEntries}',entries);
  state := jsonb_set(state,'{roundResults}',coalesce(state->'roundResults','[]'::jsonb)||jsonb_build_array(
    jsonb_build_object('round',v_round_no,'winnerIds',winners,'highestVotes',max_score)
  ));
  state := jsonb_set(state,'{status}','"result"');
  return jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.court_v5_restart(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  state jsonb := p_state;
  players jsonb;
begin
  select coalesce(jsonb_agg(jsonb_set(player,'{eligibleFromRound}','1'::jsonb) order by (player->>'seat')::integer),'[]'::jsonb)
  into players from jsonb_array_elements(state->'players') as player_rows(player);
  state := jsonb_set(state,'{sessionNo}',to_jsonb((state->>'sessionNo')::integer+1));
  state := jsonb_set(state,'{status}','"lobby"');
  state := jsonb_set(state,'{round}','0'::jsonb);
  state := jsonb_set(state,'{phaseDeadlineAt}','null');
  state := jsonb_set(state,'{players}',players);
  state := jsonb_set(state,'{previousSessionCaseIds}',coalesce(state->'usedCaseIds','[]'::jsonb));
  state := jsonb_set(state,'{usedCaseIds}','[]'::jsonb);
  state := jsonb_set(state,'{expectedPlayerIds}','[]'::jsonb);
  state := jsonb_set(state,'{statementStatuses}','{}'::jsonb);
  state := jsonb_set(state,'{responseStatuses}','{}'::jsonb);
  state := jsonb_set(state,'{voteStatuses}','{}'::jsonb);
  state := jsonb_set(state,'{statementConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{responseConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{voteConfirmedCount}','0'::jsonb);
  state := jsonb_set(state,'{publicEntries}','[]'::jsonb);
  state := jsonb_set(state,'{roundResults}','[]'::jsonb);
  state := jsonb_set(state,'{totalScores}','{}'::jsonb);
  state := jsonb_set(state,'{caseId}','null');
  state := jsonb_set(state,'{caseTitle}','null');
  state := jsonb_set(state,'{charge}','null');
  state := jsonb_set(state,'{evidenceTitle}','null');
  state := jsonb_set(state,'{evidence}','null');
  state := jsonb_set(state,'{verdictTemplate}','null');
  return state;
end $$;

create or replace function public.apply_court_action_v5(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,
  p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
<<court_v5_action>>
declare
  g public.games%rowtype;
  state jsonb;
  actor text;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint;
  v_round integer;
  v_session integer;
  action_session integer;
  deadline bigint;
  body text;
  target text;
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
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>5 then raise exception '离谱法堂 V5 房间不存在'; end if;
  state := g.state;
  v_round := coalesce((state->>'round')::integer,0);
  v_session := coalesce((state->>'sessionNo')::integer,1);
  action_session := p_expected_session;
  if exists(select 1 from public.court_v5_actions where game_code=g.code and session_no=action_session and action_id=p_action_id) then
    return jsonb_build_object('outcome','duplicate','code','ALREADY_APPLIED','message','操作已经完成','state',state,'version',g.version);
  end if;
  if p_expected_status is distinct from state->>'status'
    or p_expected_round is distinct from v_round
    or p_expected_session is distinct from v_session
    or p_expected_version is distinct from g.version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','message','状态已更新，请重试','state',state,'version',g.version);
  end if;
  deadline := coalesce((state->>'phaseDeadlineAt')::bigint,0);

  if p_action_type='start_court_game' then
    if state->>'status'<>'lobby' or state->>'ownerId'<>actor then raise exception '只有房主可以开始'; end if;
    state := public.court_v5_begin_round(g.code,state,1,now_ms);

  elsif p_action_type='confirm_court_statement' then
    if state->>'status'<>'statement' then raise exception '当前不是首次陈词阶段'; end if;
    if not (state->'expectedPlayerIds' ? actor) or coalesce((select (player->>'away')::boolean from jsonb_array_elements(state->'players') as player_rows(player) where player->>'id'=actor),false) then raise exception '本轮无需提交'; end if;
    if state->'statementStatuses'->>actor='confirmed' then
      return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','首次陈词已经确认','state',state,'version',g.version);
    end if;
    body := trim(coalesce(p_payload->>'statement',''));
    if length(body) not between 1 and 80 then raise exception '首次陈词须为 1–80 字'; end if;
    insert into public.court_v5_submissions(game_code,session_no,round_no,player_id,submission_id,statement,statement_confirmed_at)
    values(g.code,v_session,v_round,actor,'cv5-'||substr(md5(random()::text||clock_timestamp()::text||actor),1,24),body,now());
    state := jsonb_set(state,array['statementStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(state->'statementStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(state->'statementStatuses') where value<>'away';
    state := jsonb_set(state,'{statementConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then state := public.court_v5_reveal_statements(g.code,state,now_ms); end if;

  elsif p_action_type='confirm_court_response' then
    if state->>'status'<>'response' then raise exception '当前不是当庭补述阶段'; end if;
    actor_status := state->'responseStatuses'->>actor;
    if actor_status is distinct from 'writing' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','当庭补述已经确认','state',state,'version',g.version); end if;
      raise exception '本轮无需提交';
    end if;
    body := trim(coalesce(p_payload->>'response',''));
    if length(body) not between 1 and 80 then raise exception '当庭补述须为 1–80 字'; end if;
    update public.court_v5_submissions set response=body,response_confirmed_at=now()
    where game_code=g.code and court_v5_submissions.session_no=v_session
      and court_v5_submissions.round_no=v_round and player_id=actor
      and statement_confirmed_at is not null and response_confirmed_at is null;
    if not found then raise exception '首次陈词未确认或当庭补述已经确认'; end if;
    state := jsonb_set(state,array['responseStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(state->'responseStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(state->'responseStatuses') where value not in ('away','unconfirmed');
    state := jsonb_set(state,'{responseConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then state := public.court_v5_open_voting(g.code,state,now_ms); end if;

  elsif p_action_type='confirm_court_vote' then
    if state->>'status'<>'voting' then raise exception '当前不是陪审团表决阶段'; end if;
    actor_status := state->'voteStatuses'->>actor;
    if actor_status is distinct from 'unvoted' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','选票已经确认','state',state,'version',g.version); end if;
      raise exception '本轮无需投票';
    end if;
    target := coalesce(p_payload->>'submissionId','');
    if not exists(select 1 from public.court_v5_submissions submission
      where submission.game_code=g.code and submission.session_no=v_session
        and submission.round_no=v_round and submission.submission_id=target
        and submission.statement_confirmed_at is not null and submission.player_id<>actor) then
      raise exception '不能投给自己的陈述或无效陈述';
    end if;
    insert into public.court_v5_votes(game_code,session_no,round_no,player_id,submission_id)
    values(g.code,v_session,v_round,actor,target);
    state := jsonb_set(state,array['voteStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(state->'voteStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(state->'voteStatuses') where value<>'away';
    state := jsonb_set(state,'{voteConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then state := public.court_v5_finish_voting(g.code,state,now_ms); end if;

  elsif p_action_type='change_court_presence' then
    desired_away := coalesce((p_payload->>'away')::boolean,false);
    select coalesce(jsonb_agg(
      case when player->>'id'=actor then jsonb_set(player,'{away}',to_jsonb(desired_away)) else player end
      order by (player->>'seat')::integer
    ),'[]'::jsonb) into players from jsonb_array_elements(state->'players') as player_rows(player);
    state := jsonb_set(state,'{players}',players);
    if state->>'status'='statement' and state->'expectedPlayerIds' ? actor then
      state := jsonb_set(state,array['statementStatuses',actor],
        to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'confirmed' else 'writing' end),true);
      select count(*) into n from jsonb_each_text(state->'statementStatuses') where value='confirmed';
      select count(*) into eligible from jsonb_each_text(state->'statementStatuses') where value<>'away';
      state := jsonb_set(state,'{statementConfirmedCount}',to_jsonb(n));
      if eligible>0 and n>=eligible then state := public.court_v5_reveal_statements(g.code,state,now_ms); end if;
    elsif state->>'status'='response' and state->'expectedPlayerIds' ? actor then
      state := jsonb_set(state,array['responseStatuses',actor],
        to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.response_confirmed_at is not null) then 'confirmed' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'writing' else 'unconfirmed' end),true);
      select count(*) into n from jsonb_each_text(state->'responseStatuses') where value='confirmed';
      select count(*) into eligible from jsonb_each_text(state->'responseStatuses') where value not in ('away','unconfirmed');
      state := jsonb_set(state,'{responseConfirmedCount}',to_jsonb(n));
      if eligible>0 and n>=eligible then state := public.court_v5_open_voting(g.code,state,now_ms); end if;
    elsif state->>'status'='voting' and state->'expectedPlayerIds' ? actor then
      state := jsonb_set(state,array['voteStatuses',actor],
        to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_votes vote where vote.game_code=g.code and vote.session_no=v_session and vote.round_no=v_round and vote.player_id=actor) then 'confirmed' else 'unvoted' end),true);
      select count(*) into n from jsonb_each_text(state->'voteStatuses') where value='confirmed';
      select count(*) into eligible from jsonb_each_text(state->'voteStatuses') where value<>'away';
      state := jsonb_set(state,'{voteConfirmedCount}',to_jsonb(n));
      if eligible>0 and n>=eligible then state := public.court_v5_finish_voting(g.code,state,now_ms); end if;
    end if;

  elsif p_action_type='advance_court_phase' then
    if now_ms<deadline then raise exception '当前阶段尚未结束'; end if;
    if state->>'status'='statement' then state := public.court_v5_reveal_statements(g.code,state,now_ms);
    elsif state->>'status'='statement_reveal' then state := public.court_v5_open_evidence(state,now_ms);
    elsif state->>'status'='evidence' then state := public.court_v5_open_response(g.code,state,now_ms);
    elsif state->>'status'='response' then state := public.court_v5_open_voting(g.code,state,now_ms);
    elsif state->>'status'='voting' then state := public.court_v5_finish_voting(g.code,state,now_ms);
    elsif state->>'status'='result' then
      if v_round>=3 then
        state := jsonb_set(state,'{status}','"finished"');
        state := jsonb_set(state,'{phaseDeadlineAt}','null');
      else
        state := public.court_v5_begin_round(g.code,state,v_round+1,now_ms);
      end if;
    else raise exception '当前阶段无需推进';
    end if;

  elsif p_action_type='end_court_game' then
    if state->>'ownerId'<>actor then raise exception '只有房主可以结束'; end if;
    state := jsonb_set(state,'{status}','"finished"');
    state := jsonb_set(state,'{phaseDeadlineAt}','null');

  elsif p_action_type='restart_court_game' then
    if state->>'status'<>'finished' or state->>'ownerId'<>actor then raise exception '只有房主可以再来一局'; end if;
    state := public.court_v5_restart(state,now_ms);

  else
    raise exception 'unsupported court action';
  end if;

  ver := g.version+1;
  state := jsonb_set(state,'{version}',to_jsonb(ver));
  state := jsonb_set(state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=court_v5_action.state,version=ver,updated_at=now() where code=g.code;
  insert into public.court_v5_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result)
  values(g.code,action_session,p_action_id,actor,p_action_type,v_round,jsonb_build_object('outcome','applied','code','OK'));
  return jsonb_build_object('outcome','applied','code','OK','message','操作成功','state',state,'version',ver);
end $$;

revoke all on public.court_case_packs,public.court_v5_submissions,public.court_v5_votes,public.court_v5_actions from anon,authenticated;
revoke all on function public.court_v5_begin_round(text,jsonb,integer,bigint) from public;
revoke all on function public.court_v5_reveal_statements(text,jsonb,bigint) from public;
revoke all on function public.court_v5_open_evidence(jsonb,bigint) from public;
revoke all on function public.court_v5_open_response(text,jsonb,bigint) from public;
revoke all on function public.court_v5_open_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v5_finish_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v5_restart(jsonb,bigint) from public;
revoke all on function public.create_court_game_v5(text,text,text) from public;
revoke all on function public.join_court_game_v5(text,text,text) from public;
revoke all on function public.get_my_court_submission_v5(text) from public;
revoke all on function public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.create_court_game_v5(text,text,text) to anon,authenticated;
grant execute on function public.join_court_game_v5(text,text,text) to anon,authenticated;
grant execute on function public.get_my_court_submission_v5(text) to anon,authenticated;
grant execute on function public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated;
