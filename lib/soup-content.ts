export type SoupDifficulty = 'easy' | 'normal' | 'hard';
export type SoupCategory = 'daily_misunderstanding' | 'office_fun' | 'animal_behavior' | 'transport' | 'tech_life' | 'perspective';
export type SoupQuestionVerdict = 'yes' | 'no' | 'irrelevant' | 'partial' | 'rephrase';
export type SoupReviewStatus = 'pilot' | 'approved' | 'disabled';

export interface SoupFaqItem {
  question: string;
  verdict: SoupQuestionVerdict;
  note?: string;
}

export interface SoupCaseMetrics {
  playCount: number;
  successCount: number;
  effectiveQuestionTotal: number;
  hintUseCount: number;
  abandonCount: number;
  ambiguityCount: number;
  unsuitableCount: number;
}

export interface SoupCaseCard {
  id: string;
  internalTitle: string;
  surface: string;
  bottom: string;
  keyFacts: readonly string[];
  equivalentAnswers: readonly string[];
  boundary: string;
  commonQuestions: readonly SoupFaqItem[];
  hints: readonly [string, string];
  category: SoupCategory;
  difficulty: SoupDifficulty;
  sensitive: false;
  sourceNote: string;
  reviewStatus: SoupReviewStatus;
  cardVersion: number;
  metrics: SoupCaseMetrics;
}

type SoupCaseDraft = Omit<SoupCaseCard, 'commonQuestions' | 'sensitive' | 'sourceNote' | 'reviewStatus' | 'cardVersion' | 'metrics'> & {
  commonQuestions: readonly SoupFaqItem[];
};

const COMMON_FAQS: readonly SoupFaqItem[] = [
  { question: '需要超自然现象才能解释吗？', verdict: 'no' },
  { question: '有人在故意说谎吗？', verdict: 'no' },
  { question: '需要冷门专业知识才能解开吗？', verdict: 'no' },
];

function makeCard(draft: SoupCaseDraft): SoupCaseCard {
  return {
    ...draft,
    commonQuestions: [...draft.commonQuestions, ...COMMON_FAQS],
    sensitive: false,
    sourceNote: '项目原创候选题卡，未复制商业或网络现成题卡；等待真实盲测。',
    reviewStatus: 'pilot',
    cardVersion: 1,
    metrics: {
      playCount: 0,
      successCount: 0,
      effectiveQuestionTotal: 0,
      hintUseCount: 0,
      abandonCount: 0,
      ambiguityCount: 0,
      unsuitableCount: 0,
    },
  };
}

export const SOUP_CASES: readonly SoupCaseCard[] = [
  makeCard({
    id: 'soup-e01', internalTitle: '最后到的人最早打卡', difficulty: 'easy', category: 'perspective',
    surface: '早上，小周是办公室最后到的人，考勤记录却显示他最早到。',
    bottom: '小周值通宵班，前一天晚上已经进了办公室，早上只是最后一个从休息区回到工位。考勤记录统计的是进入办公区的时间，不是回到工位的时间。',
    keyFacts: ['小周前一天晚上已经进入办公室', '他值通宵班', '同事看到的是回工位顺序', '考勤记录的是进入办公区'],
    equivalentAnswers: ['他上的是夜班，早就进公司了', '“最后到”指最后回工位，不是最后进公司'],
    boundary: '只要明确“他此前已进入公司”和“观察口径不同”即可；不要求说出具体休息区。',
    hints: ['注意“到办公室”和“到工位”不是同一件事。', '他的工作日比其他人开始得早很多。'],
    commonQuestions: [
      { question: '考勤系统坏了吗？', verdict: 'no' },
      { question: '他昨晚就在公司吗？', verdict: 'yes' },
      { question: '他是夜班人员吗？', verdict: 'yes' },
      { question: '同事说的“到”是指回到工位吗？', verdict: 'yes' },
      { question: '有人替他打卡吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-e02', internalTitle: '空会议室全员到齐', difficulty: 'easy', category: 'tech_life',
    surface: '主持人走进空无一人的会议室，看了一眼就宣布：“人齐了，开始吧。”',
    bottom: '这是一场视频会议。主持人进入实体会议室只是为了使用大屏，所有参会者已经在线上会议名单中到齐。',
    keyFacts: ['会议在线举行', '实体会议室只是主持人的场地', '参会者都显示在线'],
    equivalentAnswers: ['大家在线上参会', '会议室里没人，但视频会议人员已经到齐'],
    boundary: '必须说明是远程或视频会议；电话会议等能解释线上到齐的答案也接受。',
    hints: ['“到齐”不一定指到了同一个房间。', '主持人看的不是会议室座位。'],
    commonQuestions: [
      { question: '这是视频会议吗？', verdict: 'yes' },
      { question: '其他人在别的地方吗？', verdict: 'yes' },
      { question: '主持人看的是线上名单吗？', verdict: 'yes' },
      { question: '会议室里藏着人吗？', verdict: 'no' },
      { question: '主持人是唯一线下参会者吗？', verdict: 'partial', note: '他是唯一在这个会议室里的人。' },
    ],
  }),
  makeCard({
    id: 'soup-e03', internalTitle: '没按楼层的电梯', difficulty: 'easy', category: 'tech_life',
    surface: '小林进电梯后一个按钮都没按，电梯却准确停在了他的办公楼层。',
    bottom: '大楼的门禁和电梯联动。小林进闸机时刷了工牌，系统已经把他的办公楼层发送给电梯。',
    keyFacts: ['工牌绑定办公楼层', '闸机与电梯联动', '楼层在进电梯前已经登记'],
    equivalentAnswers: ['刷工牌后电梯自动选层', '系统知道他的目标楼层'],
    boundary: '语音、电梯员或别人碰巧按同层不是主要解释；需提到自动识别或提前选层。',
    hints: ['选择动作发生在他走进电梯以前。', '工牌除了开门还传递了一条信息。'],
    commonQuestions: [
      { question: '别人替他按了按钮吗？', verdict: 'no' },
      { question: '电梯知道他的身份吗？', verdict: 'yes' },
      { question: '他刷过工牌吗？', verdict: 'yes' },
      { question: '这是专用电梯吗？', verdict: 'no' },
      { question: '楼层由系统自动分配吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-e04', internalTitle: '关机以后任务完成', difficulty: 'easy', category: 'tech_life',
    surface: '阿杰点击关机后没有再碰电脑，几分钟后同事却收到消息：他的任务完成了。',
    bottom: '电脑关机前会自动执行收尾脚本，把当天文件同步到团队服务器；服务器在同步完成后自动向同事发出了完成通知。',
    keyFacts: ['点击关机会触发收尾流程', '文件在真正断电前同步', '通知由服务器自动发送'],
    equivalentAnswers: ['关机脚本自动上传并通知', '电脑关机过程中完成了预设任务'],
    boundary: '定时任务也可接受，但要说明任务早已预设并自动完成；不能解释为同事代做。',
    hints: ['“点击关机”和“电脑立刻断电”之间还有一段流程。', '发消息的不一定是阿杰本人。'],
    commonQuestions: [
      { question: '同事替他完成了吗？', verdict: 'no' },
      { question: '电脑有自动任务吗？', verdict: 'yes' },
      { question: '通知是系统发的吗？', verdict: 'yes' },
      { question: '电脑当时已经完全断电了吗？', verdict: 'no' },
      { question: '任务是上传或同步文件吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-e05', internalTitle: '没取却已签收', difficulty: 'easy', category: 'daily_misunderstanding',
    surface: '小许一整天没离开工位，也没人替他拿包裹，快递却显示已经签收。',
    bottom: '快递被投进公司的智能快递柜。“签收”表示快递柜完成代收，不表示小许本人已经取件。',
    keyFacts: ['包裹进入智能快递柜', '快递柜属于代收方', '物流的签收不等于本人取走'],
    equivalentAnswers: ['快递柜代收了', '公司代收点完成了系统签收'],
    boundary: '前台代收也可接受；关键是签收主体不是本人，且不需要另一个玩家替他取走。',
    hints: ['物流里的“签收人”不一定是收件人。', '包裹还在公司某个上锁的小格子里。'],
    commonQuestions: [
      { question: '快递被送错了吗？', verdict: 'no' },
      { question: '是前台或设备代收吗？', verdict: 'yes' },
      { question: '包裹还在公司吗？', verdict: 'yes' },
      { question: '小许已经拿到包裹了吗？', verdict: 'no' },
      { question: '签收记录是真实的吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-e06', internalTitle: '没伞的人没淋湿', difficulty: 'easy', category: 'transport',
    surface: '下着大雨，带伞的小孟浑身湿透，没带伞的小丁却滴雨未沾。两人走的是同一段路。',
    bottom: '两人一起走在有顶棚的连廊里。小孟的伞不是用来挡雨，而是刚从门外借回来，伞面还在滴水，把自己的衣服弄湿了；小丁一直走在连廊下。',
    keyFacts: ['道路有连续顶棚', '两人都不需要用伞挡雨', '小孟拿的是一把湿伞', '湿衣服来自伞上的水'],
    equivalentAnswers: ['他们走有顶棚的路，带伞者被湿伞弄湿', '雨没直接淋到两人，水来自伞'],
    boundary: '只答“没带伞的人走廊内”不够，需解释带伞者为什么湿；水来自湿伞即可。',
    hints: ['让小孟变湿的水不是从头顶落下来的。', '这段路全程有遮挡。'],
    commonQuestions: [
      { question: '小丁在车里吗？', verdict: 'no' },
      { question: '路上有顶棚吗？', verdict: 'yes' },
      { question: '小孟打开伞了吗？', verdict: 'no' },
      { question: '伞本来就是湿的吗？', verdict: 'yes' },
      { question: '两人都在室外暴雨中行走吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n01', internalTitle: '唯一没回复的人被表扬', difficulty: 'normal', category: 'office_fun',
    surface: '群里所有人都回复了“收到”，只有小秦没回，主管却专门表扬了他。',
    bottom: '主管的原消息要求“看到后直接修改共享表格，不要刷屏回复”。小秦是唯一按要求完成修改且没有回复“收到”的人。',
    keyFacts: ['原消息明确要求不要回复', '真正任务是修改共享表格', '小秦完成了实际操作'],
    equivalentAnswers: ['主管要求别回复，小秦照做了', '其他人只回收到，小秦直接完成任务'],
    boundary: '需同时说明“不回复是要求”和“小秦完成任务”；只说主管偏心不接受。',
    hints: ['“收到”并不等于完成了原消息要求的动作。', '主管原话里包含“不要做某件事”。'],
    commonQuestions: [
      { question: '主管要求大家不要回复吗？', verdict: 'yes' },
      { question: '小秦看到了消息吗？', verdict: 'yes' },
      { question: '小秦完成了真正的任务吗？', verdict: 'yes' },
      { question: '其他人被表扬了吗？', verdict: 'no' },
      { question: '回复“收到”本身是错误操作吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-n02', internalTitle: '停电后视频更清楚', difficulty: 'normal', category: 'tech_life',
    surface: '办公室突然停电，小罗的视频会议画面反而立刻变清楚了。',
    bottom: '小罗用有电池的笔记本开会。停电后拥挤的办公室无线网络断开，电脑自动切换到他的手机热点；热点更稳定，所以画面变清楚。',
    keyFacts: ['笔记本靠电池继续运行', '办公室网络随停电断开', '设备自动切换手机热点', '热点连接更稳定'],
    equivalentAnswers: ['停电触发切换到更好的移动网络', '电脑有电，原来的差网络断了'],
    boundary: '需要解释设备为何没关和网络为何更好；仅答“切换网络”算还差一点。',
    hints: ['断电的是办公室设备，不是小罗正在使用的所有设备。', '画质变化来自自动换了一条网络。'],
    commonQuestions: [
      { question: '小罗的电脑有电池吗？', verdict: 'yes' },
      { question: '原来的网络很拥挤吗？', verdict: 'yes' },
      { question: '电脑切换到手机热点了吗？', verdict: 'yes' },
      { question: '停电改善了办公室宽带吗？', verdict: 'no' },
      { question: '会议平台在停电时升级了吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n03', internalTitle: '红灯会议室', difficulty: 'normal', category: 'daily_misunderstanding',
    surface: '会议室门口一直亮着红灯，行政却肯定地说里面没人。',
    bottom: '门口红灯只表示日历中的预约时段正在进行，不检测房间里是否有人。预约者提前结束离开了，但没有取消余下预约。',
    keyFacts: ['红灯由预约日历控制', '它不是人体感应灯', '会议提前结束', '预约没有被取消'],
    equivalentAnswers: ['红灯表示已预订，不代表有人', '人提前走了，预约状态仍是占用'],
    boundary: '核心是状态含义不同；设备故障不接受。',
    hints: ['红灯显示的是计划，不是实时画面。', '会议比日历上写的时间更早结束。'],
    commonQuestions: [
      { question: '红灯坏了吗？', verdict: 'no' },
      { question: '红灯表示房间被预约吗？', verdict: 'yes' },
      { question: '会议已经提前结束了吗？', verdict: 'yes' },
      { question: '行政刚检查过房间吗？', verdict: 'partial', note: '她通过房间情况或参会者确认了。' },
      { question: '里面有人但行政看不见吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n04', internalTitle: '删除最终版才通过', difficulty: 'normal', category: 'office_fun',
    surface: '小叶删除了名叫“最终版”的文件，项目反而立刻通过了检查。',
    bottom: '自动检查会读取文件夹中的所有表格。“最终版”其实是过期副本，里面仍有旧数据，造成重复和冲突；删除它后系统只读取到真正的最新文件。',
    keyFacts: ['检查程序批量读取文件', '“最终版”只是文件名', '该文件内容已经过期', '旧副本造成数据冲突'],
    equivalentAnswers: ['最终版是旧副本，删掉避免程序误读', '系统同时读取了重复文件'],
    boundary: '需指出名称与真实版本不一致，并且它影响自动检查。',
    hints: ['文件名会骗人，但不是有人故意骗人。', '检查程序不知道哪个文件才是真的最新。'],
    commonQuestions: [
      { question: '“最终版”真的是最新文件吗？', verdict: 'no' },
      { question: '系统会读取多个文件吗？', verdict: 'yes' },
      { question: '旧文件造成重复数据吗？', verdict: 'yes' },
      { question: '小叶重新写了项目吗？', verdict: 'no' },
      { question: '检查程序本身坏了吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n05', internalTitle: '猫准时叫人开会', difficulty: 'normal', category: 'animal_behavior',
    surface: '办公室的猫不懂日历，却每天都能准时把大家叫去开会。',
    bottom: '每日会议前，保洁推车都会经过猫窝旁边，车上有猫熟悉的零食气味。猫听到推车声就跑向会议室门口叫，大家把它当成了天然提醒。',
    keyFacts: ['固定流程每天在会前发生', '猫识别声音或气味', '猫跑去会议室是条件反射', '员工把行为当提醒'],
    equivalentAnswers: ['猫根据会前固定出现的声音或气味行动', '保洁推车成了猫的时间信号'],
    boundary: '不强求保洁推车，但必须是稳定、可感知且每天会前发生的线索；普通闹钟答案太笼统。',
    hints: ['猫判断的不是钟点，而是每天重复出现的信号。', '会前总有一辆带着熟悉气味的车经过。'],
    commonQuestions: [
      { question: '有人训练猫了吗？', verdict: 'partial', note: '没有正式训练，但形成了习惯。' },
      { question: '猫能听见固定声音吗？', verdict: 'yes' },
      { question: '这和食物气味有关吗？', verdict: 'yes' },
      { question: '会议时间每天固定吗？', verdict: 'yes' },
      { question: '员工给猫戴了手表吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n06', internalTitle: '伞只保护电脑', difficulty: 'normal', category: 'transport',
    surface: '大雨里，小段撑着伞却主动走进雨中；到了公司，他全身湿透，伞下的东西却一点没湿。',
    bottom: '小段的背包拉链坏了，里面装着借来的笔记本电脑。他把伞尽量压低只罩住背包，自己因此淋湿，但电脑安全送到公司。',
    keyFacts: ['伞下保护的不是小段本人', '背包防水失效', '包里有需要保护的电脑', '他主动牺牲遮挡面积'],
    equivalentAnswers: ['他用伞只护住怕水的物品', '伞罩着电脑包，自己淋雨'],
    boundary: '物品不必严格是电脑，但需是怕水且必须送达的工作物品；宠物不在首选边界。',
    hints: ['伞的中心并不在他的头顶。', '他更在意按时送到的一件工作物品。'],
    commonQuestions: [
      { question: '伞坏了吗？', verdict: 'no' },
      { question: '伞下的是物品吗？', verdict: 'yes' },
      { question: '物品怕水吗？', verdict: 'yes' },
      { question: '他故意让自己淋湿吗？', verdict: 'yes' },
      { question: '包的防水有问题吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-n07', internalTitle: '空白纸证明打印成功', difficulty: 'normal', category: 'office_fun',
    surface: '打印机只吐出一张看起来完全空白的纸，财务却确认材料已经打印成功。',
    bottom: '材料打印在预先盖有浅色防伪底纹的专用纸背面。小顾第一眼看到的是没有内容的正面，财务翻面后看到了完整材料。',
    keyFacts: ['纸有正反面', '内容打印在背面', '观察者只看了正面', '打印内容实际完整'],
    equivalentAnswers: ['打印在纸的另一面', '看到的空白面不是打印面'],
    boundary: '隐形墨水、加热显字不接受；只需说明翻面即可看到。',
    hints: ['不需要任何特殊工具就能看到内容。', '把纸做一个最普通的动作就行。'],
    commonQuestions: [
      { question: '打印机没墨了吗？', verdict: 'no' },
      { question: '内容在纸的背面吗？', verdict: 'yes' },
      { question: '需要紫外灯才能看见吗？', verdict: 'no' },
      { question: '财务看了纸的另一面吗？', verdict: 'yes' },
      { question: '纸张本身有问题吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-n08', internalTitle: '没带工牌过三道门', difficulty: 'normal', category: 'daily_misunderstanding',
    surface: '小冉没带工牌，也没人给他开门，却独自通过了公司的三道门禁。',
    bottom: '小冉进门前在物业前台领取了绑定本人身份的一次性手机访客码。三道门都能扫描同一个动态访客码，所以不需要实体工牌或别人开门。',
    keyFacts: ['没有工牌不等于没有通行凭证', '访客码在手机上', '凭证经过前台授权', '三道门识别同一凭证'],
    equivalentAnswers: ['他用手机访客码开门', '物业给了电子临时通行证'],
    boundary: '刷脸等合法电子凭证也可接受；尾随或翻越不接受。',
    hints: ['“没带工牌”不等于身上没有凭证。', '凭证刚刚由物业发送到他的手机。'],
    commonQuestions: [
      { question: '门一直开着吗？', verdict: 'no' },
      { question: '他使用手机了吗？', verdict: 'yes' },
      { question: '物业授权了他吗？', verdict: 'yes' },
      { question: '他刷脸了吗？', verdict: 'no' },
      { question: '他是合法进入的吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-n09', internalTitle: '周一前发出的周报', difficulty: 'normal', category: 'perspective',
    surface: '小艾周一第一次打开电脑时，发现自己本周的周报已经发送完毕，而且内容完全正确。',
    bottom: '小艾上周五下班前已经写好下一周的计划周报，并设置为周一早晨定时发送。邮件在她开电脑前由云端邮箱自动发出。',
    keyFacts: ['报告内容是下一周计划', '上周五已经写好', '邮件设置了定时发送', '发送由云端服务执行'],
    equivalentAnswers: ['她提前写好并定时发送', '周报是计划内容，不需要本周先发生'],
    boundary: '需解释内容为何能提前正确；只答定时邮件算还差一点。',
    hints: ['发送时间和写作时间不是同一天。', '这份“周报”写的是计划，不是已经发生的工作。'],
    commonQuestions: [
      { question: '有人登录了她的账号吗？', verdict: 'no' },
      { question: '她提前写好了吗？', verdict: 'yes' },
      { question: '邮件是定时发送的吗？', verdict: 'yes' },
      { question: '内容主要是本周计划吗？', verdict: 'yes' },
      { question: '电脑关机时云端邮箱还能发信吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-n10', internalTitle: '空座位显示在线', difficulty: 'normal', category: 'tech_life',
    surface: '小朱的座位一上午都空着，协作软件却一直准确显示他正在办公。',
    bottom: '小朱在公司的实验室调试设备，使用同一个工作账号和笔记本保持在线。他没有坐在自己的固定工位，但确实一直在办公。',
    keyFacts: ['座位不是唯一工作地点', '小朱在公司实验室', '他使用工作账号在线', '状态显示的是账号活动'],
    equivalentAnswers: ['他在别的工作区域办公', '在线状态不代表坐在固定座位'],
    boundary: '居家办公也可接受；需说明他本人确实工作而非脚本伪造在线。',
    hints: ['软件判断的是账号活动，不是椅子上有没有人。', '公司里还有另一个需要他工作的房间。'],
    commonQuestions: [
      { question: '他在远程控制电脑吗？', verdict: 'no' },
      { question: '他在公司别处工作吗？', verdict: 'yes' },
      { question: '在线状态是假的吗？', verdict: 'no' },
      { question: '他的账号被别人使用了吗？', verdict: 'no' },
      { question: '固定座位和工作地点不同吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-h01', internalTitle: '门禁说没来却工作全天', difficulty: 'hard', category: 'perspective',
    surface: '门禁记录证明老高今天从没进公司，监控却证明他今天一整天都在公司工作。两份记录都没错。',
    bottom: '老高负责通宵维护，在午夜前就进入公司，直到今天工作结束才离开。门禁的“今日进入记录”为零，但他确实跨过零点后全天都在楼内。',
    keyFacts: ['他在今天开始前已经进入', '工作跨越零点', '门禁记录只查进入动作', '监控记录查人在场'],
    equivalentAnswers: ['昨晚进公司后一直没离开', '跨夜工作导致今天无进门记录'],
    boundary: '必须同时解释时间边界和不同记录口径；门禁故障不接受。',
    hints: ['“今天没进来”不等于“今天不在里面”。', '关键动作发生在零点以前。'],
    commonQuestions: [
      { question: '他昨晚就进公司了吗？', verdict: 'yes' },
      { question: '他通宵工作吗？', verdict: 'yes' },
      { question: '他今天离开过再回来吗？', verdict: 'no' },
      { question: '门禁只统计进入动作吗？', verdict: 'yes' },
      { question: '监控日期设置错了吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-h02', internalTitle: '断网后上传成功', difficulty: 'hard', category: 'tech_life',
    surface: '工程师主动断开电脑网络后，卡了半小时的文件立刻上传成功。',
    bottom: '电脑同时连着公司有线网和已授权的手机热点，但系统优先走有线网；公司网络策略拦截了目标测试站点。断开有线连接后，流量自动走手机热点，上传随即完成。',
    keyFacts: ['电脑存在两条网络路径', '有线网优先级更高', '公司策略拦截目标站点', '断开的是有问题的连接', '热点仍然联网'],
    equivalentAnswers: ['断开公司网后切到可用热点', '所谓断网只断了一条网络'],
    boundary: '离线上传不接受；必须说明仍有第二网络且路由发生切换。',
    hints: ['他断开的只是电脑上的一条连接。', '原本优先使用的网络恰好不允许访问目标地址。'],
    commonQuestions: [
      { question: '电脑还有另一条网络吗？', verdict: 'yes' },
      { question: '公司网络拦截了站点吗？', verdict: 'yes' },
      { question: '断开后切到手机热点吗？', verdict: 'yes' },
      { question: '文件其实没上传到服务器吗？', verdict: 'no' },
      { question: '上传软件支持离线完成吗？', verdict: 'no' },
    ],
  }),
  makeCard({
    id: 'soup-h03', internalTitle: '会前写完的会议纪要', difficulty: 'hard', category: 'office_fun',
    surface: '会议还没开始，纪要已经写完；会议结束后，所有参会者都确认一个字也不用改。',
    bottom: '这是异步评审的收口会。所有意见和决定已在共享文档里提前完成，会议只用于逐项确认没有新增异议。秘书把共享文档中的最终结论整理成纪要，会上大家确认原结论即可。',
    keyFacts: ['实质讨论在会前异步完成', '共享文档已有全部结论', '会议目的只是最终确认', '会上没有新增异议'],
    equivalentAnswers: ['大家会前已完成讨论，会议只是确认', '纪要整理自已达成一致的异步记录'],
    boundary: '套用旧纪要不接受；需说明本次决定已真实提前产生且会议仅确认。',
    hints: ['“开会”不是他们第一次讨论这件事。', '真正的讨论都发生在一份共享文档里。'],
    commonQuestions: [
      { question: '纪要是照抄以前的吗？', verdict: 'no' },
      { question: '大家会前已经讨论过吗？', verdict: 'yes' },
      { question: '会议只做确认吗？', verdict: 'yes' },
      { question: '会上出现了新决定吗？', verdict: 'no' },
      { question: '共享文档很关键吗？', verdict: 'yes' },
    ],
  }),
  makeCard({
    id: 'soup-h04', internalTitle: '空桌接听了电话', difficulty: 'hard', category: 'tech_life',
    surface: '电话响起时，工位上一个人也没有，桌上的电脑却替员工接听了电话，而且对方得到了正确答复。',
    bottom: '公司的客服号码接入电脑软电话，来电先由自动语音机器人识别常见问题并读取知识库答案。电脑没有代替某个员工说话，而是在无人时运行预先配置的自动应答。',
    keyFacts: ['来电进入电脑软电话', '自动语音系统接听', '答案来自预设知识库', '现场不需要真人操作'],
    equivalentAnswers: ['AI 或自动语音客服在电脑上接听', '预设机器人按知识库回答'],
    boundary: '远程真人接听可判还差一点；完整答案需指出回答由自动系统生成或读取。',
    hints: ['“电脑替员工接听”可以是字面意思。', '对方问的是知识库里已有的常见问题。'],
    commonQuestions: [
      { question: '有人远程控制电脑吗？', verdict: 'no' },
      { question: '这是软电话吗？', verdict: 'yes' },
      { question: '自动语音机器人回答了吗？', verdict: 'yes' },
      { question: '答案是预先准备的吗？', verdict: 'yes' },
      { question: '电脑拥有麦克风和扬声器吗？', verdict: 'yes' },
    ],
  }),
];

export function availableSoupCases(includePilot = true): readonly SoupCaseCard[] {
  return SOUP_CASES.filter((card) => card.reviewStatus === 'approved' || (includePilot && card.reviewStatus === 'pilot'));
}

export function validateSoupCaseLibrary(cards: readonly SoupCaseCard[] = SOUP_CASES): string[] {
  const errors: string[] = [];
  const counts: Record<SoupDifficulty, number> = { easy: 0, normal: 0, hard: 0 };
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) errors.push(`${card.id}: 题卡编号重复`);
    ids.add(card.id);
    counts[card.difficulty] += 1;
    if (card.keyFacts.length < 3 || card.keyFacts.length > 6) errors.push(`${card.id}: 关键事实应为 3–6 条`);
    if (card.commonQuestions.length < 8 || card.commonQuestions.length > 15) errors.push(`${card.id}: 常见问题应为 8–15 条`);
    if (card.hints.length !== 2) errors.push(`${card.id}: 应提供 2 条提示`);
    if (!card.surface.trim() || !card.bottom.trim() || !card.boundary.trim()) errors.push(`${card.id}: 核心题卡字段不能为空`);
  }
  if (cards.length !== 20) errors.push(`题卡总数应为 20，当前为 ${cards.length}`);
  if (counts.easy !== 6 || counts.normal !== 10 || counts.hard !== 4) {
    errors.push(`难度分布应为 6/10/4，当前为 ${counts.easy}/${counts.normal}/${counts.hard}`);
  }
  if (new Set(cards.map((card) => card.category)).size < 5) errors.push('题卡至少覆盖 5 个分类');
  return errors;
}
