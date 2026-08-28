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
}

export const COURT_CASE_PACKS: readonly CourtCasePack[] = [
  { id:'friday-overtime', title:'周五加班案', charge:'被控在周五 17:59 说“只耽误五分钟”，最终让全组加班到晚上九点半。', evidenceTitle:'门禁记录与公开照片', evidence:'你本人 18:02 离开公司，并于 18:30 发布了一张火锅照片。', referenceStatement:'我只要求大家把风险点说清楚，并没有要求任何人留下。', referenceResponse:'我离开是去线下找供应商确认，火锅照片就是另一处工作现场。', verdictTemplate:'虽然离谱，但逻辑勉强闭环。', category:'meeting', enabled:true },
  { id:'reply-all', title:'全员收到案', charge:'被控对公司群发邮件使用“回复全部”，内容只有两个字：“收到”。', evidenceTitle:'邮件服务器记录', evidence:'系统显示你在发送前曾把“回复”按钮悬停了八秒，最后主动选择了“回复全部”。', referenceStatement:'我是在帮助发件人一次性确认送达范围，避免逐个追问。', referenceResponse:'悬停八秒说明我经过风险评估，回复全部是审慎后的效率选择。', verdictTemplate:'一次慎重考虑后的全员打扰。', category:'message', enabled:true },
  { id:'final-final-file', title:'最终版迷宫案', charge:'被控提交文件“最终版_最终版2_这次真不改了.xlsx”，导致所有人用错版本。', evidenceTitle:'文件修改历史', evidence:'你电脑里同时存在另外七个带“最终”字样的版本，最新一个名为“真的最终版”。', referenceStatement:'“最终版”描述的是当时状态，后缀负责记录后续需求变化。', referenceResponse:'七个版本证明需求持续演进，“真的最终版”是内部验证稿而非交付稿。', verdictTemplate:'文件名没有说谎，只是没有说完。', category:'document', enabled:true },
  { id:'meeting-last-question', title:'散会追问案', charge:'被控在领导宣布散会时突然问“还有吗？”，让会议又延长了四十分钟。', evidenceTitle:'会议录音', evidence:'录音显示你提问后立刻关闭摄像头，并在聊天框里发了一个下班表情。', referenceStatement:'我问的是还有没有遗漏，不是邀请大家重新开一场会。', referenceResponse:'关闭摄像头是节省带宽，下班表情是在提醒大家控制讨论时长。', verdictTemplate:'发问很积极，撤退也很及时。', category:'meeting', enabled:true },
  { id:'yellow-excel', title:'全表重点案', charge:'被控把 Excel 所有单元格标成黄色，并解释“黄色代表重点”。', evidenceTitle:'格式操作记录', evidence:'操作历史显示你先全选了整张工作表，然后才点击黄色填充。', referenceStatement:'这份表每个字段都会影响结论，所以不存在可以忽略的非重点。', referenceResponse:'先全选是建立统一基线，后续本应再分级，只是会议提前开始了。', verdictTemplate:'当全部都是重点时，重点获得了平等。', category:'document', enabled:true },
  { id:'quick-sync-lunch', title:'午休对齐案', charge:'被控在午休时间发起名为“快速对齐一下”的会议，持续了六十七分钟。', evidenceTitle:'日历与外卖记录', evidence:'会议开始三分钟前，你取消了自己的午餐订单，但没有通知任何参会人。', referenceStatement:'我按五分钟准备了议程，是现场新增问题把会议延长了。', referenceResponse:'取消午餐说明我预判了风险，但没有权限替其他人取消订单。', verdictTemplate:'信息已经对齐，血糖尚未对齐。', category:'meeting', enabled:true },
  { id:'ticket-no-detail', title:'系统有问题案', charge:'被控提交故障工单只写“系统有问题”，没有截图、时间或操作步骤。', evidenceTitle:'浏览器访问记录', evidence:'提交工单前，你已经打开过完整的错误详情页面，并停留了两分钟。', referenceStatement:'我先提交工单占住响应时间，详细信息原计划随后补充。', referenceResponse:'详情页包含敏感信息，我停留两分钟正是在判断哪些内容可以上传。', verdictTemplate:'问题很具体，描述十分克制。', category:'equipment', enabled:true },
  { id:'restaurant-anything', title:'随便吃什么案', charge:'被控在聚餐投票中选择“随便”，随后否决了所有候选餐厅。', evidenceTitle:'聊天记录', evidence:'投票开始前，你已经私下向三个人推荐了同一家火锅店。', referenceStatement:'“随便”表示我接受合格选项，不代表所有候选都自动合格。', referenceResponse:'私下推荐只是提供样本，没有影响公开投票的独立性。', verdictTemplate:'随便是一种态度，也可能是一家店。', category:'daily', enabled:true },
  { id:'borrowed-charger', title:'充电器缩水案', charge:'被控借走同事的一整套充电器，归还时只剩一根数据线。', evidenceTitle:'工位监控截图', evidence:'画面显示你归还前曾把充电头放进自己的抽屉，并认真地点了点头。', referenceStatement:'我先归还了对方当时急用的数据线，充电头准备单独交接。', referenceResponse:'放进抽屉是为了防止混入公共物品，点头表示我记住了存放位置。', verdictTemplate:'归还动作完整，归还物品略有精简。', category:'equipment', enabled:true },
  { id:'busy-lunch-survey', title:'忙碌状态案', charge:'被控把在线状态设为“忙碌”，随后逐个询问大家中午吃什么。', evidenceTitle:'状态变更日志', evidence:'日志显示“忙碌”状态是在第一位同事回复“有事吗”之后才设置的。', referenceStatement:'午餐统计是团队保障工作，逐个确认是为了提高最终到餐率。', referenceResponse:'第一条回复让我意识到询问会打断同事，所以才及时设置忙碌减少回流。', verdictTemplate:'忙于工作，具体工作是统计午饭。', category:'message', enabled:true },
  { id:'monitor-reboot', title:'重启显示器案', charge:'被控在网络中断时连续重启显示器三次，并声称是在排查故障。', evidenceTitle:'设备与网络日志', evidence:'网络恢复时你的显示器仍处于关闭状态，但你立即宣布“果然修好了”。', referenceStatement:'显示器重启用于排除本地显示异常，是网络排查中的对照实验。', referenceResponse:'屏幕关闭仍能听到消息提示，因此我根据声音确认网络已经恢复。', verdictTemplate:'因果关系大胆，恢复结果真实。', category:'equipment', enabled:true },
  { id:'ppt-transitions', title:'四十七种动画案', charge:'被控为五页汇报 PPT 添加四十七种切换动画，导致汇报像综艺片头。', evidenceTitle:'模板下载记录', evidence:'你在制作前搜索并下载了“让领导眼前一亮的动画大全”。', referenceStatement:'动画用于区分信息层级，页数少不代表信息节点少。', referenceResponse:'搜索“眼前一亮”是视觉目标，不代表四十七种动画都计划投入生产。', verdictTemplate:'领导确实眼前一亮，时间也确实不够。', category:'document', enabled:true },
  { id:'unread-reminder', title:'三周未读案', charge:'被控故意保留一条未读消息作为提醒，三周后仍然没有打开。', evidenceTitle:'消息转发记录', evidence:'第二天你曾把该消息截图发给自己，并配文“晚点一定看”。', referenceStatement:'未读标记持续存在，说明提醒机制没有失效。', referenceResponse:'截图转发是建立备份提醒，“晚点”只定义顺序，没有承诺具体日期。', verdictTemplate:'提醒机制运行稳定，执行模块暂未上线。', category:'message', enabled:true },
  { id:'meeting-room-charge', title:'会议室充电案', charge:'被控预约会议室两小时，实际只在里面给手机充电。', evidenceTitle:'会议室设备记录', evidence:'会议电视从未开启，但桌上插座在两小时内持续输出快充功率。', referenceStatement:'我预约的是不受打扰的电话会议，不需要开启电视。', referenceResponse:'手机是参会设备，持续快充是在保障会议连接而不是占用会议室。', verdictTemplate:'会议没有召开，电量达成共识。', category:'equipment', enabled:true },
  { id:'single-side-print', title:'八十页单面案', charge:'被控打印八十页材料时选择单面打印，使打印机当场缺纸。', evidenceTitle:'打印设置截图', evidence:'打印窗口默认勾选双面，而你曾手动取消并点击“记住此设置”。', referenceStatement:'材料需要逐页批注，单面打印是为了保留背面书写空间。', referenceResponse:'记住设置是为同类批注任务提效，缺纸属于耗材预警没有及时补充。', verdictTemplate:'纸张承担了本不该承担的留白。', category:'document', enabled:true },
  { id:'wrong-group-all', title:'发错群案', charge:'被控在群里发出“@所有人”，随后解释“抱歉，发错群了”。', evidenceTitle:'草稿与群聊记录', evidence:'同样的内容没有出现在任何其他群里，你也没有再次发送。', referenceStatement:'我发现提醒对象范围不准确，所以立即声明发错群并终止扩散。', referenceResponse:'没有再次发送说明原事项已经通过其他渠道解决，无需制造第二次打扰。', verdictTemplate:'群可能发错了，提醒倒是准确送达。', category:'message', enabled:true },
  { id:'mute-meeting', title:'忘记静音案', charge:'被控在会议中忘记静音，并清晰说出“这个会怎么还没结束”。', evidenceTitle:'快捷键记录', evidence:'系统记录显示你在说话前刚按过一次静音键，但按成了解除静音。', referenceStatement:'那句话是对会议时间管理的即时风险提示，并非私下抱怨。', referenceResponse:'我主动按键说明本意是静音，解除静音属于界面状态反馈不清。', verdictTemplate:'操作意图明确，执行方向相反。', category:'meeting', enabled:true },
  { id:'search-share', title:'共享搜索记录案', charge:'被控共享屏幕时暴露搜索记录：“如何礼貌拒绝临时会议”。', evidenceTitle:'会议邀请记录', evidence:'发起这场临时会议的人正是你，而且标题写着“大家畅所欲言”。', referenceStatement:'搜索内容用于准备会议治理方案，帮助大家减少未来的临时会议。', referenceResponse:'我发起这次会议正是为了让大家畅所欲言，共同讨论如何拒绝下一次。', verdictTemplate:'礼貌已经搜索到，拒绝尚未执行。', category:'meeting', enabled:true },
];
