'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CURRENT_RELEASE, RELEASE_NOTES } from '@/lib/release-notes';

type HubTab = 'catalog' | 'guide' | 'updates';

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];

function savedRoomCode(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as { code?: unknown };
    return typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

function tabLabel(tab: HubTab): string {
  if (tab === 'guide') return '玩法说明';
  if (tab === 'updates') return '更新记录';
  return '游戏目录';
}

export default function GameHub() {
  const [tab, setTab] = useState<HubTab>('catalog');
  const [activeCell, setActiveCell] = useState('A2');
  const [undercoverRoom, setUndercoverRoom] = useState<string | null>(null);
  const [courtRoom, setCourtRoom] = useState<string | null>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setUndercoverRoom(savedRoomCode('undercover-active-remote'));
      setCourtRoom(savedRoomCode('court-active-remote'));
    });
  }, []);

  const rows = useMemo<ReactNode[][]>(() => {
    if (tab === 'guide') return [
      ['操作步骤', '要做什么', '谁来操作', '完成标志', '遇到问题', ''],
      ['01 选择游戏', '在“游戏目录”查看人数和玩法，点击对应行的进入按钮', '所有人', '打开游戏首页', '拿不准就先选谁是卧底', ''],
      ['02 创建房间', '一名玩家填写称呼并创建联机房间', '房主', '得到六位房间编号', '把邀请链接发到群里', ''],
      ['03 加入房间', '其他人打开邀请链接，填写自己的称呼后加入', '其他玩家', '成员出现在房间名单', '不要多人共用一个浏览器标签', ''],
      ['04 按表格提示操作', '优先查看绿色按钮、操作说明和高亮单元格', '所有人', '系统自动进入下一阶段', '页面异常时先刷新恢复', ''],
      ['05 返回目录', '标题栏点击“游戏目录”；房间记录仍保留在本机', '所有人', '回到游戏目录工作表', '永久退出请在游戏内操作', ''],
      ['', '', '', '', '', ''],
      ['链接规则', '总入口 /', '谁是卧底 /undercover/', '离谱法堂 /court/', '房间邀请链接自带编号', ''],
    ];

    if (tab === 'updates') return [
      ['版本', '发布日期', '更新主题', '概要', '完整内容', '状态'],
      ...RELEASE_NOTES.flatMap((release) => [
        [release.version, release.date, release.title, release.summary, release.details.join('；'), release.version === CURRENT_RELEASE.version ? '本版本' : '历史版本'],
      ]),
    ];

    return [
      ['游戏入口', '建议人数', '预计时长', '玩法摘要', '操作', '房间状态'],
      ['A2 · 谁是卧底', '3–10 人', '10–20 分钟', '查看私密词语、轮流描述、匿名投票找出特殊成员', <a className="sheet-action hub-launch" href="./undercover/" key="undercover">{undercoverRoom ? '继续 / 进入' : '进入游戏'}</a>, undercoverRoom ? `可恢复房间 ${undercoverRoom}` : '可创建或加入'],
      ['', '', '', '', '', ''],
      ['A4 · 离谱法堂', '3–8 人', '15–25 分钟', '围绕同一离谱案件匿名陈词，证据突袭后评选最佳狡辩', <a className="sheet-action hub-launch" href="./court/" key="court">{courtRoom ? '继续 / 进入' : '进入游戏'}</a>, courtRoom ? `可恢复房间 ${courtRoom}` : '可创建或加入'],
      ['', '', '', '', '', ''],
      ['入口调整', '原首页现为游戏目录', '谁是卧底移至 /undercover/', '离谱法堂保持 /court/', '收藏本页即可', '游戏数据相互隔离'],
      ['新手建议', '第一次先读“玩法说明”', '房主只负责创建和开始', '其余阶段按表格提示操作', '邀请链接可直接发群', '刷新可恢复联机房间'],
    ];
  }, [courtRoom, tab, undercoverRoom]);

  const formula = tab === 'catalog'
    ? activeCell === 'A4' ? '离谱法堂：同案匿名陈词，证据突袭后继续圆谎' : '游戏目录：从 A2 或 A4 选择一个游戏'
    : tab === 'guide' ? '五步开始：选游戏 → 建房 → 加入 → 按提示操作 → 返回目录' : `自动更新说明 · 当前版本 ${CURRENT_RELEASE.version}`;

  return <main className="sheet-app hub-sheet">
    <header className="sheet-titlebar">
      <span className="sheet-filemark" aria-hidden="true">表</span>
      <div><strong>摸鱼游戏工作台 · 游戏目录</strong><span>一个链接进入全部游戏 · {CURRENT_RELEASE.version}</span></div>
      <div className="sheet-title-actions"><a href="./undercover/">谁是卧底</a><a href="./court/">离谱法堂</a></div>
    </header>
    <nav className="sheet-ribbon" aria-label="游戏工作台工具栏"><button className="is-current" onClick={() => setTab('catalog')}>开始</button><button onClick={() => setTab('guide')}>帮助</button><button onClick={() => setTab('updates')}>更新</button><span /></nav>
    <div className="sheet-toolbar" aria-hidden="true"><span>撤销</span><span>重做</span><i /><b>系统字体</b><b>11</b><i /><strong>B</strong><em>I</em><u>U</u><i /><span>左对齐</span><span>自动换行</span><span>筛选</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output>{formula}</output></div>
    <section className="hub-intro">
      <div><span>工作簿说明</span><strong>{tabLabel(tab)}</strong><p>{tab === 'catalog' ? '点击 A2 或 A4 对应的绿色按钮进入游戏；已有房间会显示可恢复的编号。' : tab === 'guide' ? '照着表格从上往下做，不需要提前记住完整规则。' : '更新内容随网站版本自动展示，不记录已读状态，也不发送推送。'}</p></div>
      <div className="hub-mobile-launcher"><a href="./undercover/">A2 谁是卧底</a><a href="./court/">A4 离谱法堂</a></div>
    </section>
    <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label={tabLabel(tab)}>
      <thead><tr><th className="sheet-corner" />{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
        const coordinate = `${column}${rowIndex + 1}`;
        return <td className={coordinate === activeCell ? 'is-active-cell' : ''} onClick={() => setActiveCell(coordinate)} key={column}>{row[columnIndex] ?? ''}</td>;
      })}</tr>)}</tbody>
    </table></div>
    <footer className="sheet-tabs"><button aria-label="新增工作表">＋</button>{(['catalog', 'guide', 'updates'] as const).map((item) => <button className={tab === item ? 'is-current' : ''} onClick={() => setTab(item)} key={item}>{tabLabel(item)}</button>)}<a href="./undercover/">谁是卧底</a><a href="./court/">离谱法堂</a><span /><small>就绪 · 两个游戏相互独立 · 收藏本页即可</small></footer>
  </main>;
}
