'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { eligibleCandidates, eligibleVoters, PLAYER_LIMIT_OPTIONS, undercoverOptions, type GameRoom, type Player } from '@/lib/game';
import { neutralizeGameCopy } from '@/lib/neutral-copy';
import { createPrivacyGuard, PRIVATE_REVEAL_MS, PRIVACY_IDLE_MS, type PrivacyGuard } from '@/lib/privacy';

type Screen = 'home' | 'setup' | 'game';
type Notice = { kind: 'info' | 'error'; text: string } | null;
type SheetTab = 'members' | 'log' | `round-${string}`;
type SheetGuide = {
  step: number;
  title: string;
  instruction: string;
  location: string;
  focusCell: string;
  emphasizedCells: string[];
  cellHints: Partial<Record<string, string>>;
};

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

function Grid({ rows, activeCell, emphasizedCells, onActivate }: { rows: ReactNode[][]; activeCell: string; emphasizedCells: string[]; onActivate: (cell: string) => void }) {
  return <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label="协作数据表">
    <thead><tr><th className="sheet-corner" aria-hidden="true" />{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
    <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
      const coordinate = `${column}${rowIndex + 1}`;
      const className = [activeCell === coordinate ? 'is-active-cell' : '', emphasizedCells.includes(coordinate) ? 'is-guided-cell' : ''].filter(Boolean).join(' ');
      return <td className={className} onClick={() => onActivate(coordinate)} key={column}>{row[columnIndex] ?? ''}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}

export default function SpreadsheetMode(props: SpreadsheetModeProps) {
  const [sheetTab, setSheetTab] = useState<SheetTab>('members');
  const [cellSelection, setCellSelection] = useState<{ flowKey: string; cell: string } | null>(null);
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
  const isOwner = !props.remoteMode || props.currentPlayerId === props.room?.ownerId;
  const workflowGuide = useMemo<SheetGuide>(() => {
    if (props.screen === 'home') {
      return {
        step: 0,
        title: '新建或加入协作表',
        instruction: '新建请点 E2“打开配置”；加入请依次填写 B3 称呼、C3 六位编号，再点 E3“加入”。',
        location: '操作位置：E2；或 B3 → C3 → E3',
        focusCell: 'B3',
        emphasizedCells: ['E2', 'B3', 'C3', 'E3'],
        cellHints: { E2: '新建：点击“打开配置”', B3: '必填：填写你的称呼', C3: '必填：填写六位协作表编号', E3: '完成 B3、C3 后点击“加入”' },
      };
    }
    if (props.screen === 'setup') {
      return {
        step: 0,
        title: '填写创建配置',
        instruction: '沿 B 列从上到下检查配置。重点确认负责人称呼、字段来源，以及字段 A、字段 B；完成后点上方“创建联机表”。',
        location: '必填区域：B2–B7；提交按钮：表格上方',
        focusCell: 'B2',
        emphasizedCells: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'],
        cellHints: {
          B2: '必填：负责人称呼', B3: '必填：成员数量', B4: '必填：特殊成员数量', B5: '必填：选择自动或手动生成字段',
          B6: '必填：字段 A（普通成员内容）', B7: '必填：字段 B（特殊成员内容）',
        },
      };
    }
    const room = props.room;
    if (!room) return { step: 0, title: '等待载入', instruction: '正在读取协作表。', location: '无需操作', focusCell: 'A1', emphasizedCells: [], cellHints: {} };
    if (room.status === 'lobby') {
      return {
        step: 0,
        title: room.players.length === room.playerLimit ? '成员已到齐' : '等待成员加入',
        instruction: room.players.length === room.playerLimit
          ? (isOwner ? '成员已到齐，请点击表格上方“生成个人信息”。' : '成员已到齐，等待负责人生成个人信息。')
          : `复制顶部编号并分享；当前 ${room.players.length}/${room.playerLimit} 人。成员到齐后由负责人继续。`,
        location: '成员状态：C 列；继续操作：表格上方',
        focusCell: 'C2',
        emphasizedCells: room.players.map((_, index) => `C${index + 2}`),
        cellHints: {},
      };
    }
    if (room.status === 'cards') {
      const row = Math.max(0, room.players.findIndex((player) => player.id === props.activeCardPlayer?.id)) + 2;
      const cell = `D${row}`;
      return {
        step: 1,
        title: props.activeCardPlayer ? `${props.activeCardPlayer.name}：查看个人信息` : '等待其他成员完成',
        instruction: props.activeCardPlayer ? `点击 ${cell} 的“••••••”查看，记住后点击表格上方“标记已完成”。4 秒后会自动遮挡。` : '你的个人信息已完成，请等待其他成员。',
        location: props.activeCardPlayer ? `当前填写位置：${cell}（个人信息列）` : '进度位置：C 列',
        focusCell: props.activeCardPlayer ? cell : 'C2',
        emphasizedCells: props.activeCardPlayer ? [cell] : [],
        cellHints: props.activeCardPlayer ? { [cell]: '点击显示个人信息；记住后点上方“标记已完成”' } : {},
      };
    }
    if (room.status === 'discussion') {
      return {
        step: 2,
        title: `填写本轮内容 · Round_${String(room.round).padStart(2, '0')}`,
        instruction: isOwner ? '本轮内容在群聊或现场完成；准备好后点击表格上方“开放提交选择”。' : '本轮内容在群聊或现场完成，等待负责人开放提交选择。',
        location: '本阶段无需在单元格输入',
        focusCell: 'C2', emphasizedCells: [], cellHints: {},
      };
    }
    if (room.status === 'voting') {
      const row = Math.max(0, room.players.findIndex((player) => player.id === props.activeVoter?.id)) + 2;
      const cell = `E${row}`;
      return {
        step: 3,
        title: props.activeVoter ? `${props.activeVoter.name}：提交选择` : '等待其他成员提交',
        instruction: props.activeVoter ? `在 ${cell} 的下拉框选择成员，再点击同一单元格内的“提交”。` : '你的选择已提交，请等待其他成员。',
        location: props.activeVoter ? `当前填写位置：${cell}（提交选择列）` : '进度位置：C 列',
        focusCell: props.activeVoter ? cell : 'C2',
        emphasizedCells: props.activeVoter ? [cell] : [],
        cellHints: props.activeVoter ? { [cell]: '先选择成员，再点击“提交”' } : {},
      };
    }
    return {
      step: 4,
      title: room.status === 'finished' ? '流程已完成' : '查看本轮结果',
      instruction: isOwner ? (room.status === 'finished' ? '结果已汇总；点击上方“新建一轮”可重新开始。' : '结果已汇总；点击上方“进入下一轮”继续。') : '结果已汇总，等待负责人推进。',
      location: '结果：当前 Round 工作表；历史：操作记录',
      focusCell: 'D2', emphasizedCells: ['D2'], cellHints: { D2: '本轮公开结果' },
    };
  }, [props.screen, props.room, props.activeCardPlayer, props.activeVoter, isOwner]);

  const flowKey = `${props.screen}|${props.room?.status ?? ''}|${props.room?.round ?? ''}|${props.activeCardPlayer?.id ?? ''}|${props.activeVoter?.id ?? ''}`;
  const activeCell = cellSelection?.flowKey === flowKey ? cellSelection.cell : workflowGuide.focusCell;

  const formulaValue = sensitiveVisible && currentAssignment
    ? `${currentAssignment.role === 'undercover' ? '卧底' : '平民'}｜${currentAssignment.word}`
    : workflowGuide.cellHints[activeCell] ?? (activeCell === 'D2' && props.room?.status === 'cards' ? '••••••' : `=${tabLabel(sheetTab)}!${activeCell}`);

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
        ['新建协作表', props.ownerName, '自动生成', '可用', <button key="create" className="sheet-action" onClick={props.onOpenSetup} aria-label="创建谁是卧底游戏房间">打开配置</button>, '3–10 人 · ① 点击这里'],
        ['加入现有表', <input key="join-name" value={props.joinName} onChange={(event) => props.onJoinName(event.target.value.slice(0, 12))} placeholder="① 填写你的称呼" aria-label="加入游戏时使用的玩家称呼" />, <input key="join-code" value={props.joinCode} onChange={(event) => props.onJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} maxLength={6} placeholder="② 填写六位编号" aria-label="谁是卧底游戏房间码" />, props.cloudReady ? '联机可用' : '本机可用', <button key="join" className="sheet-action" disabled={props.busy} onClick={props.onJoin} aria-label="加入谁是卧底游戏房间">③ 加入</button>, '按 B → C → E'],
        ['', '', '', '', '', ''],
        ['说明', '低干扰显示', '不规避审计', '默认静音', '本地保存', '按 Esc 遮挡'],
      ]
    : props.screen === 'setup'
      ? [
          ['配置项', '当前值', '可选值', '说明', '状态', ''],
          ['负责人称呼', <input key="owner" value={props.ownerName} onChange={(event) => props.onOwnerName(event.target.value.slice(0, 12))} placeholder="填写负责人称呼" aria-label="谁是卧底游戏房主称呼" />, '', '创建后可修改成员名', props.ownerName.trim() ? '已完成' : '待提交', ''],
          ['成员数量', <select key="player-limit" value={props.playerLimit} onChange={(event) => props.onPlayerLimit(Number(event.target.value))} aria-label="谁是卧底玩家人数">{PLAYER_LIMIT_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select>, '3–10（每个整数）', '建议 8 人', '已完成', ''],
          ['特殊成员数量', <select key="undercover-count" value={props.undercoverCount} onChange={(event) => props.onUndercoverCount(Number(event.target.value))} aria-label="谁是卧底游戏卧底人数">{undercoverOptions(props.playerLimit).map((value) => <option key={value}>{value}</option>)}</select>, undercoverOptions(props.playerLimit).join(' / '), '按人数自动建议', '已完成', ''],
          ['字段来源', <div key="word-source" className="sheet-inline"><button className={!props.customWords ? 'is-selected' : ''} onClick={props.onRandomWords} aria-label="随机生成谁是卧底词语">自动</button><button className={props.customWords ? 'is-selected' : ''} onClick={props.onCustomWords} aria-label="自定义谁是卧底词语">手动</button></div>, '', '两项内容需相近', '已完成', ''],
          ['字段 A', <input key="civilian-word" value={props.civilianWord} onChange={(event) => props.onCivilianWord(event.target.value)} placeholder="填写普通成员内容" aria-label="平民词语" />, '', '普通成员内容', props.civilianWord ? '已完成' : '待提交', ''],
          ['字段 B', <input key="undercover-word" value={props.undercoverWord} onChange={(event) => props.onUndercoverWord(event.target.value)} placeholder="填写特殊成员内容" aria-label="卧底词语" />, '', '特殊成员内容', props.undercoverWord ? '已完成' : '待提交', ''],
        ]
      : gameRows();

  const action = props.screen === 'setup'
    ? <div className="sheet-commandbar"><button onClick={props.onBackHome}>返回</button><button className="sheet-primary-action" disabled={props.busy || !props.cloudReady} onClick={props.onCreateRemote} aria-label="创建多人联机谁是卧底房间">{props.busy ? '处理中…' : '创建联机表'}</button><button onClick={props.onCreateDemo} aria-label="在本机开始谁是卧底演示流程">本机预览</button><span>填写 B2–B7 后在这里提交</span></div>
    : props.screen === 'game' && props.room
      ? <div className="sheet-commandbar">
          {props.room.status === 'lobby' && isOwner && <button className="sheet-primary-action" disabled={props.room.players.length !== props.room.playerLimit} onClick={props.onStartDealing} aria-label="锁定成员并为谁是卧底游戏发牌">{props.room.players.length === props.room.playerLimit ? '生成个人信息' : `等待 ${props.room.playerLimit - props.room.players.length} 人`}</button>}
          {props.room.status === 'cards' && props.activeCardPlayer && <button className="sheet-primary-action" onClick={() => { privacy.current?.mask('sheet-change'); props.onConfirmCard(); }} aria-label="确认已经记住谁是卧底身份和词语">标记已完成</button>}
          {props.room.status === 'discussion' && isOwner && <button className="sheet-primary-action" onClick={props.onBeginVoting} aria-label="开始谁是卧底本轮投票">开放提交选择</button>}
          {(props.room.status === 'result' || props.room.status === 'finished') && isOwner && <button className="sheet-primary-action" onClick={props.room.status === 'finished' ? props.onRematch : props.onContinue} aria-label={props.room.status === 'finished' ? '重新开始谁是卧底游戏' : '继续谁是卧底下一轮'}>{props.room.status === 'finished' ? '新建一轮' : '进入下一轮'}</button>}
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
    <section className="sheet-flow-guide" aria-labelledby="sheet-current-guide">
      <ol aria-label="操作流程">{['配置', '个人信息', '本轮内容', '提交选择', '结果'].map((label, index) => <li className={index === workflowGuide.step ? 'is-current' : index < workflowGuide.step ? 'is-complete' : ''} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
      <div><span>当前操作</span><strong id="sheet-current-guide">{workflowGuide.title}</strong><p>{workflowGuide.instruction}</p><b>{workflowGuide.location}</b></div>
    </section>
    {action}
    <Grid rows={rows} activeCell={activeCell} emphasizedCells={workflowGuide.emphasizedCells} onActivate={(cell) => setCellSelection({ flowKey, cell })} />
    <footer className="sheet-tabs"><button aria-label="新增工作表">＋</button>{sheetTabs.map((tab) => <button className={sheetTab === tab ? 'is-current' : ''} onClick={() => setSheetTab(tab)} key={tab}>{tabLabel(tab)}</button>)}<span /><small>低干扰显示不规避企业网络审计、终端监控或管理制度 · 闲置 {PRIVACY_IDLE_MS / 1000} 秒自动遮挡 · 显示 {PRIVATE_REVEAL_MS / 1000} 秒</small></footer>
    {props.notice && <div className={`sheet-toast sheet-toast--${props.notice.kind}`} role="status">{neutralizeGameCopy(props.notice.text)}</div>}
  </main>;
}
