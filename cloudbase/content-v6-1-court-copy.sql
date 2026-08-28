-- 离谱法堂 V1.6.1 内容增量迁移。
-- 只更新案件包与最近题目记录；不修改阶段、投票、计分、成员或 V6 公共 RPC。

insert into public.court_case_packs(
  id,title,charge,evidence_title,evidence,verdict_template,category,enabled,reference_statement,reference_response
) values
('friday-overtime','周五加班案','被控在周五 17:59 说“只耽误五分钟”，最终让全组加班到晚上九点半。','门禁与朋友圈','你本人 18:02 离开公司，并于 18:30 发了一张火锅照片。','五分钟开了个头，三个半小时收了个尾。','meeting',true,'我说的是会开五分钟，没说改东西也只要五分钟。','火锅是供应商请的，我也在加班，只是换了个地方。'),
('reply-all','全员收到案','被控回复公司群发邮件时点了“回复全部”，内容只有两个字：“收到”。','后续邮件','一分钟后，你又群发了一封：“大家不用回复，避免打扰。”','一个收到，引来了第二个收到。','message',true,'我怕他挨个问，干脆让所有人都知道我收到了。','第二封是在及时止损，说明我发现问题很快。'),
('final-final-file','最终版迷宫案','被控提交“最终版_最终版2_这次真不改了.xlsx”，导致所有人用错版本。','文件列表','你电脑里还有七个带“最终”的文件，最新一个叫“真的最终版”。','文件名没有说谎，只是有效期很短。','document',true,'发出去的那一刻，它确实是最终版。','“真的最终版”是我自己看的，没让你们用。'),
('meeting-last-question','散会追问案','被控在领导宣布散会时突然问“还有吗？”，让会议又延长四十分钟。','会议录屏','你提问后立刻关掉摄像头，还在聊天框发了一个下班表情。','问题留在会议里，人已经走到车库。','meeting',true,'我问的是有没有人要搭我的车。','关摄像头是去车库，下班表情是在催大家快点。'),
('yellow-excel','全表重点案','被控把 Excel 所有单元格标成黄色，并解释“黄色代表重点”。','操作记录','记录显示你先全选整张表，然后只做了一次黄色填充。','当全部都是重点，重点终于一视同仁。','document',true,'全都重要，所以我只是诚实地全标黄了。','我本来要再分级，领导来得比配色快。'),
('quick-sync-lunch','午休对齐案','被控在午休时发起“快速对齐一下”，会议持续了六十七分钟。','日历与外卖单','会议开始前三分钟，你取消了自己的午餐，却没告诉任何参会人。','信息对齐了，血糖还没有。','meeting',true,'我以为“快速”说的是开始得快。','我取消外卖是因为会议室有饼干，没想到他们没吃。'),
('ticket-no-detail','系统有问题案','被控提交故障工单时只写“系统有问题”，没有截图、时间或步骤。','浏览记录','提交前，你在完整报错页面停留了两分钟。','问题很具体，工单十分克制。','equipment',true,'我先报上去占个号，细节等你们问我。','页面里有密码，我总不能原图贴工单里吧。'),
('restaurant-anything','随便吃什么案','被控在聚餐投票中选择“随便”，随后否决了所有候选餐厅。','聊天记录','投票前，你已经私下向三个人推荐了同一家火锅店。','随便是态度，火锅是答案。','daily',true,'我说随便，又没说不能提意见。','我只是推荐火锅，没说非吃不可。'),
('snack-expiry-help','零食代管案','被控吃掉同事贴着“不要动”的零食，并留言“已帮忙处理临期食品”。','包装照片','包装袋上的保质期是明年六月。','食品没有过期，同事的信任先过期了。','daily',true,'不让它过期的最好办法，就是提前吃掉。','明年六月迟早会到，我只是处理得比较早。'),
('busy-lunch-survey','忙碌状态案','被控把状态设成“忙碌”，随后逐个询问大家中午吃什么。','状态记录','第一位同事回复“有事吗”之后，你才把状态改成忙碌。','忙于工作，具体工作是统计午饭。','message',true,'我忙的就是统计午饭，状态又没写忙什么。','第一个人一问，我才发现这事确实挺忙。'),
('monitor-reboot','重启显示器案','被控断网时连续重启显示器三次，并声称自己在排查故障。','设备记录','网络恢复时显示器仍关着，你却马上宣布“果然修好了”。','网络恢复了，显示器承受了一切。','equipment',true,'网断了总得先做点什么，显示器离我最近。','屏幕关着都听见消息响了，这不就是网好了。'),
('ppt-transitions','四十七种动画案','被控给五页 PPT 加了四十七种动画，汇报现场像综艺片头。','版本记录','你还删掉两页正文，理由是“得给动画留时间”。','内容退场了，动画完成了汇报。','document',true,'领导说要有冲击力，我理解得比较认真。','那两页字太多，动画能让重点自己走出来。'),
('unread-reminder','三周未读案','被控故意留着一条未读消息当提醒，三周后仍然没有打开。','转发记录','第二天你把消息截图发给自己，还写着“晚点一定看”。','提醒一直在线，行动暂时离线。','message',true,'它一直未读，就说明它一直在提醒我。','我还截图备份了，足以证明我非常重视。'),
('meeting-room-charge','会议室充电案','被控预约会议室两小时，实际只在里面给手机充电。','通话与用电记录','两小时内没有电话和会议流量，手机电量却从 3% 充到 100%。','会议没有发言，电量达成共识。','equipment',true,'我在里面开电话会，没规定一定要开电视。','后来改成静默会议了，主要议题是等手机充满。'),
('single-side-print','八十页单面案','被控把八十页材料全部单面打印，导致打印机当场缺纸。','打印设置','系统默认双面，你却手动取消，还点了“记住此设置”。','纸张留下了余地，打印机没有。','document',true,'背面得留着写领导临时加的需求。','记住设置，是因为领导每次都临时加。'),
('wrong-group-all','发错群案','被控在部门群里 @所有人 发“今晚吃鸡缺一”，随后解释发错群了。','群聊记录','五分钟后你的队伍已经满员，但那条消息一直没有撤回。','群确实发错了，人倒是找对了。','message',true,'发错群是真的，没撤是怕大家不知道已经满了。','队伍能满说明消息有效，部门群也是群。'),
('mute-meeting','忘记静音案','被控开会时忘记静音，清晰地说出“这个会怎么还没结束”。','快捷键记录','说话前你刚按过一次静音键，但按成了解除静音。','心声被听见了，静音没有。','meeting',true,'我是在替大家问出心声。','我明明按了静音，是软件非要替我发言。'),
('search-share','共享搜索记录案','被控共享屏幕时暴露搜索记录：“如何礼貌拒绝临时会议”。','会议邀请','发起这场临时会议的人正是你，标题还写着“大家畅所欲言”。','用一次临时会议，研究如何拒绝临时会议。','meeting',true,'我开这个会，就是想讨论以后怎么少开会。','畅所欲言，当然也包括拒绝参加下一次。'),
('camera-freeze','精准卡顿案','被控视频会议中每次被点名就说“我卡了”，没被点名时一切正常。','会议录屏','你没被点名时笑了三次，还顺手换了一个背景。','网络很懂事，只卡需要回答的部分。','meeting',true,'能看见不代表能说话，坏的是关键时候。','网络只同步了表情，没同步声音。'),
('coffee-custody','咖啡代管案','被控把茶水间最后一包咖啡豆带回家，留言“先替大家保管”。','朋友圈照片','第二天你请假在家，还发了一张手冲咖啡照片。','咖啡得到了保管，也失去了自由。','daily',true,'我怕周末受潮，带回去做保存测试。','手冲是抽样检查，不喝怎么知道坏没坏。'),
('movie-oncall','随时联系案','被控 16:58 在群里说“我先下线，手机随时联系”，随后开启飞行模式。','朋友圈定位','17:05 你发出一张电影院票根，配文“终于赶上了”。','手机随时都在，人暂时不在。','message',true,'我说手机随时联系，又没说我随时回复。','飞行模式是影院要求，票是提前取的。'),
('printer-success','两百页测试案','被控为了测试打印机，打印了两百页“测试成功”。','打印记录','两百个任务都是你每隔两秒手动发送的。','打印机通过了测试，纸没有。','equipment',true,'一次成功不算稳定，两百次才有说服力。','我怕一次打两百页累坏它，所以分开测。'),
('shared-doc-format','统一格式案','被控把共享文档里所有人的内容，统一替换成了自己的一段话。','撤销记录','记录显示你先全选文档，再粘贴自己的段落，还保存了三次。','格式终于统一，内容也只剩一种。','document',true,'统一格式之前，当然要先统一内容。','保存三次是怕大家的旧内容突然回来。'),
('elevator-wait','电梯等人案','被控按住电梯五分钟等同事，导致整栋楼的人一起等待。','门禁时间','那位同事改走楼梯，反而比电梯早到一楼。','一个人走了楼梯，一群人上了耐心课。','daily',true,'我是在替后来的人保留一个下楼名额。','他走楼梯，说明我的等待还促进了运动。'),
('overtime-meal','十二人夜宵案','被控给五名加班同事订了十二人份夜宵，并坚持说数量刚好。','订单明细','多出的七份，正好全是你平时爱吃的菜。','夜宵照顾了所有人，尤其是未来的你。','daily',true,'人数可能会变，我按最乐观的情况准备。','我爱吃才更能判断，多出来的菜有没有浪费。'),
('browser-tabs','四十二个标签案','被控因为开了四十二个浏览器标签，花十分钟也没找到汇报页面。','屏幕截图','其中二十九个标签的名字都叫“新标签页”。','页面可能就在其中，只是拒绝自报家门。','equipment',true,'新标签没标题，不代表里面没有内容。','这是浏览器不会取名，不是我不会整理。'),
('poll-advisory','投票仅供参考案','被控发起投票询问周会改到几点，投完后仍按原时间开会。','投票结果','除了你以外，所有人都选择了另一个时间。','大家完成了投票，你完成了决定。','meeting',true,'投票是收集意见，又没说票多的赢。','至少结果很统一，只是刚好和我不一样。'),
('fridge-experiment','午饭实验案','被控在冰箱里的外卖上贴“实验样品，禁止触碰”，独占整层空间。','外卖订单','订单备注写着“多放辣，谢谢”，收货人就是你。','午饭进入实验阶段，冰箱退出共享模式。','daily',true,'我的午饭也可以研究冷藏效果。','多放辣是变量，名字写我说明样品来源清楚。'),
('weekly-none','五千字周报案','被控提交五千字周报，其中四千八百字都是“暂无”。','文档检查','整份周报的重复率达到 96%。','字数非常充足，进展非常节省。','document',true,'没有进展，也应该如实充分地记录。','重复说明情况稳定，稳定本身也是成果。'),
('minutes-summary','八字纪要案','被控主动负责会议纪要，最后只写了“大家进行了充分讨论”。','会议录音','会议持续九十分钟，期间你还问了三次“刚才重点是啥”。','会议留下了录音，纪要留下了气氛。','meeting',true,'“充分讨论”就是整场会议的重点。','九十分钟压成八个字，说明我总结得很到位。')
on conflict(id) do update set
  title=excluded.title,
  charge=excluded.charge,
  evidence_title=excluded.evidence_title,
  evidence=excluded.evidence,
  verdict_template=excluded.verdict_template,
  category=excluded.category,
  enabled=excluded.enabled,
  reference_statement=excluded.reference_statement,
  reference_response=excluded.reference_response;

-- 旧“充电器缩水案”偏向真实占有纠纷，不适合轻松狡辩；保留数据但退出随机池。
update public.court_case_packs set enabled=false where id='borrowed-charger';

create or replace function public.court_v6_restart(p_state jsonb,p_now_ms bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  players jsonb;
  recent_cases jsonb;
begin
  select coalesce(jsonb_agg(jsonb_set(player,'{eligibleFromRound}','1'::jsonb) order by (player->>'seat')::integer),'[]'::jsonb)
  into players from jsonb_array_elements(v_state->'players') as player_rows(player);
  select coalesce(jsonb_agg(case_id order by last_position),'[]'::jsonb)
  into recent_cases
  from (
    select case_id,max(position) last_position
    from jsonb_array_elements_text(coalesce(v_state->'previousSessionCaseIds','[]'::jsonb)||coalesce(v_state->'usedCaseIds','[]'::jsonb))
      with ordinality as history_rows(case_id,position)
    group by case_id
    order by max(position) desc
    limit 21
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

revoke all on function public.court_v6_restart(jsonb,bigint) from public;
