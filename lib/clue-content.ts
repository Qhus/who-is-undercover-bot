export type ClueMode = 'free' | 'public_rule' | 'role_play';
export type ClueDifficulty = 'easy' | 'normal' | 'hard' | 'mixed';

export interface CluePublicRule {
  id: string;
  name: string;
  rule: string;
  example: string;
  maxLength: number;
}

export interface ClueRole {
  id: string;
  name: string;
  rule: string;
  example: string;
  maxLength: number;
  load: 'low' | 'medium' | 'high';
}

export const CLUE_MODE_LABELS: Record<ClueMode, string> = {
  free: '自由模式',
  public_rule: '公共规则模式',
  role_play: '角色扮演模式',
};

export const CLUE_DIFFICULTY_LABELS: Record<ClueDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
  mixed: '混合',
};

export const CLUE_PUBLIC_RULES: readonly CluePublicRule[] = [
  { id: 'P01', name: '后果先行', rule: '不描述答案本身，只说它出现后的结果', example: '加班 → 第二天黑眼圈', maxLength: 16 },
  { id: 'P02', name: '固定搭档', rule: '只写一个经常和答案一起出现的东西', example: '咖啡 → 电脑', maxLength: 8 },
  { id: 'P03', name: '答案开口', rule: '假设答案会说话，写一句它会说的话', example: '闹钟 → 起床，不许装死', maxLength: 16 },
  { id: 'P04', name: '路人弹幕', rule: '写一句旁观者看到它时会发的评论', example: '相亲 → 这俩人聊不下去了', maxLength: 16 },
  { id: 'P05', name: '第一反应', rule: '只写人看到、听到或遇到它的第一反应', example: '榴莲 → 先捂鼻子', maxLength: 12 },
  { id: 'P06', name: '排除法', rule: '只说它不是什么，或容易和什么混淆', example: '地铁 → 不是火车也在地下跑', maxLength: 16 },
  { id: 'P07', name: '问号局', rule: '把提示写成一个问句', example: '雨伞 → 今天会下吗？', maxLength: 16 },
  { id: 'P08', name: '数字入场', rule: '提示中带一个数字', example: '猫 → 9 条命', maxLength: 12 },
  { id: 'P09', name: '两字极限', rule: '尽量正好写 2 字', example: '失眠 → 清醒', maxLength: 8 },
  { id: 'P10', name: '四字定格', rule: '尽量正好写 4 字', example: '电梯 → 上下直达', maxLength: 8 },
  { id: 'P11', name: '一幕小剧场', rule: '用 8–16 字写一个正在发生的小场景', example: '厕所 → 再找不到真的要出事了', maxLength: 16 },
] as const;

export const CLUE_ROLES: readonly ClueRole[] = [
  { id: 'R01', name: '撒谎者', rule: '说反话，但要留下一条能绕回答案的联系', example: '失眠 → 一觉到天亮', maxLength: 12, load: 'high' },
  { id: 'R02', name: '话痨', rule: '像在群里给朋友解释一样，用一句 12–20 字的口语描述', example: '充电宝 → 我每次出门没带它都会特别没有安全感', maxLength: 20, load: 'medium' },
  { id: 'R03', name: '惜字如金', rule: '尽量正好写 2 字', example: '咖啡 → 提神', maxLength: 8, load: 'medium' },
  { id: 'R04', name: '导游', rule: '只从地点、时间或出现的场景切入', example: '电梯 → 高楼层中转站', maxLength: 12, load: 'low' },
  { id: 'R05', name: '诗人', rule: '使用比喻或意象，不直说类别', example: '闹钟 → 清晨的敌军号角', maxLength: 12, load: 'medium' },
  { id: 'R06', name: '阴阳师', rule: '使用阴阳怪气、表面夸奖的口吻', example: '加班 → 真是自愿奋斗呢', maxLength: 12, load: 'medium' },
  { id: 'R07', name: '恋爱脑', rule: '把答案描述成一段感情', example: '充电器 → 没你我活不下去', maxLength: 12, load: 'medium' },
  { id: 'R08', name: '甩锅侠', rule: '把责任推给其他人或东西', example: '迟到 → 都怪地铁太努力', maxLength: 12, load: 'medium' },
  { id: 'R09', name: '客服', rule: '使用客服通知、解释或道歉口吻', example: '排队 → 您的位置正在处理中', maxLength: 16, load: 'low' },
  { id: 'R10', name: '古人', rule: '使用古风、文言或古代人的表达', example: '自拍 → 对镜留影', maxLength: 12, load: 'medium' },
  { id: 'R11', name: '外星人', rule: '当作第一次观察地球事物来描述', example: '奶茶 → 地球人摇晃甜水', maxLength: 16, load: 'medium' },
  { id: 'R12', name: '戏精', rule: '把普通事情描述得极其严重或夸张', example: '蚊子 → 今晚不是它死就是我亡', maxLength: 16, load: 'low' },
] as const;

export function clueInputPrompt(input: {
  mode: ClueMode;
  publicRuleName?: string | null;
  publicRuleText?: string | null;
  roleName?: string | null;
  roleRule?: string | null;
}) {
  if (input.mode === 'role_play' && input.roleName && input.roleRule) return `你的角色｜${input.roleName}：${input.roleRule}`;
  if (input.mode === 'public_rule' && input.publicRuleName && input.publicRuleText) return `公共规则｜${input.publicRuleName}：${input.publicRuleText}`;
  return '填写本轮关联词';
}

export function clueInputMaxLength(input: { mode: ClueMode; publicRuleId?: string | null; roleId?: string | null }) {
  if (input.mode === 'role_play') return CLUE_ROLES.find((role) => role.id === input.roleId)?.maxLength ?? 16;
  if (input.mode === 'public_rule') return CLUE_PUBLIC_RULES.find((rule) => rule.id === input.publicRuleId)?.maxLength ?? 16;
  return 8;
}

export function clueInputMinLength(input: { mode: ClueMode; roleId?: string | null }) {
  return input.mode === 'role_play' && input.roleId === 'R02' ? 12 : 1;
}
