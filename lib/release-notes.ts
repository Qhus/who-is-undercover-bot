export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  details: readonly string[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: 'V1.2',
    date: '2026-08-26',
    title: '表格主界面与通知中心',
    summary: '将表格模式确定为主要开发界面，并加入非弹窗式版本说明。',
    details: [
      '标题栏新增“通知”入口并显示当前版本号，点击后在工作簿右侧打开通知窗格。',
      '更新记录由统一版本数据自动生成；可以切换版本并查看完整内容。',
      '通知中心不记录是否已读、不显示未读角标，也不发送浏览器或系统推送。',
      '弱化娱乐化入口和卡片式流程表现，保留单元格坐标、操作说明与隐私遮挡提示。',
      '沉浸模式调整为兼容视图，后续只保持核心流程可用，不作为主要视觉开发页面。',
    ],
  },
  {
    version: 'V1.1',
    date: '2026-08-26',
    title: '联机并发与建房修复',
    summary: '多人操作改为数据库锁内合并，并修复 CloudBase 新建房间失败。',
    details: [
      '确认词语、提交描述和投票改为受控数据库操作，避免多人同时提交互相覆盖。',
      '操作使用唯一编号保持幂等，过期轮次和冲突状态会同步最新结果并给出清晰提示。',
      '词组去重键改为 PostgreSQL jsonb 可安全保存的格式，消除建房时的 22P05 错误。',
    ],
  },
  {
    version: 'V1.0',
    date: '2026-08-26',
    title: '完整流程版本',
    summary: '补齐趣味词库、逐人计时、自动推进和临时离场能力。',
    details: [
      '系统词库扩展至 105 组中等或困难词组，并避免最近 10 局重复。',
      '按座位顺序描述时，每位在场玩家分别拥有完整 120 秒。',
      '支持暂退、返回和永久退出；描述公开后自动开放投票，结果页自动进入下一轮。',
    ],
  },
];

export const CURRENT_RELEASE = RELEASE_NOTES[0];
