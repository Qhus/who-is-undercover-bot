-- A3 提示大王 Draft 0.3 / V3 增量迁移。
-- 新增三种模式、四档题库、公共规则与个人角色；不覆盖 V1/V2 RPC，不删除旧表和旧房间。

create table if not exists public.clue_word_bank_v3 (
  id text primary key,
  word text not null unique,
  category text not null,
  difficulty text not null check(difficulty in ('easy','normal','hard')),
  role_ready boolean not null default true,
  allowed_role_ids jsonb not null default '[]'::jsonb,
  allowed_public_rule_ids jsonb not null default '[]'::jsonb,
  enabled boolean not null default true
);

create table if not exists public.clue_public_rule_bank_v3 (
  id text primary key,
  name text not null,
  rule_text text not null,
  example_text text not null,
  enabled boolean not null default true
);

create table if not exists public.clue_role_bank_v3 (
  id text primary key,
  name text not null,
  rule_text text not null,
  example_text text not null,
  load text not null check(load in ('low','medium','high')),
  enabled boolean not null default true
);

insert into public.clue_public_rule_bank_v3(id,name,rule_text,example_text) values
('P01','后果先行','不描述答案本身，只说它出现后的结果','加班 → 第二天黑眼圈'),
('P02','固定搭档','只写一个经常和答案一起出现的东西','咖啡 → 电脑'),
('P03','答案开口','假设答案会说话，写一句它会说的话','闹钟 → 起床，不许装死'),
('P04','路人弹幕','写一句旁观者看到它时会发的评论','相亲 → 这俩人聊不下去了'),
('P05','第一反应','只写人看到、听到或遇到它的第一反应','榴莲 → 先捂鼻子'),
('P06','排除法','只说它不是什么，或容易和什么混淆','地铁 → 不是火车也在地下跑'),
('P07','问号局','把提示写成一个问句','雨伞 → 今天会下吗？'),
('P08','数字入场','提示中带一个数字','猫 → 9 条命'),
('P09','两字极限','尽量正好写 2 字','失眠 → 清醒'),
('P10','四字定格','尽量正好写 4 字','电梯 → 上下直达'),
('P11','一幕小剧场','用 8–16 字写一个正在发生的小场景','厕所 → 再找不到真的要出事了')
on conflict(id) do update set name=excluded.name,rule_text=excluded.rule_text,example_text=excluded.example_text,enabled=true;

insert into public.clue_role_bank_v3(id,name,rule_text,example_text,load) values
('R01','撒谎者','说反话，但要留下一条能绕回答案的联系','失眠 → 一觉到天亮','high'),
('R02','话痨','写 8–16 字，把一件事说得稍微完整一点','雨伞 → 出门嫌累下雨后悔没带','medium'),
('R03','惜字如金','尽量正好写 2 字','咖啡 → 提神','medium'),
('R04','导游','只从地点、时间或出现的场景切入','电梯 → 高楼层中转站','low'),
('R05','诗人','使用比喻或意象，不直说类别','闹钟 → 清晨的敌军号角','medium'),
('R06','阴阳师','使用阴阳怪气、表面夸奖的口吻','加班 → 真是自愿奋斗呢','medium'),
('R07','恋爱脑','把答案描述成一段感情','充电器 → 没你我活不下去','medium'),
('R08','甩锅侠','把责任推给其他人或东西','迟到 → 都怪地铁太努力','medium'),
('R09','客服','使用客服通知、解释或道歉口吻','排队 → 您的位置正在处理中','low'),
('R10','古人','使用古风、文言或古代人的表达','自拍 → 对镜留影','medium'),
('R11','外星人','当作第一次观察地球事物来描述','奶茶 → 地球人摇晃甜水','medium'),
('R12','戏精','把普通事情描述得极其严重或夸张','蚊子 → 今晚不是它死就是我亡','low')
on conflict(id) do update set name=excluded.name,rule_text=excluded.rule_text,example_text=excluded.example_text,load=excluded.load,enabled=true;

insert into public.clue_word_bank_v3(id,word,category,difficulty) values
('e001','加班','职场','easy'),('e002','周报','职场','easy'),('e003','会议','职场','easy'),('e004','工位','职场','easy'),('e005','打卡','职场','easy'),
('e006','请假','职场','easy'),('e007','团建','职场','easy'),('e008','报销','职场','easy'),('e009','奶茶','饮食','easy'),('e010','火锅','饮食','easy'),
('e011','烧烤','饮食','easy'),('e012','咖啡','饮食','easy'),('e013','泡面','饮食','easy'),('e014','榴莲','饮食','easy'),('e015','饺子','饮食','easy'),
('e016','蛋糕','饮食','easy'),('e017','电梯','场景','easy'),('e018','地铁','场景','easy'),('e019','机场','场景','easy'),('e020','厕所','场景','easy'),
('e021','电影院','场景','easy'),('e022','健身房','场景','easy'),('e023','便利店','场景','easy'),('e024','停车场','场景','easy'),('e025','空调','物品','easy'),
('e026','雨伞','物品','easy'),('e027','充电器','物品','easy'),('e028','耳机','物品','easy'),('e029','拖鞋','物品','easy'),('e030','遥控器','物品','easy'),
('e031','保温杯','物品','easy'),('e032','行李箱','物品','easy'),('e033','打印机','物品','easy'),('e034','闹钟','日常','easy'),('e035','快递','日常','easy'),
('e036','猫','动物','easy'),('e037','狗','动物','easy'),('e038','熊猫','动物','easy'),('e039','企鹅','动物','easy'),('e040','蚊子','动物','easy'),
('n001','年终奖','职场','normal'),('n002','摸鱼','职场','normal'),('n003','相亲','生活','normal'),('n004','搬家','生活','normal'),('n005','失眠','生活','normal'),
('n006','迟到','生活','normal'),('n007','减肥','生活','normal'),('n008','网购','生活','normal'),('n009','追剧','生活','normal'),('n010','抢红包','生活','normal'),
('n011','排队','生活','normal'),('n012','做梦','生活','normal'),('n013','老板','人物','normal'),('n014','同事','人物','normal'),('n015','室友','人物','normal'),
('n016','前任','人物','normal'),('n017','外卖员','人物','normal'),('n018','班主任','人物','normal'),('n019','程序员','人物','normal'),('n020','甲方','人物','normal'),
('n021','邻居','人物','normal'),('n022','网友','人物','normal'),('n023','尴尬','感受','normal'),('n024','心虚','感受','normal'),('n025','后悔','感受','normal'),
('n026','兴奋','感受','normal'),('n027','焦虑','感受','normal'),('n028','无聊','感受','normal'),('n029','社恐','感受','normal'),('n030','感动','感受','normal'),
('n031','委屈','感受','normal'),('n032','嫉妒','感受','normal'),('n033','表情包','网络','normal'),('n034','朋友圈','网络','normal'),('n035','热搜','网络','normal'),
('n036','彩票','娱乐','normal'),('n037','堵车','日常','normal'),('n038','停电','日常','normal'),('n039','自拍','日常','normal'),('n040','黑眼圈','日常','normal'),
('h001','画饼','职场','hard'),('h002','甩锅','职场','hard'),('h003','内耗','感受','hard'),('h004','摆烂','状态','hard'),('h005','破防','感受','hard'),
('h006','上头','感受','hard'),('h007','下头','感受','hard'),('h008','吃瓜','网络','hard'),('h009','剧透','娱乐','hard'),('h010','反转','叙事','hard'),
('h011','冷场','社交','hard'),('h012','社死','社交','hard'),('h013','默契','关系','hard'),('h014','偏见','观念','hard'),('h015','执念','感受','hard'),
('h016','遗憾','感受','hard'),('h017','灵感','思维','hard'),('h018','直觉','思维','hard'),('h019','面子','社交','hard'),('h020','借口','表达','hard'),
('h021','误会','关系','hard'),('h022','暗示','表达','hard'),('h023','套路','行为','hard'),('h024','回忆','思维','hard'),('h025','梦境','思维','hard'),
('h026','预感','思维','hard'),('h027','仪式感','观念','hard'),('h028','边界感','关系','hard'),('h029','松弛感','状态','hard'),('h030','存在感','状态','hard'),
('h031','反差感','观念','hard'),('h032','安全感','感受','hard'),('h033','情绪价值','关系','hard'),('h034','选择困难','状态','hard'),('h035','职业病','职场','hard'),
('h036','电子榨菜','网络','hard'),('h037','已读不回','社交','hard'),('h038','最终解释','职场','hard'),('h039','无效加班','职场','hard'),('h040','精神股东','网络','hard')
on conflict(id) do update set word=excluded.word,category=excluded.category,difficulty=excluded.difficulty,enabled=true;

update public.clue_word_bank_v3 set
  allowed_public_rule_ids='["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11"]'::jsonb,
  allowed_role_ids=case when difficulty='hard'
    then '["R02","R03","R04","R05","R06","R07","R09","R10","R12"]'::jsonb
    else '["R01","R02","R03","R04","R05","R06","R07","R08","R09","R10","R11","R12"]'::jsonb end,
  role_ready=true;

create table if not exists public.clue_v3_round_secrets (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  guesser_id text not null,
  word_id text not null references public.clue_word_bank_v3(id),
  target_word text not null,
  difficulty text not null,
  public_rule_id text references public.clue_public_rule_bank_v3(id),
  primary key(game_code,session_no,round_no)
);

create table if not exists public.clue_v3_role_assignments (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  role_id text not null references public.clue_role_bank_v3(id),
  primary key(game_code,session_no,round_no,player_id)
);

alter table public.clue_word_bank_v3 enable row level security;
alter table public.clue_public_rule_bank_v3 enable row level security;
alter table public.clue_role_bank_v3 enable row level security;
alter table public.clue_v3_round_secrets enable row level security;
alter table public.clue_v3_role_assignments enable row level security;
revoke all on public.clue_word_bank_v3,public.clue_public_rule_bank_v3,public.clue_role_bank_v3,public.clue_v3_round_secrets,public.clue_v3_role_assignments from public,anon,authenticated;

create or replace function public.create_clue_game_v3(
  p_code text,p_owner_player_id text,p_owner_name text,p_mode text default 'free',p_difficulty text default 'normal'
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  if p_mode not in ('free','public_rule','role_play') then raise exception '玩法模式无效'; end if;
  if p_difficulty not in ('easy','normal','hard','mixed') then raise exception '题目难度无效'; end if;
  v_state := jsonb_build_object(
    'code',p_code,'gameType','clue_king','clueVersion',3,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false)),
    'playerLimit',8,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,'totalRounds',0,
    'phaseDeadlineAt',null,'mode',p_mode,'difficulty',p_difficulty,'currentDifficulty',null,
    'guesserOrder','[]'::jsonb,'guesserId',null,'guesserName',null,
    'challengeId',null,'challengeText',null,'publicRuleId',null,'publicRuleName',null,'publicRuleText',null,
    'expectedCluePlayerIds','[]'::jsonb,'clueStatuses','{}'::jsonb,'clueConfirmedCount',0,'publicClues','[]'::jsonb,
    'guessAttemptCount',0,'guessStatus','waiting','guessElapsedMs',null,'revealedWord',null,'roundResults','[]'::jsonb,
    'hintScores','{}'::jsonb,'guessTimes','{}'::jsonb,'usedWordIds','[]'::jsonb,'previousSessionWordIds','[]'::jsonb,
    'recentWordIds','[]'::jsonb,'lastPublicRuleId',null,'lastRoleByPlayer','{}'::jsonb
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,v_state,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return v_state;
end $$;

create or replace function public.join_clue_game_v3(p_code text,p_player_id text,p_nickname text)
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
  if not found or g.state->>'gameType'<>'clue_king' or coalesce((g.state->>'clueVersion')::integer,0)<>3 then raise exception 'A3 房间不存在或版本不兼容'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  if g.state->>'status'<>'lobby' then raise exception '本局已经开始，请等待下一局'; end if;
  v_players := coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(v_players)>=8 then raise exception '房间已满'; end if;
  v_players := v_players||jsonb_build_array(jsonb_build_object('id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(v_players)+1,'alive',true,'cardReady',false,'away',false));
  ver := g.version+1;
  v_state := jsonb_set(g.state,'{players}',v_players);
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;

create or replace function public.get_my_clue_round_v3(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  v_state jsonb;
  v_secret public.clue_v3_round_secrets%rowtype;
  v_clue public.clue_v1_clues%rowtype;
  v_role public.clue_role_bank_v3%rowtype;
  v_session integer;
  v_round integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select g.state into v_state from public.games g where g.code=upper(p_code) and g.expires_at>now();
  if v_state is null or v_state->>'gameType'<>'clue_king' or coalesce((v_state->>'clueVersion')::integer,0)<>3 then raise exception 'A3 房间不存在或版本不兼容'; end if;
  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  v_round := coalesce((v_state->>'round')::integer,0);
  if v_round>0 then
    select * into v_secret from public.clue_v3_round_secrets where game_code=upper(p_code) and session_no=v_session and round_no=v_round;
    select * into v_clue from public.clue_v1_clues where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
    select role.* into v_role from public.clue_v3_role_assignments assignment_row join public.clue_role_bank_v3 role on role.id=assignment_row.role_id
    where assignment_row.game_code=upper(p_code) and assignment_row.session_no=v_session and assignment_row.round_no=v_round and assignment_row.player_id=actor;
  end if;
  return jsonb_build_object(
    'sessionNo',v_session,'round',v_round,
    'targetWord',case when v_round>0 and actor<>coalesce(v_secret.guesser_id,'') then v_secret.target_word else null end,
    'clueText',coalesce(v_clue.clue_text,''),'clueConfirmed',v_clue.confirmed_at is not null,
    'challengeId',v_state->>'publicRuleId','challengeText',v_state->>'publicRuleText',
    'roleId',v_role.id,'roleName',v_role.name,'roleRule',v_role.rule_text
  );
end $$;

create or replace function public.clue_v3_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_guesser_id text;
  v_guesser_name text;
  v_expected jsonb;
  v_statuses jsonb;
  v_word public.clue_word_bank_v3%rowtype;
  v_rule public.clue_public_rule_bank_v3%rowtype;
  v_role public.clue_role_bank_v3%rowtype;
  v_difficulty text;
  v_used_roles jsonb := '[]'::jsonb;
  v_last_roles jsonb := coalesce(p_state->'lastRoleByPlayer','{}'::jsonb);
  v_player_id text;
  v_recent jsonb;
  v_recent_length integer;
begin
  v_guesser_id := v_state->'guesserOrder'->>(p_round-1);
  select player->>'name' into v_guesser_name from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=v_guesser_id;
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb) into v_expected
  from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'<>v_guesser_id;
  select coalesce(jsonb_object_agg(id,'writing'),'{}'::jsonb) into v_statuses from jsonb_array_elements_text(v_expected) as ids(id);

  if v_state->>'difficulty'='mixed' then
    select value into v_difficulty from unnest(array['easy','normal','hard']) choices(value)
    where value<>coalesce(v_state->>'currentDifficulty','') order by random() limit 1;
  else v_difficulty := v_state->>'difficulty'; end if;

  select * into v_word from public.clue_word_bank_v3
  where enabled and difficulty=v_difficulty
    and not (coalesce(v_state->'recentWordIds','[]'::jsonb) ? id)
    and (v_state->>'mode'<>'role_play' or role_ready)
  order by random() limit 1;
  if not found then
    select * into v_word from public.clue_word_bank_v3
    where enabled and difficulty=v_difficulty and not (coalesce(v_state->'usedWordIds','[]'::jsonb) ? id)
      and (v_state->>'mode'<>'role_play' or role_ready)
    order by random() limit 1;
  end if;
  if not found then raise exception '当前难度没有可用题目'; end if;

  if v_state->>'mode'='public_rule' then
    select * into v_rule from public.clue_public_rule_bank_v3
    where enabled and v_word.allowed_public_rule_ids ? id and id<>coalesce(v_state->>'lastPublicRuleId','')
    order by random() limit 1;
    if not found then select * into v_rule from public.clue_public_rule_bank_v3 where enabled and v_word.allowed_public_rule_ids ? id order by random() limit 1; end if;
    if not found then raise exception '当前题目没有可用公共规则'; end if;
  end if;

  if v_state->>'mode'='role_play' then
    for v_player_id in select value from jsonb_array_elements_text(v_expected) loop
      select * into v_role from public.clue_role_bank_v3
      where enabled and v_word.allowed_role_ids ? id and not (v_used_roles ? id) and id<>coalesce(v_last_roles->>v_player_id,'')
      order by random() limit 1;
      if not found then select * into v_role from public.clue_role_bank_v3 where enabled and v_word.allowed_role_ids ? id and not (v_used_roles ? id) order by random() limit 1; end if;
      if not found then select * into v_role from public.clue_role_bank_v3 where enabled and v_word.allowed_role_ids ? id order by random() limit 1; end if;
      if not found then raise exception '当前题目无法完成角色分配'; end if;
      insert into public.clue_v3_role_assignments(game_code,session_no,round_no,player_id,role_id)
      values(p_code,(v_state->>'sessionNo')::integer,p_round,v_player_id,v_role.id);
      v_used_roles := v_used_roles||jsonb_build_array(v_role.id);
      v_last_roles := jsonb_set(v_last_roles,array[v_player_id],to_jsonb(v_role.id),true);
    end loop;
  end if;

  insert into public.clue_v3_round_secrets(game_code,session_no,round_no,guesser_id,word_id,target_word,difficulty,public_rule_id)
  values(p_code,(v_state->>'sessionNo')::integer,p_round,v_guesser_id,v_word.id,v_word.word,v_difficulty,v_rule.id);

  v_recent := coalesce(v_state->'recentWordIds','[]'::jsonb)||jsonb_build_array(v_word.id);
  v_recent_length := jsonb_array_length(v_recent);
  if v_recent_length>21 then
    select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_recent
    from jsonb_array_elements(v_recent) with ordinality rows(value,ord) where ord>v_recent_length-21;
  end if;

  v_state := jsonb_set(v_state,'{status}','"clue_writing"');
  v_state := jsonb_set(v_state,'{round}',to_jsonb(p_round));
  v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+120000));
  v_state := jsonb_set(v_state,'{guesserId}',to_jsonb(v_guesser_id));
  v_state := jsonb_set(v_state,'{guesserName}',to_jsonb(v_guesser_name));
  v_state := jsonb_set(v_state,'{currentDifficulty}',to_jsonb(v_difficulty));
  v_state := jsonb_set(v_state,'{publicRuleId}',coalesce(to_jsonb(v_rule.id),'null'::jsonb));
  v_state := jsonb_set(v_state,'{publicRuleName}',coalesce(to_jsonb(v_rule.name),'null'::jsonb));
  v_state := jsonb_set(v_state,'{publicRuleText}',coalesce(to_jsonb(v_rule.rule_text),'null'::jsonb));
  v_state := jsonb_set(v_state,'{challengeId}',coalesce(to_jsonb(v_rule.id),'null'::jsonb));
  v_state := jsonb_set(v_state,'{challengeText}',coalesce(to_jsonb(v_rule.rule_text),'null'::jsonb));
  v_state := jsonb_set(v_state,'{expectedCluePlayerIds}',v_expected);
  v_state := jsonb_set(v_state,'{clueStatuses}',v_statuses);
  v_state := jsonb_set(v_state,'{clueConfirmedCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{publicClues}','[]'::jsonb);
  v_state := jsonb_set(v_state,'{guessAttemptCount}','0'::jsonb);
  v_state := jsonb_set(v_state,'{guessStatus}','"waiting"');
  v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
  v_state := jsonb_set(v_state,'{revealedWord}','null'::jsonb);
  v_state := jsonb_set(v_state,'{usedWordIds}',coalesce(v_state->'usedWordIds','[]'::jsonb)||jsonb_build_array(v_word.id));
  v_state := jsonb_set(v_state,'{recentWordIds}',v_recent);
  v_state := jsonb_set(v_state,'{lastPublicRuleId}',coalesce(to_jsonb(v_rule.id),v_state->'lastPublicRuleId','null'::jsonb));
  v_state := jsonb_set(v_state,'{lastRoleByPlayer}',v_last_roles);
  return v_state;
end $$;

create or replace function public.clue_v3_open_guessing(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_entries jsonb;
  v_statuses jsonb;
begin
  select coalesce(jsonb_object_agg(key,case when value='writing' then 'unconfirmed' else value end),'{}'::jsonb) into v_statuses from jsonb_each_text(coalesce(v_state->'clueStatuses','{}'::jsonb));
  select coalesce(jsonb_agg(jsonb_build_object(
    'clueId',clue.clue_id,'displayCode','提示 '||chr(64+clue.seq::integer),'text',clue.clue_text,
    'roleId',clue.role_id,'roleName',clue.role_name,'roleRule',clue.role_rule
  ) order by clue.seq),'[]'::jsonb) into v_entries
  from (
    select source.clue_id,source.clue_text,role.id role_id,role.name role_name,role.rule_text role_rule,
      row_number() over(order by md5(source.clue_id)) seq
    from public.clue_v1_clues source
    left join public.clue_v3_role_assignments assignment_row on assignment_row.game_code=source.game_code and assignment_row.session_no=source.session_no and assignment_row.round_no=source.round_no and assignment_row.player_id=source.player_id
    left join public.clue_role_bank_v3 role on role.id=assignment_row.role_id
    where source.game_code=p_code and source.session_no=(v_state->>'sessionNo')::integer and source.round_no=(v_state->>'round')::integer
  ) clue;
  v_state := jsonb_set(v_state,'{clueStatuses}',v_statuses);
  v_state := jsonb_set(v_state,'{publicClues}',v_entries);
  v_state := jsonb_set(v_state,'{status}','"guessing"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+60000));
end $$;

create or replace function public.clue_v3_finish_round(p_code text,p_state jsonb,p_now_ms bigint,p_correct boolean,p_guess_text text,p_elapsed_ms integer,p_ratings jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_secret public.clue_v3_round_secrets%rowtype;
  v_entry record;
  v_entries jsonb;
  v_score integer;
  v_guesser_name text;
  v_result jsonb;
begin
  select * into v_secret from public.clue_v3_round_secrets where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer;
  for v_entry in select * from public.clue_v1_clues where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer loop
    v_score := case when p_correct then coalesce((p_ratings->>v_entry.clue_id)::integer,1) else 0 end;
    update public.clue_v1_clues set score=case when p_correct then v_score else null end where game_code=p_code and session_no=(v_state->>'sessionNo')::integer and round_no=(v_state->>'round')::integer and player_id=v_entry.player_id;
    if p_correct then v_state := jsonb_set(v_state,array['hintScores',v_entry.player_id],to_jsonb(coalesce((v_state->'hintScores'->>v_entry.player_id)::integer,0)+v_score),true); end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'clueId',clue.clue_id,'displayCode','提示 '||chr(64+clue.seq::integer),'text',clue.clue_text,
    'roleId',clue.role_id,'roleName',clue.role_name,'roleRule',clue.role_rule,
    'authorId',clue.player_id,'authorName',coalesce((select player->>'name' from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=clue.player_id),'未知成员'),
    'score',clue.score
  ) order by clue.seq),'[]'::jsonb) into v_entries
  from (
    select source.*,role.id role_id,role.name role_name,role.rule_text role_rule,row_number() over(order by md5(source.clue_id)) seq
    from public.clue_v1_clues source
    left join public.clue_v3_role_assignments assignment_row on assignment_row.game_code=source.game_code and assignment_row.session_no=source.session_no and assignment_row.round_no=source.round_no and assignment_row.player_id=source.player_id
    left join public.clue_role_bank_v3 role on role.id=assignment_row.role_id
    where source.game_code=p_code and source.session_no=(v_state->>'sessionNo')::integer and source.round_no=(v_state->>'round')::integer
  ) clue;
  select player->>'name' into v_guesser_name from jsonb_array_elements(v_state->'players') as rows(player) where player->>'id'=v_state->>'guesserId';
  v_result := jsonb_build_object('round',(v_state->>'round')::integer,'guesserId',v_state->>'guesserId','guesserName',v_guesser_name,'targetWord',v_secret.target_word,'guessText',p_guess_text,'correct',p_correct,'elapsedMs',case when p_correct then p_elapsed_ms else null end);
  v_state := jsonb_set(v_state,'{publicClues}',v_entries);
  v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_secret.target_word));
  v_state := jsonb_set(v_state,'{guessStatus}',to_jsonb(case when p_correct then 'correct' when p_guess_text is null then 'timeout' else 'wrong' end));
  v_state := jsonb_set(v_state,'{guessElapsedMs}',case when p_correct then to_jsonb(p_elapsed_ms) else 'null'::jsonb end);
  v_state := jsonb_set(v_state,'{roundResults}',coalesce(v_state->'roundResults','[]'::jsonb)||jsonb_build_array(v_result));
  if p_correct then v_state := jsonb_set(v_state,array['guessTimes',v_state->>'guesserId'],to_jsonb(p_elapsed_ms),true); end if;
  v_state := jsonb_set(v_state,'{status}','"result"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.apply_clue_action_v3(
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
  v_attempts integer;
  v_ratings jsonb;
  v_last_result jsonb;
  clue_row record;
  response jsonb;
  v_message text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select result into prior from public.clue_v1_actions where game_code=upper(p_code) and session_no=p_expected_session and action_id=p_action_id;
  if found then return prior; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'clue_king' or coalesce((g.state->>'clueVersion')::integer,0)<>3 then raise exception 'A3 房间不存在或版本不兼容'; end if;
  v_state := g.state;
  if v_state->>'status'<>p_expected_status or (v_state->>'round')::integer<>p_expected_round or (v_state->>'sessionNo')::integer<>p_expected_session or g.version<>p_expected_version then
    return jsonb_build_object('outcome','stale','code','STATE_UPDATED','message','状态已更新，请重试','state',v_state,'version',g.version);
  end if;

  if p_action_type='start_clue_game' then
    if actor<>v_state->>'ownerId' then raise exception '仅房主可以开始'; end if;
    if v_state->>'status'<>'lobby' then raise exception '当前不能开始'; end if;
    n := jsonb_array_length(v_state->'players');
    if n<2 then raise exception '至少需要 2 名成员'; end if;
    select jsonb_agg(player->>'id' order by random()) into v_order from jsonb_array_elements(v_state->'players') as rows(player);
    select jsonb_object_agg(player->>'id',0) into v_scores from jsonb_array_elements(v_state->'players') as rows(player);
    v_state := jsonb_set(v_state,'{guesserOrder}',v_order);
    v_state := jsonb_set(v_state,'{totalRounds}',to_jsonb(n));
    v_state := jsonb_set(v_state,'{hintScores}',v_scores);
    v_state := jsonb_set(v_state,'{guessTimes}','{}'::jsonb);
    v_state := public.clue_v3_begin_round(upper(p_code),v_state,1,now_ms);
    v_message := '第一轮已开始';

  elsif p_action_type='confirm_clue' then
    if v_state->>'status'<>'clue_writing' or not (v_state->'expectedCluePlayerIds' ? actor) then raise exception '本轮无需提交提示'; end if;
    if v_state->'clueStatuses'->>actor='confirmed' then raise exception '提示已经确认'; end if;
    v_clue := trim(coalesce(p_payload->>'clueText',''));
    if length(v_clue) not between 1 and 16 then raise exception '提示须为 1–16 字'; end if;
    select target_word into v_target from public.clue_v3_round_secrets where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    if position(lower(v_target) in lower(v_clue))>0 then raise exception '提示不能直接写出答案'; end if;
    insert into public.clue_v1_clues(game_code,session_no,round_no,player_id,clue_id,clue_text)
    values(upper(p_code),p_expected_session,p_expected_round,actor,'cl3-'||substr(md5(upper(p_code)||p_expected_session||p_expected_round||actor),1,24),v_clue)
    on conflict(game_code,session_no,round_no,player_id) do nothing;
    v_state := jsonb_set(v_state,array['clueStatuses',actor],'"confirmed"'::jsonb,true);
    n := coalesce((v_state->>'clueConfirmedCount')::integer,0)+1;
    v_state := jsonb_set(v_state,'{clueConfirmedCount}',to_jsonb(n));
    if n>=jsonb_array_length(v_state->'expectedCluePlayerIds') then v_state := public.clue_v3_open_guessing(upper(p_code),v_state,now_ms); end if;
    v_message := '提示已确认';

  elsif p_action_type='submit_clue_guess' then
    if v_state->>'status'<>'guessing' or actor<>v_state->>'guesserId' then raise exception '当前不是你的判断阶段'; end if;
    v_guess := trim(coalesce(p_payload->>'guessText',''));
    if length(v_guess) not between 1 and 20 then raise exception '答案须为 1–20 字'; end if;
    v_attempts := coalesce((v_state->>'guessAttemptCount')::integer,0)+1;
    if v_attempts>3 then raise exception '本轮尝试次数已用完'; end if;
    select target_word into v_target from public.clue_v3_round_secrets where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    v_elapsed := greatest(0,least(60000,(now_ms-((v_state->>'phaseDeadlineAt')::bigint-60000))::integer));
    insert into public.clue_v1_guesses(game_code,session_no,round_no,player_id,guess_text,correct,elapsed_ms)
    values(upper(p_code),p_expected_session,p_expected_round,actor,v_guess,lower(v_guess)=lower(v_target),v_elapsed)
    on conflict(game_code,session_no,round_no) do update set player_id=excluded.player_id,guess_text=excluded.guess_text,correct=excluded.correct,elapsed_ms=excluded.elapsed_ms,submitted_at=now();
    v_state := jsonb_set(v_state,'{guessAttemptCount}',to_jsonb(v_attempts));
    if lower(v_guess)=lower(v_target) then
      v_state := jsonb_set(v_state,'{status}','"rating"');
      v_state := jsonb_set(v_state,'{guessStatus}','"correct"');
      v_state := jsonb_set(v_state,'{guessElapsedMs}',to_jsonb(v_elapsed));
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
      v_message := '判断正确，请完成提示评分';
    elsif v_attempts>=3 then
      v_state := public.clue_v3_finish_round(upper(p_code),v_state,now_ms,false,v_guess,v_elapsed,'{}'::jsonb);
      v_message := '三次均未命中，本轮已结束';
    else
      v_state := jsonb_set(v_state,'{guessStatus}','"wrong"');
      v_message := '暂未命中，还可尝试 '||(3-v_attempts)::text||' 次';
    end if;

  elsif p_action_type='confirm_clue_ratings' then
    if v_state->>'status'<>'rating' or actor<>v_state->>'guesserId' then raise exception '当前不是你的评分阶段'; end if;
    v_ratings := coalesce(p_payload->'ratings','{}'::jsonb);
    for clue_row in select value->>'clueId' clue_id from jsonb_array_elements(v_state->'publicClues') loop
      if coalesce(v_ratings->>clue_row.clue_id,'') !~ '^[1-3]$' then raise exception '请为每条提示选择 1–3 分'; end if;
    end loop;
    select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
    v_state := public.clue_v3_finish_round(upper(p_code),v_state,now_ms,true,v_guess,v_elapsed,v_ratings);
    v_message := '评分已确认，作者已揭晓';

  elsif p_action_type='skip_clue_result' then
    if v_state->>'status'<>'result' then raise exception '当前无需跳过等待'; end if;
    v_last_result := v_state->'roundResults'->(jsonb_array_length(coalesce(v_state->'roundResults','[]'::jsonb))-1);
    if coalesce((v_last_result->>'correct')::boolean,false) then raise exception '判断正确的结果保留正常展示时间'; end if;
    if actor<>v_state->>'ownerId' and actor<>v_state->>'guesserId' then raise exception '仅本轮负责人或房主可以跳过等待'; end if;
    if (v_state->>'round')::integer>=(v_state->>'totalRounds')::integer then
      v_state := jsonb_set(v_state,'{status}','"finished"');
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
      v_message := '已跳过等待，查看最终统计';
    else
      v_state := public.clue_v3_begin_round(upper(p_code),v_state,(v_state->>'round')::integer+1,now_ms);
      v_message := '已跳过等待，进入下一轮';
    end if;

  elsif p_action_type='advance_clue_phase' then
    if (v_state->>'phaseDeadlineAt')::bigint>now_ms then raise exception '当前阶段尚未结束'; end if;
    if v_state->>'status'='clue_writing' then
      v_state := public.clue_v3_open_guessing(upper(p_code),v_state,now_ms);
    elsif v_state->>'status'='guessing' then
      select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
      v_state := public.clue_v3_finish_round(upper(p_code),v_state,now_ms,false,v_guess,coalesce(v_elapsed,0),'{}'::jsonb);
    elsif v_state->>'status'='rating' then
      select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
      v_state := public.clue_v3_finish_round(upper(p_code),v_state,now_ms,true,v_guess,v_elapsed,'{}'::jsonb);
    elsif v_state->>'status'='result' then
      if (v_state->>'round')::integer>=(v_state->>'totalRounds')::integer then
        v_state := jsonb_set(v_state,'{status}','"finished"');
        v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
      else v_state := public.clue_v3_begin_round(upper(p_code),v_state,(v_state->>'round')::integer+1,now_ms); end if;
    else raise exception '当前阶段无需推进'; end if;
    v_message := '阶段已推进';

  elsif p_action_type='restart_clue_game' then
    if actor<>v_state->>'ownerId' or v_state->>'status'<>'finished' then raise exception '仅房主可在结束后再来一局'; end if;
    v_state := jsonb_set(v_state,'{sessionNo}',to_jsonb((v_state->>'sessionNo')::integer+1));
    v_state := jsonb_set(v_state,'{status}','"lobby"');
    v_state := jsonb_set(v_state,'{round}','0'::jsonb);
    v_state := jsonb_set(v_state,'{totalRounds}','0'::jsonb);
    v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
    v_state := jsonb_set(v_state,'{previousSessionWordIds}',coalesce(v_state->'usedWordIds','[]'::jsonb));
    v_state := jsonb_set(v_state,'{usedWordIds}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guesserOrder}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guesserId}','null'::jsonb);
    v_state := jsonb_set(v_state,'{guesserName}','null'::jsonb);
    v_state := jsonb_set(v_state,'{currentDifficulty}','null'::jsonb);
    v_state := jsonb_set(v_state,'{publicRuleId}','null'::jsonb);
    v_state := jsonb_set(v_state,'{publicRuleName}','null'::jsonb);
    v_state := jsonb_set(v_state,'{publicRuleText}','null'::jsonb);
    v_state := jsonb_set(v_state,'{expectedCluePlayerIds}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{clueStatuses}','{}'::jsonb);
    v_state := jsonb_set(v_state,'{clueConfirmedCount}','0'::jsonb);
    v_state := jsonb_set(v_state,'{publicClues}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{guessAttemptCount}','0'::jsonb);
    v_state := jsonb_set(v_state,'{guessStatus}','"waiting"');
    v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
    v_state := jsonb_set(v_state,'{revealedWord}','null'::jsonb);
    v_state := jsonb_set(v_state,'{roundResults}','[]'::jsonb);
    v_state := jsonb_set(v_state,'{hintScores}','{}'::jsonb);
    v_state := jsonb_set(v_state,'{guessTimes}','{}'::jsonb);
    v_message := '已保留成员和设置，等待开始新局';
  else raise exception 'unsupported clue action'; end if;

  ver := g.version+1;
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  response := jsonb_build_object('outcome','applied','code','OK','message',v_message,'state',v_state,'version',ver);
  insert into public.clue_v1_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result)
  values(g.code,p_expected_session,p_action_id,actor,p_action_type,p_expected_round,response);
  return response;
end $$;

revoke all on function public.clue_v3_begin_round(text,jsonb,integer,bigint) from public,anon,authenticated;
revoke all on function public.clue_v3_open_guessing(text,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.clue_v3_finish_round(text,jsonb,bigint,boolean,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.create_clue_game_v3(text,text,text,text,text) from public;
revoke all on function public.join_clue_game_v3(text,text,text) from public;
revoke all on function public.get_my_clue_round_v3(text) from public;
revoke all on function public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.create_clue_game_v3(text,text,text,text,text) to anon,authenticated,service_role;
grant execute on function public.join_clue_game_v3(text,text,text) to anon,authenticated,service_role;
grant execute on function public.get_my_clue_round_v3(text) to anon,authenticated,service_role;
grant execute on function public.apply_clue_action_v3(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
