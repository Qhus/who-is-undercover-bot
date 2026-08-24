'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { eligibleCandidates, eligibleVoters, type GameRoom, type Player } from '@/lib/game';
import { neutralizeGameCopy } from '@/lib/neutral-copy';
import { createPrivacyGuard, PRIVATE_REVEAL_MS, PRIVACY_IDLE_MS, type PrivacyGuard } from '@/lib/privacy';

type Screen = 'home' | 'setup' | 'game';
type Notice = { kind: 'info' | 'error'; text: string } | null;
type SheetTab = 'members' | 'log' | `round-${string}`;

export interface SpreadsheetModeProps {
  screen: Screen;
  room: GameRoom | null;
  notice: Notice;
  cloudReady: boolean;
  busy: boolean;
  remoteMode: boolean;
  currentPlayerId: string | null;
  activeCardPlayer: Player | null;
  activeVoter: Player | null;
  selectedCandidateId: string | null;
  ownerName: string;
  playerLimit: number;
  undercoverCount: number;
  civilianWord: string;
  undercoverWord: string;
  customWords: boolean;
  joinCode: string;
  joinName: string;
  onSwitchMode: () => void;
  onOpenSetup: () => void;
  onBackHome: () => void;
  onReset: () => void;
  onCopyRoomCode: () => void;
  onJoin: () => void;
  onCreateDemo: () => void;
  onCreateRemote: () => void;
  onStartDealing: () => void;
  onConfirmCard: () => void;
  onBeginVoting: () => void;
  onSubmitVote: () => void;
  onContinue: () => void;
  onRematch: () => void;
  onOwnerName: (value: string) => void;
  onPlayerLimit: (value: number) => void;
  onUndercoverCount: (value: number) => void;
  onCivilianWord: (value: string) => void;
  onUndercoverWord: (value: string) => void;
  onRandomWords: () => void;
  onCustomWords: () => void;
  onJoinCode: (value: string) => void;
  onJoinName: (value: string) => void;
  onRenamePlayer: (id: string, name: string) => void;
  onCandidate: (id: string | null) => void;
}

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];

function roundTab(round: number): `round-${string}` {
  return `round-${String(round).padStart(2, '0')}`;
}

function tabLabel(tab: SheetTab): string {
  if (tab === 'members') return '成员列表';
  if (tab === 'log') return '操作记录';
  return `Round_${tab.slice(6)}`;
}

function neutralStatus(room: GameRoom, player: Player, activeCardPlayer: Player | null, activeVoter: Player | null): string {
  if (!player.alive) return '本轮退出';
  if (room.status === 'lobby') return '等待中';
  if (room.status === 'cards') return player.cardReady ? '已完成' : player.id === activeCardPlayer?.id ? '待提交' : '等待中';
  if (room.status === 'voting') return room.votes[player.id] ? '已完成' : player.id === activeVoter?.id ? '待提交' : '等待中';
  if (room.status === 'finished') return '已完成';
  return '等待中';
}

function Grid({ rows, activeCell, onActivate }: { rows: ReactNode[][]; activeCell: string; onActivate: (cell: string) => void }) {
  return <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label="协作数据表">
    <thead><tr><th className="sheet-corner" aria-hidden="true" />{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
    <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
      const coordinate = `${column}${rowIndex + 1}`;
      return <td className={activeCell === coordinate ? 'is-active-cell' : ''} onClick={() => onActivate(coordinate)} key={column}>{row[columnIndex] ?? ''}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}

export default function SpreadsheetMode(props: SpreadsheetModeProps) {
  const [sheetTab, setSheetTab] = useState<SheetTab>('members');
  const [activeCell, setActiveCell] = useState('A1');
  const [sensitiveVisible, setSensitiveVisible] = useState(false);
  const privacy = useRef<PrivacyGuard | null>(null);

  useEffect(() => {
    privacy.current = createPrivacyGuard({ onVisibilityChange: setSensitiveVisible });
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' ? privacy.current?.mask('escape') : privacy.current?.activity();
    const onBlur = () => privacy.current?.mask('blur');
    const onVisibility = () => { if (document.hidden) privacy.current?.mask('hidden'); };
    const onActivity = () => privacy.current?.activity();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerdown', onActivity);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      privacy.current?.dispose();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerdown', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => { privacy.current?.mask('sheet-change'); }, [sheetTab]);
  useEffect(() => { if (props.notice) privacy.current?.mask('error'); }, [props.notice]);
  useEffect(() => {
    privacy.current?.mask('sheet-change');
  }, [props.room?.status, props.room?.round]);

  const sheetTabs = useMemo<SheetTab[]>(() => {
    const count = Math.max(2, props.room?.round ?? 1);
    return ['members', ...Array.from({ length: count }, (_, index) => roundTab(index + 1)), 'log'];
  }, [props.room?.round]);

  const currentAssignment = props.room && props.activeCardPlayer ? props.room.assignments[props.activeCardPlayer.id] : null;
  const formulaValue = sensitiveVisible && currentAssignment
    ? `${currentAssignment.role === 'undercover' ? '卧底' : '平民'}｜${currentAssignment.word}`
    : activeCell === 'D2' && props.room?.status === 'cards' ? '••••••' : `=${tabLabel(sheetTab)}!${activeCell}`;

  const gameRows = (): ReactNode[][] => {
    const room = props.room;
    if (!room) return [['状态', '等待载入', '', '', '', '']];
    const selectedRound = sheetTab.startsWith('round-') ? Number(sheetTab.slice(6)) : room.round;
    if (sheetTab === 'log') {
      const rows: ReactNode[][] = [['时间', '操作', '对象', '状态', '备注', '']];
      rows.push(['当前', `Round_${String(room.round).padStart(2, '0')}`, '全体成员', neutralizeGameCopy(room.status), `${room.players.length} 人`, '']);
      room.history.forEach((result) => rows.push([
        `Round_${String(result.round).padStart(2, '0')}`,
        result.ballot === 2 ? '再次汇总' : '汇总结果',
        result.eliminatedId ? room.players.find((player) => player.id === result.eliminatedId)?.name ?? '—' : '—',
        result.noElimination ? '等待中' : result.eliminatedId ? '本轮退出' : '已完成',
        Object.values(result.counts).reduce((sum, count) => sum + count, 0) + ' 份',
        '',
      ]));
      return rows;
    }
    if (sheetTab.startsWith('round-') && selectedRound !== room.round) {
      const history = room.history.filter((item) => item.round === selectedRound);
      if (!history.length) return [['轮次', '状态', '成员', '结果', '备注', ''], [`Round_${String(selectedRound).padStart(2, '0')}`, '等待中', '—', '—', '尚未开始', '']];
      return [['轮次', '批次', '成员', '结果', '数量', ''], ...history.map((result) => [
        `Round_${String(result.round).padStart(2, '0')}`,
        result.ballot === 2 ? '02' : '01',
        result.eliminatedId ? room.players.find((player) => player.id === result.eliminatedId)?.name ?? '—' : '—',
        result.noElimination ? '等待中' : result.eliminatedId ? '本轮退出' : '已完成',
        Object.values(result.counts).reduce((sum, count) => sum + count, 0),
        '',
      ])];
    }

    const header: ReactNode[] = ['序号', '成员', '本轮状态', '个人信息', '提交选择', '备注'];
    const rows: ReactNode[][] = [header];
    room.players.forEach((player) => {
      const isCardOwner = room.status === 'cards' && player.id === props.activeCardPlayer?.id;
      const isVoter = room.status === 'voting' && player.id === props.activeVoter?.id;
      let personal: ReactNode = player.cardReady ? '已完成' : '等待中';
      if (isCardOwner) personal = sensitiveVisible && currentAssignment
        ? <span className="sheet-secret-value">{currentAssignment.role === 'undercover' ? '卧底' : '平民'}｜{currentAssignment.word}</span>
        : <button className="sheet-secret" onClick={() => privacy.current?.reveal()} aria-label="显示个人信息，真实用途是查看你的身份和词语">••••••</button>;
      let selection: ReactNode = room.votes[player.id] ? '已完成' : '—';
      if (isVoter) selection = <div className="sheet-select-wrap"><select value={props.selectedCandidateId ?? ''} onChange={(event) => props.onCandidate(event.target.value || null)} aria-label="提交选择，真实用途是选择本轮投票对象"><option value="">请选择…</option>{eligibleCandidates(room).filter((candidate) => candidate.id !== player.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button disabled={!props.selectedCandidateId} onClick={props.onSubmitVote} aria-label="确认提交本轮投票选择">提交</button></div>;
      rows.push([String(player.seat).padStart(2, '0'), player.name, neutralStatus(room, player, props.activeCardPlayer, props.activeVoter), personal, selection, player.id === room.ownerId ? '负责人' : '']);
    });
    return rows;
  };

  const rows: ReactNode[][] = props.screen === 'home'
    ? [
        ['操作', '称呼', '协作表编号', '状态', '执行', '备注'],
        ['新建协作表', props.ownerName, '自动生成', '可用', <button key="create" className="sheet-action" onClick={props.onOpenSetup} aria-label="创建谁是卧底游戏房间">打开配置</button>, '6–12 人'],
        ['加入现有表', <input key="join-name" value={props.joinName} onChange={(event) => props.onJoinName(event.target.value.slice(0, 12))} placeholder="你的称呼" aria-label="加入游戏时使用的玩家称呼" />, <input key="join-code" value={props.joinCode} onChange={(event) => props.onJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} maxLength={6} placeholder="六位编号" aria-label="谁是卧底游戏房间码" />, props.cloudReady ? '联机可用' : '本机可用', <button key="join" className="sheet-action" disabled={props.busy} onClick={props.onJoin} aria-label="加入谁是卧底游戏房间">加入</button>, ''],
        ['', '', '', '', '', ''],
        ['说明', '低干扰显示', '不规避审计', '默认静音', '本地保存', '按 Esc 遮挡'],
      ]
    : props.screen === 'setup'
      ? [
          ['配置项', '当前值', '可选值', '说明', '状态', ''],
          ['负责人称呼', <input key="owner" value={props.ownerName} onChange={(event) => props.onOwnerName(event.target.value.slice(0, 12))} aria-label="谁是卧底游戏房主称呼" />, '', '创建后可修改成员名', '已完成', ''],
          ['成员数量', <select key="player-limit" value={props.playerLimit} onChange={(event) => props.onPlayerLimit(Number(event.target.value))} aria-label="谁是卧底玩家人数">{[6, 8, 10, 12].map((value) => <option key={value}>{value}</option>)}</select>, '6 / 8 / 10 / 12', '建议 8 人', '已完成', ''],
          ['特殊成员数量', <select key="undercover-count" value={props.undercoverCount} onChange={(event) => props.onUndercoverCount(Number(event.target.value))} aria-label="谁是卧底游戏卧底人数">{[1, 2].map((value) => <option key={value}>{value}</option>)}</select>, '1 / 2', '按人数自动建议', '已完成', ''],
          ['字段来源', <div key="word-source" className="sheet-inline"><button className={!props.customWords ? 'is-selected' : ''} onClick={props.onRandomWords} aria-label="随机生成谁是卧底词语">自动</button><button className={props.customWords ? 'is-selected' : ''} onClick={props.onCustomWords} aria-label="自定义谁是卧底词语">手动</button></div>, '', '两项内容需相近', '已完成', ''],
          ['字段 A', <input key="civilian-word" value={props.civilianWord} onChange={(event) => props.onCivilianWord(event.target.value)} aria-label="平民词语" />, '', '普通成员内容', props.civilianWord ? '已完成' : '待提交', ''],
          ['字段 B', <input key="undercover-word" value={props.undercoverWord} onChange={(event) => props.onUndercoverWord(event.target.value)} aria-label="卧底词语" />, '', '特殊成员内容', props.undercoverWord ? '已完成' : '待提交', ''],
        ]
      : gameRows();

  const isOwner = !props.remoteMode || props.currentPlayerId === props.room?.ownerId;
  const action = props.screen === 'setup'
    ? <div className="sheet-commandbar"><button onClick={props.onBackHome}>返回</button><button disabled={props.busy || !props.cloudReady} onClick={props.onCreateRemote} aria-label="创建多人联机谁是卧底房间">{props.busy ? '处理中…' : '创建联机表'}</button><button onClick={props.onCreateDemo} aria-label="在本机开始谁是卧底演示流程">本机预览</button></div>
    : props.screen === 'game' && props.room
      ? <div className="sheet-commandbar">
          {props.room.status === 'lobby' && isOwner && <button disabled={props.room.players.length !== props.room.playerLimit} onClick={props.onStartDealing} aria-label="锁定成员并为谁是卧底游戏发牌">{props.room.players.length === props.room.playerLimit ? '生成个人信息' : `等待 ${props.room.playerLimit - props.room.players.length} 人`}</button>}
          {props.room.status === 'cards' && props.activeCardPlayer && <button onClick={() => { privacy.current?.mask('sheet-change'); props.onConfirmCard(); }} aria-label="确认已经记住谁是卧底身份和词语">标记已完成</button>}
          {props.room.status === 'discussion' && isOwner && <button onClick={props.onBeginVoting} aria-label="开始谁是卧底本轮投票">开放提交选择</button>}
          {(props.room.status === 'result' || props.room.status === 'finished') && isOwner && <button onClick={props.room.status === 'finished' ? props.onRematch : props.onContinue} aria-label={props.room.status === 'finished' ? '重新开始谁是卧底游戏' : '继续谁是卧底下一轮'}>{props.room.status === 'finished' ? '新建一轮' : '进入下一轮'}</button>}
          <span>{props.room.status === 'voting' ? `${Object.keys(props.room.votes).length}/${eligibleVoters(props.room).length} 已完成` : neutralizeGameCopy(props.room.status)}</span>
        </div>
      : null;

  return <main className="sheet-app" onContextMenu={(event) => event.preventDefault()}>
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={props.onReset} aria-label="返回谁是卧底游戏首页">表</button>
      <div><strong>{props.room ? `协作数据表 · ${props.room.code}` : '协作数据表'}</strong><span>{props.remoteMode ? '已同步' : '已保存到本机'}</span></div>
      <div className="sheet-title-actions">{props.room && <button onClick={props.onCopyRoomCode} aria-label="复制谁是卧底游戏房间码">复制编号</button>}<button onClick={() => { privacy.current?.mask('mode-change'); props.onSwitchMode(); }} aria-label="切换到沉浸式谁是卧底游戏界面">沉浸模式</button></div>
    </header>
    <nav className="sheet-ribbon" aria-label="表格工具栏"><button className="is-current">开始</button><button>数据</button><button>视图</button><span /><button onClick={() => privacy.current?.mask('escape')} aria-label="立即隐藏身份和词语">隐藏敏感内容</button></nav>
    <div className="sheet-toolbar" aria-hidden="true"><span>撤销</span><span>重做</span><i /><b>系统字体</b><b>11</b><i /><strong>B</strong><em>I</em><u>U</u><i /><span>对齐</span><span>筛选</span><span>静音</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output aria-live="polite">{formulaValue}</output></div>
    {action}
    <Grid rows={rows} activeCell={activeCell} onActivate={setActiveCell} />
    <footer className="sheet-tabs"><button aria-label="新增工作表">＋</button>{sheetTabs.map((tab) => <button className={sheetTab === tab ? 'is-current' : ''} onClick={() => setSheetTab(tab)} key={tab}>{tabLabel(tab)}</button>)}<span /><small>低干扰显示不规避企业网络审计、终端监控或管理制度 · 闲置 {PRIVACY_IDLE_MS / 1000} 秒自动遮挡 · 显示 {PRIVATE_REVEAL_MS / 1000} 秒</small></footer>
    {props.notice && <div className={`sheet-toast sheet-toast--${props.notice.kind}`} role="status">{neutralizeGameCopy(props.notice.text)}</div>}
  </main>;
}
