-- A5 汤底侦探 V1 增量迁移。
-- 仅新增 A5 表和版本化 RPC；不修改 A2、A3、A4 对象，不删除旧数据。
-- 题卡初始状态统一为 pilot，真实盲测通过后才可人工改为 approved。

create table if not exists public.soup_case_bank_v1 (
  id text primary key,
  internal_title text not null,
  surface text not null,
  bottom text not null,
  key_facts jsonb not null check(jsonb_typeof(key_facts)='array' and jsonb_array_length(key_facts) between 3 and 6),
  equivalent_answers jsonb not null check(jsonb_typeof(equivalent_answers)='array' and jsonb_array_length(equivalent_answers)>=1),
  boundary_text text not null,
  common_questions jsonb not null check(jsonb_typeof(common_questions)='array' and jsonb_array_length(common_questions) between 8 and 15),
  hints jsonb not null check(jsonb_typeof(hints)='array' and jsonb_array_length(hints)=2),
  category text not null,
  difficulty text not null check(difficulty in ('easy','normal','hard')),
  sensitive boolean not null default false,
  source_note text not null,
  review_status text not null default 'pilot' check(review_status in ('pilot','approved','disabled')),
  card_version integer not null default 1 check(card_version>0),
  play_count integer not null default 0,
  success_count integer not null default 0,
  effective_question_total integer not null default 0,
  hint_use_count integer not null default 0,
  abandon_count integer not null default 0,
  ambiguity_count integer not null default 0,
  unsuitable_count integer not null default 0,
  enabled boolean not null default true
);

create table if not exists public.soup_round_secrets_v1 (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  host_id text not null,
  case_id text not null references public.soup_case_bank_v1(id),
  case_version integer not null,
  bottom text not null,
  key_facts jsonb not null,
  equivalent_answers jsonb not null,
  boundary_text text not null,
  common_questions jsonb not null,
  hints jsonb not null,
  started_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no)
);

create table if not exists public.soup_drafts_v1 (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  draft_text text not null default '' check(length(draft_text)<=240),
  updated_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,player_id)
);

create table if not exists public.soup_feedback_v1 (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  player_id text not null,
  case_id text not null references public.soup_case_bank_v1(id),
  case_version integer not null,
  difficulty text not null check(difficulty in ('too_easy','just_right','too_hard')),
  ambiguous boolean not null default false,
  unsuitable boolean not null default false,
  note text not null default '' check(length(note)<=300),
  created_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,player_id)
);

create table if not exists public.soup_actions_v1 (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  action_id text not null,
  actor_uid text not null default auth.uid(),
  actor_player_id text not null,
  action_type text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(game_code,session_no,action_id)
);

alter table public.soup_case_bank_v1 enable row level security;
alter table public.soup_round_secrets_v1 enable row level security;
alter table public.soup_drafts_v1 enable row level security;
alter table public.soup_feedback_v1 enable row level security;
alter table public.soup_actions_v1 enable row level security;
revoke all on public.soup_case_bank_v1,public.soup_round_secrets_v1,public.soup_drafts_v1,public.soup_feedback_v1,public.soup_actions_v1 from public,anon,authenticated;

with source(card) as (select value from jsonb_array_elements($cards$
[
 {"id":"soup-e01","title":"最后到的人最早打卡","surface":"早上，小周是办公室最后到的人，考勤记录却显示他最早到。","bottom":"小周值通宵班，前一天晚上已经进了办公室，早上只是最后一个从休息区回到工位。考勤记录统计的是进入办公区的时间。","facts":["前一天晚上已经进入","值通宵班","看到的是回工位顺序","考勤记录进入时间"],"equivalents":["他上夜班，早就进公司了"],"boundary":"需明确此前已进入公司且观察口径不同。","faq":[{"question":"考勤系统坏了吗？","verdict":"no"},{"question":"他昨晚就在公司吗？","verdict":"yes"},{"question":"他是夜班人员吗？","verdict":"yes"},{"question":"同事说的是回工位吗？","verdict":"yes"},{"question":"有人替他打卡吗？","verdict":"no"}],"hints":["到办公室和到工位不是同一件事。","他的工作日开始得早很多。"],"category":"perspective","difficulty":"easy"},
 {"id":"soup-e02","title":"空会议室全员到齐","surface":"主持人走进空无一人的会议室，看了一眼就宣布：人齐了，开始吧。","bottom":"这是一场视频会议。主持人进入实体会议室只是为了使用大屏，所有参会者已经在线上名单中到齐。","facts":["会议在线举行","实体会议室只是场地","参会者显示在线"],"equivalents":["大家在线上参会"],"boundary":"需说明远程或视频会议。","faq":[{"question":"这是视频会议吗？","verdict":"yes"},{"question":"其他人在别处吗？","verdict":"yes"},{"question":"他看的是线上名单吗？","verdict":"yes"},{"question":"房间里藏着人吗？","verdict":"no"},{"question":"到齐指上线吗？","verdict":"yes"}],"hints":["到齐不一定在同一房间。","主持人看的不是座位。"],"category":"tech_life","difficulty":"easy"},
 {"id":"soup-e03","title":"没按楼层的电梯","surface":"小林进电梯后一个按钮都没按，电梯却准确停在了他的办公楼层。","bottom":"大楼门禁和电梯联动。小林进闸机时刷了工牌，系统已把办公楼层发送给电梯。","facts":["工牌绑定楼层","闸机电梯联动","进电梯前已登记"],"equivalents":["刷工牌后电梯自动选层"],"boundary":"需提到自动识别或提前选层。","faq":[{"question":"别人替他按了吗？","verdict":"no"},{"question":"电梯知道身份吗？","verdict":"yes"},{"question":"他刷过工牌吗？","verdict":"yes"},{"question":"是专用电梯吗？","verdict":"no"},{"question":"楼层由系统分配吗？","verdict":"yes"}],"hints":["选择发生在进电梯以前。","工牌还传递了一条信息。"],"category":"tech_life","difficulty":"easy"},
 {"id":"soup-e04","title":"关机以后任务完成","surface":"阿杰点击关机后没有再碰电脑，几分钟后同事却收到消息：他的任务完成了。","bottom":"电脑关机前自动执行收尾脚本，把文件同步到团队服务器；服务器完成后自动通知同事。","facts":["关机触发收尾流程","断电前完成同步","通知由服务器发送"],"equivalents":["关机脚本自动上传并通知"],"boundary":"定时任务也接受，但必须是预设自动完成。","faq":[{"question":"同事替他完成了吗？","verdict":"no"},{"question":"电脑有自动任务吗？","verdict":"yes"},{"question":"通知是系统发的吗？","verdict":"yes"},{"question":"电脑已完全断电吗？","verdict":"no"},{"question":"任务是同步文件吗？","verdict":"yes"}],"hints":["点击关机与断电之间还有流程。","发消息的不一定是本人。"],"category":"tech_life","difficulty":"easy"},
 {"id":"soup-e05","title":"没取却已签收","surface":"小许一整天没离开工位，也没人替他拿包裹，快递却显示已经签收。","bottom":"快递被投进公司智能快递柜。签收表示快递柜完成代收，不表示小许本人已取件。","facts":["包裹进入快递柜","快递柜是代收方","签收不等于本人取走"],"equivalents":["快递柜代收了"],"boundary":"前台代收也可接受。","faq":[{"question":"快递送错了吗？","verdict":"no"},{"question":"是设备代收吗？","verdict":"yes"},{"question":"包裹还在公司吗？","verdict":"yes"},{"question":"小许拿到了吗？","verdict":"no"},{"question":"签收记录真实吗？","verdict":"yes"}],"hints":["签收人不一定是收件人。","包裹还在一个上锁的小格子里。"],"category":"daily_misunderstanding","difficulty":"easy"},
 {"id":"soup-e06","title":"没伞的人没淋湿","surface":"下着大雨，带伞的小孟浑身湿透，没带伞的小丁却滴雨未沾。两人走的是同一段路。","bottom":"两人走在有顶棚的连廊。小孟拿着刚从门外借回的湿伞，伞上的水弄湿了衣服；小丁一直在连廊下。","facts":["道路有顶棚","两人不需伞挡雨","伞原本是湿的","水来自伞"],"equivalents":["走有顶棚的路，带伞者被湿伞弄湿"],"boundary":"需同时解释带伞者为何湿。","faq":[{"question":"小丁在车里吗？","verdict":"no"},{"question":"路上有顶棚吗？","verdict":"yes"},{"question":"小孟打开伞了吗？","verdict":"no"},{"question":"伞本来湿吗？","verdict":"yes"},{"question":"雨直接淋到两人吗？","verdict":"no"}],"hints":["水不是从头顶落下的。","这段路全程有遮挡。"],"category":"transport","difficulty":"easy"},
 {"id":"soup-n01","title":"唯一没回复的人被表扬","surface":"群里所有人都回复了收到，只有小秦没回，主管却专门表扬了他。","bottom":"主管要求看到后直接修改共享表格，不要刷屏回复。小秦是唯一完成修改且没有回复的人。","facts":["原消息要求不要回复","任务是改共享表格","小秦完成实际操作"],"equivalents":["主管要求别回复，小秦照做并完成任务"],"boundary":"需说明不回复是要求且完成任务。","faq":[{"question":"主管要求别回复吗？","verdict":"yes"},{"question":"小秦看到了吗？","verdict":"yes"},{"question":"小秦完成任务了吗？","verdict":"yes"},{"question":"其他人完成了吗？","verdict":"no"},{"question":"回复收到是错误操作吗？","verdict":"yes"}],"hints":["收到不等于完成动作。","原话里包含不要做某事。"],"category":"office_fun","difficulty":"normal"},
 {"id":"soup-n02","title":"停电后视频更清楚","surface":"办公室突然停电，小罗的视频会议画面反而立刻变清楚了。","bottom":"笔记本靠电池继续运行。拥挤的办公室无线网断开后，电脑自动切换到更稳定的手机热点。","facts":["笔记本有电池","办公室网络断开","自动切手机热点","热点更稳定"],"equivalents":["停电触发切换到更好的移动网络"],"boundary":"需解释设备为何没关和网络为何更好。","faq":[{"question":"电脑有电池吗？","verdict":"yes"},{"question":"原网络拥挤吗？","verdict":"yes"},{"question":"切到热点了吗？","verdict":"yes"},{"question":"停电改善宽带吗？","verdict":"no"},{"question":"平台升级了吗？","verdict":"no"}],"hints":["不是所有设备都断电。","自动换了一条网络。"],"category":"tech_life","difficulty":"normal"},
 {"id":"soup-n03","title":"红灯会议室","surface":"会议室门口一直亮着红灯，行政却肯定地说里面没人。","bottom":"红灯只表示预约时段，不检测是否有人。会议提前结束，但没人取消余下预约。","facts":["红灯由日历控制","不是人体感应","会议提前结束","预约未取消"],"equivalents":["红灯表示预订，不代表有人"],"boundary":"设备故障不接受。","faq":[{"question":"红灯坏了吗？","verdict":"no"},{"question":"表示已预约吗？","verdict":"yes"},{"question":"会议提前结束吗？","verdict":"yes"},{"question":"行政确认过吗？","verdict":"partial"},{"question":"里面藏着人吗？","verdict":"no"}],"hints":["红灯显示计划。","会议比日历更早结束。"],"category":"daily_misunderstanding","difficulty":"normal"},
 {"id":"soup-n04","title":"删除最终版才通过","surface":"小叶删除了名叫最终版的文件，项目反而立刻通过了检查。","bottom":"自动检查读取所有表格。最终版其实是过期副本，旧数据造成重复冲突；删除后只剩真正最新文件。","facts":["程序批量读文件","最终版只是文件名","内容已过期","旧副本冲突"],"equivalents":["最终版是旧副本，删掉避免误读"],"boundary":"需指出名称与真实版本不一致。","faq":[{"question":"它真是最新吗？","verdict":"no"},{"question":"系统读多个文件吗？","verdict":"yes"},{"question":"旧文件造成重复吗？","verdict":"yes"},{"question":"小叶重写了吗？","verdict":"no"},{"question":"检查程序坏了吗？","verdict":"no"}],"hints":["文件名会骗人。","程序不知道哪个才最新。"],"category":"office_fun","difficulty":"normal"},
 {"id":"soup-n05","title":"猫准时叫人开会","surface":"办公室的猫不懂日历，却每天都能准时把大家叫去开会。","bottom":"每日会前保洁推车经过猫窝，车上有猫熟悉的零食气味。猫听到车声就跑向会议室叫，大家把它当提醒。","facts":["会前有固定流程","猫识别声味","形成条件反射","员工当成提醒"],"equivalents":["猫根据会前固定信号行动"],"boundary":"必须有每天会前稳定可感知的线索。","faq":[{"question":"有人训练猫吗？","verdict":"partial"},{"question":"猫听到固定声音吗？","verdict":"yes"},{"question":"和食物有关吗？","verdict":"yes"},{"question":"会议每天固定吗？","verdict":"yes"},{"question":"猫看手表吗？","verdict":"no"}],"hints":["猫判断的是重复信号。","会前总有一辆车经过。"],"category":"animal_behavior","difficulty":"normal"},
 {"id":"soup-n06","title":"伞只保护电脑","surface":"大雨里，小段撑着伞却主动走进雨中；到了公司，他全身湿透，伞下的东西却一点没湿。","bottom":"背包拉链坏了且装着借来的电脑。他把伞压低只罩住背包，自己因此淋湿。","facts":["伞保护的不是本人","背包防水失效","包里有电脑","主动牺牲遮挡"],"equivalents":["他用伞只护住怕水的物品"],"boundary":"物品可替换为必须送达的怕水工作物品。","faq":[{"question":"伞坏了吗？","verdict":"no"},{"question":"伞下是物品吗？","verdict":"yes"},{"question":"物品怕水吗？","verdict":"yes"},{"question":"他故意淋湿吗？","verdict":"yes"},{"question":"包防水有问题吗？","verdict":"yes"}],"hints":["伞中心不在头顶。","他更在意一件工作物品。"],"category":"transport","difficulty":"normal"},
 {"id":"soup-n07","title":"空白纸证明打印成功","surface":"打印机只吐出一张看起来完全空白的纸，财务却确认材料已经打印成功。","bottom":"材料打印在专用纸背面。小顾只看了没有内容的正面，财务翻面后看到完整材料。","facts":["纸有正反面","内容在背面","只看了正面","内容完整"],"equivalents":["打印在纸的另一面"],"boundary":"隐形墨水不接受。","faq":[{"question":"没墨了吗？","verdict":"no"},{"question":"在背面吗？","verdict":"yes"},{"question":"需要紫外灯吗？","verdict":"no"},{"question":"财务翻面了吗？","verdict":"yes"},{"question":"纸有问题吗？","verdict":"no"}],"hints":["不用特殊工具。","把纸做一个普通动作。"],"category":"office_fun","difficulty":"normal"},
 {"id":"soup-n08","title":"没带工牌过三道门","surface":"小冉没带工牌，也没人给他开门，却独自通过了公司的三道门禁。","bottom":"他从物业领取了绑定身份的一次性手机访客码，三道门都能扫描同一个动态码。","facts":["没有工牌仍有凭证","访客码在手机","物业授权","三门识别同一凭证"],"equivalents":["他用手机访客码开门"],"boundary":"合法电子凭证可接受，尾随不接受。","faq":[{"question":"门一直开着吗？","verdict":"no"},{"question":"使用手机吗？","verdict":"yes"},{"question":"物业授权吗？","verdict":"yes"},{"question":"刷脸吗？","verdict":"no"},{"question":"是合法进入吗？","verdict":"yes"}],"hints":["没有工牌不等于没有凭证。","凭证刚发到手机。"],"category":"daily_misunderstanding","difficulty":"normal"},
 {"id":"soup-n09","title":"周一前发出的周报","surface":"小艾周一第一次打开电脑时，发现自己本周的周报已经发送完毕，而且内容完全正确。","bottom":"她上周五已写好下一周计划并设置周一早晨由云端邮箱定时发送。","facts":["内容是下周计划","上周五写好","定时发送","云端执行"],"equivalents":["提前写好计划并定时发送"],"boundary":"需解释内容为何能提前正确。","faq":[{"question":"别人登录账号吗？","verdict":"no"},{"question":"她提前写好吗？","verdict":"yes"},{"question":"定时发送吗？","verdict":"yes"},{"question":"主要是计划吗？","verdict":"yes"},{"question":"关机还能发吗？","verdict":"yes"}],"hints":["发送与写作不同天。","写的是计划。"],"category":"perspective","difficulty":"normal"},
 {"id":"soup-n10","title":"空座位显示在线","surface":"小朱的座位一上午都空着，协作软件却一直准确显示他正在办公。","bottom":"小朱在公司实验室调试设备，使用同一工作账号在线。他没坐固定工位，但确实在办公。","facts":["座位不是唯一地点","人在实验室","工作账号在线","状态显示账号活动"],"equivalents":["他在别的工作区域办公"],"boundary":"需说明本人确实工作而非脚本假在线。","faq":[{"question":"远程控制吗？","verdict":"no"},{"question":"在公司别处吗？","verdict":"yes"},{"question":"在线状态假吗？","verdict":"no"},{"question":"账号给别人用吗？","verdict":"no"},{"question":"工作地点不同吗？","verdict":"yes"}],"hints":["软件判断账号活动。","公司还有另一个工作房间。"],"category":"tech_life","difficulty":"normal"},
 {"id":"soup-h01","title":"门禁说没来却工作全天","surface":"门禁记录证明老高今天从没进公司，监控却证明他今天一整天都在公司工作。两份记录都没错。","bottom":"老高负责通宵维护，在午夜前进入公司，直到今天结束才离开。今天进入记录为零，但他一直在楼内。","facts":["今天前已进入","工作跨零点","门禁查进入动作","监控查人在场"],"equivalents":["昨晚进入后一直没离开"],"boundary":"需解释时间边界和记录口径。","faq":[{"question":"昨晚进公司吗？","verdict":"yes"},{"question":"通宵工作吗？","verdict":"yes"},{"question":"今天离开再回来吗？","verdict":"no"},{"question":"只统计进入吗？","verdict":"yes"},{"question":"监控日期错吗？","verdict":"no"}],"hints":["没进来不等于不在里面。","关键动作在零点前。"],"category":"perspective","difficulty":"hard"},
 {"id":"soup-h02","title":"断网后上传成功","surface":"工程师主动断开电脑网络后，卡了半小时的文件立刻上传成功。","bottom":"电脑同时有公司有线网和授权手机热点，但优先走会拦截测试站点的有线网。断开有线后自动走热点。","facts":["有两条网络","有线优先","公司网拦截","断开问题连接","热点仍联网"],"equivalents":["断开公司网后切到可用热点"],"boundary":"必须说明仍有第二网络。","faq":[{"question":"还有另一网络吗？","verdict":"yes"},{"question":"公司网拦截吗？","verdict":"yes"},{"question":"切到热点吗？","verdict":"yes"},{"question":"文件没上服务器吗？","verdict":"no"},{"question":"支持离线上传吗？","verdict":"no"}],"hints":["只断开一条连接。","原优先网络不允许目标地址。"],"category":"tech_life","difficulty":"hard"},
 {"id":"soup-h03","title":"会前写完的会议纪要","surface":"会议还没开始，纪要已经写完；会议结束后，所有参会者都确认一个字也不用改。","bottom":"这是异步评审收口会。全部意见和决定已在共享文档提前完成，会议只逐项确认没有新增异议。","facts":["实质讨论已异步完成","共享文档有结论","会议只确认","没有新增异议"],"equivalents":["会前完成讨论，会议只是确认"],"boundary":"套旧纪要不接受。","faq":[{"question":"照抄以前的吗？","verdict":"no"},{"question":"会前讨论过吗？","verdict":"yes"},{"question":"会议只确认吗？","verdict":"yes"},{"question":"有新决定吗？","verdict":"no"},{"question":"共享文档关键吗？","verdict":"yes"}],"hints":["开会不是第一次讨论。","讨论发生在共享文档。"],"category":"office_fun","difficulty":"hard"},
 {"id":"soup-h04","title":"空桌接听了电话","surface":"电话响起时工位上一个人也没有，桌上的电脑却替员工接听了电话，而且对方得到了正确答复。","bottom":"客服号码接入电脑软电话，来电由自动语音机器人识别常见问题并读取知识库答案。","facts":["来电进入软电话","自动语音接听","答案来自知识库","无需现场真人"],"equivalents":["自动语音客服在电脑上接听"],"boundary":"远程真人只判还差一点。","faq":[{"question":"有人远控吗？","verdict":"no"},{"question":"是软电话吗？","verdict":"yes"},{"question":"机器人回答吗？","verdict":"yes"},{"question":"答案预设吗？","verdict":"yes"},{"question":"电脑有音频设备吗？","verdict":"yes"}],"hints":["电脑替接是字面意思。","问题在知识库里。"],"category":"tech_life","difficulty":"hard"}
]
$cards$::jsonb)), common_faq as (
  select '[{"question":"需要超自然现象吗？","verdict":"no"},{"question":"有人故意说谎吗？","verdict":"no"},{"question":"需要冷门专业知识吗？","verdict":"no"}]'::jsonb value
)
insert into public.soup_case_bank_v1(
  id,internal_title,surface,bottom,key_facts,equivalent_answers,boundary_text,common_questions,hints,category,difficulty,sensitive,source_note,review_status,card_version,enabled
)
select card->>'id',card->>'title',card->>'surface',card->>'bottom',card->'facts',card->'equivalents',card->>'boundary',card->'faq'||common_faq.value,
  card->'hints',card->>'category',card->>'difficulty',false,'项目原创候选题卡；等待真实盲测。','pilot',1,true
from source cross join common_faq
on conflict(id) do update set
  internal_title=excluded.internal_title,surface=excluded.surface,bottom=excluded.bottom,key_facts=excluded.key_facts,
  equivalent_answers=excluded.equivalent_answers,boundary_text=excluded.boundary_text,common_questions=excluded.common_questions,
  hints=excluded.hints,category=excluded.category,difficulty=excluded.difficulty,source_note=excluded.source_note,
  card_version=greatest(public.soup_case_bank_v1.card_version,excluded.card_version),enabled=true;

create or replace function public.create_soup_game_v1(p_code text,p_owner_player_id text,p_owner_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint; v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_owner_name)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  v_state:=jsonb_build_object(
    'code',p_code,'gameType','soup_detective','soupVersion',1,'sessionNo',1,'ownerId',p_owner_player_id,
    'players',jsonb_build_array(jsonb_build_object('id',p_owner_player_id,'name',trim(p_owner_name),'seat',1,'alive',true,'cardReady',false,'away',false)),
    'playerLimit',10,'version',1,'createdAt',now_ms,'updatedAt',now_ms,'status','lobby','round',0,
    'hostOrder','[]'::jsonb,'servedHostIds','[]'::jsonb,'hostId',null,'hostName',null,'detectiveOrder','[]'::jsonb,
    'currentDetectiveId',null,'currentDetectiveName',null,'actionCycle',0,'surface',null,'caseTitle',null,
    'caseCategory',null,'difficulty',null,'roundStartedAt',null,'effectiveQuestionCount',0,'maxQuestions',20,
    'extended',false,'hintsUsed',0,'publicHints','[]'::jsonb,'pendingAction',null,'records','[]'::jsonb,
    'usedCaseIds','[]'::jsonb,'revealedBottom',null,'result',null,'feedbackCount',0
  );
  insert into public.games(code,owner_uid,owner_player_id,state,version) values(p_code,auth.uid(),p_owner_player_id,v_state,1);
  insert into public.game_members(game_code,user_uid,player_id) values(p_code,auth.uid(),p_owner_player_id);
  return v_state;
end $$;

create or replace function public.join_soup_game_v1(p_code text,p_player_id text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.games%rowtype; v_state jsonb; v_players jsonb; existing_id text; ver bigint; now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)),0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'soup_detective' or coalesce((g.state->>'soupVersion')::integer,0)<>1 then raise exception 'A5 房间不存在或版本不兼容'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  if g.state->>'status'<>'lobby' then raise exception '本题已经开始，请等待下一局'; end if;
  v_players:=coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(v_players)>=10 then raise exception '房间已满'; end if;
  v_players:=v_players||jsonb_build_array(jsonb_build_object('id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(v_players)+1,'alive',true,'cardReady',false,'away',false));
  ver:=g.version+1; v_state:=jsonb_set(g.state,'{players}',v_players); v_state:=jsonb_set(v_state,'{version}',to_jsonb(ver)); v_state:=jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;

create or replace function public.soup_v1_private_packet(p_code text,p_actor text,p_state jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare secret public.soup_round_secrets_v1%rowtype; draft public.soup_drafts_v1%rowtype; v_session integer; v_round integer; is_host boolean;
begin
  v_session:=coalesce((p_state->>'sessionNo')::integer,1); v_round:=coalesce((p_state->>'round')::integer,0); is_host:=p_actor=coalesce(p_state->>'hostId','');
  if v_round>0 then
    select * into secret from public.soup_round_secrets_v1 where game_code=upper(p_code) and session_no=v_session and round_no=v_round;
    select * into draft from public.soup_drafts_v1 where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=p_actor;
  end if;
  return jsonb_build_object(
    'sessionNo',v_session,'round',v_round,'isHost',is_host,
    'bottom',case when is_host then secret.bottom else null end,
    'keyFacts',case when is_host then coalesce(secret.key_facts,'[]'::jsonb) else '[]'::jsonb end,
    'equivalentAnswers',case when is_host then coalesce(secret.equivalent_answers,'[]'::jsonb) else '[]'::jsonb end,
    'boundary',case when is_host then secret.boundary_text else null end,
    'commonQuestions',case when is_host then coalesce(secret.common_questions,'[]'::jsonb) else '[]'::jsonb end,
    'hints',case when is_host then coalesce(secret.hints,'[]'::jsonb) else '[]'::jsonb end,
    'draftText',coalesce(draft.draft_text,''),'draftUpdatedAt',case when draft.updated_at is null then null else (extract(epoch from draft.updated_at)*1000)::bigint end
  );
end $$;

create or replace function public.get_my_soup_round_v1(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; v_state jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select state into v_state from public.games where code=upper(p_code) and expires_at>now();
  if v_state is null or v_state->>'gameType'<>'soup_detective' then raise exception 'A5 房间不存在'; end if;
  return public.soup_v1_private_packet(upper(p_code),actor,v_state);
end $$;

create or replace function public.save_soup_draft_v1(p_code text,p_draft_text text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; v_state jsonb; session_no integer; round_no integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(coalesce(p_draft_text,''))>240 then raise exception '草稿最多 240 字'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select state into v_state from public.games where code=upper(p_code) and expires_at>now();
  if v_state is null or v_state->>'gameType'<>'soup_detective' then raise exception 'A5 房间不存在'; end if;
  if actor=coalesce(v_state->>'hostId','') then raise exception '汤主无需填写侦探草稿'; end if;
  if v_state->>'status' in ('lobby','feedback','finished') then raise exception '当前题目不能修改草稿'; end if;
  session_no:=(v_state->>'sessionNo')::integer; round_no:=(v_state->>'round')::integer;
  insert into public.soup_drafts_v1(game_code,session_no,round_no,player_id,draft_text,updated_at)
  values(upper(p_code),session_no,round_no,actor,coalesce(p_draft_text,''),now())
  on conflict(game_code,session_no,round_no,player_id) do update set draft_text=excluded.draft_text,updated_at=now();
  return public.soup_v1_private_packet(upper(p_code),actor,v_state);
end $$;

create or replace function public.soup_v1_advance_detective(p_state jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_state jsonb:=p_state; current_pos integer; next_index integer; n integer; next_id text; next_name text; cycle integer;
begin
  n:=jsonb_array_length(coalesce(v_state->'detectiveOrder','[]'::jsonb));
  if n=0 then raise exception '当前没有可行动的侦探'; end if;
  select ordinality::integer into current_pos from jsonb_array_elements_text(v_state->'detectiveOrder') with ordinality as items(id,ordinality) where id=v_state->>'currentDetectiveId';
  if current_pos is null then next_index:=0; else next_index:=case when current_pos>=n then 0 else current_pos end; end if;
  cycle:=coalesce((v_state->>'actionCycle')::integer,1); if current_pos>=n then cycle:=cycle+1; end if;
  next_id:=v_state->'detectiveOrder'->>next_index;
  select player->>'name' into next_name from jsonb_array_elements(v_state->'players') rows(player) where player->>'id'=next_id;
  v_state:=jsonb_set(v_state,'{currentDetectiveId}',to_jsonb(next_id));
  v_state:=jsonb_set(v_state,'{currentDetectiveName}',to_jsonb(next_name));
  v_state:=jsonb_set(v_state,'{actionCycle}',to_jsonb(cycle));
  return v_state;
end $$;

create or replace function public.soup_v1_begin_round(p_code text,p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v_state jsonb:=p_state; v_round integer; v_host_id text; v_host_name text; v_served jsonb; v_host_order jsonb; v_detectives jsonb; v_case public.soup_case_bank_v1%rowtype; v_used jsonb;
begin
  if (select count(*) from jsonb_array_elements(v_state->'players') rows(player) where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false))<3 then raise exception '至少需要 3 名未暂离成员'; end if;
  v_served:=coalesce(v_state->'servedHostIds','[]'::jsonb);
  select player->>'id',player->>'name' into v_host_id,v_host_name
  from jsonb_array_elements(v_state->'players') rows(player)
  where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false)
    and not (v_served ? (player->>'id')) order by random() limit 1;
  if v_host_id is null then
    v_served:='[]'::jsonb;
    select player->>'id',player->>'name' into v_host_id,v_host_name from jsonb_array_elements(v_state->'players') rows(player)
    where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false) order by random() limit 1;
  end if;
  v_host_order:=v_served||to_jsonb(v_host_id);
  v_served:=v_host_order;
  select coalesce(jsonb_agg(player->>'id' order by (player->>'seat')::integer),'[]'::jsonb) into v_detectives
  from jsonb_array_elements(v_state->'players') rows(player)
  where player->>'id'<>v_host_id and coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false);
  v_used:=coalesce(v_state->'usedCaseIds','[]'::jsonb);
  select * into v_case from public.soup_case_bank_v1 c where c.enabled and c.review_status in ('pilot','approved') and not (v_used ? c.id) order by random() limit 1;
  if not found then select * into v_case from public.soup_case_bank_v1 c where c.enabled and c.review_status in ('pilot','approved') order by random() limit 1; v_used:='[]'::jsonb; end if;
  if not found then raise exception '当前没有可用题卡'; end if;
  v_round:=coalesce((v_state->>'round')::integer,0)+1;
  insert into public.soup_round_secrets_v1(game_code,session_no,round_no,host_id,case_id,case_version,bottom,key_facts,equivalent_answers,boundary_text,common_questions,hints)
  values(p_code,(v_state->>'sessionNo')::integer,v_round,v_host_id,v_case.id,v_case.card_version,v_case.bottom,v_case.key_facts,v_case.equivalent_answers,v_case.boundary_text,v_case.common_questions,v_case.hints);
  v_state:=v_state||jsonb_build_object(
    'round',v_round,'hostOrder',v_host_order,'servedHostIds',v_served,'hostId',v_host_id,'hostName',v_host_name,
    'detectiveOrder',v_detectives,'currentDetectiveId',v_detectives->>0,'currentDetectiveName',(select player->>'name' from jsonb_array_elements(v_state->'players') rows(player) where player->>'id'=v_detectives->>0),
    'actionCycle',1,'status','host_reading','surface',v_case.surface,'caseTitle',null,'caseCategory',v_case.category,
    'difficulty',v_case.difficulty,'roundStartedAt',p_now_ms,'effectiveQuestionCount',0,'maxQuestions',20,'extended',false,
    'hintsUsed',0,'publicHints','[]'::jsonb,'pendingAction',null,'records','[]'::jsonb,
    'usedCaseIds',v_used||to_jsonb(v_case.id),'revealedBottom',null,'result',null,'feedbackCount',0
  );
  return v_state;
end $$;

create or replace function public.submit_soup_feedback_v1(p_code text,p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; secret public.soup_round_secrets_v1%rowtype; v_state jsonb; n integer; inserted_rows integer; ver bigint; level text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid(); if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'soup_detective' then raise exception 'A5 房间不存在'; end if;
  if g.state->>'status'<>'feedback' then raise exception '当前不在题后反馈阶段'; end if;
  level:=p_feedback->>'difficulty'; if level not in ('too_easy','just_right','too_hard') then raise exception '请选择难度感受'; end if;
  if length(coalesce(p_feedback->>'note',''))>300 then raise exception '文字反馈最多 300 字'; end if;
  select * into secret from public.soup_round_secrets_v1 where game_code=g.code and session_no=(g.state->>'sessionNo')::integer and round_no=(g.state->>'round')::integer;
  insert into public.soup_feedback_v1(game_code,session_no,round_no,player_id,case_id,case_version,difficulty,ambiguous,unsuitable,note)
  values(g.code,(g.state->>'sessionNo')::integer,(g.state->>'round')::integer,actor,secret.case_id,secret.case_version,level,coalesce((p_feedback->>'ambiguous')::boolean,false),coalesce((p_feedback->>'unsuitable')::boolean,false),coalesce(p_feedback->>'note',''))
  on conflict(game_code,session_no,round_no,player_id) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows=1 then
    update public.soup_case_bank_v1 set
      ambiguity_count=ambiguity_count+case when coalesce((p_feedback->>'ambiguous')::boolean,false) then 1 else 0 end,
      unsuitable_count=unsuitable_count+case when coalesce((p_feedback->>'unsuitable')::boolean,false) then 1 else 0 end
    where id=secret.case_id;
  end if;
  select count(*) into n from public.soup_feedback_v1 where game_code=g.code and session_no=(g.state->>'sessionNo')::integer and round_no=(g.state->>'round')::integer;
  ver:=g.version+1; v_state:=jsonb_set(g.state,'{feedbackCount}',to_jsonb(n)); v_state:=jsonb_set(v_state,'{version}',to_jsonb(ver)); v_state:=jsonb_set(v_state,'{updatedAt}',to_jsonb((extract(epoch from clock_timestamp())*1000)::bigint));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  return jsonb_build_object('accepted',true);
end $$;

create or replace function public.apply_soup_action_v1(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; prior jsonb; g public.games%rowtype; v_state jsonb; ver bigint; now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  pending jsonb; records jsonb; verdict text; note text; counted boolean; q_count integer; n integer; current_pos integer; content text; secret public.soup_round_secrets_v1%rowtype; result jsonb; active_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid(); if not found then raise exception 'not a room member'; end if;
  select a.result into prior from public.soup_actions_v1 a where a.game_code=upper(p_code) and a.session_no=p_expected_session and a.action_id=p_action_id;
  if prior is not null then return prior; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'soup_detective' or coalesce((g.state->>'soupVersion')::integer,0)<>1 then raise exception 'A5 房间不存在或版本不兼容'; end if;
  if (g.state->>'sessionNo')::integer<>p_expected_session or (g.state->>'round')::integer<>p_expected_round then raise exception 'STALE_ROUND'; end if;
  if g.state->>'status'<>p_expected_status then raise exception 'WRONG_PHASE'; end if;
  if g.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
  v_state:=g.state; records:=coalesce(v_state->'records','[]'::jsonb);

  if p_action_type='start_soup_game' then
    if actor<>v_state->>'ownerId' or v_state->>'status'<>'lobby' then raise exception '仅负责人可开始'; end if;
    v_state:=public.soup_v1_begin_round(g.code,v_state,now_ms);
  elsif p_action_type='acknowledge_soup_host' then
    if actor<>v_state->>'hostId' or v_state->>'status'<>'host_reading' then raise exception '仅本题汤主可确认'; end if;
    v_state:=jsonb_set(v_state,'{status}','"investigating"'::jsonb);
  elsif p_action_type in ('submit_soup_question','submit_soup_solution') then
    if v_state->>'status'<>'investigating' or actor<>v_state->>'currentDetectiveId' then raise exception '还没轮到你正式提交'; end if;
    content:=trim(coalesce(p_payload->>'content','')); if length(content) not between 1 and 240 then raise exception '内容须为 1–240 字'; end if;
    pending:=jsonb_build_object('id',p_action_id,'playerId',actor,'playerName',(select player->>'name' from jsonb_array_elements(v_state->'players') rows(player) where player->>'id'=actor),'type',case when p_action_type='submit_soup_question' then 'question' else 'solution' end,'content',content,'submittedAt',now_ms);
    v_state:=jsonb_set(v_state,'{pendingAction}',pending);
    v_state:=jsonb_set(v_state,'{status}',to_jsonb(case when p_action_type='submit_soup_question' then 'judging_question' else 'judging_solution' end));
  elsif p_action_type='skip_soup_turn' then
    if v_state->>'status'<>'investigating' or actor<>v_state->>'currentDetectiveId' then raise exception '还没轮到你跳过'; end if;
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',actor,'playerName',v_state->>'currentDetectiveName','type','skip','content','跳过本轮','verdict',null,'note',null,'counted',false,'createdAt',now_ms));
    v_state:=jsonb_set(v_state,'{records}',records); v_state:=public.soup_v1_advance_detective(v_state);
  elsif p_action_type='judge_soup_question' then
    if actor<>v_state->>'hostId' or v_state->>'status'<>'judging_question' then raise exception '仅汤主可判定当前问题'; end if;
    pending:=v_state->'pendingAction'; verdict:=p_payload->>'verdict'; note:=nullif(trim(coalesce(p_payload->>'note','')),'');
    if verdict not in ('yes','no','irrelevant','partial','rephrase') then raise exception '问题判定无效'; end if;
    counted:=verdict<>'rephrase'; q_count:=coalesce((v_state->>'effectiveQuestionCount')::integer,0)+case when counted then 1 else 0 end;
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',pending->>'playerId','playerName',pending->>'playerName','type','question','content',pending->>'content','verdict',verdict,'note',note,'counted',counted,'createdAt',now_ms));
    v_state:=jsonb_set(v_state,'{records}',records); v_state:=jsonb_set(v_state,'{effectiveQuestionCount}',to_jsonb(q_count)); v_state:=jsonb_set(v_state,'{pendingAction}','null'::jsonb); v_state:=public.soup_v1_advance_detective(v_state);
    v_state:=jsonb_set(v_state,'{status}',to_jsonb(case when q_count>=coalesce((v_state->>'maxQuestions')::integer,20) then 'limit_reached' else 'investigating' end));
  elsif p_action_type='judge_soup_solution' then
    if actor<>v_state->>'hostId' or v_state->>'status'<>'judging_solution' then raise exception '仅汤主可判定当前还原'; end if;
    pending:=v_state->'pendingAction'; verdict:=p_payload->>'verdict'; note:=nullif(trim(coalesce(p_payload->>'note','')),'');
    if verdict not in ('success','close','wrong') then raise exception '还原判定无效'; end if;
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',pending->>'playerId','playerName',pending->>'playerName','type','solution','content',pending->>'content','verdict',verdict,'note',note,'counted',false,'createdAt',now_ms));
    v_state:=jsonb_set(v_state,'{records}',records); v_state:=jsonb_set(v_state,'{pendingAction}','null'::jsonb);
    if verdict='success' then
      select * into secret from public.soup_round_secrets_v1 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round;
      update public.soup_case_bank_v1 set play_count=play_count+1,success_count=success_count+1,
        effective_question_total=effective_question_total+coalesce((v_state->>'effectiveQuestionCount')::integer,0),
        hint_use_count=hint_use_count+coalesce((v_state->>'hintsUsed')::integer,0) where id=secret.case_id;
      v_state:=jsonb_set(v_state,'{status}','"feedback"'::jsonb); v_state:=jsonb_set(v_state,'{revealedBottom}',to_jsonb(secret.bottom));
      v_state:=jsonb_set(v_state,'{result}',jsonb_build_object('success',true,'validQuestions',(v_state->>'effectiveQuestionCount')::integer,'hintsUsed',(v_state->>'hintsUsed')::integer,'solverId',pending->>'playerId','solverName',pending->>'playerName','elapsedMs',greatest(0,now_ms-(v_state->>'roundStartedAt')::bigint),'revealedReason','solved'));
    else v_state:=public.soup_v1_advance_detective(v_state); v_state:=jsonb_set(v_state,'{status}','"investigating"'::jsonb); end if;
  elsif p_action_type='use_soup_hint' then
    if actor<>v_state->>'hostId' or v_state->>'status' not in ('investigating','limit_reached') then raise exception '当前不能给提示'; end if;
    n:=coalesce((v_state->>'hintsUsed')::integer,0); if n>=2 then raise exception '本题提示已用完'; end if;
    select * into secret from public.soup_round_secrets_v1 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round; content:=secret.hints->>n;
    v_state:=jsonb_set(v_state,'{hintsUsed}',to_jsonb(n+1)); v_state:=jsonb_set(v_state,'{publicHints}',coalesce(v_state->'publicHints','[]'::jsonb)||to_jsonb(content));
    records:=records||jsonb_build_array(jsonb_build_object('sequence',jsonb_array_length(records)+1,'playerId',actor,'playerName',v_state->>'hostName','type','hint','content',content,'verdict',null,'note',null,'counted',false,'createdAt',now_ms)); v_state:=jsonb_set(v_state,'{records}',records);
  elsif p_action_type='extend_soup_limit' then
    if actor<>v_state->>'hostId' or v_state->>'status'<>'limit_reached' or coalesce((v_state->>'extended')::boolean,false) then raise exception '当前不能延长'; end if;
    v_state:=jsonb_set(v_state,'{extended}','true'::jsonb); v_state:=jsonb_set(v_state,'{maxQuestions}',to_jsonb((v_state->>'maxQuestions')::integer+5)); v_state:=jsonb_set(v_state,'{status}','"investigating"'::jsonb);
  elsif p_action_type='reveal_soup_bottom' then
    if actor<>v_state->>'hostId' or v_state->>'status' not in ('investigating','limit_reached','judging_question','judging_solution') then raise exception '当前不能公布汤底'; end if;
    select * into secret from public.soup_round_secrets_v1 where game_code=g.code and session_no=p_expected_session and round_no=p_expected_round;
    update public.soup_case_bank_v1 set play_count=play_count+1,abandon_count=abandon_count+1,
      effective_question_total=effective_question_total+coalesce((v_state->>'effectiveQuestionCount')::integer,0),
      hint_use_count=hint_use_count+coalesce((v_state->>'hintsUsed')::integer,0) where id=secret.case_id;
    v_state:=jsonb_set(v_state,'{pendingAction}','null'::jsonb); v_state:=jsonb_set(v_state,'{status}','"feedback"'::jsonb); v_state:=jsonb_set(v_state,'{revealedBottom}',to_jsonb(secret.bottom));
    v_state:=jsonb_set(v_state,'{result}',jsonb_build_object('success',false,'validQuestions',(v_state->>'effectiveQuestionCount')::integer,'hintsUsed',(v_state->>'hintsUsed')::integer,'solverId',null,'solverName',null,'elapsedMs',greatest(0,now_ms-(v_state->>'roundStartedAt')::bigint),'revealedReason','host_reveal'));
  elsif p_action_type='next_soup_round' then
    if actor<>v_state->>'ownerId' or v_state->>'status'<>'feedback' then raise exception '仅负责人可进入下一碗'; end if;
    select count(*) into active_count from jsonb_array_elements(v_state->'players') rows(player) where coalesce((player->>'alive')::boolean,true) and not coalesce((player->>'away')::boolean,false);
    if coalesce((v_state->>'feedbackCount')::integer,0)<active_count then raise exception '请等待所有成员完成题后反馈'; end if;
    v_state:=public.soup_v1_begin_round(g.code,v_state,now_ms);
  elsif p_action_type='end_soup_game' then
    if actor<>v_state->>'ownerId' or v_state->>'status'='lobby' then raise exception '当前不能结束本局'; end if;
    v_state:=jsonb_set(v_state,'{status}','"finished"'::jsonb);
  else raise exception 'unknown A5 action'; end if;

  ver:=g.version+1; v_state:=jsonb_set(v_state,'{version}',to_jsonb(ver)); v_state:=jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  result:=jsonb_build_object('outcome','applied','code','OK','message','操作已记录','state',v_state,'version',ver);
  insert into public.soup_actions_v1(game_code,session_no,action_id,actor_uid,actor_player_id,action_type,result) values(g.code,p_expected_session,p_action_id,auth.uid(),actor,p_action_type,result);
  return result;
end $$;

grant execute on function public.create_soup_game_v1(text,text,text) to anon,authenticated,service_role;
grant execute on function public.join_soup_game_v1(text,text,text) to anon,authenticated,service_role;
grant execute on function public.get_my_soup_round_v1(text) to anon,authenticated,service_role;
grant execute on function public.save_soup_draft_v1(text,text) to anon,authenticated,service_role;
grant execute on function public.submit_soup_feedback_v1(text,jsonb) to anon,authenticated,service_role;
grant execute on function public.apply_soup_action_v1(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
revoke all on function public.soup_v1_private_packet(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.soup_v1_advance_detective(jsonb) from public,anon,authenticated;
revoke all on function public.soup_v1_begin_round(text,jsonb,bigint) from public,anon,authenticated;
