-- 离谱法堂 Draft 0.4 / V7 攻防样板增量。
-- 依赖已通过核验的 V5/V6/V1.6.2；复用 V5 私密陈词表，新增招式、质询、V7 选票与版本化 RPC。
-- 本文件不删除或覆盖 V5/V6 对象，新建的 V7 房间仅抽取六套已配置质询的样板案件。

create table if not exists public.court_v7_tactics (
  id text primary key,
  name text not null unique,
  instruction text not null,
  enabled boolean not null default true
);

insert into public.court_v7_tactics(id,name,instruction,enabled) values
  ('admit-small','承认小错','主动承认一个小问题，但坚持真正的大锅不属于你。',true),
  ('process-blame','流程背锅','把结果解释成流程、规定或交接方式造成的。',true),
  ('reverse-credit','反向邀功','把看似翻车的行为解释成一次贡献或优化。',true),
  ('emotional','打感情牌','强调你的出发点是照顾同事、团队或大家的感受。',true),
  ('wording','抓住字眼','抓住题目中的一个词，证明大家误解了你的原意。',true),
  ('everyone-does-it','大家都这样','说明这是普遍做法，只是这次刚好被记录下来。',true),
  ('technical','技术问题','把关键矛盾解释成设备、软件、网络或操作界面的问题。',true),
  ('collective','为了集体','说明你的选择是在保护团队效率或避免更大的损失。',true)
on conflict(id) do update set name=excluded.name,instruction=excluded.instruction,enabled=excluded.enabled;

create table if not exists public.court_v7_case_questions (
  case_id text not null references public.court_case_packs(id) on delete cascade,
  question_id text not null,
  position integer not null check(position between 1 and 3),
  question_text text not null,
  primary key(case_id,question_id),
  unique(case_id,position)
);

insert into public.court_v7_case_questions(case_id,question_id,position,question_text) values
  ('friday-overtime','timeline',1,'你为什么 18:02 就先走了？'),
  ('friday-overtime','responsibility',2,'如果没人要求加班，大家为什么都留下了？'),
  ('friday-overtime','motive',3,'这件事最后到底对谁最有好处？'),
  ('final-final-file','timeline',1,'既然是真最终版，后面七个版本是什么？'),
  ('final-final-file','responsibility',2,'别人用错版本时，你为什么没提醒？'),
  ('final-final-file','motive',3,'为什么不用日期，偏要一直写最终？'),
  ('restaurant-anything','timeline',1,'你否决的餐厅到底哪里不行？'),
  ('restaurant-anything','responsibility',2,'既然都随便，为什么只推荐火锅？'),
  ('restaurant-anything','motive',3,'这次投票还有实际意义吗？'),
  ('ppt-transitions','timeline',1,'四十七种动画分别解决了什么问题？'),
  ('ppt-transitions','responsibility',2,'删掉的正文是不是比动画更重要？'),
  ('ppt-transitions','motive',3,'你自己看完后记住了哪一页内容？'),
  ('meeting-room-charge','timeline',1,'没有通话记录，你到底和谁开会？'),
  ('meeting-room-charge','responsibility',2,'为什么不用工位上的充电插座？'),
  ('meeting-room-charge','motive',3,'两小时里产生了什么会议结论？'),
  ('wrong-group-all','timeline',1,'发现发错群后为什么没有立即撤回？'),
  ('wrong-group-all','responsibility',2,'队伍满员的人是不是就在部门群里？'),
  ('wrong-group-all','motive',3,'你是不是故意用“发错了”掩护招人？')
on conflict(case_id,question_id) do update set position=excluded.position,question_text=excluded.question_text;

create table if not exists public.court_v7_case_archive (
  case_id text primary key references public.court_case_packs(id) on delete cascade,
  tactic_name text not null,
  question_text text not null
);

insert into public.court_v7_case_archive(case_id,tactic_name,question_text) values
  ('friday-overtime','抓住字眼','你说的五分钟到底指什么？'),
  ('final-final-file','抓住字眼','“最终”这两个字还有有效期吗？'),
  ('restaurant-anything','承认小错','你所谓的随便有什么隐藏条件？'),
  ('ppt-transitions','反向邀功','冲击力和看不懂有什么区别？'),
  ('meeting-room-charge','技术问题','静默会议为什么需要预约两小时？'),
  ('wrong-group-all','反向邀功','既然发错了，为什么结果刚好有效？')
on conflict(case_id) do update set tactic_name=excluded.tactic_name,question_text=excluded.question_text;

create table if not exists public.court_v7_assignments (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  tactic_id text not null references public.court_v7_tactics(id),
  target_player_id text,
  target_submission_id text,
  primary key(game_code,session_no,round_no,player_id)
);

create table if not exists public.court_v7_questions (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  questioner_id text not null,
  target_player_id text not null,
  question_id text not null,
  question_text text not null,
  confirmed_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,questioner_id),
  unique(game_code,session_no,round_no,target_player_id)
);

create table if not exists public.court_v7_rerolls (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  player_id text not null,
  used_at timestamptz not null default now(),
  primary key(game_code,session_no,player_id)
);

create table if not exists public.court_v7_votes (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  best_submission_id text not null,
  truth_submission_id text not null,
  confirmed_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,player_id)
);

create table if not exists public.court_v7_actions (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  action_id text not null,
  actor_player_id text not null,
  action_type text not null,
  round_no integer not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(game_code,session_no,action_id)
);

alter table public.court_v7_tactics enable row level security;
alter table public.court_v7_case_questions enable row level security;
alter table public.court_v7_case_archive enable row level security;
alter table public.court_v7_assignments enable row level security;
alter table public.court_v7_questions enable row level security;
alter table public.court_v7_rerolls enable row level security;
alter table public.court_v7_votes enable row level security;
alter table public.court_v7_actions enable row level security;

create or replace function public.create_court_game_v7(p_code text,p_owner_player_id text,p_owner_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 12 then raise exception '称呼须为 1–12 字'; end if;
  v_state := jsonb_build_object(
    'code',p_code,'gameType','absurd_court','courtVersion',7,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false,'eligibleFromRound',1)),
    'playerLimit',8,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,'totalRounds',3,
    'phaseDeadlineAt',null,'caseId',null,'caseTitle',null,'charge',null,'evidenceTitle',null,'evidence',null,'verdictTemplate',null,
    'usedCaseIds','[]'::jsonb,'previousSessionCaseIds','[]'::jsonb,'expectedPlayerIds','[]'::jsonb,
    'statementStatuses','{}'::jsonb,'questionStatuses','{}'::jsonb,'responseStatuses','{}'::jsonb,'voteStatuses','{}'::jsonb,
    'statementConfirmedCount',0,'questionConfirmedCount',0,'responseConfirmedCount',0,'voteConfirmedCount',0,
    'publicEntries','[]'::jsonb,'roundResults','[]'::jsonb,'totalBestScores','{}'::jsonb,'totalTruthScores','{}'::jsonb
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,v_state,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return v_state;
end $$;

create or replace function public.court_v7_open_questioning(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
  entries jsonb;
  statement_statuses jsonb;
  question_statuses jsonb;
  participant_ids text[];
  participant_submissions text[];
  idx integer;
  target_idx integer;
begin
  select array_agg(submission.player_id order by md5(submission.submission_id)),array_agg(submission.submission_id order by md5(submission.submission_id))
    into participant_ids,participant_submissions
    from public.court_v5_submissions submission
    where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.statement_confirmed_at is not null
      and not coalesce((select (player->>'away')::boolean from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=submission.player_id),false);
  if coalesce(cardinality(participant_ids),0)>1 then
    for idx in 1..cardinality(participant_ids) loop
      target_idx := case when idx=cardinality(participant_ids) then 1 else idx+1 end;
      update public.court_v7_assignments set target_player_id=participant_ids[target_idx],target_submission_id=participant_submissions[target_idx]
        where game_code=p_code and session_no=v_session and round_no=v_round and player_id=participant_ids[idx];
    end loop;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),'statement',statement,
    'tacticName',tactic_name,'question',null,'response',null
  ) order by seq),'[]'::jsonb) into entries
  from (
    select submission.submission_id,submission.statement,tactic.name tactic_name,
      row_number() over(order by md5(submission.submission_id)) seq
    from public.court_v5_submissions submission
    join public.court_v7_assignments assignment on assignment.game_code=submission.game_code and assignment.session_no=submission.session_no and assignment.round_no=submission.round_no and assignment.player_id=submission.player_id
    join public.court_v7_tactics tactic on tactic.id=assignment.tactic_id
    where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.statement_confirmed_at is not null
  ) candidates;
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb) into statement_statuses
    from jsonb_each_text(coalesce(v_state->'statementStatuses','{}'::jsonb));
  select coalesce(jsonb_object_agg(expected_id,
    case when coalesce((player->>'away')::boolean,false) then 'away'
      when exists(select 1 from public.court_v7_assignments assignment where assignment.game_code=p_code and assignment.session_no=v_session and assignment.round_no=v_round and assignment.player_id=expected_id and assignment.target_submission_id is not null) then 'choosing'
      else 'unconfirmed' end),'{}'::jsonb) into question_statuses
  from jsonb_array_elements_text(v_state->'expectedPlayerIds') as expected_rows(expected_id)
  left join lateral (select player from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=expected_id) matched on true;
  v_state := jsonb_set(v_state,'{statementStatuses}',statement_statuses);
  v_state := jsonb_set(v_state,'{questionStatuses}',question_statuses);
  v_state := jsonb_set(v_state,'{questionConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicEntries}',entries);
  v_state := jsonb_set(v_state,'{status}','"questioning"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+45000));
end $$;

create or replace function public.court_v7_open_evidence(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
  statuses jsonb;
begin
  insert into public.court_v7_questions(game_code,session_no,round_no,questioner_id,target_player_id,question_id,question_text)
  select assignment.game_code,assignment.session_no,assignment.round_no,assignment.player_id,assignment.target_player_id,question.question_id,question.question_text
  from public.court_v7_assignments assignment
  join lateral (
    select candidate.question_id,candidate.question_text from public.court_v7_case_questions candidate
    where candidate.case_id=v_state->>'caseId' order by md5(assignment.player_id||candidate.question_id) limit 1
  ) question on true
  where assignment.game_code=p_code and assignment.session_no=v_session and assignment.round_no=v_round and assignment.target_player_id is not null
    and not exists(select 1 from public.court_v7_questions existing where existing.game_code=p_code and existing.session_no=v_session and existing.round_no=v_round and existing.questioner_id=assignment.player_id)
  on conflict do nothing;
  insert into public.court_v7_questions(game_code,session_no,round_no,questioner_id,target_player_id,question_id,question_text)
  select assignment.game_code,assignment.session_no,assignment.round_no,'system-'||assignment.player_id,assignment.player_id,question.question_id,question.question_text
  from public.court_v7_assignments assignment
  join public.court_v5_submissions submission on submission.game_code=assignment.game_code and submission.session_no=assignment.session_no and submission.round_no=assignment.round_no and submission.player_id=assignment.player_id and submission.statement_confirmed_at is not null
  join lateral (
    select candidate.question_id,candidate.question_text from public.court_v7_case_questions candidate
    where candidate.case_id=v_state->>'caseId' order by candidate.position limit 1
  ) question on true
  where assignment.game_code=p_code and assignment.session_no=v_session and assignment.round_no=v_round and assignment.target_player_id is null
    and not exists(select 1 from public.court_v7_questions existing where existing.game_code=p_code and existing.session_no=v_session and existing.round_no=v_round and existing.target_player_id=assignment.player_id)
  on conflict do nothing;
  select coalesce(jsonb_object_agg(key,case when value='choosing' then 'unconfirmed' else value end),'{}'::jsonb) into statuses
    from jsonb_each_text(coalesce(v_state->'questionStatuses','{}'::jsonb));
  v_state := jsonb_set(v_state,'{questionStatuses}',statuses);
  v_state := jsonb_set(v_state,'{status}','"evidence"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+5000));
end $$;

create or replace function public.court_v7_open_response(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  statuses jsonb;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
begin
  select coalesce(jsonb_object_agg(expected_id,
    case when coalesce((player->>'away')::boolean,false) then 'away'
      when exists(select 1 from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=expected_id and submission.statement_confirmed_at is not null) then 'writing'
      else 'unconfirmed' end),'{}'::jsonb) into statuses
  from jsonb_array_elements_text(v_state->'expectedPlayerIds') as expected_rows(expected_id)
  left join lateral (select player from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=expected_id) matched on true;
  v_state := jsonb_set(v_state,'{responseStatuses}',statuses);
  v_state := jsonb_set(v_state,'{status}','"response"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+300000));
end $$;

create or replace function public.court_v7_open_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  entries jsonb;
  response_statuses jsonb;
  vote_statuses jsonb;
  v_session integer := (p_state->>'sessionNo')::integer;
  v_round integer := (p_state->>'round')::integer;
  archive_id text := 'cv7-'||substr(md5(p_code||(p_state->>'sessionNo')||(p_state->>'round')||(p_state->>'caseId')||'archive'),1,24);
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb) into response_statuses
    from jsonb_each_text(coalesce(v_state->'responseStatuses','{}'::jsonb));
  select coalesce(jsonb_object_agg(expected_id,case when coalesce((player->>'away')::boolean,false) then 'away' else 'unvoted' end),'{}'::jsonb) into vote_statuses
  from jsonb_array_elements_text(v_state->'expectedPlayerIds') as expected_rows(expected_id)
  left join lateral (select player from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=expected_id) matched on true;
  select coalesce(jsonb_agg(jsonb_build_object(
    'submissionId',submission_id,'displayCode','陈述 '||chr(64+seq::integer),'statement',statement,
    'tacticName',tactic_name,'question',question_text,'response',response
  ) order by seq),'[]'::jsonb) into entries
  from (
    select candidate.*,row_number() over(order by md5(submission_id)) seq from (
      select submission.submission_id,submission.statement,
        case when submission.response_confirmed_at is null then null else submission.response end response,
        tactic.name tactic_name,
        (select question.question_text from public.court_v7_questions question where question.game_code=p_code and question.session_no=v_session and question.round_no=v_round and question.target_player_id=submission.player_id) question_text
      from public.court_v5_submissions submission
      join public.court_v7_assignments assignment on assignment.game_code=submission.game_code and assignment.session_no=submission.session_no and assignment.round_no=submission.round_no and assignment.player_id=submission.player_id
      join public.court_v7_tactics tactic on tactic.id=assignment.tactic_id
      where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.statement_confirmed_at is not null
      union all
      select archive_id,pack.reference_statement,pack.reference_response,archive.tactic_name,archive.question_text
      from public.court_case_packs pack join public.court_v7_case_archive archive on archive.case_id=pack.id
      where pack.id=v_state->>'caseId' and jsonb_array_length(v_state->'expectedPlayerIds')=2
    ) candidate
  ) ordered_candidates;
  v_state := jsonb_set(v_state,'{responseStatuses}',response_statuses);
  v_state := jsonb_set(v_state,'{voteStatuses}',vote_statuses);
  v_state := jsonb_set(v_state,'{publicEntries}',entries);
  v_state := jsonb_set(v_state,'{status}','"voting"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
end $$;

create or replace function public.join_court_game_v7(p_code text,p_player_id text,p_nickname text)
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
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>7 then raise exception '离谱法堂 V7 房间不存在'; end if;
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

create or replace function public.get_my_court_context_v7(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  v_state jsonb;
  submission public.court_v5_submissions%rowtype;
  assignment public.court_v7_assignments%rowtype;
  v_session integer;
  v_round integer;
  options jsonb := '[]'::jsonb;
  selected_question text;
  received_question text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select g.state into v_state from public.games g where g.code=upper(p_code) and g.expires_at>now();
  if v_state is null or v_state->>'gameType'<>'absurd_court' or coalesce((v_state->>'courtVersion')::integer,0)<>7 then raise exception '离谱法堂 V7 房间不存在'; end if;
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  v_round := coalesce((v_state->>'round')::integer,0);
  select * into submission from public.court_v5_submissions where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
  select * into assignment from public.court_v7_assignments where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'text',question_text) order by position),'[]'::jsonb) into options
    from public.court_v7_case_questions where case_id=v_state->>'caseId' and v_state->>'status'='questioning';
  select question_id into selected_question from public.court_v7_questions where game_code=upper(p_code) and session_no=v_session and round_no=v_round and questioner_id=actor;
  if v_state->>'status' in ('evidence','response','voting','result','finished') then
    select question_text into received_question from public.court_v7_questions where game_code=upper(p_code) and session_no=v_session and round_no=v_round and target_player_id=actor;
  end if;
  return jsonb_build_object(
    'sessionNo',v_session,'round',v_round,
    'submissionId',submission.submission_id,'statement',coalesce(submission.statement,''),'statementConfirmed',submission.statement_confirmed_at is not null,
    'response',coalesce(submission.response,''),'responseConfirmed',submission.response_confirmed_at is not null,
    'tacticId',assignment.tactic_id,
    'tacticName',(select name from public.court_v7_tactics where id=assignment.tactic_id),
    'tacticInstruction',(select instruction from public.court_v7_tactics where id=assignment.tactic_id),
    'rerollAvailable',v_state->>'status'='statement' and submission.statement_confirmed_at is null and not exists(select 1 from public.court_v7_rerolls where game_code=upper(p_code) and session_no=v_session and player_id=actor),
    'questionTargetSubmissionId',assignment.target_submission_id,'questionOptions',options,
    'selectedQuestionId',selected_question,'questionConfirmed',selected_question is not null,'receivedQuestion',received_question
  );
end $$;

create or replace function public.court_v7_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  expected jsonb;
  statuses jsonb;
  selected public.court_case_packs%rowtype;
  v_player_id text;
  v_tactic_id text;
  v_session integer := (p_state->>'sessionNo')::integer;
begin
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb) into expected
  from jsonb_array_elements(v_state->'players') as player_rows(player)
  where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false) and coalesce((player->>'eligibleFromRound')::integer,1)<=p_round;
  if jsonb_array_length(expected)<2 then
    v_state := jsonb_set(v_state,'{status}','"finished"');
    return jsonb_set(v_state,'{phaseDeadlineAt}','null');
  end if;
  select pack.* into selected from public.court_case_packs pack join public.court_v7_case_archive archive on archive.case_id=pack.id
    where pack.enabled and not (coalesce(v_state->'usedCaseIds','[]'::jsonb) ? pack.id) and not (coalesce(v_state->'previousSessionCaseIds','[]'::jsonb) ? pack.id) order by random() limit 1;
  if not found then select pack.* into selected from public.court_case_packs pack join public.court_v7_case_archive archive on archive.case_id=pack.id where pack.enabled and not (coalesce(v_state->'usedCaseIds','[]'::jsonb) ? pack.id) order by random() limit 1; end if;
  if not found then select pack.* into selected from public.court_case_packs pack join public.court_v7_case_archive archive on archive.case_id=pack.id where pack.enabled order by random() limit 1; end if;
  if not found then raise exception '没有可用的 V7 样板案件'; end if;
  for v_player_id in select value from jsonb_array_elements_text(expected) loop
    select tactic.id into v_tactic_id from public.court_v7_tactics tactic
      where tactic.enabled and not exists(select 1 from public.court_v7_assignments existing where existing.game_code=p_code and existing.session_no=v_session and existing.round_no=p_round and existing.tactic_id=tactic.id)
      order by random() limit 1;
    if not found then select id into v_tactic_id from public.court_v7_tactics where enabled order by random() limit 1; end if;
    insert into public.court_v7_assignments(game_code,session_no,round_no,player_id,tactic_id) values(p_code,v_session,p_round,v_player_id,v_tactic_id);
  end loop;
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
  v_state := jsonb_set(v_state,'{questionStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{responseStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{voteStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{statementConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{questionConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{responseConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{voteConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicEntries}','[]'::jsonb);
  return v_state;
end $$;

create or replace function public.court_v7_finish_voting(p_code text,p_state jsonb,p_now_ms bigint)
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
  archive_id text := 'cv7-'||substr(md5(p_code||(p_state->>'sessionNo')||(p_state->>'round')||(p_state->>'caseId')||'archive'),1,24);
  score_row record;
  author_id text;
begin
  select coalesce(jsonb_object_agg(key,case when value='unvoted' then 'unconfirmed' else value end),'{}'::jsonb) into statuses
    from jsonb_each_text(coalesce(v_state->'voteStatuses','{}'::jsonb));
  select coalesce(max(best_score),0),coalesce(max(truth_score),0) into best_max,truth_max from (
    select entry->>'submissionId' submission_id,
      (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId')::integer best_score,
      (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')::integer truth_score
    from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
  ) scores;
  if best_max>0 then
    select coalesce(jsonb_agg(submission_id),'[]'::jsonb) into best_winners from (
      select entry->>'submissionId' submission_id from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
      where (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId')=best_max
    ) winners;
  end if;
  if truth_max>0 then
    select coalesce(jsonb_agg(submission_id),'[]'::jsonb) into truth_winners from (
      select entry->>'submissionId' submission_id from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry)
      where (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')=truth_max
    ) winners;
  end if;
  for score_row in
    select submission.player_id,
      (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=submission.submission_id)::integer best_score,
      (select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=submission.submission_id)::integer truth_score
    from public.court_v5_submissions submission
    where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.statement_confirmed_at is not null
  loop
    v_state := jsonb_set(v_state,array['totalBestScores',score_row.player_id],to_jsonb(coalesce((v_state->'totalBestScores'->>score_row.player_id)::integer,0)+score_row.best_score),true);
    v_state := jsonb_set(v_state,array['totalTruthScores',score_row.player_id],to_jsonb(coalesce((v_state->'totalTruthScores'->>score_row.player_id)::integer,0)+score_row.truth_score),true);
  end loop;
  select coalesce(jsonb_agg(entry || jsonb_build_object(
    'isArchive',(entry->>'submissionId')=archive_id,
    'authorId',case when (entry->>'submissionId')=archive_id then null else (select submission.player_id from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=entry->>'submissionId') end,
    'authorName',case when (entry->>'submissionId')=archive_id then '卷宗旧案' else (select player->>'name' from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=(select submission.player_id from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=entry->>'submissionId')) end,
    'questionerName',case when (entry->>'submissionId')=archive_id then '卷宗记录' else coalesce((
      select matched.candidate->>'name' from public.court_v7_questions question
      left join lateral (select candidate from jsonb_array_elements(v_state->'players') as candidate_rows(candidate) where candidate->>'id'=question.questioner_id) matched on true
      where question.game_code=p_code and question.session_no=v_session and question.round_no=v_round
        and question.target_player_id=(select submission.player_id from public.court_v5_submissions submission where submission.game_code=p_code and submission.session_no=v_session and submission.round_no=v_round and submission.submission_id=entry->>'submissionId')
    ),'系统检方') end,
    'bestVotes',(select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.best_submission_id=entry->>'submissionId'),
    'truthVotes',(select count(*) from public.court_v7_votes vote where vote.game_code=p_code and vote.session_no=v_session and vote.round_no=v_round and vote.truth_submission_id=entry->>'submissionId')
  ) order by entry->>'displayCode'),'[]'::jsonb) into entries from jsonb_array_elements(v_state->'publicEntries') as entry_rows(entry);
  v_state := jsonb_set(v_state,'{voteStatuses}',statuses);
  v_state := jsonb_set(v_state,'{publicEntries}',entries);
  v_state := jsonb_set(v_state,'{roundResults}',coalesce(v_state->'roundResults','[]'::jsonb)||jsonb_build_array(jsonb_build_object('round',v_round,'bestWinnerSubmissionIds',best_winners,'truthWinnerSubmissionIds',truth_winners,'bestHighestVotes',best_max,'truthHighestVotes',truth_max)));
  v_state := jsonb_set(v_state,'{status}','"result"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.court_v7_restart(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  players jsonb;
  recent_cases jsonb;
begin
  select coalesce(jsonb_agg(jsonb_set(player,'{eligibleFromRound}','1'::jsonb) order by (player->>'seat')::integer),'[]'::jsonb)
    into players from jsonb_array_elements(v_state->'players') as player_rows(player);
  select coalesce(jsonb_agg(case_id order by last_position),'[]'::jsonb) into recent_cases from (
    select case_id,max(position) last_position
    from jsonb_array_elements_text(coalesce(v_state->'previousSessionCaseIds','[]'::jsonb)||coalesce(v_state->'usedCaseIds','[]'::jsonb)) with ordinality as history_rows(case_id,position)
    group by case_id order by max(position) desc limit 21
  ) newest_cases;
  v_state := jsonb_set(v_state,'{sessionNo}',to_jsonb((v_state->>'sessionNo')::integer+1));
  v_state := jsonb_set(v_state,'{status}','"lobby"');
  v_state := jsonb_set(v_state,'{round}','0'::jsonb);
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
  v_state := jsonb_set(v_state,'{players}',players);
  v_state := jsonb_set(v_state,'{previousSessionCaseIds}',recent_cases);
  v_state := jsonb_set(v_state,'{usedCaseIds}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{expectedPlayerIds}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{statementStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{questionStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{responseStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{voteStatuses}','{}'::jsonb);
  v_state := jsonb_set(v_state,'{statementConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{questionConfirmedCount}','0'::jsonb);
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

create or replace function public.apply_court_action_v7(
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
  question_id_value text;
  desired_away boolean;
  players jsonb;
  n integer;
  eligible integer;
  actor_status text;
  current_tactic text;
  new_tactic text;
  assignment public.court_v7_assignments%rowtype;
  question_text_value text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_action_id)),0)<8 then raise exception 'invalid action id'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>7 then raise exception '离谱法堂 V7 房间不存在'; end if;
  v_state := g.state;
  v_round := coalesce((v_state->>'round')::integer,0);
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  action_session := p_expected_session;
  if exists(select 1 from public.court_v7_actions where game_code=g.code and session_no=action_session and action_id=p_action_id) then
    return jsonb_build_object('outcome','duplicate','code','ALREADY_APPLIED','message','操作已经完成','state',v_state,'version',g.version);
  end if;
  if p_expected_status is distinct from v_state->>'status' or p_expected_round is distinct from v_round or p_expected_session is distinct from v_session or p_expected_version is distinct from g.version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','message','状态已更新，请重试','state',v_state,'version',g.version);
  end if;
  deadline := coalesce((v_state->>'phaseDeadlineAt')::bigint,0);

  if p_action_type='start_court_game' then
    if v_state->>'status'<>'lobby' or v_state->>'ownerId'<>actor then raise exception '只有房主可以开始'; end if;
    select count(*) into n from jsonb_array_elements(v_state->'players') as player_rows(player)
      where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false);
    if n<2 then raise exception '至少需要 2 名未暂离成员'; end if;
    v_state := public.court_v7_begin_round(g.code,v_state,1,now_ms);
  elsif p_action_type='reroll_court_tactic' then
    if v_state->>'status'<>'statement' or not (v_state->'expectedPlayerIds' ? actor) then raise exception '当前不能更换招式'; end if;
    if v_state->'statementStatuses'->>actor='confirmed' then raise exception '首次陈词确认后不能更换招式'; end if;
    if exists(select 1 from public.court_v7_rerolls where game_code=g.code and session_no=v_session and player_id=actor) then raise exception '本局换招机会已经使用'; end if;
    select tactic_id into current_tactic from public.court_v7_assignments where game_code=g.code and session_no=v_session and round_no=v_round and player_id=actor;
    select id into new_tactic from public.court_v7_tactics where enabled and id<>current_tactic order by random() limit 1;
    if new_tactic is null then raise exception '没有可更换的招式'; end if;
    update public.court_v7_assignments set tactic_id=new_tactic where game_code=g.code and session_no=v_session and round_no=v_round and player_id=actor;
    insert into public.court_v7_rerolls(game_code,session_no,player_id) values(g.code,v_session,actor);
  elsif p_action_type='confirm_court_statement' then
    if v_state->>'status'<>'statement' then raise exception '当前不是首次陈词阶段'; end if;
    if not (v_state->'expectedPlayerIds' ? actor) or coalesce((select (player->>'away')::boolean from jsonb_array_elements(v_state->'players') as player_rows(player) where player->>'id'=actor),false) then raise exception '本轮无需提交'; end if;
    if v_state->'statementStatuses'->>actor='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','首次陈词已经确认','state',v_state,'version',g.version); end if;
    body := trim(coalesce(p_payload->>'statement',''));
    if length(body) not between 1 and 80 then raise exception '首次陈词须为 1–80 字'; end if;
    insert into public.court_v5_submissions(game_code,session_no,round_no,player_id,submission_id,statement,statement_confirmed_at)
      values(g.code,v_session,v_round,actor,'cv7-'||substr(md5(random()::text||clock_timestamp()::text||actor),1,24),body,now());
    v_state := jsonb_set(v_state,array['statementStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'statementStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'statementStatuses') where value<>'away';
    v_state := jsonb_set(v_state,'{statementConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v7_open_questioning(g.code,v_state,now_ms); end if;
  elsif p_action_type='confirm_court_question' then
    if v_state->>'status'<>'questioning' then raise exception '当前不是选择质询阶段'; end if;
    actor_status := v_state->'questionStatuses'->>actor;
    if actor_status is distinct from 'choosing' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','质询已经确认','state',v_state,'version',g.version); end if;
      raise exception '本轮无需选择质询';
    end if;
    question_id_value := coalesce(p_payload->>'questionId','');
    select * into assignment from public.court_v7_assignments where game_code=g.code and session_no=v_session and round_no=v_round and player_id=actor;
    if assignment.target_player_id is null then raise exception '没有可质询的匿名陈述'; end if;
    select question_text into question_text_value from public.court_v7_case_questions where case_id=v_state->>'caseId' and question_id=question_id_value;
    if not found then raise exception '请选择有效质询'; end if;
    insert into public.court_v7_questions(game_code,session_no,round_no,questioner_id,target_player_id,question_id,question_text)
      values(g.code,v_session,v_round,actor,assignment.target_player_id,question_id_value,question_text_value);
    v_state := jsonb_set(v_state,array['questionStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'questionStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'questionStatuses') where value not in ('away','unconfirmed');
    v_state := jsonb_set(v_state,'{questionConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v7_open_evidence(g.code,v_state,now_ms); end if;
  elsif p_action_type='confirm_court_response' then
    if v_state->>'status'<>'response' then raise exception '当前不是当庭补述阶段'; end if;
    actor_status := v_state->'responseStatuses'->>actor;
    if actor_status is distinct from 'writing' then
      if actor_status='confirmed' then return jsonb_build_object('outcome','duplicate','code','ALREADY_CONFIRMED','message','当庭补述已经确认','state',v_state,'version',g.version); end if;
      raise exception '本轮无需提交';
    end if;
    body := trim(coalesce(p_payload->>'response',''));
    if length(body) not between 1 and 120 then raise exception '当庭补述须为 1–120 字'; end if;
    update public.court_v5_submissions set response=body,response_confirmed_at=now()
      where game_code=g.code and session_no=v_session and round_no=v_round and player_id=actor and statement_confirmed_at is not null and response_confirmed_at is null;
    if not found then raise exception '首次陈词未确认或当庭补述已经确认'; end if;
    v_state := jsonb_set(v_state,array['responseStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'responseStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'responseStatuses') where value not in ('away','unconfirmed');
    v_state := jsonb_set(v_state,'{responseConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v7_open_voting(g.code,v_state,now_ms); end if;
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
    insert into public.court_v7_votes(game_code,session_no,round_no,player_id,best_submission_id,truth_submission_id) values(g.code,v_session,v_round,actor,best_target,truth_target);
    v_state := jsonb_set(v_state,array['voteStatuses',actor],'"confirmed"',true);
    select count(*) into n from jsonb_each_text(v_state->'voteStatuses') where value='confirmed';
    select count(*) into eligible from jsonb_each_text(v_state->'voteStatuses') where value<>'away';
    v_state := jsonb_set(v_state,'{voteConfirmedCount}',to_jsonb(n));
    if eligible>0 and n>=eligible then v_state := public.court_v7_finish_voting(g.code,v_state,now_ms); end if;
  elsif p_action_type='change_court_presence' then
    desired_away := coalesce((p_payload->>'away')::boolean,false);
    select coalesce(jsonb_agg(case when player->>'id'=actor then jsonb_set(player,'{away}',to_jsonb(desired_away)) else player end order by (player->>'seat')::integer),'[]'::jsonb) into players from jsonb_array_elements(v_state->'players') as player_rows(player);
    v_state := jsonb_set(v_state,'{players}',players);
    if v_state->>'status'='statement' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['statementStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'confirmed' else 'writing' end),true);
      select count(*) into n from jsonb_each_text(v_state->'statementStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'statementStatuses') where value<>'away';
      v_state := jsonb_set(v_state,'{statementConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v7_open_questioning(g.code,v_state,now_ms); end if;
    elsif v_state->>'status'='questioning' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['questionStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v7_questions question where question.game_code=g.code and question.session_no=v_session and question.round_no=v_round and question.questioner_id=actor) then 'confirmed' when exists(select 1 from public.court_v7_assignments assignment_row where assignment_row.game_code=g.code and assignment_row.session_no=v_session and assignment_row.round_no=v_round and assignment_row.player_id=actor and assignment_row.target_submission_id is not null) then 'choosing' else 'unconfirmed' end),true);
      select count(*) into n from jsonb_each_text(v_state->'questionStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'questionStatuses') where value not in ('away','unconfirmed');
      v_state := jsonb_set(v_state,'{questionConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v7_open_evidence(g.code,v_state,now_ms); end if;
    elsif v_state->>'status'='response' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['responseStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.response_confirmed_at is not null) then 'confirmed' when exists(select 1 from public.court_v5_submissions submission where submission.game_code=g.code and submission.session_no=v_session and submission.round_no=v_round and submission.player_id=actor and submission.statement_confirmed_at is not null) then 'writing' else 'unconfirmed' end),true);
      select count(*) into n from jsonb_each_text(v_state->'responseStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'responseStatuses') where value not in ('away','unconfirmed');
      v_state := jsonb_set(v_state,'{responseConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v7_open_voting(g.code,v_state,now_ms); end if;
    elsif v_state->>'status'='voting' and v_state->'expectedPlayerIds' ? actor then
      v_state := jsonb_set(v_state,array['voteStatuses',actor],to_jsonb(case when desired_away then 'away' when exists(select 1 from public.court_v7_votes vote where vote.game_code=g.code and vote.session_no=v_session and vote.round_no=v_round and vote.player_id=actor) then 'confirmed' else 'unvoted' end),true);
      select count(*) into n from jsonb_each_text(v_state->'voteStatuses') where value='confirmed'; select count(*) into eligible from jsonb_each_text(v_state->'voteStatuses') where value<>'away';
      v_state := jsonb_set(v_state,'{voteConfirmedCount}',to_jsonb(n)); if eligible>0 and n>=eligible then v_state := public.court_v7_finish_voting(g.code,v_state,now_ms); end if;
    end if;
  elsif p_action_type='advance_court_phase' then
    if now_ms<deadline then raise exception '当前阶段尚未结束'; end if;
    if v_state->>'status'='statement' then v_state := public.court_v7_open_questioning(g.code,v_state,now_ms);
    elsif v_state->>'status'='questioning' then v_state := public.court_v7_open_evidence(g.code,v_state,now_ms);
    elsif v_state->>'status'='evidence' then v_state := public.court_v7_open_response(g.code,v_state,now_ms);
    elsif v_state->>'status'='response' then v_state := public.court_v7_open_voting(g.code,v_state,now_ms);
    elsif v_state->>'status'='voting' then v_state := public.court_v7_finish_voting(g.code,v_state,now_ms);
    elsif v_state->>'status'='result' then
      if v_round>=3 then v_state := jsonb_set(v_state,'{status}','"finished"'); v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
      else v_state := public.court_v7_begin_round(g.code,v_state,v_round+1,now_ms); end if;
    else raise exception '当前阶段无需推进'; end if;
  elsif p_action_type='end_court_game' then
    if v_state->>'ownerId'<>actor then raise exception '只有房主可以结束'; end if;
    v_state := jsonb_set(v_state,'{status}','"finished"'); v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null');
  elsif p_action_type='restart_court_game' then
    if v_state->>'status'<>'finished' or v_state->>'ownerId'<>actor then raise exception '只有房主可以再来一局'; end if;
    v_state := public.court_v7_restart(v_state,now_ms);
  else raise exception 'unsupported court action'; end if;

  ver := g.version+1;
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.court_v7_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result)
    values(g.code,action_session,p_action_id,actor,p_action_type,v_round,jsonb_build_object('outcome','applied','code','OK'));
  return jsonb_build_object('outcome','applied','code','OK','message','操作成功','state',v_state,'version',ver);
end $$;

revoke all on public.court_v7_tactics,public.court_v7_case_questions,public.court_v7_case_archive,public.court_v7_assignments,public.court_v7_questions,public.court_v7_rerolls,public.court_v7_votes,public.court_v7_actions from anon,authenticated;
revoke all on function public.court_v7_begin_round(text,jsonb,integer,bigint) from public;
revoke all on function public.court_v7_open_questioning(text,jsonb,bigint) from public;
revoke all on function public.court_v7_open_evidence(text,jsonb,bigint) from public;
revoke all on function public.court_v7_open_response(text,jsonb,bigint) from public;
revoke all on function public.court_v7_open_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v7_finish_voting(text,jsonb,bigint) from public;
revoke all on function public.court_v7_restart(jsonb,bigint) from public;
revoke all on function public.create_court_game_v7(text,text,text) from public;
revoke all on function public.join_court_game_v7(text,text,text) from public;
revoke all on function public.get_my_court_context_v7(text) from public;
revoke all on function public.apply_court_action_v7(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.create_court_game_v7(text,text,text) to anon,authenticated;
grant execute on function public.join_court_game_v7(text,text,text) to anon,authenticated;
grant execute on function public.get_my_court_context_v7(text) to anon,authenticated;
grant execute on function public.apply_court_action_v7(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated;
