export type CourtCaseCategory = 'meeting' | 'document' | 'message' | 'equipment' | 'daily';

export interface CourtCasePack {
  id: string;
  title: string;
  charge: string;
  evidenceTitle: string;
  evidence: string;
  referenceStatement: string;
  referenceResponse: string;
  verdictTemplate: string;
  category: CourtCaseCategory;
  enabled: boolean;
  v7Sample?: {
    questionCards: readonly [string, string, string];
    archiveTactic: string;
    archiveQuestion: string;
  };
}

export const COURT_CASE_PACKS: readonly CourtCasePack[] = [
  { id:'friday-overtime', title:'周五加班案', charge:'被控在周五 17:59 说“只耽误五分钟”，最终让全组加班到晚上九点半。', evidenceTitle:'门禁与朋友圈', evidence:'你本人 18:02 离开公司，并于 18:30 发了一张火锅照片。', referenceStatement:'我说的是会开五分钟，没说改东西也只要五分钟。', referenceResponse:'火锅是供应商请的，我也在加班，只是换了个地方。', verdictTemplate:'五分钟开了个头，三个半小时收了个尾。', category:'meeting', enabled:true, v7Sample:{ questionCards:['你为什么 18:02 就先走了？','如果没人要求加班，大家为什么都留下了？','这件事最后到底对谁最有好处？'], archiveTactic:'抓住字眼', archiveQuestion:'你说的五分钟到底指什么？' } },
  { id:'reply-all', title:'全员收到案', charge:'被控回复公司群发邮件时点了“回复全部”，内容只有两个字：“收到”。', evidenceTitle:'后续邮件', evidence:'一分钟后，你又群发了一封：“大家不用回复，避免打扰。”', referenceStatement:'我怕他挨个问，干脆让所有人都知道我收到了。', referenceResponse:'第二封是在及时止损，说明我发现问题很快。', verdictTemplate:'一个收到，引来了第二个收到。', category:'message', enabled:true },
  { id:'final-final-file', title:'最终版迷宫案', charge:'被控提交“最终版_最终版2_这次真不改了.xlsx”，导致所有人用错版本。', evidenceTitle:'文件列表', evidence:'你电脑里还有七个带“最终”的文件，最新一个叫“真的最终版”。', referenceStatement:'发出去的那一刻，它确实是最终版。', referenceResponse:'“真的最终版”是我自己看的，没让你们用。', verdictTemplate:'文件名没有说谎，只是有效期很短。', category:'document', enabled:true, v7Sample:{ questionCards:['既然是真最终版，后面七个版本是什么？','别人用错版本时，你为什么没提醒？','为什么不用日期，偏要一直写最终？'], archiveTactic:'抓住字眼', archiveQuestion:'“最终”这两个字还有有效期吗？' } },
  { id:'meeting-last-question', title:'散会追问案', charge:'被控在领导宣布散会时突然问“还有吗？”，让会议又延长四十分钟。', evidenceTitle:'会议录屏', evidence:'你提问后立刻关掉摄像头，还在聊天框发了一个下班表情。', referenceStatement:'我问的是有没有人要搭我的车。', referenceResponse:'关摄像头是去车库，下班表情是在催大家快点。', verdictTemplate:'问题留在会议里，人已经走到车库。', category:'meeting', enabled:true },
  { id:'yellow-excel', title:'全表重点案', charge:'被控把 Excel 所有单元格标成黄色，并解释“黄色代表重点”。', evidenceTitle:'操作记录', evidence:'记录显示你先全选整张表，然后只做了一次黄色填充。', referenceStatement:'全都重要，所以我只是诚实地全标黄了。', referenceResponse:'我本来要再分级，领导来得比配色快。', verdictTemplate:'当全部都是重点，重点终于一视同仁。', category:'document', enabled:true },
  { id:'quick-sync-lunch', title:'午休对齐案', charge:'被控在午休时发起“快速对齐一下”，会议持续了六十七分钟。', evidenceTitle:'日历与外卖单', evidence:'会议开始前三分钟，你取消了自己的午餐，却没告诉任何参会人。', referenceStatement:'我以为“快速”说的是开始得快。', referenceResponse:'我取消外卖是因为会议室有饼干，没想到他们没吃。', verdictTemplate:'信息对齐了，血糖还没有。', category:'meeting', enabled:true },
  { id:'ticket-no-detail', title:'系统有问题案', charge:'被控提交故障工单时只写“系统有问题”，没有截图、时间或步骤。', evidenceTitle:'浏览记录', evidence:'提交前，你在完整报错页面停留了两分钟。', referenceStatement:'我先报上去占个号，细节等你们问我。', referenceResponse:'页面里有密码，我总不能原图贴工单里吧。', verdictTemplate:'问题很具体，工单十分克制。', category:'equipment', enabled:true },
  { id:'restaurant-anything', title:'随便吃什么案', charge:'被控在聚餐投票中选择“随便”，随后否决了所有候选餐厅。', evidenceTitle:'聊天记录', evidence:'投票前，你已经私下向三个人推荐了同一家火锅店。', referenceStatement:'我说随便，又没说不能提意见。', referenceResponse:'我只是推荐火锅，没说非吃不可。', verdictTemplate:'随便是态度，火锅是答案。', category:'daily', enabled:true, v7Sample:{ questionCards:['你否决的餐厅到底哪里不行？','既然都随便，为什么只推荐火锅？','这次投票还有实际意义吗？'], archiveTactic:'承认小错', archiveQuestion:'你所谓的随便有什么隐藏条件？' } },
  { id:'snack-expiry-help', title:'零食代管案', charge:'被控吃掉同事贴着“不要动”的零食，并留言“已帮忙处理临期食品”。', evidenceTitle:'包装照片', evidence:'包装袋上的保质期是明年六月。', referenceStatement:'不让它过期的最好办法，就是提前吃掉。', referenceResponse:'明年六月迟早会到，我只是处理得比较早。', verdictTemplate:'食品没有过期，同事的信任先过期了。', category:'daily', enabled:true },
  { id:'busy-lunch-survey', title:'忙碌状态案', charge:'被控把状态设成“忙碌”，随后逐个询问大家中午吃什么。', evidenceTitle:'状态记录', evidence:'第一位同事回复“有事吗”之后，你才把状态改成忙碌。', referenceStatement:'我忙的就是统计午饭，状态又没写忙什么。', referenceResponse:'第一个人一问，我才发现这事确实挺忙。', verdictTemplate:'忙于工作，具体工作是统计午饭。', category:'message', enabled:true },
  { id:'monitor-reboot', title:'重启显示器案', charge:'被控断网时连续重启显示器三次，并声称自己在排查故障。', evidenceTitle:'设备记录', evidence:'网络恢复时显示器仍关着，你却马上宣布“果然修好了”。', referenceStatement:'网断了总得先做点什么，显示器离我最近。', referenceResponse:'屏幕关着都听见消息响了，这不就是网好了。', verdictTemplate:'网络恢复了，显示器承受了一切。', category:'equipment', enabled:true },
  { id:'ppt-transitions', title:'四十七种动画案', charge:'被控给五页 PPT 加了四十七种动画，汇报现场像综艺片头。', evidenceTitle:'版本记录', evidence:'你还删掉两页正文，理由是“得给动画留时间”。', referenceStatement:'领导说要有冲击力，我理解得比较认真。', referenceResponse:'那两页字太多，动画能让重点自己走出来。', verdictTemplate:'内容退场了，动画完成了汇报。', category:'document', enabled:true, v7Sample:{ questionCards:['四十七种动画分别解决了什么问题？','删掉的正文是不是比动画更重要？','你自己看完后记住了哪一页内容？'], archiveTactic:'反向邀功', archiveQuestion:'冲击力和看不懂有什么区别？' } },
  { id:'unread-reminder', title:'三周未读案', charge:'被控故意留着一条未读消息当提醒，三周后仍然没有打开。', evidenceTitle:'转发记录', evidence:'第二天你把消息截图发给自己，还写着“晚点一定看”。', referenceStatement:'它一直未读，就说明它一直在提醒我。', referenceResponse:'我还截图备份了，足以证明我非常重视。', verdictTemplate:'提醒一直在线，行动暂时离线。', category:'message', enabled:true },
  { id:'meeting-room-charge', title:'会议室充电案', charge:'被控预约会议室两小时，实际只在里面给手机充电。', evidenceTitle:'通话与用电记录', evidence:'两小时内没有电话和会议流量，手机电量却从 3% 充到 100%。', referenceStatement:'我在里面开电话会，没规定一定要开电视。', referenceResponse:'后来改成静默会议了，主要议题是等手机充满。', verdictTemplate:'会议没有发言，电量达成共识。', category:'equipment', enabled:true, v7Sample:{ questionCards:['没有通话记录，你到底和谁开会？','为什么不用工位上的充电插座？','两小时里产生了什么会议结论？'], archiveTactic:'技术问题', archiveQuestion:'静默会议为什么需要预约两小时？' } },
  { id:'single-side-print', title:'八十页单面案', charge:'被控把八十页材料全部单面打印，导致打印机当场缺纸。', evidenceTitle:'打印设置', evidence:'系统默认双面，你却手动取消，还点了“记住此设置”。', referenceStatement:'背面得留着写领导临时加的需求。', referenceResponse:'记住设置，是因为领导每次都临时加。', verdictTemplate:'纸张留下了余地，打印机没有。', category:'document', enabled:true },
  { id:'wrong-group-all', title:'发错群案', charge:'被控在部门群里 @所有人 发“今晚吃鸡缺一”，随后解释发错群了。', evidenceTitle:'群聊记录', evidence:'五分钟后你的队伍已经满员，但那条消息一直没有撤回。', referenceStatement:'发错群是真的，没撤是怕大家不知道已经满了。', referenceResponse:'队伍能满说明消息有效，部门群也是群。', verdictTemplate:'群确实发错了，人倒是找对了。', category:'message', enabled:true, v7Sample:{ questionCards:['发现发错群后为什么没有立即撤回？','队伍满员的人是不是就在部门群里？','你是不是故意用“发错了”掩护招人？'], archiveTactic:'反向邀功', archiveQuestion:'既然发错了，为什么结果刚好有效？' } },
  { id:'mute-meeting', title:'忘记静音案', charge:'被控开会时忘记静音，清晰地说出“这个会怎么还没结束”。', evidenceTitle:'快捷键记录', evidence:'说话前你刚按过一次静音键，但按成了解除静音。', referenceStatement:'我是在替大家问出心声。', referenceResponse:'我明明按了静音，是软件非要替我发言。', verdictTemplate:'心声被听见了，静音没有。', category:'meeting', enabled:true },
  { id:'search-share', title:'共享搜索记录案', charge:'被控共享屏幕时暴露搜索记录：“如何礼貌拒绝临时会议”。', evidenceTitle:'会议邀请', evidence:'发起这场临时会议的人正是你，标题还写着“大家畅所欲言”。', referenceStatement:'我开这个会，就是想讨论以后怎么少开会。', referenceResponse:'畅所欲言，当然也包括拒绝参加下一次。', verdictTemplate:'用一次临时会议，研究如何拒绝临时会议。', category:'meeting', enabled:true },
  { id:'camera-freeze', title:'精准卡顿案', charge:'被控视频会议中每次被点名就说“我卡了”，没被点名时一切正常。', evidenceTitle:'会议录屏', evidence:'你没被点名时笑了三次，还顺手换了一个背景。', referenceStatement:'能看见不代表能说话，坏的是关键时候。', referenceResponse:'网络只同步了表情，没同步声音。', verdictTemplate:'网络很懂事，只卡需要回答的部分。', category:'meeting', enabled:true },
  { id:'coffee-custody', title:'咖啡代管案', charge:'被控把茶水间最后一包咖啡豆带回家，留言“先替大家保管”。', evidenceTitle:'朋友圈照片', evidence:'第二天你请假在家，还发了一张手冲咖啡照片。', referenceStatement:'我怕周末受潮，带回去做保存测试。', referenceResponse:'手冲是抽样检查，不喝怎么知道坏没坏。', verdictTemplate:'咖啡得到了保管，也失去了自由。', category:'daily', enabled:true },
  { id:'movie-oncall', title:'随时联系案', charge:'被控 16:58 在群里说“我先下线，手机随时联系”，随后开启飞行模式。', evidenceTitle:'朋友圈定位', evidence:'17:05 你发出一张电影院票根，配文“终于赶上了”。', referenceStatement:'我说手机随时联系，又没说我随时回复。', referenceResponse:'飞行模式是影院要求，票是提前取的。', verdictTemplate:'手机随时都在，人暂时不在。', category:'message', enabled:true },
  { id:'printer-success', title:'两百页测试案', charge:'被控为了测试打印机，打印了两百页“测试成功”。', evidenceTitle:'打印记录', evidence:'两百个任务都是你每隔两秒手动发送的。', referenceStatement:'一次成功不算稳定，两百次才有说服力。', referenceResponse:'我怕一次打两百页累坏它，所以分开测。', verdictTemplate:'打印机通过了测试，纸没有。', category:'equipment', enabled:true },
  { id:'shared-doc-format', title:'统一格式案', charge:'被控把共享文档里所有人的内容，统一替换成了自己的一段话。', evidenceTitle:'撤销记录', evidence:'记录显示你先全选文档，再粘贴自己的段落，还保存了三次。', referenceStatement:'统一格式之前，当然要先统一内容。', referenceResponse:'保存三次是怕大家的旧内容突然回来。', verdictTemplate:'格式终于统一，内容也只剩一种。', category:'document', enabled:true },
  { id:'elevator-wait', title:'电梯等人案', charge:'被控按住电梯五分钟等同事，导致整栋楼的人一起等待。', evidenceTitle:'门禁时间', evidence:'那位同事改走楼梯，反而比电梯早到一楼。', referenceStatement:'我是在替后来的人保留一个下楼名额。', referenceResponse:'他走楼梯，说明我的等待还促进了运动。', verdictTemplate:'一个人走了楼梯，一群人上了耐心课。', category:'daily', enabled:true },
  { id:'overtime-meal', title:'十二人夜宵案', charge:'被控给五名加班同事订了十二人份夜宵，并坚持说数量刚好。', evidenceTitle:'订单明细', evidence:'多出的七份，正好全是你平时爱吃的菜。', referenceStatement:'人数可能会变，我按最乐观的情况准备。', referenceResponse:'我爱吃才更能判断，多出来的菜有没有浪费。', verdictTemplate:'夜宵照顾了所有人，尤其是未来的你。', category:'daily', enabled:true },
  { id:'browser-tabs', title:'四十二个标签案', charge:'被控因为开了四十二个浏览器标签，花十分钟也没找到汇报页面。', evidenceTitle:'屏幕截图', evidence:'其中二十九个标签的名字都叫“新标签页”。', referenceStatement:'新标签没标题，不代表里面没有内容。', referenceResponse:'这是浏览器不会取名，不是我不会整理。', verdictTemplate:'页面可能就在其中，只是拒绝自报家门。', category:'equipment', enabled:true },
  { id:'poll-advisory', title:'投票仅供参考案', charge:'被控发起投票询问周会改到几点，投完后仍按原时间开会。', evidenceTitle:'投票结果', evidence:'除了你以外，所有人都选择了另一个时间。', referenceStatement:'投票是收集意见，又没说票多的赢。', referenceResponse:'至少结果很统一，只是刚好和我不一样。', verdictTemplate:'大家完成了投票，你完成了决定。', category:'meeting', enabled:true },
  { id:'fridge-experiment', title:'午饭实验案', charge:'被控在冰箱里的外卖上贴“实验样品，禁止触碰”，独占整层空间。', evidenceTitle:'外卖订单', evidence:'订单备注写着“多放辣，谢谢”，收货人就是你。', referenceStatement:'我的午饭也可以研究冷藏效果。', referenceResponse:'多放辣是变量，名字写我说明样品来源清楚。', verdictTemplate:'午饭进入实验阶段，冰箱退出共享模式。', category:'daily', enabled:true },
  { id:'weekly-none', title:'五千字周报案', charge:'被控提交五千字周报，其中四千八百字都是“暂无”。', evidenceTitle:'文档检查', evidence:'整份周报的重复率达到 96%。', referenceStatement:'没有进展，也应该如实充分地记录。', referenceResponse:'重复说明情况稳定，稳定本身也是成果。', verdictTemplate:'字数非常充足，进展非常节省。', category:'document', enabled:true },
  { id:'minutes-summary', title:'八字纪要案', charge:'被控主动负责会议纪要，最后只写了“大家进行了充分讨论”。', evidenceTitle:'会议录音', evidence:'会议持续九十分钟，期间你还问了三次“刚才重点是啥”。', referenceStatement:'“充分讨论”就是整场会议的重点。', referenceResponse:'九十分钟压成八个字，说明我总结得很到位。', verdictTemplate:'会议留下了录音，纪要留下了气氛。', category:'meeting', enabled:true },
];

export const COURT_V7_SAMPLE_CASES = COURT_CASE_PACKS.filter((item) => item.enabled && item.v7Sample);
