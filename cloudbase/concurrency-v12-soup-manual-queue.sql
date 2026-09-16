-- A5 V1.2：手动出题、随机汤主、每人一个待回答位置与 10 秒冷却。
-- 前置：已执行 V10 与 V10.1。本迁移只新增 V1.2 对象并扩展草稿列。
begin;

alter table public.soup_drafts_v1 add column if not exists solution_text text not null default '' check(length(solution_text)<=240);

create table if not exists public.soup_manual_secrets_v12 (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  host_player_id text not null,
  bottom text not null check(length(bottom) between 1 and 2000),
  bottom_image_url text,
  key_facts text,
  boundary text,
  created_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no)
);
alter table public.soup_manual_secrets_v12 enable row level security;

create or replace function public.soup_v12_begin_round(p_state jsonb,p_now bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare active_ids jsonb; served jsonb; host_id text; host_name text; next_round integer;
begin
  select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) into active_ids
    from jsonb_array_elements(p_state->'players') where coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
  if jsonb_array_length(active_ids)<3 then raise exception '至少需要 3 人才能开始'; end if;
  served:=coalesce(p_state->'servedHostIds','[]'::jsonb);
  select value#>>'{}' into host_id from jsonb_array_elements(active_ids) where not (served ? (value#>>'{}')) order by random() limit 1;
  if host_id is null then
    served:='[]'::jsonb;
    select value#>>'{}' into host_id from jsonb_array_elements(active_ids) order by random() limit 1;
  end if;
  select value->>'name' into host_name from jsonb_array_elements(p_state->'players') where value->>'id'=host_id;
  next_round:=coalesce((p_state->>'round')::integer,0)+1;
  return p_state||jsonb_build_object(
    'soupVersion',2,'round',next_round,'status','host_preparing','hostId',host_id,'hostName',host_name,
    'servedHostIds',served||to_jsonb(host_id),'surface',null,'surfaceImageUrl',null,'roundStartedAt',null,
    'effectiveQuestionCount',0,'maxQuestions',20,'extended',false,'hintsUsed',0,'publicHints','[]'::jsonb,
    'publicPosts','[]'::jsonb,'questionQueue','[]'::jsonb,'lastQuestionAtByPlayer','{}'::jsonb,
    'pendingAction',null,'records','[]'::jsonb,'revealedBottom',null,'revealedBottomImageUrl',null,
    'result',null,'feedbackCount',0,'updatedAt',p_now
  );
end $$;

create or replace function public.create_soup_game_v12(p_code text,p_owner_player_id text,p_owner_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  s:=jsonb_build_object(
    'code',p_code,'gameType','soup_detective','soupVersion',2,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'away',false,'cardReady',false)),
    'playerLimit',10,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,
    'hostOrder','[]'::jsonb,'servedHostIds','[]'::jsonb,'hostId',null,'hostName',null,
    'detectiveOrder','[]'::jsonb,'currentDetectiveId',null,'currentDetectiveName',null,'actionCycle',0,
    'surface',null,'surfaceImageUrl',null,'caseTitle',null,'caseCategory',null,'difficulty',null,'roundStartedAt',null,
    'effectiveQuestionCount',0,'maxQuestions',20,'extended',false,'hintsUsed',0,'publicHints','[]'::jsonb,
    'publicPosts','[]'::jsonb,'questionQueue','[]'::jsonb,'lastQuestionAtByPlayer','{}'::jsonb,
    'pendingAction',null,'records','[]'::jsonb,'usedCaseIds','[]'::jsonb,'revealedBottom',null,
    'revealedBottomImageUrl',null,'result',null,'feedbackCount',0
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,s,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return s;
end $$;

create or replace function public.join_soup_game_v12(p_code text,p_player_id text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.games%rowtype; s jsonb; players jsonb; existing_id text; ver bigint; now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'soup_detective' or coalesce((g.state->>'soupVersion')::integer,0)<>2 then raise exception 'A5 手动出题房间不存在'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  if g.state->>'status'<>'lobby' then raise exception '本题已经开始，请等待下一局'; end if;
  players:=coalesce(g.state->'players','[]'::jsonb); if jsonb_array_length(players)>=10 then raise exception '房间已满'; end if;
  players:=players||jsonb_build_array(jsonb_build_object('id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(players)+1,'alive',true,'cardReady',false,'away',false));
  ver:=g.version+1; s:=jsonb_set(g.state,'{players}',players); s:=jsonb_set(s,'{version}',to_jsonb(ver)); s:=jsonb_set(s,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=s,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',s,'playerId',p_player_id);
end $$;

create or replace function public.get_my_soup_round_v12(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; secret public.soup_manual_secrets_v12%rowtype; d public.soup_drafts_v1%rowtype; is_host boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for share;
  if not found or g.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  is_host:=actor=g.state->>'hostId';
  select * into secret from public.soup_manual_secrets_v12 where game_code=g.code and session_no=(g.state->>'sessionNo')::integer and round_no=(g.state->>'round')::integer;
  select * into d from public.soup_drafts_v1 where game_code=g.code and session_no=(g.state->>'sessionNo')::integer and round_no=(g.state->>'round')::integer and player_id=actor;
  return jsonb_build_object(
    'sessionNo',(g.state->>'sessionNo')::integer,'round',(g.state->>'round')::integer,'isHost',is_host,
    'bottom',case when is_host then secret.bottom else null end,'bottomImageUrl',case when is_host then secret.bottom_image_url else null end,
    'keyFacts',case when is_host and secret.key_facts is not null then jsonb_build_array(secret.key_facts) else '[]'::jsonb end,
    'equivalentAnswers','[]'::jsonb,'boundary',case when is_host then secret.boundary else null end,'commonQuestions','[]'::jsonb,'hints','[]'::jsonb,
    'draftText',coalesce(d.draft_text,''),'solutionDraft',coalesce(d.solution_text,''),'draftUpdatedAt',(extract(epoch from d.updated_at)*1000)::bigint,
    'draftRevision',coalesce(d.revision,0),'feedbackSubmitted',false
  );
end $$;

create or replace function public.save_soup_draft_v12(p_code text,p_expected_session integer,p_expected_round integer,p_expected_revision bigint,p_question_text text,p_solution_text text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; rev bigint; question text; solution text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(coalesce(p_question_text,''))>240 or length(coalesce(p_solution_text,''))>240 then raise exception '草稿最多 240 字'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for share;
  if not found or (g.state->>'sessionNo')::integer is distinct from p_expected_session or (g.state->>'round')::integer is distinct from p_expected_round then raise exception 'STALE_ROUND'; end if;
  if actor=g.state->>'hostId' then raise exception '汤主无需填写侦探草稿'; end if;
  if g.state->>'status' not in ('host_preparing','investigating','limit_reached') then raise exception '当前题目不能修改草稿'; end if;
  insert into public.soup_drafts_v1(game_code,session_no,round_no,player_id) values(g.code,p_expected_session,p_expected_round,actor) on conflict on constraint soup_drafts_v1_pkey do nothing;
  select revision,draft_text,solution_text into rev,question,solution from public.soup_drafts_v1
    where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round and player_id=actor for update;
  if rev is distinct from p_expected_revision then
    return jsonb_build_object('accepted',question=p_question_text and solution=p_solution_text,'privateRound',public.get_my_soup_round_v12(g.code));
  end if;
  if question is distinct from p_question_text or solution is distinct from p_solution_text then
    update public.soup_drafts_v1 set draft_text=coalesce(p_question_text,''),solution_text=coalesce(p_solution_text,''),revision=rev+1,updated_at=clock_timestamp()
      where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round and player_id=actor;
  end if;
  return jsonb_build_object('accepted',true,'privateRound',public.get_my_soup_round_v12(g.code));
end $$;

create or replace function public.apply_soup_action_v12(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; prior public.soup_actions_v1%rowtype; s jsonb; q jsonb; head jsonb; records jsonb; posts jsonb;
  now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; ver bigint; content text; note text; verdict text; kind text; image_url text;
  q_count integer; active_count integer; last_at bigint; secret public.soup_manual_secrets_v12%rowtype; result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(p_action_id),0) not between 1 and 160 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '操作参数无效'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  select * into prior from public.soup_actions_v1 where game_code=g.code and session_no=p_expected_session and action_id=p_action_id;
  if found then
    if prior.actor_uid is distinct from auth.uid() or prior.action_type is distinct from p_action_type or prior.request_payload is distinct from p_payload then raise exception '操作编号已被使用，请重新操作'; end if;
    return prior.result||jsonb_build_object('outcome','duplicate','state',g.state,'version',g.version,'message','此操作已记录');
  end if;
  if (g.state->>'sessionNo')::integer is distinct from p_expected_session or (g.state->>'round')::integer is distinct from p_expected_round
    or g.state->>'status' is distinct from p_expected_status or g.version is distinct from p_expected_version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','state',g.state,'version',g.version,'message','队列已更新，请确认后重试');
  end if;
  s:=g.state; q:=coalesce(s->'questionQueue','[]'::jsonb); records:=coalesce(s->'records','[]'::jsonb); posts:=coalesce(s->'publicPosts','[]'::jsonb);

  if p_action_type='start_soup_game' then
    if actor<>s->>'ownerId' or s->>'status'<>'lobby' then raise exception '仅负责人可开始'; end if;
    select count(*) into active_count from jsonb_array_elements(s->'players') where coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
    if active_count<3 then raise exception '至少需要 3 人才能开始'; end if;
    s:=public.soup_v12_begin_round(s,now_ms);
  elsif p_action_type='prepare_soup_case' then
    if actor<>s->>'hostId' or s->>'status'<>'host_preparing' then raise exception '仅本题汤主可录入题目'; end if;
    content:=trim(coalesce(p_payload->>'surface','')); note:=trim(coalesce(p_payload->>'bottom',''));
    if length(content) not between 1 and 600 or length(note) not between 1 and 2000 then raise exception '请填写汤面和完整汤底'; end if;
    if length(coalesce(p_payload->>'keyFacts',''))>1000 or length(coalesce(p_payload->>'boundary',''))>1000 then raise exception '补充资料过长'; end if;
    if coalesce(p_payload->>'surfaceImageUrl','')<>'' and p_payload->>'surfaceImageUrl' !~ '^https?://' then raise exception '图片须使用 http 或 https 链接'; end if;
    if coalesce(p_payload->>'bottomImageUrl','')<>'' and p_payload->>'bottomImageUrl' !~ '^https?://' then raise exception '图片须使用 http 或 https 链接'; end if;
    insert into public.soup_manual_secrets_v12(game_code,session_no,round_no,host_player_id,bottom,bottom_image_url,key_facts,boundary)
      values(g.code,p_expected_session,p_expected_round,actor,note,nullif(trim(coalesce(p_payload->>'bottomImageUrl','')),''),nullif(trim(coalesce(p_payload->>'keyFacts','')),''),nullif(trim(coalesce(p_payload->>'boundary','')),''))
      on conflict(game_code,session_no,round_no) do update set bottom=excluded.bottom,bottom_image_url=excluded.bottom_image_url,key_facts=excluded.key_facts,boundary=excluded.boundary;
    s:=s||jsonb_build_object('surface',content,'surfaceImageUrl',nullif(trim(coalesce(p_payload->>'surfaceImageUrl','')),''),'status','investigating','roundStartedAt',now_ms);
  elsif p_action_type in ('submit_soup_question','submit_soup_solution') then
    if s->>'status'<>'investigating' or actor=s->>'hostId' then raise exception '当前不能加入待回答区'; end if;
    content:=trim(coalesce(p_payload->>'content','')); if length(content) not between 1 and 240 then raise exception '内容须为 1–240 字'; end if;
    if exists(select 1 from jsonb_array_elements(q) where value->>'playerId'=actor) then raise exception '你已有一条内容正在等待汤主回答'; end if;
    last_at:=coalesce((s->'lastQuestionAtByPlayer'->>actor)::bigint,0);
    if now_ms-last_at<10000 then raise exception '提问冷却中，请稍后再提交'; end if;
    if p_action_type='submit_soup_question' then
      select count(*) into active_count from jsonb_array_elements(q) where value->>'type'='question';
      if (s->>'effectiveQuestionCount')::integer+active_count >= (s->>'maxQuestions')::integer then raise exception '有效问题名额已满，请等待汤主处理'; end if;
    end if;
    select value->>'name' into note from jsonb_array_elements(s->'players') where value->>'id'=actor;
    q:=q||jsonb_build_array(jsonb_build_object('id',p_action_id,'playerId',actor,'playerName',note,'type',case when p_action_type='submit_soup_question' then 'question' else 'solution' end,'content',content,'submittedAt',now_ms));
    s:=jsonb_set(s,'{questionQueue}',q); s:=jsonb_set(s,'{pendingAction}',q->0);
    s:=jsonb_set(s,array['lastQuestionAtByPlayer',actor],to_jsonb(now_ms),true);
  elsif p_action_type in ('judge_soup_question','judge_soup_solution') then
    if actor<>s->>'hostId' or jsonb_array_length(q)=0 then raise exception '当前没有待回答内容'; end if;
    head:=q->0; verdict:=coalesce(p_payload->>'verdict',''); note:=nullif(trim(coalesce(p_payload->>'note','')),'');
    if length(coalesce(note,''))>160 then raise exception '补充说明最多 160 字'; end if;
    if head->>'type'='question' then
      if p_action_type<>'judge_soup_question' or verdict not in ('yes','no','irrelevant','partial','rephrase') then raise exception '请选择问题判定'; end if;
      q_count:=(s->>'effectiveQuestionCount')::integer+case when verdict='rephrase' then 0 else 1 end;
    else
      if p_action_type<>'judge_soup_solution' or verdict not in ('success','close','wrong') then raise exception '请选择还原判定'; end if;
      q_count:=(s->>'effectiveQuestionCount')::integer;
    end if;
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',head->>'playerId','playerName',head->>'playerName','type',head->>'type','content',head->>'content','verdict',verdict,'note',note,'counted',head->>'type'='question' and verdict<>'rephrase','createdAt',now_ms));
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into q from jsonb_array_elements(q) with ordinality where ordinality>1;
    s:=jsonb_set(s,'{records}',records); s:=jsonb_set(s,'{effectiveQuestionCount}',to_jsonb(q_count)); s:=jsonb_set(s,'{questionQueue}',q); s:=jsonb_set(s,'{pendingAction}',case when jsonb_array_length(q)>0 then q->0 else 'null'::jsonb end);
    if head->>'type'='solution' and verdict='success' then
      select * into secret from public.soup_manual_secrets_v12 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round;
      s:=s||jsonb_build_object('status','round_result','questionQueue','[]'::jsonb,'pendingAction',null,'revealedBottom',secret.bottom,'revealedBottomImageUrl',secret.bottom_image_url,
        'result',jsonb_build_object('success',true,'validQuestions',q_count,'hintsUsed',jsonb_array_length(posts),'solverId',head->>'playerId','solverName',head->>'playerName','elapsedMs',greatest(0,now_ms-(s->>'roundStartedAt')::bigint),'revealedReason','solved'));
    elsif jsonb_array_length(q)=0 and q_count>=(s->>'maxQuestions')::integer then s:=jsonb_set(s,'{status}','"limit_reached"');
    else s:=jsonb_set(s,'{status}','"investigating"'); end if;
  elsif p_action_type='publish_soup_note' then
    if actor<>s->>'hostId' or s->>'status' not in ('investigating','limit_reached') then raise exception '当前不能发布提示或证据'; end if;
    kind:=coalesce(p_payload->>'kind','hint'); content:=trim(coalesce(p_payload->>'text','')); image_url:=nullif(trim(coalesce(p_payload->>'imageUrl','')),'');
    if kind not in ('hint','evidence') or (content='' and image_url is null) or length(content)>600 then raise exception '请填写提示或证据'; end if;
    if image_url is not null and image_url !~ '^https?://' then raise exception '图片须使用 http 或 https 链接'; end if;
    posts:=posts||jsonb_build_array(jsonb_build_object('id',p_action_id,'kind',kind,'text',content,'imageUrl',image_url,'createdAt',now_ms));
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',actor,'playerName',s->>'hostName','type','hint','content',content,'verdict',null,'note',case when image_url is null then null else '含图片' end,'counted',false,'createdAt',now_ms));
    s:=jsonb_set(s,'{publicPosts}',posts); s:=jsonb_set(s,'{records}',records); s:=jsonb_set(s,'{hintsUsed}',to_jsonb(jsonb_array_length(posts)));
  elsif p_action_type='extend_soup_limit' then
    if actor<>s->>'hostId' or s->>'status'<>'limit_reached' or coalesce((s->>'extended')::boolean,false) then raise exception '当前不能延长'; end if;
    s:=s||jsonb_build_object('extended',true,'maxQuestions',(s->>'maxQuestions')::integer+5,'status','investigating');
  elsif p_action_type='reveal_soup_bottom' then
    if actor<>s->>'hostId' or s->>'status' not in ('investigating','limit_reached') then raise exception '当前不能公布汤底'; end if;
    select * into secret from public.soup_manual_secrets_v12 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round;
    if not found then raise exception '汤底资料尚未提交'; end if;
    s:=s||jsonb_build_object('status','round_result','questionQueue','[]'::jsonb,'pendingAction',null,'revealedBottom',secret.bottom,'revealedBottomImageUrl',secret.bottom_image_url,
      'result',jsonb_build_object('success',false,'validQuestions',(s->>'effectiveQuestionCount')::integer,'hintsUsed',jsonb_array_length(posts),'solverId',null,'solverName',null,'elapsedMs',greatest(0,now_ms-(s->>'roundStartedAt')::bigint),'revealedReason','host_reveal'));
  elsif p_action_type='next_soup_round' then
    if actor<>s->>'ownerId' or s->>'status'<>'round_result' then raise exception '仅负责人可开始下一题'; end if;
    s:=public.soup_v12_begin_round(s,now_ms);
  elsif p_action_type='end_soup_game' then
    if actor<>s->>'ownerId' or s->>'status' in ('lobby','finished') then raise exception '当前不能结束本局'; end if;
    select * into secret from public.soup_manual_secrets_v12 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round;
    s:=s||jsonb_build_object('status','finished','questionQueue','[]'::jsonb,'pendingAction',null,'revealedBottom',secret.bottom,'revealedBottomImageUrl',secret.bottom_image_url);
  else raise exception 'unknown A5 V1.2 action'; end if;

  ver:=g.version+1; s:=jsonb_set(s,'{version}',to_jsonb(ver)); s:=jsonb_set(s,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=s,version=ver,updated_at=now() where code=g.code;
  result:=jsonb_build_object('outcome','applied','code','OK','message','操作已记录','state',s,'version',ver);
  insert into public.soup_actions_v1(game_code,session_no,action_id,actor_uid,actor_player_id,action_type,result,request_payload)
    values(g.code,p_expected_session,p_action_id,auth.uid(),actor,p_action_type,result,p_payload);
  return result;
end $$;

revoke all on function public.soup_v12_begin_round(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.create_soup_game_v12(text,text,text) from public;
revoke all on function public.join_soup_game_v12(text,text,text) from public;
revoke all on function public.get_my_soup_round_v12(text) from public;
revoke all on function public.save_soup_draft_v12(text,integer,integer,bigint,text,text) from public;
revoke all on function public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.create_soup_game_v12(text,text,text) to anon,authenticated,service_role;
grant execute on function public.join_soup_game_v12(text,text,text) to anon,authenticated,service_role;
grant execute on function public.get_my_soup_round_v12(text) to anon,authenticated,service_role;
grant execute on function public.save_soup_draft_v12(text,integer,integer,bigint,text,text) to anon,authenticated,service_role;
grant execute on function public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
commit;
