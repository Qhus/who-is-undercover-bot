export type WordPairCategory = '日常' | '职场' | '科技' | '娱乐' | '食物' | '物品' | '抽象';
export type WordPairDifficulty = 'medium' | 'hard';

export interface WordPairEntry {
  words: readonly [string, string];
  category: WordPairCategory;
  difficulty: WordPairDifficulty;
}

const entries = (category: WordPairCategory, difficulty: WordPairDifficulty, pairs: readonly (readonly [string, string])[]): WordPairEntry[] =>
  pairs.map((words) => ({ words, category, difficulty }));

export const WORD_PAIR_ENTRIES: readonly WordPairEntry[] = [
  ...entries('日常', 'medium', [
    ['搬家', '旅行'], ['加班', '熬夜'], ['排队', '堵车'], ['失眠', '赖床'], ['露营', '野餐'],
    ['外卖', '预制菜'], ['合租', '住校'], ['迷路', '绕路'], ['打包', '收纳'], ['迟到', '请假'],
    ['预约', '排号'], ['发呆', '等人'], ['退货', '换货'], ['散步', '遛狗'], ['装修', '大扫除'],
  ]),
  ...entries('职场', 'hard', [
    ['周报', '复盘'], ['摸鱼', '午休'], ['需求变更', '临时通知'], ['会议纪要', '聊天记录'], ['汇报', '答辩'],
    ['值班', '轮班'], ['试用期', '实习期'], ['工位', '自习室'], ['团建', '聚餐'], ['内推', '推荐信'],
    ['方案', '预案'], ['排期', '日程'], ['交接', '培训'], ['远程办公', '居家学习'], ['审批', '确认'],
  ]),
  ...entries('科技', 'hard', [
    ['蓝牙', 'Wi-Fi'], ['截图', '录屏'], ['验证码', '密码'], ['更新', '重启'], ['充电宝', '移动硬盘'],
    ['云盘', '收藏夹'], ['备份', '缓存'], ['搜索框', '地址栏'], ['飞行模式', '勿扰模式'], ['扫码', '刷脸'],
    ['自动回复', '机器人客服'], ['草稿箱', '回收站'], ['直播', '视频通话'], ['定位', '导航'], ['滤镜', '美颜'],
  ]),
  ...entries('娱乐', 'hard', [
    ['剧透', '预告'], ['弹幕', '评论区'], ['热搜', '朋友圈'], ['演唱会', '音乐节'], ['密室逃脱', '剧本杀'],
    ['主播', '主持人'], ['追星', '追剧'], ['片尾彩蛋', '隐藏关卡'], ['翻唱', '模仿秀'], ['综艺', '真人秀'],
    ['脱口秀', '辩论赛'], ['路透', '花絮'], ['会员', '季票'], ['连载', '更新'], ['盲盒', '扭蛋'],
  ]),
  ...entries('食物', 'medium', [
    ['寿司', '饭团'], ['冰粉', '果冻'], ['蛋挞', '布丁'], ['自助餐', '流水席'], ['便当', '拼盘'],
    ['沙拉', '凉菜'], ['奶昔', '酸奶'], ['汤圆', '珍珠'], ['三明治', '汉堡'], ['泡面', '米线'],
    ['豆花', '双皮奶'], ['爆米花', '薯片'], ['冰淇淋', '奶油'], ['煎饼', '披萨'], ['糖葫芦', '水果串'],
  ]),
  ...entries('物品', 'hard', [
    ['门禁卡', '银行卡'], ['遥控器', '计算器'], ['台灯', '补光灯'], ['保温杯', '焖烧杯'], ['充电线', '挂绳'],
    ['行李箱', '收纳箱'], ['白板', '投影幕'], ['便利贴', '标签纸'], ['雨衣', '防晒衣'], ['眼罩', '口罩'],
    ['快递柜', '储物柜'], ['订书机', '打孔器'], ['门铃', '闹钟'], ['购物车', '行李车'], ['书签', '票根'],
  ]),
  ...entries('抽象', 'hard', [
    ['尴尬', '冷场'], ['安慰', '敷衍'], ['惊喜', '意外'], ['默契', '习惯'], ['仪式感', '形式主义'],
    ['回忆', '梦境'], ['社恐', '慢热'], ['直觉', '偏见'], ['期待', '焦虑'], ['自信', '固执'],
    ['礼貌', '客套'], ['计划', 'flag'], ['借口', '理由'], ['玩笑', '暗示'], ['灵感', '冲动'],
  ]),
];

export const WORD_PAIRS: readonly (readonly [string, string])[] = WORD_PAIR_ENTRIES.map((entry) => entry.words);

const BLANK_HINTS: Readonly<Record<WordPairCategory, string>> = {
  日常: '日常行为或生活场景',
  职场: '工作或学习场景',
  科技: '数码、网络或软件功能',
  娱乐: '娱乐内容或休闲活动',
  食物: '食物或饮品',
  物品: '日常使用的物品',
  抽象: '感受、态度或抽象概念',
};

export function wordPairHint(pair: readonly [string, string]): string {
  const key = wordPairKey(pair);
  const entry = WORD_PAIR_ENTRIES.find((item) => wordPairKey(item.words) === key);
  return entry ? BLANK_HINTS[entry.category] : '';
}

export function wordPairKey(pair: readonly [string, string]): string {
  return JSON.stringify([...pair].sort((a, b) => a.localeCompare(b, 'zh-CN')));
}

export function randomWordPair(random = Math.random): [string, string] {
  const pair = WORD_PAIRS[Math.floor(random() * WORD_PAIRS.length)];
  return random() > 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
}

export function randomWordPairAvoiding(excludedKeys: readonly string[], random = Math.random): [string, string] {
  const excluded = new Set(excludedKeys);
  const alternatives = WORD_PAIRS.filter((pair) => !excluded.has(wordPairKey(pair)));
  const pool = alternatives.length ? alternatives : WORD_PAIRS;
  const pair = pool[Math.floor(random() * pool.length)];
  return random() > 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
}

export function randomWordPairExcluding(previous: readonly [string, string], random = Math.random): [string, string] {
  return randomWordPairAvoiding([wordPairKey(previous)], random);
}
