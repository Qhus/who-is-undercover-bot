const replacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/私密发牌|随机发牌|发牌/g, '个人信息'],
  [/私牌/g, '个人信息'],
  [/匿名投票|秘密投票|投票/g, '提交选择'],
  [/淘汰/g, '本轮退出'],
  [/出局/g, '本轮退出'],
  [/游戏记录/g, '操作记录'],
  [/游戏/g, '流程'],
  [/牌局/g, '协作表'],
];

export function neutralizeGameCopy(copy: string): string {
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), copy);
}

export const neutralMessageCopy = {
  personalReady: (completed: number, total: number) => `个人信息确认进度：${completed}/${total} 已完成。`,
  selectionOpen: (round: number) => `Round_${String(round).padStart(2, '0')} 已开放提交选择。`,
  roundExit: (name: string) => `${name} 本轮退出，流程将继续。`,
  waiting: '当前步骤等待其他成员完成。',
} as const;

