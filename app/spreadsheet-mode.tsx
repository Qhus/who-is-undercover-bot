'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { blankCardOptions, canAccuseUndercover, canTriggerBuzzer, challengeModeLabel, descriptionModeLabel, descriptionsAreRevealed, eligibleCandidates, eligibleVoters, getAccuseUnavailableReason, getBuzzerUnavailableReason, getDescriptionTurnPlayer, getRoundChallenge, getRoundContents, isRoundContentVisible, LIGHT_CHALLENGE_RULES, PLAYER_LIMIT_OPTIONS, PLAYER_NAME_MAX_LENGTH, RANDOM_CHALLENGE_RULES, ROUND_CONTENT_MAX_LENGTH, undercoverOptions, validateRoleCounts, type ChallengeMode, type DescriptionRevealMode, type GameRoom, type Player } from '@/lib/game';
import { neutralizeGameCopy } from '@/lib/neutral-copy';
import { createPrivacyGuard, PRIVATE_REVEAL_MS, PRIVACY_IDLE_MS, type PrivacyGuard } from '@/lib/privacy';
import { CURRENT_RELEASE } from '@/lib/release-notes';
import { wordPairHint } from '@/lib/words';

type Screen = 'home' | 'setup' | 'game';
type Notice = { kind: 'info' | 'error'; text: string } | null;
type SheetTab = 'members' | 'rules' | 'guide' | 'log' | `round-${string}`;
type LobbySettingsDraft = { playerLimit: number; undercoverCount: number; blankCardCount: number };
type SpecialActionConfirmation = { type: 'buzzer' | 'accuse'; playerId: string } | null;
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
  activeDiscussionPlayer: Player | null;
  activeVoter: Player | null;
  activeComebackPlayer: Player | null;
  wordReviewPlayer: Player | null;
  selectedCandidateId: string | null;
  roundContentDraft: string;
  discussionRemainingSeconds: number;
  votingOpenRemainingSeconds: number;
  comebackDraft: string;
  comebackRemainingSeconds: number;
  nextRoundRemainingSeconds: number;
  canOpenVoting: boolean;
  ownerName: string;
  playerLimit: number;
  undercoverCount: number;
  blankCardCount: number;
  civilianAccuseEnabled: boolean;
  lobbySettingsDraft: LobbySettingsDraft | null;
  accuseActorId: string | null;
  accuseTargetId: string | null;
  specialActionConfirmation: SpecialActionConfirmation;
  civilianWord: string;
  undercoverWord: string;
  blankHint: string;
  customWords: boolean;
  challengeMode: ChallengeMode;
  undercoverComebackEnabled: boolean;
  descriptionRevealMode: DescriptionRevealMode;
  buzzerEnabled: boolean;
  autoAdvanceEnabled: boolean;
  joinCode: string;
  joinName: string;
  onSwitchMode: () => void;
  onOpenSetup: () => void;
  onReviewWord: (playerId: string) => void;
  onBackHome: () => void;
  onReset: () => void;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
  onCopyCurrentRule: () => void;
  onJoin: () => void;
  onCreateDemo: () => void;
  onCreateRemote: () => void;
  onStartDealing: () => void;
  onConfirmCard: () => void;
  onRoundContentDraft: (value: string) => void;
  onSubmitRoundContent: () => void;
  onBeginVoting: () => void;
  onSkipDescription: () => void;
  onBuzzer: (playerId: string) => void;
  onSubmitVote: () => void;
  onComebackDraft: (value: string) => void;
  onSubmitComeback: () => void;
  onContinue: () => void;
  onToggleAutoAdvance: () => void;
  onRematch: () => void;
  onOwnerName: (value: string) => void;
  onPlayerLimit: (value: number) => void;
  onUndercoverCount: (value: number) => void;
  onBlankCardCount: (value: number) => void;
  onCivilianAccuseEnabled: (value: boolean) => void;
  onLobbySettingsDraft: (value: LobbySettingsDraft | null) => void;
  onSaveLobbySettings: (value: LobbySettingsDraft) => void;
  onOpenCivilianAccuse: (playerId: string) => void;
  onAccuseTarget: (id: string | null) => void;
  onCancelCivilianAccuse: () => void;
  onSubmitCivilianAccuse: () => void;
  onConfirmSpecialAction: () => void;
  onCancelSpecialAction: () => void;
  onCivilianWord: (value: string) => void;
  onUndercoverWord: (value: string) => void;
  onBlankHint: (value: string) => void;
  onRandomWords: () => void;
  onCustomWords: () => void;
  onChallengeMode: (value: ChallengeMode) => void;
  onUndercoverComebackEnabled: (value: boolean) => void;
  onDescriptionRevealMode: (value: DescriptionRevealMode) => void;
  onBuzzerEnabled: (value: boolean) => void;
  onAutoAdvanceEnabled: (value: boolean) => void;
  onJoinCode: (value: string) => void;
  onJoinName: (value: string) => void;
  onRenamePlayer: (id: string, name: string) => void;
  onCandidate: (id: string | null) => void;
  onToggleAway: (playerId: string) => void;
  onExitPlayer: (playerId: string) => void;
}

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];

function roundTab(round: number): `round-${string}` {
  return `round-${String(round).padStart(2, '0')}`;
}

function tabLabel(tab: SheetTab): string {
  if (tab === 'members') return '成员列表';
  if (tab === 'rules') return '规则说明';
  if (tab === 'guide') return '玩法说明';
  if (tab === 'log') return '操作记录';
  return `Round_${tab.slice(6)}`;
}

function neutralStatus(room: GameRoom, player: Player, activeCardPlayer: Player | null, activeDiscussionPlayer: Player | null, activeVoter: Player | null): string {
  if (!player.alive) return '本轮退出';
  if (player.away) return '暂退中';
  if (room.status === 'lobby') return '等待中';
  if (room.status === 'cards') return player.cardReady ? '已确认自己的词语' : player.id === activeCardPlayer?.id ? '待确认' : '等待中';
  if (room.status === 'discussion') return getRoundContents(room)[player.id] ? '已完成' : player.id === activeDiscussionPlayer?.id ? '待提交' : '等待中';
  if (room.status === 'voting') return room.votes[player.id] ? '已完成' : player.id === activeVoter?.id ? '待提交' : '等待中';
  if (room.status === 'guessing') return player.id === room.pendingComebackPlayerId ? '待提交' : '等待中';
  if (room.status === 'finished') return '已完成';
  return '等待中';
}

function formatCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function eliminatedUndercover(room: GameRoom): Player | null {
  const eliminatedId = room.lastResult?.eliminatedId;
  if (!eliminatedId || !['undercover', 'blank'].includes(room.assignments[eliminatedId]?.role ?? '')) return null;
  return room.players.find((player) => player.id === eliminatedId) ?? null;
}

function blankCardCopy(room: GameRoom): string {
  const hint = room.blankHint?.trim() || wordPairHint([room.civilianWord, room.undercoverWord]);
  return hint
    ? `你没有具体词语 · 范围提示：${hint}`
    : '你没有具体词语 · 请围绕使用场景、感受或特点进行模糊描述';
}

function specialActivityCopy(room: GameRoom): string | null {
  const name = (id: string) => room.players.find((player) => player.id === id)?.name ?? '一名成员';
  if (room.status === 'guessing' && room.pendingComebackPlayerId) {
    return room.pendingGuessingReason === 'buzzer'
      ? `${name(room.pendingComebackPlayerId)} 发起了猜词爆灯，正在私密输入多数玩家的原词。`
      : `${name(room.pendingComebackPlayerId)} 被投出后正在进行私密反猜。`;
  }
  const result = room.lastCivilianAccuseResult;
  if (result && result.round === room.round && room.status === 'voting') {
    return `${name(result.accuserId)} 发起了平民爆灯指认，系统已判定 ${name(result.eliminatedId)} 本轮退出。`;
  }
  return null;
}

function Grid({ rows, activeCell, emphasizedCells, onActivate }: { rows: ReactNode[][]; activeCell: string; emphasizedCells: string[]; onActivate: (cell: string) => void }) {
  return <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label="协作数据表">
    <thead><tr><th className="sheet-corner" aria-hidden="true" />{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
    <tbody>{rows.map((row, rowIndex) => <tr className={row[0] === '游玩步骤' || row[0] === '核心规则' ? 'is-guide-heading' : ''} key={rowIndex}><th scope="row">{rowIndex + 1}</th>{columns.map((column, columnIndex) => {
      const coordinate = `${column}${rowIndex + 1}`;
      const className = [activeCell === coordinate ? 'is-active-cell' : '', emphasizedCells.includes(coordinate) ? 'is-guided-cell' : ''].filter(Boolean).join(' ');
      return <td className={className} onClick={() => onActivate(coordinate)} key={column}>{row[columnIndex] ?? ''}</td>;
    })}</tr>)}</tbody>
  </table></div>;
}

export default function SpreadsheetMode(props: SpreadsheetModeProps) {
  const [sheetTab, setSheetTab] = useState<SheetTab>('members');
  const [returnSheetTab, setReturnSheetTab] = useState<SheetTab>('members');
  const [cellSelection, setCellSelection] = useState<{ flowKey: string; cell: string } | null>(null);
  const [sensitiveVisible, setSensitiveVisible] = useState(false);
  const [lobbyEditing, setLobbyEditing] = useState(false);
  const [guessAcknowledgedKey, setGuessAcknowledgedKey] = useState<string | null>(null);
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
    const tabs: SheetTab[] = ['members', 'rules', ...Array.from({ length: count }, (_, index) => roundTab(index + 1)), 'log'];
    return sheetTab === 'guide' ? [...tabs, 'guide'] : tabs;
  }, [props.room?.round, sheetTab]);

  function openGuideSheet() {
    if (sheetTab !== 'guide') setReturnSheetTab(sheetTab);
    setCellSelection(null);
    setSheetTab('guide');
  }

  function closeGuideSheet() {
    setCellSelection(null);
    setSheetTab(returnSheetTab === 'guide' ? 'members' : returnSheetTab);
  }

  const currentAssignment = props.room && props.wordReviewPlayer ? props.room.assignments[props.wordReviewPlayer.id] : null;
  const isOwner = !props.remoteMode || props.currentPlayerId === props.room?.ownerId;
  const lobbyDraft = props.lobbySettingsDraft ?? (props.room?.status === 'lobby' ? {
    playerLimit: props.room.playerLimit,
    undercoverCount: props.room.undercoverCount,
    blankCardCount: props.room.blankCardCount ?? 0,
  } : null);
  function updateLobbyDraft(patch: Partial<NonNullable<typeof lobbyDraft>>) {
    if (!lobbyDraft) return;
    props.onLobbySettingsDraft({ ...lobbyDraft, ...patch });
  }
  const workflowGuide = useMemo<SheetGuide>(() => {
    if (sheetTab === 'guide') {
      return {
        step: 0,
        title: '玩法说明工作表',
        instruction: '从第 2 行开始按 01–06 阅读游玩步骤，再查看下方核心规则；看完点击表格上方“返回之前的工作表”。',
        location: '游玩步骤：A2–F7；核心规则：A9–F15',
        focusCell: 'A2',
        emphasizedCells: ['A2', 'A9'],
        cellHints: { A2: '从这里开始阅读六步流程', A9: '继续阅读核心规则' },
      };
    }
    if (props.screen === 'home') {
      return {
        step: 0,
        title: '选择你的角色入口',
        instruction: '房主从 A2 开始创建房间；普通玩家从 A4 开始，依次填写 B4 称呼、C4 六位编号，再点 E4“加入”。',
        location: '房主入口：A2；玩家入口：A4',
        focusCell: 'A2',
        emphasizedCells: ['A2', 'A4'],
        cellHints: { A2: '房主入口：创建一个新房间', A4: '玩家入口：加入已有房间' },
      };
    }
    if (props.screen === 'setup') {
      return {
        step: 0,
        title: '填写创建配置',
        instruction: '沿 B 列从上到下检查配置。确认描述方式、爆灯和自动下一轮；完成后点上方“创建联机表”。',
        location: '配置区域：从 B2 向下检查；提交按钮：表格上方',
        focusCell: 'B2',
        emphasizedCells: ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15'],
        cellHints: {
          B2: '必填：负责人称呼', B3: '必填：成员数量', B4: '必填：卧底数量', B5: '选择空白牌数量', B6: '选择本轮挑战模式',
          B7: '选择描述公开方式', B8: '选择是否开启猜词翻盘', B9: '选择是否开启猜词爆灯', B10: '选择是否开启平民爆灯指认',
          B11: '选择是否自动进入下一轮', B12: '必填：选择自动或手动生成字段', B13: '必填：字段 A', B14: '必填：字段 B', B15: '启用空白牌时填写范围提示',
        },
      };
    }
    const room = props.room;
    if (!room) return { step: 0, title: '等待载入', instruction: '正在读取协作表。', location: '无需操作', focusCell: 'A1', emphasizedCells: [], cellHints: {} };
    const accuseActor = room.players.find((player) => player.id === props.accuseActorId);
    if (accuseActor && canAccuseUndercover(room, accuseActor.id)) {
      const firstRow = room.players.length + 2;
      const finalRow = firstRow + eligibleVoters(room).filter((player) => player.id !== accuseActor.id).length + 1;
      return {
        step: 3,
        title: `${accuseActor.name}：确认平民指认`,
        instruction: '在成员列表下方选择一名候选人，再到“最终操作”行确认；不想继续可点击“取消”。',
        location: `候选区域：A${firstRow}–F${finalRow}`,
        focusCell: `A${firstRow}`,
        emphasizedCells: [`A${firstRow}`, `E${finalRow}`],
        cellHints: { [`A${firstRow}`]: `发起人：${accuseActor.name}`, [`E${finalRow}`]: props.accuseTargetId ? '确认或取消本次指认' : '请先选择候选人' },
      };
    }
    if (room.status === 'lobby') {
      return {
        step: 0,
        title: room.players.length === room.playerLimit ? '成员已到齐' : '等待成员加入',
        instruction: room.players.length === room.playerLimit
          ? (isOwner ? '成员已到齐，请点击表格上方“生成个人信息”。' : '成员已到齐，等待负责人生成个人信息。')
          : `复制顶部编号并分享；当前 ${room.players.length}/${room.playerLimit} 人。所有人可在“规则说明”工作表查看本局设置。`,
        location: '成员状态：C 列；公共规则：规则说明；继续操作：表格上方',
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
        instruction: props.activeCardPlayer ? `点击 ${cell} 的“···”查看，记住后点击表格上方“已确认自己的词语”。4 秒后会自动遮挡。` : '你的词语已经确认，请等待其他成员。',
        location: props.activeCardPlayer ? `当前填写位置：${cell}（个人信息列）` : '进度位置：C 列',
        focusCell: props.activeCardPlayer ? cell : 'C2',
        emphasizedCells: props.activeCardPlayer ? [cell] : [],
        cellHints: props.activeCardPlayer ? { [cell]: '点击显示个人信息；记住后点上方“已确认自己的词语”' } : {},
      };
    }
    if (room.status === 'discussion') {
      const row = Math.max(0, room.players.findIndex((player) => player.id === props.activeDiscussionPlayer?.id)) + 2;
      const cell = `D${row}`;
      return {
        step: 2,
        title: `填写本轮内容 · ${formatCountdown(props.discussionRemainingSeconds)}`,
        instruction: props.activeDiscussionPlayer
          ? `在 ${cell} 输入本轮内容并点击“提交”；全员完成或倒计时结束后，由负责人继续。`
          : props.canOpenVoting ? `描述已经公开，${props.votingOpenRemainingSeconds} 秒后自动开放投票；房主也可提前开放。` : '你的内容已完成，等待其他成员或倒计时结束后统一公开。',
        location: props.activeDiscussionPlayer ? `当前填写位置：${cell}（本轮内容列）` : props.canOpenVoting ? `自动开放投票：${props.votingOpenRemainingSeconds} 秒` : `剩余时间：${formatCountdown(props.discussionRemainingSeconds)}`,
        focusCell: props.activeDiscussionPlayer ? cell : 'C2',
        emphasizedCells: props.activeDiscussionPlayer ? [cell] : [],
        cellHints: props.activeDiscussionPlayer ? { [cell]: '填写内容后点击同一单元格内的“提交”' } : {},
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
    if (room.status === 'guessing') {
      const row = Math.max(0, room.players.findIndex((player) => player.id === room.pendingComebackPlayerId)) + 2;
      const cell = `D${row}`;
      return {
        step: 4,
        title: props.activeComebackPlayer ? `填写特殊判定 · ${formatCountdown(props.comebackRemainingSeconds)}` : `等待特殊判定 · ${formatCountdown(props.comebackRemainingSeconds)}`,
        instruction: props.activeComebackPlayer ? `在 ${cell} 私密输入另一组词语并提交，只能尝试一次。` : '一名成员正在私密完成特殊判定，结果稍后统一公开。',
        location: props.activeComebackPlayer ? `当前填写位置：${cell}` : '当前无需填写',
        focusCell: props.activeComebackPlayer ? cell : 'C2',
        emphasizedCells: props.activeComebackPlayer ? [cell] : [],
        cellHints: props.activeComebackPlayer ? { [cell]: '私密输入另一组词语；20 秒内仅可提交一次' } : {},
      };
    }
    const foundUndercover = eliminatedUndercover(room);
    const comebackWon = room.lastComebackResult?.correct;
    return {
      step: 4,
      title: comebackWon ? '流程已完成' : foundUndercover ? `成功找出卧底：${foundUndercover.name}` : room.status === 'finished' ? '流程已完成' : '查看本轮结果',
      instruction: comebackWon ? '特殊判定已通过，本局结束；负责人可换词再来一局。' : foundUndercover
        ? (room.status === 'finished' ? '所有卧底已经找出，本局结束。' : isOwner ? '本轮命中卧底；点击上方“进入下一轮”继续。' : '本轮命中卧底，等待负责人推进。')
        : isOwner ? (room.status === 'finished' ? '结果已汇总；点击上方“换词再来一局”重新开始。' : (room.autoAdvanceEnabled ?? true) ? `${props.nextRoundRemainingSeconds} 秒后自动进入下一轮，可暂停或立即进入。` : '结果已汇总；点击上方“进入下一轮”继续。') : (room.status === 'result' && (room.autoAdvanceEnabled ?? true) ? `${props.nextRoundRemainingSeconds} 秒后自动进入下一轮。` : '结果已汇总，等待负责人推进。'),
      location: comebackWon ? '结果提示：特殊判定成功' : foundUndercover ? '结果提示：已成功找出卧底' : '结果：当前 Round 工作表；历史：操作记录',
      focusCell: 'D2', emphasizedCells: ['D2'], cellHints: { D2: comebackWon ? '流程已完成' : foundUndercover ? `成功找出卧底：${foundUndercover.name}` : '查看本轮结果' },
    };
  }, [sheetTab, props.screen, props.room, props.accuseActorId, props.accuseTargetId, props.activeCardPlayer, props.activeDiscussionPlayer, props.activeVoter, props.activeComebackPlayer, props.discussionRemainingSeconds, props.votingOpenRemainingSeconds, props.comebackRemainingSeconds, props.nextRoundRemainingSeconds, props.canOpenVoting, isOwner]);

  const flowKey = `${sheetTab}|${props.screen}|${props.room?.status ?? ''}|${props.room?.round ?? ''}|${props.activeCardPlayer?.id ?? ''}|${props.activeDiscussionPlayer?.id ?? ''}|${props.activeVoter?.id ?? ''}|${props.accuseActorId ?? ''}`;
  const activeCell = cellSelection?.flowKey === flowKey ? cellSelection.cell : workflowGuide.focusCell;

  const formulaValue = sensitiveVisible && currentAssignment
    ? (currentAssignment.role === 'blank' && props.room ? blankCardCopy(props.room) : currentAssignment.word)
    : workflowGuide.cellHints[activeCell] ?? (activeCell === 'D2' && props.room?.status === 'cards' ? '···' : `=${tabLabel(sheetTab)}!${activeCell}`);

  const gameRows = (): ReactNode[][] => {
    const room = props.room;
    if (!room) return [['状态', '等待载入', '', '', '', '']];
    const guessAcknowledgementKey = room.status === 'guessing' && room.pendingComebackPlayerId
      ? `${room.code}:${room.round}:${room.pendingComebackPlayerId}:${room.pendingGuessingReason ?? 'elimination'}:${room.comebackDeadlineAt ?? 0}`
      : null;
    const selectedRound = sheetTab.startsWith('round-') ? Number(sheetTab.slice(6)) : room.round;
    if (sheetTab === 'rules') {
      const pool = room.challengeMode === 'random' ? RANDOM_CHALLENGE_RULES : room.challengeMode === 'light' ? LIGHT_CHALLENGE_RULES : [];
      return [
        ['规则项目', '当前设置', '适用范围', '说明', '状态', ''],
        ['角色配置', `${room.playerLimit} 人 / ${room.undercoverCount} 名卧底 / ${room.blankCardCount ?? 0} 张空白牌`, '整局', '空白牌没有词语，与卧底同属特殊阵营', '已完成', ''],
        ['本轮挑战', challengeModeLabel(room.challengeMode ?? 'off'), '每轮公共', getRoundChallenge(room, room.round)?.text ?? '无附加规则', '已完成', ''],
        ['描述方式', descriptionModeLabel(room.descriptionRevealMode ?? 'all_submitted'), '每轮公共', '统一公开或按座位顺序公开', descriptionsAreRevealed(room) ? '已公开' : '等待中', ''],
        ['特殊判定', room.undercoverComebackEnabled ? '开启' : '关闭', '特殊成员方每局一次', '20 秒内输入多数玩家拿到的完整原词', room.undercoverComebackUsed ? '已完成' : '等待中', ''],
        ['猜词爆灯', room.buzzerEnabled ? '开启' : '关闭', '全局一次', '猜错或超时立即退出', room.buzzerUsedBy ? '已使用' : '等待中', ''],
        ['平民爆灯指认', room.civilianAccuseEnabled ? '开启' : '关闭', '每局一次', '描述公开后可指认；指错则发起者退出', room.civilianAccuseUsedBy ? '已使用' : '等待中', ''],
        ['自动下一轮', (room.autoAdvanceEnabled ?? true) ? '开启' : '关闭', '结果阶段', `${room.autoAdvanceDelaySeconds ?? 7} 秒后自动进入`, room.autoAdvancePaused ? '已暂停' : '等待中', ''],
        ['规则执行', '玩家自觉遵守', '本轮内容', '当前不校验、不拦截提交', '已完成', ''],
        ...pool.map((rule, index) => [`规则池 ${String(index + 1).padStart(2, '0')}`, rule.text, challengeModeLabel(room.challengeMode ?? 'off'), '每轮随机且尽量不连续重复', '等待中', '']),
      ];
    }
    if (sheetTab === 'log') {
      const rows: ReactNode[][] = [['时间', '操作', '对象', '状态', '备注', '']];
      rows.push(['当前', `Round_${String(room.round).padStart(2, '0')}`, '全体成员', neutralizeGameCopy(room.status), getRoundChallenge(room, room.round)?.text ?? '无附加规则', '']);
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
      const contents = getRoundContents(room, selectedRound);
      if (!history.length && !Object.keys(contents).length) return [['轮次', '状态', '成员', '描述', '备注', ''], [`Round_${String(selectedRound).padStart(2, '0')}`, '等待中', '—', '—', '尚未开始', '']];
      return [['轮次', '成员', '本轮描述', '状态', '票数记录', ''], ...room.players.map((player) => [
        `Round_${String(selectedRound).padStart(2, '0')}`,
        player.name,
        contents[player.id] ?? '本轮未提交',
        history.some((result) => result.eliminatedId === player.id) ? '本轮退出' : '已完成',
        history.map((result) => result.counts[player.id] ?? 0).join(' / ') || '0',
        '',
      ])];
    }

    const showsRoundContent = room.status === 'discussion' || room.status === 'voting';
    const header: ReactNode[] = ['序号', '成员', '本轮状态', showsRoundContent ? '本轮内容' : room.status === 'result' || room.status === 'finished' ? '本轮结果' : '个人信息', '提交选择', '备注 / 操作'];
    const rows: ReactNode[][] = [header];
    room.players.forEach((player) => {
      const isCardOwner = room.status === 'cards' && player.id === props.activeCardPlayer?.id;
      const isContentOwner = room.status === 'discussion' && player.id === props.activeDiscussionPlayer?.id;
      const isVoter = room.status === 'voting' && player.id === props.activeVoter?.id;
      const isComebackPlayer = room.status === 'guessing' && player.id === props.activeComebackPlayer?.id;
      let personal: ReactNode = player.cardReady ? '已完成' : '等待中';
      if (isCardOwner) personal = sensitiveVisible && currentAssignment
        ? <span className="sheet-secret-value">{currentAssignment.role === 'blank' ? blankCardCopy(room) : currentAssignment.word}</span>
        : <button className="sheet-secret" onClick={() => privacy.current?.reveal()} aria-label="显示个人信息，真实用途是查看自己的秘密词语，不显示角色">···</button>;
    if (room.status === 'discussion') {
      if (!player.alive || player.away) personal = '无需提交';
      else {
        const submittedContent = getRoundContents(room)[player.id];
        personal = submittedContent
          ? isRoundContentVisible(room, player.id, props.currentPlayerId) ? submittedContent : '已提交，等待公开'
          : (room.skippedDescriptionPlayerIds ?? []).includes(player.id) ? '本轮未提交' : '等待中';
        if (isContentOwner) personal = <div className="sheet-content-input"><input value={props.roundContentDraft} maxLength={ROUND_CONTENT_MAX_LENGTH} onChange={(event) => props.onRoundContentDraft(event.target.value)} placeholder={`填写本轮描述｜规则：${getRoundChallenge(room, room.round)?.text ?? '自由表达'}`} aria-label="填写谁是卧底本轮描述内容" /><button disabled={!props.roundContentDraft.trim()} onClick={props.onSubmitRoundContent} aria-label="提交谁是卧底本轮描述内容">提交</button></div>;
      }
    }
      if (room.status === 'voting') personal = player.alive && !player.away ? getRoundContents(room)[player.id] ?? '本轮未提交' : '无需提交';
      if (room.status === 'guessing') personal = isComebackPlayer
        ? guessAcknowledgedKey !== guessAcknowledgementKey
          ? <div className="sheet-content-input"><span>输入多数玩家拿到的完整原词；身份不符、答案不一致或超时都会退出。倒计时正在继续。</span><button className="sheet-action" onClick={() => setGuessAcknowledgedKey(guessAcknowledgementKey)}>我已了解，开始反猜</button></div>
          : <div className="sheet-content-input"><input value={props.comebackDraft} onChange={(event) => props.onComebackDraft(event.target.value.slice(0, 30))} placeholder={`输入多数玩家拿到的完整原词 · ${formatCountdown(props.comebackRemainingSeconds)}`} aria-label="输入多数玩家拿到的完整原词" /><button disabled={!props.comebackDraft.trim()} onClick={props.onSubmitComeback} aria-label="提交私密反猜答案">提交</button></div>
        : '特殊判定中';
      if (room.status === 'result' || room.status === 'finished') {
        personal = room.lastResult?.eliminatedId === player.id
          ? room.lastComebackResult?.correct ? '特殊判定成功' : eliminatedUndercover(room) ? '成功找出卧底' : '本轮退出'
          : '—';
      }
      if (sensitiveVisible && props.wordReviewPlayer?.id === player.id && player.cardReady && (room.status === 'discussion' || room.status === 'voting' || room.status === 'result')) {
        const assignment = room.assignments[player.id];
        personal = <span className="sheet-secret-value">{assignment?.role === 'blank' ? blankCardCopy(room) : assignment?.word}</span>;
      }
      let selection: ReactNode = room.votes[player.id] ? '已完成' : '—';
      if (isVoter) selection = <div className="sheet-select-wrap"><select value={props.selectedCandidateId ?? ''} onChange={(event) => props.onCandidate(event.target.value || null)} aria-label="提交选择，真实用途是选择本轮投票对象"><option value="">请选择…</option>{eligibleCandidates(room).filter((candidate) => candidate.id !== player.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button disabled={!props.selectedCandidateId} onClick={props.onSubmitVote} aria-label="确认提交本轮投票选择">提交</button></div>;
      const controlsCurrentPlayer = !props.remoteMode || props.currentPlayerId === player.id;
      const showSpecialControls = room.status === 'discussion' || room.status === 'voting';
      const buzzerReason = getBuzzerUnavailableReason(room, player.id);
      const accuseReason = getAccuseUnavailableReason(room, player.id);
      const canBuzz = canTriggerBuzzer(room, player.id) && controlsCurrentPlayer;
      const canReview = player.cardReady && (room.status === 'discussion' || room.status === 'voting' || room.status === 'result') && (!props.remoteMode || props.currentPlayerId === player.id);
      const canControlPresence = room.status !== 'finished' && player.alive && (!props.remoteMode || props.currentPlayerId === player.id);
      const canAccuse = canAccuseUndercover(room, player.id) && controlsCurrentPlayer;
      const note = <div className="sheet-inline">{player.id === room.ownerId && <span>负责人</span>}{canReview && room.status !== 'cards' && <button className="sheet-secret" onClick={() => { props.onReviewWord(player.id); window.setTimeout(() => privacy.current?.reveal(), 0); }} aria-label={`${player.name} 再次查看自己的词语`}>···</button>}{showSpecialControls && room.buzzerEnabled && controlsCurrentPlayer && <button disabled={!canBuzz} title={buzzerReason ?? '可发起'} onClick={() => props.onBuzzer(player.id)} aria-label={`${player.name} 猜词爆灯`}>{canBuzz ? '猜词爆灯' : `猜词爆灯 · ${buzzerReason}`}</button>}{showSpecialControls && room.civilianAccuseEnabled && controlsCurrentPlayer && <button disabled={!canAccuse} title={accuseReason ?? '可发起'} onClick={() => props.onOpenCivilianAccuse(player.id)} aria-label={`${player.name} 打开平民爆灯指认`}>{canAccuse ? '平民爆灯指认' : `平民爆灯 · ${accuseReason}`}</button>}{canControlPresence && <button onClick={() => props.onToggleAway(player.id)}>{player.away ? '返回' : '暂退'}</button>}{canControlPresence && <button onClick={() => props.onExitPlayer(player.id)}>退出</button>}</div>;
      rows.push([String(player.seat).padStart(2, '0'), player.name, neutralStatus(room, player, props.activeCardPlayer, props.activeDiscussionPlayer, props.activeVoter), personal, selection, note]);
    });
    const activity = specialActivityCopy(room);
    if (activity) rows.push(['全体提示', activity, '', '不公开身份、答案或未完成的选择', '进行中', '']);
    if (room.status === 'lobby') {
      const settings = lobbyDraft ?? { playerLimit: room.playerLimit, undercoverCount: room.undercoverCount, blankCardCount: room.blankCardCount ?? 0 };
      let validation = '';
      try { validateRoleCounts(settings.playerLimit, settings.undercoverCount, settings.blankCardCount); if (settings.playerLimit < room.players.length) validation = '总人数不能少于已加入人数'; } catch (error) { validation = error instanceof Error ? error.message : '配置不合法'; }
      const editing = isOwner && lobbyEditing && Boolean(props.lobbySettingsDraft);
      rows.push(['设置', '总人数', editing ? <select value={settings.playerLimit} onChange={(event) => { const value = Number(event.target.value); const allowedUndercover = undercoverOptions(value, settings.blankCardCount); const undercover = allowedUndercover.includes(settings.undercoverCount) ? settings.undercoverCount : allowedUndercover[0] ?? 1; const blank = blankCardOptions(value, undercover).includes(settings.blankCardCount) ? settings.blankCardCount : 0; updateLobbyDraft({ playerLimit: value, undercoverCount: undercover, blankCardCount: blank }); }} aria-label="等待房间总人数">{PLAYER_LIMIT_OPTIONS.map((value) => <option value={value} key={value}>{value}</option>)}</select> : `${room.playerLimit} 人`, '等待房间可调整', '', isOwner && !editing ? '房主可编辑' : '']);
      rows.push(['设置', '卧底人数', editing ? <select value={settings.undercoverCount} onChange={(event) => { const undercover = Number(event.target.value); const blank = blankCardOptions(settings.playerLimit, undercover).includes(settings.blankCardCount) ? settings.blankCardCount : 0; updateLobbyDraft({ undercoverCount: undercover, blankCardCount: blank }); }} aria-label="等待房间卧底人数">{undercoverOptions(settings.playerLimit, settings.blankCardCount).map((value) => <option value={value} key={value}>{value}</option>)}</select> : `${room.undercoverCount} 人`, '特殊阵营配置', '', '']);
      rows.push(['设置', '空白牌人数', editing ? <select value={settings.blankCardCount} onChange={(event) => updateLobbyDraft({ blankCardCount: Number(event.target.value) })} aria-label="等待房间空白牌人数">{blankCardOptions(settings.playerLimit, settings.undercoverCount).map((value) => <option value={value} key={value}>{value}</option>)}</select> : `${room.blankCardCount ?? 0} 张`, '0–1 张；没有词语', '', '']);
      rows.push(['设置', editing ? '保存配置' : '配置操作', editing ? <div className="sheet-inline"><button className="sheet-action" disabled={Boolean(validation)} onClick={() => { props.onSaveLobbySettings(settings); setLobbyEditing(false); }}>保存等待房间设置</button><button onClick={() => { props.onLobbySettingsDraft(null); setLobbyEditing(false); }}>取消修改</button></div> : isOwner ? <button className="sheet-action" onClick={() => { props.onLobbySettingsDraft({ playerLimit: room.playerLimit, undercoverCount: room.undercoverCount, blankCardCount: room.blankCardCount ?? 0 }); setLobbyEditing(true); }}>编辑配置</button> : '—', editing ? (validation || '三个配置一次保存，不影响已加入成员') : '房主可编辑，其他玩家只读', '', '']);
    }
    const pendingSpecialActor = room.players.find((player) => player.id === props.specialActionConfirmation?.playerId);
    if (pendingSpecialActor && (!props.remoteMode || pendingSpecialActor.id === props.currentPlayerId)) {
      const isBuzzer = props.specialActionConfirmation?.type === 'buzzer';
      rows.push([
        '操作确认',
        isBuzzer ? '猜词爆灯' : '平民爆灯指认',
        pendingSpecialActor.name,
        isBuzzer
          ? '输入你认为多数玩家拿到的完整原词；只有卧底或空白牌答对才获胜，身份不符、答案不一致或超时都会退出'
          : '平民指中特殊阵营则目标退出；指错或由特殊阵营发起，发起者退出',
        <div key="special-confirm-actions" className="sheet-inline"><button className="sheet-action" onClick={props.onConfirmSpecialAction}>我已了解，继续</button><button onClick={props.onCancelSpecialAction}>取消</button></div>,
        '本局机会仅一次',
      ]);
    }
    const accuseActor = room.players.find((player) => player.id === props.accuseActorId);
    if (accuseActor && canAccuseUndercover(room, accuseActor.id) && (!props.remoteMode || accuseActor.id === props.currentPlayerId)) {
      const targetOptions = eligibleVoters(room).filter((player) => player.id !== accuseActor.id);
      rows.push(['指认', '发起人', accuseActor.name, '指中卧底或空白牌则目标退出；指错则自己退出', '本局仅一次', '']);
      rows.push(...targetOptions.map((candidate) => [
        '候选',
        candidate.name,
        candidate.id === props.accuseTargetId ? '已选择' : '在场',
        candidate.id === props.accuseTargetId ? '等待最终确认' : '可指认',
        <button key={`accuse-${candidate.id}`} className={candidate.id === props.accuseTargetId ? 'sheet-action' : ''} onClick={() => props.onAccuseTarget(candidate.id)} aria-label={`选择 ${candidate.name} 作为平民爆灯指认对象`}>{candidate.id === props.accuseTargetId ? '已选择' : '选择'}</button>,
        '',
      ]));
      rows.push(['指认', '最终操作', props.accuseTargetId ? `将指认：${targetOptions.find((player) => player.id === props.accuseTargetId)?.name ?? '未知成员'}` : '尚未选择目标', '确认后不可撤销，并会清空当前票数', <div key="accuse-actions" className="sheet-inline"><button className="sheet-action" disabled={!props.accuseTargetId} onClick={props.onSubmitCivilianAccuse}>确认指认</button><button onClick={props.onCancelCivilianAccuse}>取消</button></div>, '']);
    }
    return rows;
  };

  const guideRows: ReactNode[][] = [
    ['游玩步骤', '序号', '要做什么', '操作说明', '关键提醒', ''],
    ['开始这里', '01', '创建或加入房间', '房主创建房间并分享六位编号；其他玩家填写称呼和编号加入。', '所有人进入同一个房间', ''],
    ['下一步', '02', '私密查看词语', '每人只查看自己的词语，记住后点击“已确认自己的词语”。', '不要让旁边的人看到', ''],
    ['然后', '03', '提交一条描述', '根据自己的词语写一条描述；顺序模式每人独立 120 秒，描述公开 5 秒后自动投票。', '暂退或退出显示“无需提交”', ''],
    ['接着', '04', '匿名投票', '阅读所有人的描述，选择最像卧底的人；不能选择自己。', '只公开总票数', ''],
    ['查看', '05', '处理本轮结果', '最高票玩家退出；首次平票会复投，复投仍平票则本轮无人退出。', '系统自动判断胜负', ''],
    ['继续', '06', '进入下一轮', '未结束时结果页等待 7 秒自动进入下一轮，房主也可暂停或立即进入。', '结束后公开身份和词语', ''],
    ['', '', '', '', '', ''],
    ['核心规则', '项目', '规则', '说明', '适用范围', ''],
    ['角色', '平民、卧底与空白牌', '平民拿到同一个词，卧底拿到相近但不同的词；空白牌没有词语。', '空白牌根据其他人的描述发挥，身份只在结束后公开。', '整局', ''],
    ['描述', '每人每轮一次', '描述最多 80 字，不能直接说出自己的词语。', '统一公开模式下，别人提交前看不到你的描述。', '每轮', ''],
    ['离开', '暂退 / 退出', '暂退可返回且不影响胜负；退出视作淘汰且本局不能返回。', '投票名单变化时已投内容会清空。', '整局', ''],
    ['投票', '存活玩家一人一票', '不能投自己或已经退出的玩家；不公开谁投了谁。', '首次平票只在最高票玩家中复投。', '每轮', ''],
    ['胜负', '系统自动判定', '特殊阵营（卧底＋空白牌）全部退出则平民获胜；特殊阵营人数不低于平民人数则特殊阵营获胜。', '特殊阵营胜利也显示“流程已完成”。', '整局', ''],
    ['空白牌', '没有具体词语', '开局会获得宽泛的范围提示；请围绕使用场景、感受或特点进行模糊描述。', '猜出多数玩家的完整原词可为特殊阵营赢得胜利。', '开启时', ''],
    ['平民爆灯指认', '每局一次', '描述公开后，任一在场玩家可指认目标；指中卧底或空白牌目标退出。', '指错或特殊阵营发起，发起者退出；使用后清空票数。', '开启时', ''],
    ['猜词爆灯', '特殊阵营主动猜词', '描述公开后可猜另一组词；猜错或超时会立即退出。', '每局全局只能成功触发一次。', '开启时', ''],
    ['隐私', '轮流操作', '词语最多显示 4 秒；松开、按 Esc、切走页面或窗口失焦都会遮挡。', '熟人娱乐工具，不防开发者工具作弊。', '整局', ''],
  ];

  const rows: ReactNode[][] = sheetTab === 'guide'
    ? guideRows
    : props.screen === 'home'
    ? [
        ['操作', '称呼', '协作表编号', '状态', '执行', '备注'],
        ['创建房间（房主入口）', props.ownerName, '自动生成', '可用', <button key="create" className="sheet-action" onClick={props.onOpenSetup} aria-label="创建谁是卧底游戏房间">打开配置</button>, '成员识别表 · 3–10 人'],
        ['玩法与完整规则', '新手推荐先读', '六步游玩流程', '核心规则', <button key="guide" className="sheet-action" onClick={openGuideSheet} aria-label="在表格中查看谁是卧底游玩步骤与核心规则">查看说明</button>, '开局前可随时查看'],
        ['加入房间（玩家入口）', <input key="join-name" value={props.joinName} maxLength={PLAYER_NAME_MAX_LENGTH} onChange={(event) => props.onJoinName(event.target.value.slice(0, PLAYER_NAME_MAX_LENGTH))} placeholder="① 填写你的称呼" aria-label="加入游戏时使用的玩家称呼" />, <input key="join-code" value={props.joinCode} onChange={(event) => props.onJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} maxLength={6} placeholder="② 填写六位编号" aria-label="谁是卧底游戏房间码" />, props.cloudReady ? '联机可用' : '本机可用', <button key="join" className="sheet-action" disabled={props.busy} onClick={props.onJoin} aria-label="加入谁是卧底游戏房间">③ 加入</button>, 'A4 · 按 B4 → C4 → E4'],
        ['', '', '', '', '', ''],
        ['说明', '低干扰显示', '不规避审计', '默认静音', '本地保存', '按 Esc 遮挡'],
      ]
    : props.screen === 'setup'
      ? [
          ['配置项', '当前值', '可选值', '说明', '状态', ''],
          ['负责人称呼', <input key="owner" value={props.ownerName} maxLength={PLAYER_NAME_MAX_LENGTH} onChange={(event) => props.onOwnerName(event.target.value.slice(0, PLAYER_NAME_MAX_LENGTH))} placeholder="填写负责人称呼" aria-label="谁是卧底游戏房主称呼" />, `最多 ${PLAYER_NAME_MAX_LENGTH} 字`, '创建后可修改成员名', props.ownerName.trim() ? '已完成' : '待提交', ''],
          ['成员数量', <select key="player-limit" value={props.playerLimit} onChange={(event) => props.onPlayerLimit(Number(event.target.value))} aria-label="谁是卧底玩家人数">{PLAYER_LIMIT_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select>, '3–10（每个整数）', '建议 8 人', '已完成', ''],
          ['卧底人数', <select key="undercover-count" value={props.undercoverCount} onChange={(event) => props.onUndercoverCount(Number(event.target.value))} aria-label="谁是卧底游戏卧底人数">{undercoverOptions(props.playerLimit, props.blankCardCount).map((value) => <option key={value}>{value}</option>)}</select>, undercoverOptions(props.playerLimit, props.blankCardCount).join(' / '), '按人数与空白牌数量自动限制', '已完成', ''],
          ['空白牌人数', <select key="blank-count" value={props.blankCardCount} onChange={(event) => props.onBlankCardCount(Number(event.target.value))} aria-label="空白牌人数">{blankCardOptions(props.playerLimit, props.undercoverCount).map((value) => <option key={value} value={value}>{value}</option>)}</select>, blankCardOptions(props.playerLimit, props.undercoverCount).join(' / '), '没有具体词语；获得范围提示后同步提交', '已完成', ''],
          ['本轮挑战', <select key="challenge-mode" value={props.challengeMode} onChange={(event) => props.onChallengeMode(event.target.value as ChallengeMode)} aria-label="选择谁是卧底每轮公共挑战模式"><option value="off">关闭</option><option value="light">轻度</option><option value="random">随机</option></select>, '关闭 / 轻度 / 随机', '每轮公开；玩家自觉遵守', '已完成', ''],
          ['描述方式', <select key="description-mode" value={props.descriptionRevealMode} onChange={(event) => props.onDescriptionRevealMode(event.target.value as DescriptionRevealMode)} aria-label="选择谁是卧底描述公开方式"><option value="all_submitted">全部提交后公开</option><option value="sequential">按座位顺序公开</option></select>, '统一公开 / 依次公开', '默认统一公开，避免模仿', '已完成', ''],
          ['特殊判定', <select key="comeback" value={props.undercoverComebackEnabled ? 'on' : 'off'} onChange={(event) => props.onUndercoverComebackEnabled(event.target.value === 'on')} aria-label="选择是否开启卧底猜词翻盘"><option value="off">关闭</option><option value="on">开启</option></select>, '关闭 / 开启', '特殊成员方每局一次，输入多数玩家的完整原词', '已完成', ''],
          ['猜词爆灯', <select key="buzzer" value={props.buzzerEnabled ? 'on' : 'off'} onChange={(event) => props.onBuzzerEnabled(event.target.value === 'on')} aria-label="选择是否开启谁是卧底猜词爆灯"><option value="off">关闭</option><option value="on">开启</option></select>, '关闭 / 开启', '特殊阵营主动猜词，猜错或超时立即退出', '已完成', ''],
          ['平民爆灯指认', <select key="civilian-accuse" value={props.civilianAccuseEnabled ? 'on' : 'off'} onChange={(event) => props.onCivilianAccuseEnabled(event.target.value === 'on')} aria-label="选择是否开启平民爆灯指认"><option value="off">关闭</option><option value="on">开启</option></select>, '关闭 / 开启', '描述公开后每局一次，指错则发起者退出', '已完成', ''],
          ['自动下一轮', <select key="auto-advance" value={props.autoAdvanceEnabled ? 'on' : 'off'} onChange={(event) => props.onAutoAdvanceEnabled(event.target.value === 'on')} aria-label="选择是否自动进入谁是卧底下一轮"><option value="on">开启</option><option value="off">关闭</option></select>, '开启 / 关闭', '结果展示 7 秒后自动进入', '已完成', ''],
          ['字段来源', <div key="word-source" className="sheet-inline"><button className={!props.customWords ? 'is-selected' : ''} onClick={props.onRandomWords} aria-label="随机生成谁是卧底词语">自动</button><button className={props.customWords ? 'is-selected' : ''} onClick={props.onCustomWords} aria-label="自定义谁是卧底词语">手动</button></div>, '', '两项内容需相近', '已完成', ''],
          ['字段 A', <input key="civilian-word" value={props.civilianWord} onChange={(event) => props.onCivilianWord(event.target.value)} placeholder="填写普通成员内容" aria-label="平民词语" />, '', '普通成员内容', props.civilianWord ? '已完成' : '待提交', ''],
          ['字段 B', <input key="undercover-word" value={props.undercoverWord} onChange={(event) => props.onUndercoverWord(event.target.value)} placeholder="填写特殊成员内容" aria-label="卧底词语" />, '', '特殊成员内容', props.undercoverWord ? '已完成' : '待提交', ''],
          ...(props.blankCardCount > 0 ? [['空白牌范围提示', <input key="blank-hint" value={props.blankHint} maxLength={30} onChange={(event) => props.onBlankHint(event.target.value.slice(0, 30))} placeholder="例如：工作或学习场景" aria-label="空白牌范围提示" />, '只让空白牌本人看到', '填写宽泛类别，不要包含具体答案', props.blankHint.trim() ? '已完成' : '待提交', '']] : []),
        ]
      : gameRows();

  const action = sheetTab === 'guide'
    ? <div className="sheet-commandbar"><button className="sheet-primary-action" onClick={closeGuideSheet} aria-label={`返回之前的工作表：${tabLabel(returnSheetTab)}`}>← 返回之前的工作表</button><span>返回后恢复：{tabLabel(returnSheetTab)}</span></div>
    : props.screen === 'setup'
    ? <div className="sheet-commandbar"><button onClick={props.onBackHome}>返回</button><button className="sheet-primary-action" disabled={props.busy || !props.cloudReady} onClick={props.onCreateRemote} aria-label="创建多人联机谁是卧底房间">{props.busy ? '处理中…' : '创建联机表'}</button><button onClick={props.onCreateDemo} aria-label="在本机开始谁是卧底演示流程">本机预览</button><span>沿 B 列检查全部配置后在这里提交</span></div>
    : props.screen === 'game' && props.room
      ? <div className="sheet-commandbar">
          {props.room.status === 'lobby' && isOwner && <button className="sheet-primary-action" disabled={props.room.players.length !== props.room.playerLimit} onClick={props.onStartDealing} aria-label="锁定成员并为谁是卧底游戏发牌">{props.room.players.length === props.room.playerLimit ? '生成个人信息' : `等待 ${props.room.playerLimit - props.room.players.length} 人`}</button>}
          {props.room.status === 'cards' && props.activeCardPlayer && <button className="sheet-primary-action" onClick={() => { privacy.current?.mask('sheet-change'); props.onConfirmCard(); }} aria-label="已确认自己的词语">已确认自己的词语</button>}
          {props.room.status === 'discussion' && isOwner && <button className="sheet-primary-action" disabled={!props.canOpenVoting} onClick={props.onBeginVoting} aria-label="开始谁是卧底本轮投票">{props.canOpenVoting ? `立即开放投票（${props.votingOpenRemainingSeconds} 秒后自动）` : `等待本轮内容 ${formatCountdown(props.discussionRemainingSeconds)}`}</button>}
          {props.room.status === 'discussion' && isOwner && (props.room.descriptionRevealMode ?? 'all_submitted') === 'sequential' && getDescriptionTurnPlayer(props.room) && <button onClick={props.onSkipDescription}>跳过当前描述</button>}
          {props.room.status === 'result' && isOwner && <><button className="sheet-primary-action" onClick={props.onContinue}>立即进入下一轮</button>{(props.room.autoAdvanceEnabled ?? true) && <button onClick={props.onToggleAutoAdvance}>{props.room.autoAdvancePaused ? '继续自动进入' : '暂停自动进入'}</button>}</>}
          {props.room.status === 'finished' && isOwner && <button className="sheet-primary-action" onClick={props.onRematch} aria-label="更换词语并重新开始谁是卧底游戏">换词再来一局</button>}
          <span>{props.room.status === 'discussion' ? `${descriptionModeLabel(props.room.descriptionRevealMode ?? 'all_submitted')} · ${Object.keys(getRoundContents(props.room)).length}/${eligibleVoters(props.room).length} 已完成 · ${descriptionsAreRevealed(props.room) ? `${props.votingOpenRemainingSeconds} 秒后自动开放投票` : formatCountdown(props.discussionRemainingSeconds)}` : props.room.status === 'voting' ? `${Object.keys(props.room.votes).length}/${eligibleVoters(props.room).length} 已完成 · 本轮描述保持可见` : props.room.status === 'guessing' ? `${props.room.pendingGuessingReason === 'buzzer' ? '猜词爆灯' : '特殊判定'} · ${formatCountdown(props.comebackRemainingSeconds)}` : props.room.status === 'result' && (props.room.autoAdvanceEnabled ?? true) ? (props.room.autoAdvancePaused ? '自动进入已暂停' : `${props.nextRoundRemainingSeconds} 秒后自动进入下一轮`) : neutralizeGameCopy(props.room.status)}</span>
        </div>
      : null;

  return <main className={`sheet-app ${sheetTab === 'guide' ? 'sheet-app--guide' : ''}`} onContextMenu={(event) => event.preventDefault()}>
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={props.onReset} aria-label="返回谁是卧底游戏首页">表</button>
      <div><strong>{props.room ? `协作数据表 · ${props.room.code}` : '协作数据表'}</strong><span>{props.remoteMode ? '已同步' : '已保存到本机'} · {CURRENT_RELEASE.version}</span></div>
      <div className="sheet-title-actions">
        <a href="../" aria-label="返回摸鱼游戏工作台">目录</a>
        <button onClick={openGuideSheet} aria-label="在表格中查看谁是卧底游玩步骤与核心规则">帮助</button>
        {props.room && <><button onClick={props.onCopyRoomCode} aria-label="复制谁是卧底游戏房间码">复制编号</button><button onClick={props.onCopyInviteLink} aria-label="复制带房间编号的谁是卧底邀请链接">复制邀请链接</button><button onClick={props.onCopyCurrentRule} aria-label="复制谁是卧底本轮公共规则">复制备注</button></>}
        <button className="sheet-compatibility-action" onClick={() => { privacy.current?.mask('mode-change'); props.onSwitchMode(); }} aria-label="切换到兼容保留的沉浸式谁是卧底游戏界面">兼容视图</button>
      </div>
    </header>
    <nav className="sheet-ribbon" aria-label="表格工具栏"><button className="is-current">开始</button><button>数据</button><button>视图</button><span /><button onClick={() => privacy.current?.mask('escape')} aria-label="立即隐藏秘密词语">隐藏敏感内容</button></nav>
    <div className="sheet-toolbar" aria-hidden="true"><span>撤销</span><span>重做</span><i /><b>系统字体</b><b>11</b><i /><strong>B</strong><em>I</em><u>U</u><i /><span>左对齐</span><span>自动换行</span><span>筛选</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output aria-live="polite">{formulaValue}</output></div>
    <div className="sheet-workspace">
      <div className="sheet-canvas">
        <section className="sheet-flow-guide" aria-labelledby="sheet-current-guide">
          <ol aria-label="操作流程">{['配置', '个人信息', '本轮内容', '提交选择', '结果'].map((label, index) => <li className={index === workflowGuide.step ? 'is-current' : index < workflowGuide.step ? 'is-complete' : ''} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
          <div><span>操作说明</span><strong id="sheet-current-guide">{workflowGuide.title}</strong><p>{workflowGuide.instruction}</p><b>{workflowGuide.location}</b></div>
        </section>
        {action}
        {props.screen === 'game' && props.room?.status === 'discussion' && <aside className="sheet-rule-banner" aria-label="谁是卧底本轮公共表达规则">
          <span>Round_{String(props.room.round).padStart(2, '0')} 公共规则</span>
          <strong>{getRoundChallenge(props.room, props.room.round)?.text ?? '本轮自由表达'}</strong>
          <small>当前输入 {props.roundContentDraft.length} 字 · 玩家自觉遵守 · 不影响提交</small>
        </aside>}
        <Grid rows={rows} activeCell={activeCell} emphasizedCells={workflowGuide.emphasizedCells} onActivate={(cell) => setCellSelection({ flowKey, cell })} />
      </div>
    </div>
    <footer className="sheet-tabs"><button aria-label="新增工作表">＋</button>{sheetTabs.map((tab) => <button className={sheetTab === tab ? 'is-current' : ''} onClick={() => setSheetTab(tab)} key={tab}>{tabLabel(tab)}</button>)}<span /><small>就绪 · 自动同步 · 保护视图：闲置 {PRIVACY_IDLE_MS / 1000} 秒遮挡，显示 {PRIVATE_REVEAL_MS / 1000} 秒</small></footer>
    {props.notice && <div className={`sheet-toast sheet-toast--${props.notice.kind}`} role="status">{neutralizeGameCopy(props.notice.text)}</div>}
  </main>;
}
