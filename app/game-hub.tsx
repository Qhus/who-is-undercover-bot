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
  return '目录';
}

export default function GameHub() {
  const [tab, setTab] = useState<HubTab>('catalog');
  const [activeCell, setActiveCell] = useState('A2');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [selectedReleaseVersion, setSelectedReleaseVersion] = useState(CURRENT_RELEASE.version);
  const [undercoverRoom, setUndercoverRoom] = useState<string | null>(null);
  const [clueRoom, setClueRoom] = useState<string | null>(null);
  const [courtRoom, setCourtRoom] = useState<string | null>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setUndercoverRoom(savedRoomCode('undercover-active-remote'));
      setClueRoom(savedRoomCode('clue-active-remote'));
      setCourtRoom(savedRoomCode('court-active-remote'));
    });
  }, []);

  const rows = useMemo<ReactNode[][]>(() => {
    if (tab === 'guide') return [
      ['操作步骤', '要做什么', '谁来操作', '完成标志', '遇到问题', ''],
      ['01 选择项目', '在“目录”查看人数、时长和摘要，点击对应行的打开按钮', '所有人', '打开对应页面', 'A2、A3、A4 相互独立', ''],
      ['02 创建房间', '一名玩家填写称呼并创建联机房间', '房主', '得到六位房间编号', '把邀请链接发到群里', ''],
      ['03 加入房间', '其他人打开邀请链接，填写自己的称呼后加入', '其他玩家', '成员出现在房间名单', '不要多人共用一个浏览器标签', ''],
      ['04 按表格提示操作', '优先查看绿色按钮、操作说明和高亮单元格', '所有人', '系统自动进入下一阶段', '页面异常时先刷新恢复', ''],
      ['05 返回目录', '标题栏点击“目录”；房间记录仍保留在本机', '所有人', '回到目录工作表', '永久退出请在对应页面操作', ''],
      ['', '', '', '', '', ''],
      ['链接规则', '总入口 /', 'A2 独立页面', 'A3 独立页面', 'A4 独立页面', '邀请链接自带编号'],
    ];

    if (tab === 'updates') return [
      ['版本', '发布日期', '更新主题', '概要', '完整内容', '状态'],
      ...RELEASE_NOTES.flatMap((release) => [
        [release.version, release.date, release.title, release.summary, release.details.join('；'), release.version === CURRENT_RELEASE.version ? '本版本' : '历史版本'],
      ]),
    ];

    return [
      ['入口', '建议人数', '预计时长', '摘要', '操作', '状态'],
      ['A2', '3–10 人', '10–20 分钟', '查看私密词语、轮流描述、匿名投票找出特殊成员', <a className="sheet-action hub-launch" href="./undercover/" key="undercover" aria-label="打开 A2">{undercoverRoom ? '继续 / 打开' : '打开'}</a>, undercoverRoom ? `可恢复编号 ${undercoverRoom}` : '可创建或加入'],
      ['A3', '3–8 人', '8–15 分钟', '轮流猜词、提交匿名提示并评分，争夺提示分与猜题速度双榜单', <a className="sheet-action hub-launch" href="./clue/" key="clue" aria-label="打开 A3">{clueRoom ? '继续 / 打开' : '打开'}</a>, clueRoom ? `可恢复编号 ${clueRoom}` : '可创建或加入'],
      ['A4', '2–8 人', '15–25 分钟', '围绕同一离谱案件匿名陈词，评选最会狡辩和最像真的答案', <a className="sheet-action hub-launch" href="./court/" key="court" aria-label="打开 A4">{courtRoom ? '继续 / 打开' : '打开'}</a>, courtRoom ? `可恢复编号 ${courtRoom}` : '可创建或加入'],
      ['', '', '', '', '', ''],
      ['页面调整', '根页面现为目录', 'A2、A3、A4 使用独立页面', '返回目录不影响进行中的流程', '收藏本页即可', '三项数据相互隔离'],
      ['使用建议', '第一次先读“玩法说明”', '负责人只需创建和开始', '其余阶段按表格提示操作', '邀请链接可直接发送', '刷新可恢复联机状态'],
    ];
  }, [clueRoom, courtRoom, tab, undercoverRoom]);

  const formula = tab === 'catalog'
    ? activeCell === 'A4' ? 'A4：同案匿名陈词，证据突袭后继续补充说明' : activeCell === 'A3' ? 'A3：匿名提示不去重，猜中后评分并生成双榜单' : '目录：根据摘要从 A2、A3 或 A4 选择一个项目'
    : tab === 'guide' ? '五步开始：选游戏 → 建房 → 加入 → 按提示操作 → 返回目录' : `自动更新说明 · 当前版本 ${CURRENT_RELEASE.version}`;
  const selectedRelease = RELEASE_NOTES.find((release) => release.version === selectedReleaseVersion) ?? CURRENT_RELEASE;

  return <main className="sheet-app hub-sheet">
    <header className="sheet-titlebar">
      <span className="sheet-filemark" aria-hidden="true">表</span>
      <div><strong>协作工作簿 · 目录</strong><span>流程入口 · {CURRENT_RELEASE.version}</span></div>
      <div className="sheet-title-actions"><a href="./undercover/" aria-label="打开 A2">A2</a><a href="./clue/" aria-label="打开 A3">A3</a><a href="./court/" aria-label="打开 A4">A4</a><button className={notificationOpen ? 'is-active' : ''} aria-expanded={notificationOpen} aria-controls="hub-notification-panel" onClick={() => setNotificationOpen((open) => !open)}>通知 · {CURRENT_RELEASE.version}</button></div>
    </header>
    <nav className="sheet-ribbon" aria-label="游戏工作台工具栏"><button className="is-current" onClick={() => setTab('catalog')}>开始</button><button onClick={() => setTab('guide')}>帮助</button><button onClick={() => setTab('updates')}>更新</button><span /></nav>
    <div className="sheet-toolbar" aria-hidden="true"><span>撤销</span><span>重做</span><i /><b>系统字体</b><b>11</b><i /><strong>B</strong><em>I</em><u>U</u><i /><span>左对齐</span><span>自动换行</span><span>筛选</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output>{formula}</output></div>
    <div className="sheet-workspace">
      <div className="sheet-canvas">
        <section className="hub-intro">
          <div><span>工作簿说明</span><strong>{tabLabel(tab)}</strong><p>{tab === 'catalog' ? '根据摘要选择 A2、A3 或 A4，再点击绿色按钮打开；已有记录会显示可恢复的编号。' : tab === 'guide' ? '照着表格从上往下做，不需要提前记住完整规则。' : '更新内容随网站版本自动展示，不记录已读状态，也不发送推送。'}</p></div>
          <div className="hub-mobile-launcher"><a href="./undercover/" aria-label="打开 A2">打开 A2</a><a href="./clue/" aria-label="打开 A3">打开 A3</a><a href="./court/" aria-label="打开 A4">打开 A4</a></div>
        </section>
        <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label={tabLabel(tab)}>
          <thead><tr><th className="sheet-corner" />{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
            const coordinate = `${column}${rowIndex + 1}`;
            return <td className={coordinate === activeCell ? 'is-active-cell' : ''} onClick={() => setActiveCell(coordinate)} key={column}>{row[columnIndex] ?? ''}</td>;
          })}</tr>)}</tbody>
        </table></div>
      </div>
      {notificationOpen && <aside className="sheet-notification-panel" id="hub-notification-panel" aria-labelledby="hub-notification-title">
        <header><div><span>版本通知</span><strong id="hub-notification-title">更新说明</strong><small>当前版本 {CURRENT_RELEASE.version}</small></div><button onClick={() => setNotificationOpen(false)} aria-label="关闭更新说明栏">×</button></header>
        <p className="sheet-notification-policy">内容随版本发布自动更新；暂不记录已读状态，也不发送推送。</p>
        <div className="sheet-release-list" aria-label="版本列表">{RELEASE_NOTES.map((release) => <button className={selectedRelease.version === release.version ? 'is-selected' : ''} onClick={() => setSelectedReleaseVersion(release.version)} key={release.version}><span>{release.version}</span><strong>{release.title}</strong><small>{release.date}</small><p>{release.summary}</p></button>)}</div>
        <section className="sheet-release-detail" aria-live="polite"><span>{selectedRelease.version} · {selectedRelease.date}</span><h2>{selectedRelease.title}</h2><p>{selectedRelease.summary}</p><ul>{selectedRelease.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></section>
      </aside>}
    </div>
    <footer className="sheet-tabs"><button aria-label="新增工作表">＋</button>{(['catalog', 'guide', 'updates'] as const).map((item) => <button className={tab === item ? 'is-current' : ''} onClick={() => setTab(item)} key={item}>{tabLabel(item)}</button>)}<a href="./undercover/" aria-label="打开 A2">A2</a><a href="./clue/" aria-label="打开 A3">A3</a><a href="./court/" aria-label="打开 A4">A4</a><span /><small>就绪 · 三项流程相互独立 · 收藏本页即可</small></footer>
  </main>;
}
