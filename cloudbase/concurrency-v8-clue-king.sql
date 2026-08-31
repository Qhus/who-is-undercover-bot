-- A3 提示大王 V1 增量迁移。
-- 新增独立题库、私密答案/提示/猜测/幂等表和版本化 RPC；不修改现有谁是卧底或离谱法堂对象。

create table if not exists public.clue_word_bank_v1 (
  id text primary key,
  word text not null unique,
  category text not null,
  enabled boolean not null default true
);

insert into public.clue_word_bank_v1(id,word,category) values
('w001','加班','职场'),('w002','周报','职场'),('w003','会议','职场'),('w004','工位','职场'),('w005','打卡','职场'),
('w006','请假','职场'),('w007','团建','职场'),('w008','报销','职场'),('w009','年终奖','职场'),('w010','摸鱼','职场'),
('w011','奶茶','饮食'),('w012','火锅','饮食'),('w013','烧烤','饮食'),('w014','螺蛳粉','饮食'),('w015','冰淇淋','饮食'),
('w016','咖啡','饮食'),('w017','泡面','饮食'),('w018','榴莲','饮食'),('w019','饺子','饮食'),('w020','蛋糕','饮食'),
('w021','电梯','场景'),('w022','地铁','场景'),('w023','机场','场景'),('w024','厕所','场景'),('w025','电影院','场景'),
('w026','健身房','场景'),('w027','便利店','场景'),('w028','会议室','场景'),('w029','停车场','场景'),('w030','游乐园','场景'),
('w031','空调','物品'),('w032','雨伞','物品'),('w033','充电器','物品'),('w034','耳机','物品'),('w035','拖鞋','物品'),
('w036','遥控器','物品'),('w037','保温杯','物品'),('w038','行李箱','物品'),('w039','打印机','物品'),('w040','体重秤','物品'),
('w041','相亲','生活'),('w042','搬家','生活'),('w043','失眠','生活'),('w044','迟到','生活'),('w045','减肥','生活'),
('w046','网购','生活'),('w047','追剧','生活'),('w048','抢红包','生活'),('w049','排队','生活'),('w050','做梦','生活'),
('w051','老板','人物'),('w052','同事','人物'),('w053','室友','人物'),('w054','前任','人物'),('w055','外卖员','人物'),
('w056','班主任','人物'),('w057','程序员','人物'),('w058','甲方','人物'),('w059','邻居','人物'),('w060','网友','人物'),
('w061','尴尬','感受'),('w062','心虚','感受'),('w063','后悔','感受'),('w064','兴奋','感受'),('w065','焦虑','感受'),
('w066','无聊','感受'),('w067','社恐','感受'),('w068','感动','感受'),('w069','委屈','感受'),('w070','嫉妒','感受'),
('w071','世界杯','娱乐'),('w072','演唱会','娱乐'),('w073','剧本杀','娱乐'),('w074','广场舞','娱乐'),('w075','短视频','娱乐'),
('w076','直播','娱乐'),('w077','表情包','娱乐'),('w078','朋友圈','娱乐'),('w079','热搜','娱乐'),('w080','彩票','娱乐'),
('w081','蚊子','日常'),('w082','闹钟','日常'),('w083','堵车','日常'),('w084','快递','日常'),('w085','停电','日常'),
('w086','密码','日常'),('w087','红包','日常'),('w088','自拍','日常'),('w089','发际线','日常'),('w090','黑眼圈','日常'),
('w091','猫','动物'),('w092','狗','动物'),('w093','熊猫','动物'),('w094','企鹅','动物'),('w095','鸽子','动物'),
('w096','海豚','动物'),('w097','松鼠','动物'),('w098','蚂蚁','动物'),('w099','孔雀','动物'),('w100','树懒','动物')
on conflict (id) do update set word=excluded.word,category=excluded.category,enabled=true;

create table if not exists public.clue_v1_round_secrets (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  guesser_id text not null,
  word_id text not null references public.clue_word_bank_v1(id),
  target_word text not null,
  challenge_id text,
  challenge_text text,
  primary key(game_code,session_no,round_no)
);

create table if not exists public.clue_v1_clues (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  clue_id text not null unique,
  clue_text text not null,
  score smallint,
  confirmed_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,player_id),
  check(score is null or score between 1 and 3)
);

create table if not exists public.clue_v1_guesses (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  guess_text text not null,
  correct boolean not null,
  elapsed_ms integer not null,
  submitted_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no)
);

create table if not exists public.clue_v1_actions (
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

alter table public.clue_word_bank_v1 enable row level security;
alter table public.clue_v1_round_secrets enable row level security;
alter table public.clue_v1_clues enable row level security;
alter table public.clue_v1_guesses enable row level security;
alter table public.clue_v1_actions enable row level security;

create or replace function public.create_clue_game_v1(p_code text,p_owner_player_id text,p_owner_name text,p_rule_mode text default 'off')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  if p_rule_mode not in ('off','random') then raise exception '提示限制配置无效'; end if;
  v_state := jsonb_build_object(
    'code',p_code,'gameType','clue_king','clueVersion',1,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false)),
    'playerLimit',8,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,'totalRounds',0,
    'phaseDeadlineAt',null,'ruleMode',p_rule_mode,'guesserOrder','[]'::jsonb,'guesserId',null,'guesserName',null,
    'challengeId',null,'challengeText',null,'expectedCluePlayerIds','[]'::jsonb,'clueStatuses','{}'::jsonb,'clueConfirmedCount',0,
    'publicClues','[]'::jsonb,'guessStatus','waiting','guessElapsedMs',null,'revealedWord',null,'roundResults','[]'::jsonb,
    'hintScores','{}'::jsonb,'guessTimes','{}'::jsonb,'usedWordIds','[]'::jsonb,'previousSessionWordIds','[]'::jsonb
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,v_state,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return v_state;
end $$;

create or replace function public.join_clue_game_v1(p_code text,p_player_id text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  v_players jsonb;
  existing_id text;
  ver bigint;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'clue_king' or coalesce((g.state->>'clueVersion')::integer,0)<>1 then raise exception 'A3 房间不存在'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  if g.state->>'status'<>'lobby' then raise exception '本局已经开始，请等待下一局'; end if;
  v_players := coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(v_players)>=8 then raise exception '房间已满'; end if;
  v_players := v_players || jsonb_build_array(jsonb_build_object('id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(v_players)+1,'alive',true,'cardReady',false,'away',false));
  ver := g.version+1;
  v_state := jsonb_set(g.state,'{players}',v_players);
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;

create or replace function public.get_my_clue_round_v1(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  v_state jsonb;
  v_secret public.clue_v1_round_secrets%rowtype;
  v_clue public.clue_v1_clues%rowtype;
  v_session integer;
  v_round integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select g.state into v_state from public.games g where g.code=upper(p_code) and g.expires_at>now();
  if v_state is null or v_state->>'gameType'<>'clue_king' or coalesce((v_state->>'clueVersion')::integer,0)<>1 then raise exception 'A3 房间不存在'; end if;
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  v_round := coalesce((v_state->>'round')::integer,0);
  if v_round>0 then
    select * into v_secret from public.clue_v1_round_secrets where game_code=upper(p_code) and session_no=v_session and round_no=v_round;
    select * into v_clue from public.clue_v1_clues where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
  end if;
  return jsonb_build_object(
    'sessionNo',v_session,'round',v_round,
    'targetWord',case when v_round>0 and actor<>coalesce(v_secret.guesser_id,'') then v_secret.target_word else null end,
    'clueText',coalesce(v_clue.clue_text,''),'clueConfirmed',v_clue.confirmed_at is not null,
    'challengeId',v_state->>'challengeId','challengeText',v_state->>'challengeText'
  );
end $$;

create or replace function public.clue_v1_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_guesser_id text;
  v_guesser_name text;
  v_expected jsonb;
  v_statuses jsonb;
  v_word public.clue_word_bank_v1%rowtype;
  v_challenge_id text := null;
  v_challenge_text text := null;
  v_pick integer;
begin
  v_guesser_id := v_state->'guesserOrder'->>(p_round-1);
  select player->>'name' into v_guesser_name from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=v_guesser_id;
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb) into v_expected
  from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'<>v_guesser_id;
  select coalesce(jsonb_object_agg(id,'writing'),'{}'::jsonb) into v_statuses from jsonb_array_elements_text(v_expected) as ids(id);
  select * into v_word from public.clue_word_bank_v1 where enabled and not (coalesce(v_state->'usedWordIds','[]'::jsonb) ? id) and not (coalesce(v_state->'previousSessionWordIds','[]'::jsonb) ? id) order by random() limit 1;
  if not found then select * into v_word from public.clue_word_bank_v1 where enabled and not (coalesce(v_state->'usedWordIds','[]'::jsonb) ? id) order by random() limit 1; end if;
  if not found then select * into v_word from public.clue_word_bank_v1 where enabled order by random() limit 1; end if;
  if not found then raise exception '提示题库为空'; end if;
  if v_state->>'ruleMode'='random' then
    v_pick := floor(random()*4)::integer;
    if v_pick=0 then v_challenge_id:='max2'; v_challenge_text:='本轮提示最多 2 字';
    elsif v_pick=1 then v_challenge_id:='exact4'; v_challenge_text:='本轮提示必须正好 4 字';
    elsif v_pick=2 then v_challenge_id:='no_fillers'; v_challenge_text:='不能使用“的、是、很、像、有”';
    else v_challenge_id:='scene'; v_challenge_text:='本轮尽量只写场景或地点（自觉遵守）'; end if;
  end if;
  insert into public.clue_v1_round_secrets(game_code,session_no,round_no,guesser_id,word_id,target_word,challenge_id,challenge_text)
  values(p_code,(v_state->>'sessionNo')::integer,p_round,v_guesser_id,v_word.id,v_word.word,v_challenge_id,v_challenge_text);
  v_state := jsonb_set(v_state,'{status}','"clue_writing"');
  v_state := jsonb_set(v_state,'{round}',to_jsonb(p_round));
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+90000));
  v_state := jsonb_set(v_state,'{guesserId}',to_jsonb(v_guesser_id));
  v_state := jsonb_set(v_state,'{guesserName}',to_jsonb(v_guesser_name));
  v_state := jsonb_set(v_state,'{challengeId}',coalesce(to_jsonb(v_challenge_id),'null'::jsonb));
  v_state := jsonb_set(v_state,'{challengeText}',coalesce(to_jsonb(v_challenge_text),'null'::jsonb));
  v_state := jsonb_set(v_state,'{expectedCluePlayerIds}',v_expected);
  v_state := jsonb_set(v_state,'{clueStatuses}',v_statuses);
  v_state := jsonb_set(v_state,'{clueConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicClues}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{guessStatus}','"waiting"');
  v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
  v_state := jsonb_set(v_state,'{revealedWord}','null'::jsonb);
  v_state := jsonb_set(v_state,'{usedWordIds}',coalesce(v_state->'usedWordIds','[]'::jsonb)||jsonb_build_array(v_word.id));
  return v_state;
end $$;

create or replace function public.clue_v1_open_guessing(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_entries jsonb;
  v_statuses jsonb;
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb) into v_statuses from jsonb_each_text(coalesce(v_state->'clueStatuses','{}'::jsonb));
  select coalesce(jsonb_agg(jsonb_build_object('clueId',clue_id,'displayCode','提示 '||chr(64+seq::integer),'text',clue_text) order by seq),'[]'::jsonb) into v_entries
  from (
    select clue_id,clue_text,row_number() over(order by md5(clue_id)) seq
    from public.clue_v1_clues where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer
  ) clues;
  v_state := jsonb_set(v_state,'{clueStatuses}',v_statuses);
  v_state := jsonb_set(v_state,'{publicClues}',v_entries);
  v_state := jsonb_set(v_state,'{status}','"guessing"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+60000));
end $$;

create or replace function public.clue_v1_finish_round(p_code text,p_state jsonb,p_now_ms bigint,p_correct boolean,p_guess_text text,p_elapsed_ms integer,p_ratings jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_secret public.clue_v1_round_secrets%rowtype;
  v_entry record;
  v_entries jsonb;
  v_score integer;
  v_author_name text;
  v_result jsonb;
begin
  select * into v_secret from public.clue_v1_round_secrets where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer;
  for v_entry in select * from public.clue_v1_clues where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer loop
    v_score := case when p_correct then coalesce((p_ratings->>v_entry.clue_id)::integer,1) else 0 end;
    update public.clue_v1_clues set score=case when p_correct then v_score else null end where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer and player_id=v_entry.player_id;
    if p_correct then
      v_state := jsonb_set(v_state,array['hintScores',v_entry.player_id],to_jsonb(coalesce((v_state->'hintScores'->>v_entry.player_id)::integer,0)+v_score),true);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'clueId',clue.clue_id,'displayCode','提示 '||chr(64+clue.seq::integer),'text',clue.clue_text,
    'authorId',clue.player_id,'authorName',coalesce((select player->>'name' from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=clue.player_id),'未知成员'),
    'score',clue.score
  ) order by clue.seq),'[]'::jsonb) into v_entries
  from (select row_data.*,row_number() over(order by md5(clue_id)) seq from public.clue_v1_clues row_data where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer) clue;
  select player->>'name' into v_author_name from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=v_state->>'guesserId';
  v_result := jsonb_build_object('round',(v_state->>'round')::integer,'guesserId',v_state->>'guesserId','guesserName',v_author_name,'targetWord',v_secret.target_word,'guessText',p_guess_text,'correct',p_correct,'elapsedMs',case when p_correct then p_elapsed_ms else null end);
  v_state := jsonb_set(v_state,'{publicClues}',v_entries);
  v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_secret.target_word));
  v_state := jsonb_set(v_state,'{guessStatus}',to_jsonb(case when p_correct then 'correct' when p_guess_text is null then 'timeout' else 'wrong' end));
  v_state := jsonb_set(v_state,'{guessElapsedMs}',case when p_correct then to_jsonb(p_elapsed_ms) else 'null'::jsonb end);
  v_state := jsonb_set(v_state,'{roundResults}',coalesce(v_state->'roundResults','[]'::jsonb)||jsonb_build_array(v_result));
  if p_correct then v_state := jsonb_set(v_state,array['guessTimes',v_state->>'guesserId'],to_jsonb(p_elapsed_ms),true); end if;
  v_state := jsonb_set(v_state,'{status}','"result"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.apply_clue_action_v1(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  actor text;
  prior jsonb;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint;
  n integer;
  v_order jsonb;
  v_scores jsonb;
  v_clue text;
  v_guess text;
  v_target text;
  v_elapsed integer;
  v_ratings jsonb;
  clue_row record;
  response jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select result into prior from public.clue_v1_actions where game_code=upper(p_code) and session_no=p_expected_session and action_id=p_action_id;
  if found then return prior; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'clue_king' or coalesce((g.state->>'clueVersion')::integer,0)<>1 then raise exception 'A3 房间不存在'; end if;
  v_state := g.state;
  if v_state->>'status'<>p_expected_status or (v_state->>'round')::integer<>p_expected_round or (v_state->>'sessionNo')::integer<>p_expected_session or g.version<>p_expected_version then
    return jsonb_build_object('outcome','stale','code','STATE_UPDATED','message','状态已更新，请重试','state',v_state,'version',g.version);
  end if;

  if p_action_type='start_clue_game' then
    if actor<>v_state->>'ownerId' then raise exception '仅房主可以开始'; end if;
    if v_state->>'status'<>'lobby' then raise exception '当前不能开始'; end if;
    n := jsonb_array_length(v_state->'players');
    if n<3 then raise exception '至少需要 3 名成员'; end if;
    select jsonb_agg(player->>'id' order by random()) into v_order from jsonb_array_elements(v_state->'players') as rows(player);
    select jsonb_object_agg(player->>'id',0) into v_scores from jsonb_array_elements(v_state->'players') as rows(player);
    v_state := jsonb_set(v_state,'{guesserOrder}',v_order);
    v_state := jsonb_set(v_state,'{totalRounds}',to_jsonb(n));
    v_state := jsonb_set(v_state,'{hintScores}',v_scores);
    v_state := jsonb_set(v_state,'{guessTimes}','{}'::jsonb);
    v_state := public.clue_v1_begin_round(upper(p_code),v_state,1,now_ms);

  elsif p_action_type='confirm_clue' then
    if v_state->>'status'<>'clue_writing' or not (v_state->'expectedCluePlayerIds' ? actor) then raise exception '本轮无需提交提示'; end if;
    if v_state->'clueStatuses'->>actor='confirmed' then raise exception '提示已经确认'; end if;
    v_clue := trim(coalesce(p_payload->>'clueText',''));
    if length(v_clue) not between 1 and 8 then raise exception '提示须为 1–8 字'; end if;
    select target_word into v_target from public.clue_v1_round_secrets where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    if lower(v_clue)=lower(v_target) then raise exception '提示不能直接写出答案'; end if;
    if v_state->>'challengeId'='max2' and length(v_clue)>2 then raise exception '本轮提示最多 2 字'; end if;
    if v_state->>'challengeId'='exact4' and length(v_clue)<>4 then raise exception '本轮提示必须正好 4 字'; end if;
    if v_state->>'challengeId'='no_fillers' and v_clue ~ '[的是很像有]' then raise exception '本轮提示包含禁用字'; end if;
    insert into public.clue_v1_clues(game_code,session_no,round_no,player_id,clue_id,clue_text)
    values(upper(p_code),p_expected_session,p_expected_round,actor,'cl1-'||substr(md5(upper(p_code)||p_expected_session||p_expected_round||actor),1,24),v_clue)
    on conflict(game_code,session_no,round_no,player_id) do nothing;
    v_state := jsonb_set(v_state,array['clueStatuses',actor],'"confirmed"'::jsonb,true);
    n := coalesce((v_state->>'clueConfirmedCount')::integer,0)+1;
    v_state := jsonb_set(v_state,'{clueConfirmedCount}',to_jsonb(n));
    if n>=jsonb_array_length(v_state->'expectedCluePlayerIds') then v_state := public.clue_v1_open_guessing(upper(p_code),v_state,now_ms); end if;

  elsif p_action_type='submit_clue_guess' then
    if v_state->>'status'<>'guessing' or actor<>v_state->>'guesserId' then raise exception '当前不是你的猜题阶段'; end if;
    v_guess := trim(coalesce(p_payload->>'guessText',''));
    if length(v_guess) not between 1 and 20 then raise exception '答案须为 1–20 字'; end if;
    select target_word into v_target from public.clue_v1_round_secrets where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    v_elapsed := greatest(0,least(60000,(now_ms-((v_state->>'phaseDeadlineAt')::bigint-60000))::integer));
    insert into public.clue_v1_guesses(game_code,session_no,round_no,player_id,guess_text,correct,elapsed_ms)
    values(upper(p_code),p_expected_session,p_expected_round,actor,v_guess,lower(v_guess)=lower(v_target),v_elapsed);
    if lower(v_guess)=lower(v_target) then
      v_state := jsonb_set(v_state,'{status}','"rating"');
      v_state := jsonb_set(v_state,'{guessStatus}','"correct"');
      v_state := jsonb_set(v_state,'{guessElapsedMs}',to_jsonb(v_elapsed));
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
    else
      v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,false,v_guess,v_elapsed,'{}'::jsonb);
    end if;

  elsif p_action_type='confirm_clue_ratings' then
    if v_state->>'status'<>'rating' or actor<>v_state->>'guesserId' then raise exception '当前不是你的评分阶段'; end if;
    v_ratings := coalesce(p_payload->'ratings','{}'::jsonb);
    for clue_row in select value->>'clueId' clue_id from jsonb_array_elements(v_state->'publicClues') loop
      if coalesce(v_ratings->>clue_row.clue_id,'') !~ '^[1-3]$' then raise exception '请为每条提示选择 1–3 分'; end if;
    end loop;
    select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,true,v_guess,v_elapsed,v_ratings);

  elsif p_action_type='advance_clue_phase' then
    if (v_state->>'phaseDeadlineAt')::bigint>now_ms then raise exception '当前阶段尚未结束'; end if;
    if v_state->>'status'='clue_writing' then
      v_state := public.clue_v1_open_guessing(upper(p_code),v_state,now_ms);
    elsif v_state->>'status'='guessing' then
      v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,false,null,0,'{}'::jsonb);
    elsif v_state->>'status'='rating' then
      select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
      v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,true,v_guess,v_elapsed,'{}'::jsonb);
    elsif v_state->>'status'='result' then
      if (v_state->>'round')::integer>=(v_state->>'totalRounds')::integer then
        v_state := jsonb_set(v_state,'{status}','"finished"');
        v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
      else
        v_state := public.clue_v1_begin_round(upper(p_code),v_state,(v_state->>'round')::integer+1,now_ms);
      end if;
    else raise exception '当前阶段无需推进'; end if;

  elsif p_action_type='restart_clue_game' then
    if actor<>v_state->>'ownerId' or v_state->>'status'<>'finished' then raise exception '仅房主可在结束后再来一局'; end if;
    v_state := jsonb_set(v_state,'{sessionNo}',to_jsonb((v_state->>'sessionNo')::integer+1));
    v_state := jsonb_set(v_state,'{status}','"lobby"');
    v_state := jsonb_set(v_state,'{round}','0'::jsonb);
    v_state := jsonb_set(v_state,'{totalRounds}','0'::jsonb);
    v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
    v_state := jsonb_set(v_state,'{previousSessionWordIds}',coalesce(v_state->'previousSessionWordIds','[]'::jsonb)||coalesce(v_state->'usedWordIds','[]'::jsonb));
    v_state := jsonb_set(v_state,'{usedWordIds}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guesserOrder}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guesserId}','null'::jsonb);
    v_state := jsonb_set(v_state,'{guesserName}','null'::jsonb);
    v_state := jsonb_set(v_state,'{challengeId}','null'::jsonb);
    v_state := jsonb_set(v_state,'{challengeText}','null'::jsonb);
    v_state := jsonb_set(v_state,'{expectedCluePlayerIds}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{clueStatuses}','{}'::jsonb);
    v_state := jsonb_set(v_state,'{clueConfirmedCount}','0'::jsonb);
    v_state := jsonb_set(v_state,'{publicClues}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guessStatus}','"waiting"');
    v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
    v_state := jsonb_set(v_state,'{revealedWord}','null'::jsonb);
    v_state := jsonb_set(v_state,'{roundResults}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{hintScores}','{}'::jsonb);
    v_state := jsonb_set(v_state,'{guessTimes}','{}'::jsonb);
  else
    raise exception 'unsupported clue action';
  end if;

  ver := g.version+1;
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  response := jsonb_build_object('outcome','applied','code','OK','message',case p_action_type
    when 'start_clue_game' then '第一轮已开始'
    when 'confirm_clue' then '提示已确认'
    when 'submit_clue_guess' then case when v_state->>'guessStatus'='correct' then '猜中了，请为提示评分' else '已提交答案' end
    when 'confirm_clue_ratings' then '评分已确认，作者已揭晓'
    when 'restart_clue_game' then '已保留成员并开启新局'
    else '阶段已推进' end,'state',v_state,'version',ver);
  insert into public.clue_v1_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result)
  values(g.code,p_expected_session,p_action_id,actor,p_action_type,p_expected_round,response);
  return response;
end $$;

revoke all on function public.clue_v1_begin_round(text,jsonb,integer,bigint) from public,anon,authenticated;
revoke all on function public.clue_v1_open_guessing(text,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.clue_v1_finish_round(text,jsonb,bigint,boolean,text,integer,jsonb) from public,anon,authenticated;

grant execute on function public.create_clue_game_v1(text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.join_clue_game_v1(text,text,text) to anon,authenticated,service_role;
grant execute on function public.get_my_clue_round_v1(text) to anon,authenticated,service_role;
grant execute on function public.apply_clue_action_v1(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;

notify pgrst,'reload schema';
