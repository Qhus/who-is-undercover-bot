-- 离谱法堂 V4.1：可联机试玩增量迁移。
-- 前置：已执行 concurrency-v4-absurd-court.sql。本文件可重复执行，不修改谁是卧底函数。

create table if not exists public.court_cases (id text primary key, content text not null, enabled boolean not null default true);
create table if not exists public.court_twists (id text primary key, content text not null, enabled boolean not null default true);
create table if not exists public.court_keywords (id text primary key, content text not null, enabled boolean not null default true);
alter table public.court_cases enable row level security;
alter table public.court_twists enable row level security;
alter table public.court_keywords enable row level security;

insert into public.court_cases(id,content) values
('case-1','被控在领导宣布散会时，突然问了一句“还有吗？”。'),
('case-2','被控将文件命名为“最终版_最终版2_这次真不改了.xlsx”。'),
('case-3','被控对公司群通知使用“回复全部”，内容仅为“收到”。'),
('case-4','被控连续四周在周报中填写“该事项正在持续推进”。'),
('case-5','被控在周五 17:59 说“只耽误五分钟”，却让全组加班到晚上九点半。'),
('case-6','被控在群里发出“@所有人”，随后解释“抱歉，发错群了”。'),
('case-7','被控在会议中忘记静音，并清晰地说出“这个会怎么还没结束”。'),
('case-8','被控共享屏幕时暴露搜索记录：“如何礼貌拒绝临时会议”。'),
('case-9','被控预约会议室两小时，实际用途是给手机充电。'),
('case-10','被控将 Excel 中所有单元格标成黄色，并称“黄色代表重点”。'),
('case-11','被控打印八十页材料时选择单面打印。'),
('case-12','被控提交故障工单只写“系统有问题”，且没有截图。'),
('case-13','被控在聚餐投票中选择“随便”，随后否决了所有餐厅。'),
('case-14','被控在午休时间发起名为“快速对齐一下”的会议。'),
('case-15','被控借走同事的充电器，归还时只剩一根数据线。'),
('case-16','被控将会议纪要中的每一项负责人都填写为“待确认”。'),
('case-17','被控把在线状态设置为“忙碌”，随后逐个询问大家中午吃什么。'),
('case-18','被控网络中断时连续重启显示器三次。'),
('case-19','被控为一份五页 PPT 添加了四十七种切换动画。'),
('case-20','被控故意保留一条未读消息作为提醒，三周后仍未打开。')
on conflict(id) do update set content=excluded.content,enabled=true;

insert into public.court_twists(id,content) values
('twist-1','新证据显示，监控录像与刚才的陈述存在明显差异。'),('twist-2','新证据显示，现场有一张未署名的便签。'),
('twist-3','新证据显示，时间线比原先记录早了十分钟。'),('twist-4','新证据显示，系统日志显示操作来自共享设备。'),
('twist-5','新证据显示，一位目击者只记得听到了提示音。'),('twist-6','新证据显示，相关文件的修改人显示为“未知”。'),
('twist-7','新证据显示，门禁记录出现了一次异常停留。'),('twist-8','新证据显示，照片背景里有一只没有盖好的水杯。'),
('twist-9','新证据显示，会议纪要缺少关键的一行。'),('twist-10','新证据显示，当事人曾请求“先别发群里”。'),
('twist-11','新证据显示，打印队列里多出了一份同名文件。'),('twist-12','新证据显示，日历上原本的安排被临时挪动。'),
('twist-13','新证据显示，旁边的人说当时听见了笑声。'),('twist-14','新证据显示，设备电量在事件发生前已低于 5%。'),
('twist-15','新证据显示，聊天记录里有一个被撤回的表情。'),('twist-16','新证据显示，现场留下了一根多余的数据线。'),
('twist-17','新证据显示，文件属性显示它被打开过两次。'),('twist-18','新证据显示，监控画面恰好在关键时刻转向了墙角。'),
('twist-19','新证据显示，值班表上有人临时换过班。'),('twist-20','新证据显示，白板上有一个被擦掉一半的箭头。'),
('twist-21','新证据显示，咖啡机在此期间被连续使用三次。'),('twist-22','新证据显示，网络恢复前有人先刷新了页面。'),
('twist-23','新证据显示，记录中的“已处理”并非本人点击。'),('twist-24','新证据显示，桌面上少了一枚回形针。'),
('twist-25','新证据显示，相关通知实际发送到了另一个群。'),('twist-26','新证据显示，屏幕保护程序在关键时刻自动启动。'),
('twist-27','新证据显示，有人把附件拖进了错误的文件夹。'),('twist-28','新证据显示，座位旁出现了一张不属于本人的工牌。'),
('twist-29','新证据显示，时间戳与口头说明相差了整整一分钟。'),('twist-30','新证据显示，当天的天气并不支持原先的说法。')
on conflict(id) do update set content=excluded.content,enabled=true;

insert into public.court_keywords(id,content)
select 'keyword-'||row_number() over(), value from unnest(array[
'订书机','蓝牙','草稿箱','便利贴','充电器','工位','咖啡','投影仪','回形针','共享盘','密码箱','日历','白板','耳机','打印机','门禁','文件夹','待办','截图','表格','邮件','闹钟','窗口','水杯','标签','扫码','雨伞','键盘','鼠标','座位','台灯','便当','电梯','走廊','会议室','冰箱','备忘录','红笔','纸杯','插座','缓存','排队','权限','工单','编号','附件','网线','提示音','签字笔','清单','日程','文件名','录音笔','扩展坞','显示器','浏览器','文件柜','打卡机','二维码','文件袋','台历','计算器','秒表','胶带','快递柜','遥控器','标签纸','风扇','屏保','聊天框','表情包'
]) value
on conflict(id) do update set content=excluded.content,enabled=true;

create or replace function public.court_begin_round(p_code text,p_state jsonb,p_round integer,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare expected jsonb; ids text[]; pool text[]; pid text; idx integer:=1; case_id text; case_text text; state jsonb:=p_state;
begin
 select coalesce(jsonb_agg(p->>'id' order by (p->>'seat')::int),'[]'::jsonb) into expected from jsonb_array_elements(state->'players') p where coalesce((p->>'alive')::boolean,true) and not coalesce((p->>'away')::boolean,false);
 if jsonb_array_length(expected)<3 then return jsonb_set(jsonb_set(state,'{status}','"finished"'),'{phaseDeadlineAt}','null'); end if;
 select id,content into case_id,case_text from public.court_cases where enabled and not (coalesce(state->'usedCaseIds','[]'::jsonb) ? id) order by random() limit 1;
 if case_id is null then select id,content into case_id,case_text from public.court_cases where enabled order by random() limit 1; end if;
 select array_agg(content order by random()) into pool from public.court_keywords where enabled;
 ids:=array(select jsonb_array_elements_text(expected));
 foreach pid in array ids loop
   insert into public.court_private_assignments(game_code,player_id,round_no,keywords) values(p_code,pid,p_round,jsonb_build_array(pool[idx],pool[idx+1])) on conflict(game_code,player_id,round_no) do update set keywords=excluded.keywords;
   idx:=idx+2;
 end loop;
 state:=jsonb_set(state,'{status}','"defense"'); state:=jsonb_set(state,'{round}',to_jsonb(p_round)); state:=jsonb_set(state,'{caseId}',to_jsonb(case_id)); state:=jsonb_set(state,'{caseText}',to_jsonb(case_text));
 state:=jsonb_set(state,'{usedCaseIds}',coalesce(state->'usedCaseIds','[]'::jsonb)||jsonb_build_array(case_id)); state:=jsonb_set(state,'{twistId}','null'); state:=jsonb_set(state,'{twistText}','null');
 state:=jsonb_set(state,'{expectedPlayerIds}',expected); state:=jsonb_set(state,'{publicEntries}','[]'); state:=jsonb_set(state,'{defenseSubmittedCount}','0'); state:=jsonb_set(state,'{supplementSubmittedCount}','0'); state:=jsonb_set(state,'{voteSubmittedCount}','0'); state:=jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+30000));
 return state;
end $$;

create or replace function public.court_reveal_defenses(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entries jsonb; state jsonb:=p_state; rnd integer:=(p_state->>'round')::int;
begin
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',id,'displayCode','陈述 '||upper(left(md5(id),4)),'defense',defense,'supplement',null) order by md5(id)),'[]'::jsonb) into entries from public.court_submissions where game_code=p_code and round_no=rnd and defense is not null;
 state:=jsonb_set(state,'{publicEntries}',entries); state:=jsonb_set(state,'{status}','"defense_reveal"'); state:=jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+5000)); return state;
end $$;

create or replace function public.court_open_supplement(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare twist_id text; twist_text text; state jsonb:=p_state;
begin
 select id,content into twist_id,twist_text from public.court_twists where enabled and not (coalesce(state->'usedTwistIds','[]'::jsonb) ? id) order by random() limit 1;
 if twist_id is null then select id,content into twist_id,twist_text from public.court_twists where enabled order by random() limit 1; end if;
 state:=jsonb_set(state,'{twistId}',to_jsonb(twist_id)); state:=jsonb_set(state,'{twistText}',to_jsonb(twist_text)); state:=jsonb_set(state,'{usedTwistIds}',coalesce(state->'usedTwistIds','[]'::jsonb)||jsonb_build_array(twist_id)); state:=jsonb_set(state,'{status}','"supplement"'); state:=jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+15000)); return state;
end $$;

create or replace function public.court_open_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entries jsonb; state jsonb:=p_state; rnd integer:=(p_state->>'round')::int;
begin
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',id,'displayCode','陈述 '||upper(left(md5(id),4)),'defense',defense,'supplement',nullif(supplement,'')) order by md5(id)),'[]'::jsonb) into entries from public.court_submissions where game_code=p_code and round_no=rnd and defense is not null;
 state:=jsonb_set(state,'{publicEntries}',entries); state:=jsonb_set(state,'{status}','"voting"'); state:=jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+30000)); return state;
end $$;

create or replace function public.court_finish_voting(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare state jsonb:=p_state; rnd integer:=(p_state->>'round')::int; entries jsonb; rec record; max_score integer; winners jsonb;
begin
 for rec in select cs.player_id,count(choice)::int score from public.court_submissions cs left join (select x choice from public.court_votes cv cross join jsonb_array_elements_text(cv.submission_ids) x where cv.game_code=p_code and cv.round_no=rnd) votes on votes.choice=cs.id where cs.game_code=p_code and cs.round_no=rnd group by cs.player_id loop
   state:=jsonb_set(state,array['totalScores',rec.player_id],to_jsonb(coalesce((state->'totalScores'->>rec.player_id)::int,0)+rec.score),true);
 end loop;
 select max(score) into max_score from (select cs.id,count(choice)::int score from public.court_submissions cs left join (select x choice from public.court_votes cv cross join jsonb_array_elements_text(cv.submission_ids) x where cv.game_code=p_code and cv.round_no=rnd) votes on votes.choice=cs.id where cs.game_code=p_code and cs.round_no=rnd group by cs.id) q;
 select coalesce(jsonb_agg(cs.player_id),'[]'::jsonb) into winners from public.court_submissions cs where cs.game_code=p_code and cs.round_no=rnd and (select count(*) from public.court_votes cv cross join jsonb_array_elements_text(cv.submission_ids) x where cv.game_code=p_code and cv.round_no=rnd and x=cs.id)=coalesce(max_score,0);
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',cs.id,'displayCode','陈述 '||upper(left(md5(cs.id),4)),'defense',cs.defense,'supplement',nullif(cs.supplement,''),'authorId',cs.player_id,'authorName',(select p->>'name' from jsonb_array_elements(state->'players') p where p->>'id'=cs.player_id),'roundVotes',(select count(*) from public.court_votes cv cross join jsonb_array_elements_text(cv.submission_ids) x where cv.game_code=p_code and cv.round_no=rnd and x=cs.id)) order by md5(cs.id)),'[]'::jsonb) into entries from public.court_submissions cs where cs.game_code=p_code and cs.round_no=rnd;
 state:=jsonb_set(state,'{publicEntries}',entries); state:=jsonb_set(state,'{roundResults}',coalesce(state->'roundResults','[]'::jsonb)||jsonb_build_array(jsonb_build_object('round',rnd,'winnerIds',winners,'highestVotes',coalesce(max_score,0)))); state:=jsonb_set(state,'{status}','"result"'); state:=jsonb_set(state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000)); return state;
end $$;

create or replace function public.apply_court_action(p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
<<court_action>>
declare g public.games%rowtype; state jsonb; actor text; now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; ver bigint; rnd integer; deadline bigint; n integer; eligible integer; needed integer; body text; words jsonb; word text; choices jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if; if coalesce(length(trim(p_action_id)),0)<8 then raise exception 'invalid action id'; end if;
 select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid(); if not found then raise exception 'not a room member'; end if;
 select * into g from public.games where code=upper(p_code) and expires_at>now() for update; if not found or g.state->>'gameType'<>'absurd_court' then raise exception 'court room not found'; end if; state:=g.state;
 if exists(select 1 from public.game_actions where game_code=g.code and action_id=p_action_id) then return jsonb_build_object('outcome','duplicate','code','ALREADY_APPLIED','message','操作已经完成','state',state,'version',g.version); end if;
 if p_expected_status is distinct from state->>'status' or p_expected_round is distinct from coalesce((state->>'round')::int,0) or p_expected_version is distinct from g.version then return jsonb_build_object('outcome','stale','code','STALE_STATE','message','状态已更新，请重试','state',state,'version',g.version); end if;
 rnd:=coalesce((state->>'round')::int,0); deadline:=coalesce((state->>'phaseDeadlineAt')::bigint,0);
 if p_action_type='start_court_game' then if state->>'status'<>'lobby' or state->>'ownerId'<>actor then raise exception '只有房主可以开始'; end if; state:=public.court_begin_round(g.code,state,1,now_ms);
 elsif p_action_type='submit_court_defense' then
   if state->>'status'<>'defense' then raise exception '当前不是辩护阶段'; end if; if not (state->'expectedPlayerIds' ? actor) then raise exception '本轮无需提交'; end if; body:=trim(coalesce(p_payload->>'defense','')); if length(body) not between 1 and 40 then raise exception '辩护须为 1–40 字'; end if;
   select keywords into words from public.court_private_assignments where game_code=g.code and player_id=actor and round_no=rnd; for word in select jsonb_array_elements_text(words) loop if position(word in body)=0 then raise exception '请同时包含两个私密关键词'; end if; end loop;
   insert into public.court_submissions(id,game_code,player_id,round_no,defense) values('s-'||actor||'-'||rnd,g.code,actor,rnd,body) on conflict(game_code,player_id,round_no) do nothing; select count(*) into n from public.court_submissions where game_code=g.code and round_no=rnd and defense is not null; state:=jsonb_set(state,'{defenseSubmittedCount}',to_jsonb(n)); if n>=jsonb_array_length(state->'expectedPlayerIds') then state:=public.court_reveal_defenses(g.code,state,now_ms); end if;
 elsif p_action_type='submit_court_supplement' then
   if state->>'status'<>'supplement' then raise exception '当前不是补充阶段'; end if; body:=trim(coalesce(p_payload->>'supplement','')); if length(body)>30 then raise exception '补充说明最多 30 字'; end if;
   update public.court_submissions set supplement=body where game_code=g.code and player_id=actor and round_no=rnd and defense is not null and supplement is null; if not found then raise exception '未提交辩护或已经补充'; end if; select count(*) filter(where supplement is not null),count(*) into n,eligible from public.court_submissions where game_code=g.code and round_no=rnd and defense is not null; state:=jsonb_set(state,'{supplementSubmittedCount}',to_jsonb(n)); if n>=eligible then state:=public.court_open_voting(g.code,state,now_ms); end if;
 elsif p_action_type='submit_court_vote' then
   if state->>'status'<>'voting' then raise exception '当前不是评选阶段'; end if; choices:=p_payload->'submissionIds'; needed:=case when jsonb_array_length(state->'expectedPlayerIds')>=5 then 2 else 1 end;
   if jsonb_typeof(choices)<>'array' or jsonb_array_length(choices)<>needed or (select count(distinct x) from jsonb_array_elements_text(choices) x)<>needed then raise exception '请选择数量正确且不同的陈述'; end if;
   if exists(select 1 from jsonb_array_elements_text(choices) x where x='s-'||actor||'-'||rnd or not exists(select 1 from public.court_submissions cs where cs.id=x and cs.game_code=g.code and cs.round_no=rnd)) then raise exception '不能投自己的陈述或无效陈述'; end if;
   insert into public.court_votes(game_code,player_id,round_no,submission_ids) values(g.code,actor,rnd,choices) on conflict do nothing; select count(*) into n from public.court_votes where game_code=g.code and round_no=rnd; state:=jsonb_set(state,'{voteSubmittedCount}',to_jsonb(n)); if n>=jsonb_array_length(state->'expectedPlayerIds') then state:=public.court_finish_voting(g.code,state,now_ms); end if;
 elsif p_action_type='advance_court_phase' then
   if now_ms<deadline then raise exception '当前阶段尚未结束'; end if;
   if state->>'status'='defense' then state:=public.court_reveal_defenses(g.code,state,now_ms);
   elsif state->>'status'='defense_reveal' then state:=public.court_open_supplement(state,now_ms);
   elsif state->>'status'='supplement' then state:=public.court_open_voting(g.code,state,now_ms);
   elsif state->>'status'='voting' then state:=public.court_finish_voting(g.code,state,now_ms);
   elsif state->>'status'='result' then if rnd>=3 then state:=jsonb_set(jsonb_set(state,'{status}','"finished"'),'{phaseDeadlineAt}','null'); else state:=public.court_begin_round(g.code,state,rnd+1,now_ms); end if;
   else raise exception '当前阶段无需推进'; end if;
 elsif p_action_type='end_court_game' then if state->>'ownerId'<>actor then raise exception '只有房主可以结束'; end if; state:=jsonb_set(jsonb_set(state,'{status}','"finished"'),'{phaseDeadlineAt}','null');
 else raise exception 'unsupported court action'; end if;
 ver:=g.version+1; state:=jsonb_set(jsonb_set(state,'{version}',to_jsonb(ver)),'{updatedAt}',to_jsonb(now_ms)); update public.games set state=court_action.state,version=ver,updated_at=now() where code=g.code;
 insert into public.game_actions(game_code,action_id,actor_player_id,action_type,round_no,ballot_no,result) values(g.code,p_action_id,actor,p_action_type,coalesce((state->>'round')::int,0),0,jsonb_build_object('outcome','applied','code','OK'));
 return jsonb_build_object('outcome','applied','code','OK','message','操作成功','state',state,'version',ver);
end $$;

revoke all on public.court_cases,public.court_twists,public.court_keywords from anon,authenticated;
revoke all on function public.court_begin_round(text,jsonb,integer,bigint),public.court_reveal_defenses(text,jsonb,bigint),public.court_open_supplement(jsonb,bigint),public.court_open_voting(text,jsonb,bigint),public.court_finish_voting(text,jsonb,bigint) from public;
revoke all on function public.apply_court_action(text,text,text,text,integer,bigint,jsonb) from public;
grant execute on function public.apply_court_action(text,text,text,text,integer,bigint,jsonb) to anon,authenticated;
