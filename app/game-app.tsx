'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { accuseUndercover, applyBallotResult, autoAdvanceDue, autoVotingDue, canAccuseUndercover, canBeginVoting, canTriggerBuzzer, challengeModeLabel, createRoom, dealRoom, descriptionModeLabel, descriptionsAreRevealed, eligibleCandidates, eligibleVoters, exitPlayer, getDescriptionTurnPlayer, getRoundChallenge, getRoundContents, getVotingOpensAt, isRoundContentVisible, makeId, PLAYER_LIMIT_OPTIONS, revealDescriptions, resolveBallot, resolveUndercoverComeback, ROUND_CONTENT_MAX_LENGTH, selectChallengeRule, setAutoAdvancePaused, setPlayerAway, skipDescription as skipRoundDescription, startDiscussion, startNextRound, startVoting, submitRoundContent as recordRoundContent, triggerBuzzer, undercoverOptions, updateLobbySettings, type ChallengeMode, type DescriptionRevealMode, type GameRoom, type Player } from '@/lib/game';
import { getCloudStore, type GameActionType } from '@/lib/cloudbase-store';
import { randomWordPair, randomWordPairAvoiding, wordPairKey } from '@/lib/words';
import SpreadsheetMode from './spreadsheet-mode';

type Screen = 'home' | 'setup' | 'game';
type DisplayMode = 'spreadsheet' | 'immersive';
type Notice = { kind: 'info' | 'error'; text: string } | null;
const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);
const steps = [['01', '建房', '选人数和词语'], ['02', '发牌', '轮流查看私牌'], ['03', '投票', '匿名提交选择'], ['04', '判定', '自动处理胜负']] as const;

function playerName(room: GameRoom, id: string | null | undefined): string {
  return room.players.find((player) => player.id === id)?.name ?? '无人';
}

function roleRevealCopy(room: GameRoom, playerId: string): string {
  const assignment = room.assignments[playerId];
  if (!assignment) return '未知 · —';
  const label = assignment.role === 'undercover' ? '卧底' : assignment.role === 'blank' ? '空白牌' : '平民';
  return `${label} · ${assignment.role === 'blank' ? '无词语' : assignment.word}`;
}

function eliminatedUndercoverName(room: GameRoom): string | null {
  const eliminatedId = room.lastResult?.eliminatedId;
  return eliminatedId && ['undercover', 'blank'].includes(room.assignments[eliminatedId]?.role ?? '') ? playerName(room, eliminatedId) : null;
}

function statusCopy(room: GameRoom): string {
  if (room.status === 'lobby') return '等待玩家';
  if (room.status === 'cards') return '私密发牌';
  if (room.status === 'discussion') return `第 ${room.round} 轮讨论`;
  if (room.status === 'voting') return room.ballot === 2 ? '平票复投' : `第 ${room.round} 轮投票`;
  if (room.status === 'guessing') return '特殊判定';
  if (room.status === 'result') return '本轮结果';
  return '游戏结束';
}

function formatCountdown(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function Progress({ room }: { room: GameRoom }) {
  const index = room.status === 'lobby' ? 0 : room.status === 'cards' || room.status === 'discussion' ? 1 : room.status === 'voting' ? 2 : 3;
  return <div className="progress" aria-label="游戏进度">{steps.map(([number, label], stepIndex) => <div className={`progress__item ${stepIndex <= index ? 'is-active' : ''}`} key={number}><span>{number}</span><b>{label}</b></div>)}</div>;
}

function RulesGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return <div className="rules-guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="rules-guide" role="dialog" aria-modal="true" aria-labelledby="rules-guide-title">
      <header><div><span className="stamp">新手先看这里</span><h2 id="rules-guide-title">游玩步骤与完整规则</h2><p>3–10 人，无需额外主持人；房主负责推进流程，系统负责私密发词、计票和判定。</p></div><button className="rules-guide__close" onClick={onClose} aria-label="关闭游玩步骤与完整规则">关闭 ×</button></header>
      <div className="rules-guide__body">
        <section><span className="panel-kicker">HOW TO PLAY</span><h3>六步开始一局</h3><ol className="play-steps">
          <li><b>创建或加入</b><p>房主设置人数、卧底数、词语和趣味规则并创建房间；其他玩家输入昵称和 6 位房间码加入。</p></li>
          <li><b>私密查看词语</b><p>满员后房主发牌。每人只看自己的词语，不显示角色；记住后立刻遮挡屏幕。</p></li>
          <li><b>依次描述</b><p>存活玩家根据自己的词语提交一条最多 80 字的描述，不能直接说出词语；有公共挑战时按提示表达。</p></li>
          <li><b>匿名投票</b><p>每名存活玩家投一票，不能投自己或已退出者。全部提交后才统一公开各候选人的票数。</p></li>
          <li><b>处理结果</b><p>唯一最高票者退出；首次平票只在并列者中复投，复投仍平票则本轮无人退出。</p></li>
          <li><b>继续或结束</b><p>每轮结束后系统自动判定胜负；未满足条件就进入下一轮，结束时公开身份、词语和各轮票数。</p></li>
        </ol></section>
        <section className="complete-rules"><span className="panel-kicker">FULL RULES</span><h3>完整规则</h3><div className="rule-groups">
          <article><h4>角色与词语</h4><ul><li>3–8 人默认 1 名卧底，9–10 人默认 2 名；3–4 人只允许 1 名。</li><li>平民拿到同一个词，卧底拿到相近但不同的词；可选空白牌没有词语，需要根据描述发挥。</li><li>查看个人信息时只显示词语，不标注角色，身份在本局结束后统一公开。</li></ul></article>
          <article><h4>描述与公共挑战</h4><ul><li>顺序模式每位玩家各有独立 120 秒，超时只跳过当前玩家；全部提交模式为全员共用 120 秒。</li><li>每位存活且在场的玩家提交一次 1–80 字描述；描述公开后倒计时 5 秒自动开放投票。</li><li>挑战可选关闭、轻度或随机；公共规则每轮同步展示，并尽量避免连续重复。</li></ul></article>
          <article><h4>投票与平票</h4><ul><li>只有存活玩家可投票，每轮一票，不得投自己或已经退出的玩家。</li><li>系统不展示实时票型，只在全部提交后公布每位候选人的总票数，不公开谁投了谁。</li><li>唯一最高票者退出；首次平票对并列者复投，第二次仍平票则无人退出并进入下一轮。</li></ul></article>
          <article><h4>胜负条件</h4><ul><li>卧底与空白牌都属于特殊阵营；特殊阵营全部退出，平民阵营获胜。</li><li>存活特殊阵营人数大于或等于存活平民人数，特殊阵营获胜。</li><li>两项条件都未满足时继续下一轮；结束后可由房主原班人马再开一局。</li></ul></article>
          <article><h4>暂退与退出</h4><ul><li>暂退后不参与当前描述和投票，也不会因此触发胜负；点击“返回”即可重新参与。</li><li>永久退出视作淘汰，本局不能返回，并会立即重新判断阵营胜负。</li><li>投票中有人暂退、返回或退出时，已投票会清空，避免候选名单变化造成无效票。</li></ul></article>
          <article><h4>卧底猜词翻盘（可选）</h4><ul><li>开启后，首名被成功投出的卧底有 20 秒私密机会猜平民词，全卧底阵营每局只有一次。</li><li>完全猜中立即结束本局；猜错、空提交或超时则该玩家正常退出。</li><li>比对忽略首尾空格、常见标点和英文字母大小写，不接受近义词。</li></ul></article>
          <article><h4>公平与隐私</h4><ul><li>秘密词语按住才显示，松开、切走页面或触发遮挡后隐藏；请轮流操作并避免旁观。</li><li>这是熟人娱乐工具，不防开发者工具查看数据，也不规避企业网络审计或终端管理。</li><li>若使用自定义词语，房主应选择含义相近、难度相当且不含敏感信息的一对词。</li></ul></article>
        </div></section>
      </div>
      <footer><button className="button button--primary" onClick={onClose}>我了解了，开始游玩 <span>→</span></button></footer>
    </section>
  </div>;
}

function Seat({ player }: { player: Player }) {
  return <div className={`seat ${!player.alive ? 'is-out' : player.away ? 'is-away' : ''}`}><span className="seat__number">{String(player.seat).padStart(2, '0')}</span><span className="seat__avatar">{player.name.slice(0, 1)}</span><span className="seat__name">{player.name}</span><span className="seat__status">{!player.alive ? '已出局' : player.away ? '暂退' : player.cardReady ? '已确认' : '在场'}</span></div>;
}

export default function GameApp() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('spreadsheet');
  const [screen, setScreen] = useState<Screen>('home');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [ownerName, setOwnerName] = useState('房主');
  const [playerLimit, setPlayerLimit] = useState(8);
  const [undercoverCount, setUndercoverCount] = useState(1);
  const [blankCardCount, setBlankCardCount] = useState(0);
  const [civilianAccuseEnabled, setCivilianAccuseEnabled] = useState(false);
  const [lobbySettingsDraft, setLobbySettingsDraft] = useState<{ playerLimit: number; undercoverCount: number; blankCardCount: number } | null>(null);
  const [accuseActorId, setAccuseActorId] = useState<string | null>(null);
  const [accuseTargetId, setAccuseTargetId] = useState<string | null>(null);
  const [civilianWord, setCivilianWord] = useState('');
  const [undercoverWord, setUndercoverWord] = useState('');
  const [customWords, setCustomWords] = useState(false);
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('off');
  const [undercoverComebackEnabled, setUndercoverComebackEnabled] = useState(false);
  const [descriptionRevealMode, setDescriptionRevealMode] = useState<DescriptionRevealMode>('all_submitted');
  const [buzzerEnabled, setBuzzerEnabled] = useState(false);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [remoteMode, setRemoteMode] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealPlayerId, setRevealPlayerId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [votePlayerId, setVotePlayerId] = useState<string | null>(null);
  const [discussionPlayerId, setDiscussionPlayerId] = useState<string | null>(null);
  const [roundContentDraft, setRoundContentDraft] = useState('');
  const [comebackDraft, setComebackDraft] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [privacyGate, setPrivacyGate] = useState(true);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [guideOpen, setGuideOpen] = useState(false);
  const [wordReviewPlayerId, setWordReviewPlayerId] = useState<string | null>(null);
  const pendingRemoteActions = useRef(new Set<string>());

  useEffect(() => {
    const savedMode = window.localStorage.getItem('undercover-display-mode');
    if (savedMode === 'immersive') window.queueMicrotask(() => setDisplayMode('immersive'));
  }, []);

  useEffect(() => {
    document.title = displayMode === 'spreadsheet' ? '协作数据表' : '卧底裁判局';
  }, [displayMode]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const hideCard = () => setRevealed(false);
    const onVisibility = () => { if (document.hidden) hideCard(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') hideCard(); };
    window.addEventListener('blur', hideCard);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('blur', hideCard); window.removeEventListener('keydown', onKeyDown); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const timeout = window.setTimeout(() => setRevealed(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [revealed]);

  useEffect(() => {
    const invitedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) ?? '';
    if (invitedCode) window.queueMicrotask(() => setJoinCode(invitedCode));
    const activeRemote = window.localStorage.getItem('undercover-active-remote');
    if (activeRemote && cloudReady) {
      try {
        const { code, playerId } = JSON.parse(activeRemote) as { code: string; playerId: string };
        if (invitedCode && code !== invitedCode) return;
        getCloudStore().getRoom(code).then((restored) => {
          if (restored) { setRoom(restored); setCurrentPlayerId(playerId); setRemoteMode(true); setScreen('game'); }
        }).catch(() => window.localStorage.removeItem('undercover-active-remote'));
        return;
      } catch { window.localStorage.removeItem('undercover-active-remote'); }
    }
    const saved = window.localStorage.getItem('undercover-demo-room');
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as GameRoom;
      if (restored?.code && Date.now() - restored.updatedAt < 24 * 60 * 60 * 1000) {
        window.queueMicrotask(() => { setRoom(restored); setScreen('game'); setRemoteMode(false); });
      }
    } catch { window.localStorage.removeItem('undercover-demo-room'); }
  }, []);

  useEffect(() => {
    if (room && !remoteMode) window.localStorage.setItem('undercover-demo-room', JSON.stringify(room));
  }, [room, remoteMode]);

  const discussionDeadline = room?.status === 'discussion' ? room.discussionDeadlineAt : null;
  const votingOpenDeadline = room?.status === 'discussion' ? getVotingOpensAt(room) : null;
  const comebackDeadline = room?.status === 'guessing' ? room.comebackDeadlineAt : null;
  const nextRoundDeadline = room?.status === 'result' ? room.nextRoundAt : null;
  useEffect(() => {
    if (!discussionDeadline && !votingOpenDeadline && !comebackDeadline && !nextRoundDeadline) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [discussionDeadline, votingOpenDeadline, comebackDeadline, nextRoundDeadline]);

  const roomCode = room?.code;
  useEffect(() => {
    if (!roomCode || !remoteMode) return;
    let close: (() => void) | undefined;
    let cancelled = false;
    getCloudStore().connect().then(() => {
      if (!cancelled) close = getCloudStore().watchRoom(roomCode, setRoom, () => setNotice({ kind: 'error', text: '实时连接已中断，请刷新重试' }));
    }).catch((error) => setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'CloudBase 连接失败' }));
    return () => { cancelled = true; close?.(); };
  }, [remoteMode, roomCode]);

  const activeCardPlayer = useMemo(() => {
    if (!room || room.status !== 'cards') return null;
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && player.alive && !player.away && !player.cardReady) ?? null;
    return room.players.find((player) => player.id === revealPlayerId && player.alive && !player.away && !player.cardReady) ?? room.players.find((player) => player.alive && !player.away && !player.cardReady) ?? null;
  }, [room, revealPlayerId, remoteMode, currentPlayerId]);

  const activeVoter = useMemo(() => {
    if (!room || room.status !== 'voting') return null;
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && player.alive && !player.away && !room.votes[player.id]) ?? null;
    return room.players.find((player) => player.id === votePlayerId && player.alive && !player.away && !room.votes[player.id]) ?? room.players.find((player) => player.alive && !player.away && !room.votes[player.id]) ?? null;
  }, [room, votePlayerId, remoteMode, currentPlayerId]);

  const activeDiscussionPlayer = useMemo(() => {
    if (!room || room.status !== 'discussion') return null;
    const contents = getRoundContents(room);
    if ((room.descriptionRevealMode ?? 'all_submitted') === 'sequential') {
      const current = getDescriptionTurnPlayer(room);
      if (remoteMode && current?.id !== currentPlayerId) return null;
      return current;
    }
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && player.alive && !player.away && !contents[player.id]) ?? null;
    return room.players.find((player) => player.id === discussionPlayerId && player.alive && !player.away && !contents[player.id])
      ?? room.players.find((player) => player.alive && !player.away && !contents[player.id]) ?? null;
  }, [room, remoteMode, currentPlayerId, discussionPlayerId]);

  const activeComebackPlayer = useMemo(() => {
    if (!room || room.status !== 'guessing' || !room.pendingComebackPlayerId) return null;
    const player = room.players.find((item) => item.id === room.pendingComebackPlayerId) ?? null;
    if (remoteMode && player?.id !== currentPlayerId) return null;
    return player;
  }, [room, remoteMode, currentPlayerId]);

  const displayNow = Math.max(clockNow, room?.updatedAt ?? 0);
  const discussionRemainingSeconds = discussionDeadline ? Math.max(0, Math.ceil((discussionDeadline - displayNow) / 1000)) : 0;
  const votingOpenRemainingSeconds = votingOpenDeadline ? Math.max(0, Math.ceil((votingOpenDeadline - displayNow) / 1000)) : 0;
  const comebackRemainingSeconds = comebackDeadline ? Math.max(0, Math.ceil((comebackDeadline - displayNow) / 1000)) : 0;
  const nextRoundRemainingSeconds = nextRoundDeadline ? Math.max(0, Math.ceil((nextRoundDeadline - displayNow) / 1000)) : 0;
  const wordReviewPlayer = useMemo(() => {
    if (!room || room.status === 'lobby' || room.status === 'finished') return null;
    const requested = room.players.find((player) => player.id === wordReviewPlayerId && player.cardReady);
    if (remoteMode) return room.status === 'cards' ? activeCardPlayer : room.players.find((player) => player.id === currentPlayerId && player.cardReady) ?? null;
    return requested ?? activeCardPlayer ?? activeDiscussionPlayer ?? activeVoter ?? null;
  }, [room, wordReviewPlayerId, remoteMode, currentPlayerId, activeCardPlayer, activeDiscussionPlayer, activeVoter]);

  async function runRemoteAction(
    sourceRoom: GameRoom,
    actionType: GameActionType,
    payload: Record<string, unknown>,
    pendingKey: string,
  ): Promise<GameRoom | null> {
    if (pendingRemoteActions.current.has(pendingKey)) return null;
    pendingRemoteActions.current.add(pendingKey);
    const actionId = makeId('action');
    try {
      let result;
      try {
        result = await getCloudStore().applyGameAction({ room: sourceRoom, actionId, actionType, payload });
      } catch {
        result = await getCloudStore().applyGameAction({ room: sourceRoom, actionId, actionType, payload });
      }
      setRoom(result.state);
      if (result.outcome === 'stale') setNotice({ kind: 'info', text: '状态已更新，请重试' });
      if (result.outcome === 'rejected') setNotice({ kind: 'error', text: result.message || '当前操作无法完成' });
      return result.outcome === 'applied' || result.outcome === 'duplicate' ? result.state : null;
    } catch {
      try {
        const latest = await getCloudStore().getRoom(sourceRoom.code);
        if (latest) setRoom(latest);
      } catch { /* watcher will keep retrying */ }
      setNotice({ kind: 'error', text: '同步未完成，已刷新最新状态，请重试' });
      return null;
    } finally {
      pendingRemoteActions.current.delete(pendingKey);
    }
  }

  function commitRoom(
    next: GameRoom,
    remoteAction: { type?: GameActionType; transition?: string; automatic?: boolean; key?: string } = {},
  ) {
    if (!remoteMode || !room) {
      setRoom(next);
      return;
    }
    const type = remoteAction.type ?? 'advance_phase';
    const transition = remoteAction.transition ?? 'controlled_transition';
    void runRemoteAction(room, type, { proposedState: next, transition, automatic: remoteAction.automatic ?? false }, remoteAction.key ?? `${type}:${transition}:${room.version}`);
  }

  useEffect(() => {
    if (!room || room.status !== 'guessing' || comebackRemainingSeconds > 0 || !room.pendingComebackPlayerId) return;
    const timeout = window.setTimeout(() => {
      const next = resolveUndercoverComeback(room, room.pendingComebackPlayerId!, '', Date.now());
      if (remoteMode) void runRemoteAction(room, 'advance_phase', { proposedState: next, transition: 'guess_timeout', automatic: true }, `guess-timeout:${room.version}`);
      else setRoom(next);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [room, comebackRemainingSeconds, remoteMode]);

  useEffect(() => {
    if (!room || room.status !== 'discussion' || room.descriptionsRevealedAt || !room.discussionDeadlineAt || discussionRemainingSeconds > 0) return;
    const timeout = window.setTimeout(() => {
      const current = getDescriptionTurnPlayer(room);
      const next = (room.descriptionRevealMode ?? 'all_submitted') === 'sequential' && current
        ? skipRoundDescription(room, current.id, Date.now())
        : revealDescriptions(room, Date.now());
      setDiscussionPlayerId(getDescriptionTurnPlayer(next)?.id ?? null);
      if (remoteMode) void runRemoteAction(room, 'advance_phase', { proposedState: next, transition: current ? 'auto_skip_description' : 'auto_reveal_descriptions', automatic: true }, `discussion-timeout:${room.version}`);
      else setRoom(next);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [room, discussionRemainingSeconds, remoteMode]);

  useEffect(() => {
    if (!room || !autoAdvanceDue(room, clockNow)) return;
    const timeout = window.setTimeout(() => {
      const next = startNextRound(room, Date.now());
      setRoundContentDraft('');
      if (remoteMode) void runRemoteAction(room, 'advance_phase', { proposedState: next, transition: 'auto_next_round', automatic: true }, `auto-next:${room.version}`);
      else setRoom(next);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [room, clockNow, remoteMode]);

  useEffect(() => {
    if (!room || !autoVotingDue(room, clockNow)) return;
    const timeout = window.setTimeout(() => {
      const next = startVoting(room, clockNow);
      setVotePlayerId(eligibleVoters(next)[0]?.id ?? null);
      setSelectedCandidateId(null);
      setPrivacyGate(true);
      if (remoteMode) void runRemoteAction(room, 'advance_phase', { proposedState: next, transition: 'auto_open_voting', automatic: true }, `auto-voting:${room.version}`);
      else setRoom(next);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [room, clockNow, remoteMode]);

  function choosePlayerLimit(limit: number) { setPlayerLimit(limit); setUndercoverCount(limit >= 9 ? 2 : 1); }
  function openSetup() { const [civilian, undercover] = randomWordPair(); setCivilianWord(civilian); setUndercoverWord(undercover); setScreen('setup'); }
  function switchDisplayMode() {
    const next: DisplayMode = displayMode === 'spreadsheet' ? 'immersive' : 'spreadsheet';
    setRevealed(false);
    setDisplayMode(next);
    window.localStorage.setItem('undercover-display-mode', next);
  }

  function createDemo() {
    if (!ownerName.trim()) return setNotice({ kind: 'error', text: '先给房主起个名字' });
    if (!civilianWord.trim() || !undercoverWord.trim()) return setNotice({ kind: 'error', text: '两组词语都需要填写' });
    if (civilianWord.trim() === undercoverWord.trim()) return setNotice({ kind: 'error', text: '两组词语不能相同' });
    const ownerId = makeId('player');
    const created = createRoom({ ownerId, ownerName, playerLimit, undercoverCount, blankCardCount, civilianAccuseEnabled, civilianWord, undercoverWord, challengeMode, undercoverComebackEnabled, descriptionRevealMode, buzzerEnabled, autoAdvanceEnabled });
    const base = { ...created, recentWordPairKeys: [wordPairKey([civilianWord, undercoverWord])] };
    const players: Player[] = Array.from({ length: playerLimit }, (_, index) => index === 0 ? base.players[0] : { id: makeId('player'), name: `玩家 ${index + 1}`, seat: index + 1, alive: true, cardReady: false, away: false });
    window.localStorage.removeItem('undercover-active-remote');
    setRemoteMode(false); setCurrentPlayerId(ownerId); setRoom({ ...base, players }); setScreen('game'); setPrivacyGate(true);
    setNotice({ kind: 'info', text: '演示局已创建：这台电脑会依次交给每位玩家操作' });
  }

  async function createRemote() {
    if (!cloudReady) return setNotice({ kind: 'info', text: '请先填写 CloudBase 环境 ID 和 Publishable Key' });
    if (!ownerName.trim() || !civilianWord.trim() || !undercoverWord.trim()) return setNotice({ kind: 'error', text: '请先填写完整的开局信息' });
    setBusy(true);
    try {
      const ownerId = makeId('player');
      const created = createRoom({ ownerId, ownerName, playerLimit, undercoverCount, blankCardCount, civilianAccuseEnabled, civilianWord, undercoverWord, challengeMode, undercoverComebackEnabled, descriptionRevealMode, buzzerEnabled, autoAdvanceEnabled });
      const next = { ...created, recentWordPairKeys: [wordPairKey([civilianWord, undercoverWord])] };
      await getCloudStore().createRoom(next);
      window.localStorage.setItem(`undercover-player-${next.code}`, ownerId);
      window.localStorage.setItem('undercover-active-remote', JSON.stringify({ code: next.code, playerId: ownerId }));
      window.localStorage.removeItem('undercover-demo-room');
      setRemoteMode(true); setCurrentPlayerId(ownerId); setRoom(next); setScreen('game');
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '创建联机房间失败' }); }
    finally { setBusy(false); }
  }

  async function tryRemoteJoin() {
    if (!joinCode.trim()) return setNotice({ kind: 'error', text: '请输入房间码' });
    if (!joinName.trim()) return setNotice({ kind: 'error', text: '请输入你的称呼' });
    if (!cloudReady) return setNotice({ kind: 'info', text: '联机入口已做好；填入 CloudBase 参数后即可启用' });
    setBusy(true);
    try {
      const code = joinCode.trim().toUpperCase();
      const rememberedId = window.localStorage.getItem(`undercover-player-${code}`);
      const requestedId = rememberedId ?? makeId('player');
      const targetRoom = await getCloudStore().getRoom(code);
      if ((targetRoom as unknown as { gameType?: string } | null)?.gameType === 'absurd_court') throw new Error('这是离谱法堂房间，请前往离谱法堂页面加入');
      const joined = await getCloudStore().joinRoom(code, requestedId, joinName.trim());
      window.localStorage.setItem(`undercover-player-${code}`, joined.playerId);
      window.localStorage.setItem('undercover-active-remote', JSON.stringify({ code, playerId: joined.playerId }));
      window.localStorage.removeItem('undercover-demo-room');
      setRemoteMode(true); setCurrentPlayerId(joined.playerId); setRoom(joined.room); setScreen('game'); setPrivacyGate(true);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '加入房间失败' }); }
    finally { setBusy(false); }
  }

  function renamePlayer(id: string, name: string) {
    if (room) setRoom({ ...room, players: room.players.map((player) => player.id === id ? { ...player, name: name.slice(0, 12) } : player) });
  }

  function startDealing() {
    if (!room) return;
    if (room.players.some((player) => !player.name.trim())) return setNotice({ kind: 'error', text: '每个座位都需要一个名字' });
    try { const next = dealRoom(room); commitRoom(next); setRevealPlayerId(next.players[0].id); setPrivacyGate(true); }
    catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '发牌失败' }); }
  }

  function saveLobbySettings(settings: { playerLimit: number; undercoverCount: number; blankCardCount: number }) {
    if (!room) return;
    try {
      const next = updateLobbySettings(room, remoteMode ? (currentPlayerId ?? '') : room.ownerId, settings);
      if (remoteMode) {
        // 兼容线上 V3：旧函数仍读取此字段，但等待房间编辑器不再允许修改它。
        void runRemoteAction(room, 'update_lobby_settings', { playerLimit: settings.playerLimit, undercoverCount: settings.undercoverCount, blankCardCount: settings.blankCardCount, civilianAccuseEnabled: room.civilianAccuseEnabled ?? false }, `lobby-settings:${room.version}`).then((saved) => { if (saved) { setLobbySettingsDraft(null); setPlayerLimit(saved.playerLimit); setUndercoverCount(saved.undercoverCount); setBlankCardCount(saved.blankCardCount ?? 0); setCivilianAccuseEnabled(saved.civilianAccuseEnabled ?? false); } });
      } else { commitRoom(next); setLobbySettingsDraft(null); setPlayerLimit(next.playerLimit); setUndercoverCount(next.undercoverCount); setBlankCardCount(next.blankCardCount ?? 0); setCivilianAccuseEnabled(next.civilianAccuseEnabled ?? false); }
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '房间设置保存失败' }); }
  }

  function openCivilianAccuse(playerId: string) {
    if (!room || !canAccuseUndercover(room, playerId, clockNow)) return setNotice({ kind: 'info', text: '当前不能进行平民爆灯指认' });
    setAccuseActorId(playerId);
    setAccuseTargetId(null);
  }

  function cancelCivilianAccuse() {
    setAccuseActorId(null);
    setAccuseTargetId(null);
  }

  function submitCivilianAccuse() {
    if (!room || !accuseActorId || !accuseTargetId) return;
    const actorId = remoteMode ? currentPlayerId : accuseActorId;
    if (!actorId || actorId !== accuseActorId) return setNotice({ kind: 'error', text: '状态已更新，请重新打开指认区域' });
    try {
      const next = accuseUndercover(room, actorId, accuseTargetId);
      const applyResult = (saved: GameRoom) => {
        setAccuseActorId(null);
        setAccuseTargetId(null);
        setSelectedCandidateId(null);
        setVotePlayerId(saved.status === 'voting' ? eligibleVoters(saved)[0]?.id ?? null : null);
        setPrivacyGate(true);
        setNotice({ kind: 'info', text: '成员状态发生变化，请重新投票。' });
      };
      if (remoteMode) void runRemoteAction(room, 'accuse_undercover', { targetId: accuseTargetId, targetPlayerId: accuseTargetId }, `accuse:${room.round}:${actorId}`).then((saved) => { if (saved) applyResult(saved); });
      else { commitRoom(next); applyResult(next); }
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '平民爆灯指认失败' }); }
  }

  function confirmCard() {
    if (!room || !activeCardPlayer) return;
    if (remoteMode) {
      const previousId = room.roundChallenges?.[String(room.round - 1)] ?? null;
      const challengeId = selectChallengeRule(room.challengeMode ?? 'off', previousId)?.id ?? null;
      void runRemoteAction(room, 'confirm_card', { challengeId }, `confirm-card:${room.round}:${activeCardPlayer.id}`).then((next) => {
        if (!next) return;
        setPrivacyGate(true);
        setRevealPlayerId(next.players.find((player) => player.alive && !player.away && !player.cardReady)?.id ?? null);
      });
      return;
    }
    const players = room.players.map((player) => player.id === activeCardPlayer.id ? { ...player, cardReady: true } : player);
    const nextPlayer = players.find((player) => player.alive && !player.away && !player.cardReady);
    if (!nextPlayer) { const next = startDiscussion({ ...room, players }); commitRoom(next); setDiscussionPlayerId(next.players.find((player) => player.alive)?.id ?? null); setRoundContentDraft(''); setRevealPlayerId(null); setPrivacyGate(true); return; }
    commitRoom({ ...room, players }); setRevealPlayerId(nextPlayer.id); setRevealed(false); setPrivacyGate(true);
  }

  function submitCurrentRoundContent() {
    if (!room || !activeDiscussionPlayer) return;
    if (remoteMode) {
      void runRemoteAction(room, 'submit_description', { content: roundContentDraft }, `description:${room.round}:${activeDiscussionPlayer.id}`).then((next) => {
        if (!next) return;
        setRoundContentDraft('');
        setDiscussionPlayerId(getDescriptionTurnPlayer(next)?.id ?? null);
      });
      return;
    }
    try {
      const next = recordRoundContent(room, activeDiscussionPlayer.id, roundContentDraft);
      commitRoom(next);
      setRoundContentDraft('');
      if (!remoteMode) setDiscussionPlayerId(getDescriptionTurnPlayer(next)?.id ?? next.players.find((player) => player.alive && !getRoundContents(next)[player.id])?.id ?? null);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '本轮内容提交失败' }); }
  }

  function beginVoting() {
    if (!room) return;
    if (!canBeginVoting(room, clockNow)) return setNotice({ kind: 'info', text: '请等待本轮描述公开' });
    const next = startVoting(room, clockNow);
    const first = eligibleVoters(next)[0];
    commitRoom(next);
    setVotePlayerId(first?.id ?? null); setSelectedCandidateId(null); setPrivacyGate(true);
  }

  function skipCurrentDescription() {
    if (!room) return;
    const current = getDescriptionTurnPlayer(room);
    if (!current) return;
    try {
      const next = skipRoundDescription(room, current.id);
      commitRoom(next);
      if (!remoteMode) setDiscussionPlayerId(getDescriptionTurnPlayer(next)?.id ?? null);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '跳过失败' }); }
  }

  function submitVote() {
    if (!room || !activeVoter || !selectedCandidateId) return;
    if (remoteMode) {
      const voterId = activeVoter.id;
      void runRemoteAction(room, 'submit_vote', { candidateId: selectedCandidateId }, `vote:${room.round}:${room.ballot}:${voterId}`).then((next) => {
        if (!next) return;
        setSelectedCandidateId(null);
        setPrivacyGate(true);
        setVotePlayerId(eligibleVoters(next).find((player) => !next.votes[player.id])?.id ?? null);
        if (next.status === 'voting' && next.ballot === 2 && room.ballot === 1) setNotice({ kind: 'info', text: '最高票并列，马上进行一次复投' });
      });
      return;
    }
    const votes = { ...room.votes, [activeVoter.id]: selectedCandidateId };
    const withVote = { ...room, votes, version: room.version + 1, updatedAt: clockNow };
    const remaining = eligibleVoters(withVote).find((player) => !votes[player.id]);
    setSelectedCandidateId(null); setPrivacyGate(true);
    if (remaining) { commitRoom(withVote); setVotePlayerId(remaining.id); return; }
    try {
      const resolved = applyBallotResult(withVote, resolveBallot(withVote)); commitRoom(resolved);
      if (resolved.status === 'voting') { setVotePlayerId(eligibleVoters(resolved)[0]?.id ?? null); setNotice({ kind: 'info', text: '最高票并列，马上进行一次复投' }); }
      else setVotePlayerId(null);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '计票失败' }); }
  }

  function submitComeback() {
    if (!room || !activeComebackPlayer) return;
    try {
      const next = resolveUndercoverComeback(room, activeComebackPlayer.id, comebackDraft);
      if (remoteMode) {
        void runRemoteAction(room, 'submit_special', { proposedState: next, transition: 'submit_guess' }, `special:${room.round}:${activeComebackPlayer.id}`).then((saved) => {
          if (!saved) return;
          setComebackDraft(''); setPrivacyGate(true);
          if (room.pendingGuessingReason === 'buzzer' && !saved.winner) setNotice({ kind: 'info', text: '爆灯判定未通过，该玩家已退出，原流程继续' });
        });
        return;
      }
      commitRoom(next); setComebackDraft(''); setPrivacyGate(true);
      if (room.pendingGuessingReason === 'buzzer' && !next.winner) setNotice({ kind: 'info', text: '爆灯判定未通过，该玩家已退出，原流程继续' });
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '翻盘答案提交失败' }); }
  }

  function startBuzzer(playerId: string) {
    if (!room || !canTriggerBuzzer(room, playerId, clockNow)) return setNotice({ kind: 'info', text: '当前不能爆灯' });
    try {
      const next = triggerBuzzer(room, playerId);
      if (remoteMode) {
        void runRemoteAction(room, 'trigger_buzzer', { proposedState: next, transition: 'trigger_buzzer' }, `buzzer:${room.round}:${playerId}`).then((saved) => {
          if (!saved) return;
          setComebackDraft(''); setPrivacyGate(true); setWordReviewPlayerId(null);
        });
        return;
      }
      commitRoom(next); setComebackDraft(''); setPrivacyGate(true); setWordReviewPlayerId(null);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '爆灯失败' }); }
  }

  function togglePlayerAway(playerId: string) {
    if (!room) return;
    const player = room.players.find((item) => item.id === playerId);
    if (!player?.alive) return;
    try {
      const next = setPlayerAway(room, playerId, !player.away);
      const applyPresence = (saved: GameRoom) => {
        setRevealPlayerId(saved.players.find((item) => item.alive && !item.away && !item.cardReady)?.id ?? null);
        setDiscussionPlayerId(getDescriptionTurnPlayer(saved)?.id ?? eligibleVoters(saved).find((item) => !getRoundContents(saved)[item.id])?.id ?? null);
        setVotePlayerId(eligibleVoters(saved).find((item) => !saved.votes[item.id])?.id ?? null);
        setNotice({ kind: 'info', text: player.away ? `${player.name} 已返回游戏` : `${player.name} 已暂退，不参与当前描述与投票` });
      };
      if (remoteMode) void runRemoteAction(room, 'change_presence', { proposedState: next, transition: player.away ? 'return' : 'away' }, `presence:${room.version}:${playerId}`).then((saved) => { if (saved) applyPresence(saved); });
      else { commitRoom(next); applyPresence(next); }
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '暂退状态切换失败' }); }
  }

  function permanentlyExitPlayer(playerId: string) {
    if (!room) return;
    const player = room.players.find((item) => item.id === playerId);
    if (!player?.alive) return;
    if (!window.confirm(`${player.name} 退出后将视作淘汰，且本局不能返回。确定退出吗？`)) return;
    const next = exitPlayer(room, playerId);
    const applyExit = (saved: GameRoom) => {
      setRevealPlayerId(saved.players.find((item) => item.alive && !item.away && !item.cardReady)?.id ?? null);
      setDiscussionPlayerId(getDescriptionTurnPlayer(saved)?.id ?? null);
      setVotePlayerId(eligibleVoters(saved).find((item) => !saved.votes[item.id])?.id ?? null);
      setNotice({ kind: 'info', text: `${player.name} 已退出，并按淘汰处理` });
    };
    if (remoteMode) void runRemoteAction(room, 'change_presence', { proposedState: next, transition: 'exit' }, `exit:${room.version}:${playerId}`).then((saved) => { if (saved) applyExit(saved); });
    else { commitRoom(next); applyExit(next); }
  }

  function continueGame() { if (room) { const next = startNextRound(room); commitRoom(next); setDiscussionPlayerId(next.players.find((player) => player.alive)?.id ?? null); setRoundContentDraft(''); } }
  function toggleAutoAdvance() { if (room) commitRoom(setAutoAdvancePaused(room, !room.autoAdvancePaused)); }
  function rematch() {
    if (!room) return;
    const recent = room.recentWordPairKeys ?? [wordPairKey([room.civilianWord, room.undercoverWord])];
    const [civilianWord, undercoverWord] = randomWordPairAvoiding(recent);
    const recentWordPairKeys = [...recent, wordPairKey([civilianWord, undercoverWord])].slice(-10);
    const fresh = dealRoom({ ...room, civilianWord, undercoverWord, recentWordPairKeys, status: 'lobby', players: room.players.map((player) => ({ ...player, alive: true, away: false, cardReady: false })) });
    commitRoom(fresh);
    setRevealPlayerId(fresh.players[0]?.id ?? null);
    setPrivacyGate(true);
  }
  async function copyRoomCode() { if (!room) return; try { await navigator.clipboard.writeText(room.code); } catch { /* clipboard may be unavailable */ } setNotice({ kind: 'info', text: `房间码 ${room.code} 已复制` }); }
  async function copyInviteLink() { if (!room) return; const invite = new URL(window.location.href); invite.search = ''; invite.hash = ''; invite.searchParams.set('room', room.code); try { await navigator.clipboard.writeText(invite.toString()); setNotice({ kind: 'info', text: '邀请链接已复制，群友打开后只需填写称呼' }); } catch { setNotice({ kind: 'error', text: '浏览器未允许复制，请复制地址栏链接并附上房间码' }); } }
  async function copyCurrentRule() { if (!room) return; const text = `本局设置：${challengeModeLabel(room.challengeMode ?? 'off')}挑战｜描述方式：${descriptionModeLabel(room.descriptionRevealMode ?? 'all_submitted')}｜猜词翻盘${room.undercoverComebackEnabled ? '开启' : '关闭'}｜猜词爆灯${room.buzzerEnabled ? '开启' : '关闭'}｜自动下一轮${(room.autoAdvanceEnabled ?? true) ? '开启' : '关闭'}\nRound_${String(room.round).padStart(2, '0')}：${getRoundChallenge(room, room.round)?.text ?? '无附加规则'}\n挑战规则由玩家自觉遵守。`; try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable */ } setNotice({ kind: 'info', text: '本轮公共规则已复制' }); }
  function reset() { setScreen('home'); setRoom(null); setRemoteMode(false); setCurrentPlayerId(null); setRevealPlayerId(null); setVotePlayerId(null); setDiscussionPlayerId(null); setRoundContentDraft(''); setComebackDraft(''); setWordReviewPlayerId(null); setAccuseActorId(null); setAccuseTargetId(null); setPrivacyGate(true); window.localStorage.removeItem('undercover-demo-room'); window.localStorage.removeItem('undercover-active-remote'); }

  if (displayMode === 'spreadsheet') return <SpreadsheetMode
    screen={screen} room={room} notice={notice} cloudReady={cloudReady} busy={busy} remoteMode={remoteMode}
    currentPlayerId={currentPlayerId} activeCardPlayer={activeCardPlayer} activeDiscussionPlayer={activeDiscussionPlayer} activeVoter={activeVoter} activeComebackPlayer={activeComebackPlayer} wordReviewPlayer={wordReviewPlayer} selectedCandidateId={selectedCandidateId}
    roundContentDraft={roundContentDraft} discussionRemainingSeconds={discussionRemainingSeconds} votingOpenRemainingSeconds={votingOpenRemainingSeconds} comebackDraft={comebackDraft} comebackRemainingSeconds={comebackRemainingSeconds} nextRoundRemainingSeconds={nextRoundRemainingSeconds} canOpenVoting={room ? canBeginVoting(room, clockNow) : false}
    ownerName={ownerName} playerLimit={playerLimit} undercoverCount={undercoverCount} civilianWord={civilianWord} undercoverWord={undercoverWord}
    customWords={customWords} challengeMode={challengeMode} undercoverComebackEnabled={undercoverComebackEnabled} descriptionRevealMode={descriptionRevealMode} buzzerEnabled={buzzerEnabled} autoAdvanceEnabled={autoAdvanceEnabled} joinCode={joinCode} joinName={joinName} onSwitchMode={switchDisplayMode} onOpenSetup={openSetup} onReviewWord={setWordReviewPlayerId}
    onBackHome={() => setScreen('home')} onReset={reset} onCopyRoomCode={() => void copyRoomCode()} onCopyInviteLink={() => void copyInviteLink()} onCopyCurrentRule={() => void copyCurrentRule()} onJoin={() => void tryRemoteJoin()}
    onCreateDemo={createDemo} onCreateRemote={() => void createRemote()} onStartDealing={startDealing} onConfirmCard={confirmCard}
    onRoundContentDraft={(value) => setRoundContentDraft(value.slice(0, ROUND_CONTENT_MAX_LENGTH))} onSubmitRoundContent={submitCurrentRoundContent}
    onBeginVoting={beginVoting} onSkipDescription={skipCurrentDescription} onBuzzer={startBuzzer} onSubmitVote={submitVote} onComebackDraft={setComebackDraft} onSubmitComeback={submitComeback} onContinue={continueGame} onToggleAutoAdvance={toggleAutoAdvance} onRematch={rematch} onOwnerName={setOwnerName}
    blankCardCount={blankCardCount} civilianAccuseEnabled={civilianAccuseEnabled} lobbySettingsDraft={lobbySettingsDraft} accuseActorId={accuseActorId} accuseTargetId={accuseTargetId}
    onLobbySettingsDraft={setLobbySettingsDraft} onSaveLobbySettings={saveLobbySettings} onOpenCivilianAccuse={openCivilianAccuse} onAccuseTarget={setAccuseTargetId} onCancelCivilianAccuse={cancelCivilianAccuse} onSubmitCivilianAccuse={submitCivilianAccuse}
    onPlayerLimit={choosePlayerLimit} onUndercoverCount={setUndercoverCount} onBlankCardCount={setBlankCardCount} onCivilianAccuseEnabled={setCivilianAccuseEnabled} onCivilianWord={(value) => { setCivilianWord(value); setCustomWords(true); }}
    onUndercoverWord={(value) => { setUndercoverWord(value); setCustomWords(true); }} onRandomWords={() => { const [a, b] = randomWordPair(); setCivilianWord(a); setUndercoverWord(b); setCustomWords(false); }}
    onCustomWords={() => { setCustomWords(true); setCivilianWord(''); setUndercoverWord(''); }} onChallengeMode={setChallengeMode} onUndercoverComebackEnabled={setUndercoverComebackEnabled} onDescriptionRevealMode={setDescriptionRevealMode} onBuzzerEnabled={setBuzzerEnabled} onAutoAdvanceEnabled={setAutoAdvanceEnabled} onJoinCode={setJoinCode} onJoinName={setJoinName}
    onRenamePlayer={renamePlayer} onCandidate={setSelectedCandidateId} onToggleAway={togglePlayerAway} onExitPlayer={permanentlyExitPlayer}
  />;

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={reset} aria-label="返回谁是卧底首页"><span className="brand__mark">卧</span><span>卧底裁判局</span></button><div className="topbar__right"><a className="mode-switch" href="../">目录</a><button className="mode-switch" onClick={switchDisplayMode} aria-label="切换到表格低干扰模式">表格模式</button><span className={`connection ${cloudReady ? 'is-online' : ''}`}><i />{cloudReady ? '联机已就绪' : '本机演示模式'}</span>{room && <button className="room-code" onClick={copyRoomCode}>房间 {room.code} · 复制</button>}</div></header>

    {screen === 'home' && <div className="home"><section className="hero"><div className="hero__copy"><p className="eyebrow">WHO IS THE UNDERCOVER · DESKTOP</p><h1>偷偷发牌，<br /><em>认真数票。</em></h1><p className="lede">不需要主持人。群里或线下照常聊，裁判器只在该出手的时候出现。</p><div className="hero__actions"><button className="button button--primary" onClick={openSetup}>创建一局 <span>→</span></button><button className="button button--outline" onClick={() => setGuideOpen(true)}>怎么玩？查看完整规则</button><span className="microcopy">3–10 人 · 匿名投票 · 自动判胜</span></div></div><div className="join-panel"><span className="panel-kicker">已有房间</span><h2>加入朋友的牌局</h2><label htmlFor="join-name">你的称呼</label><input className="plain-input" id="join-name" value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 12))} placeholder="例如：小王" /><label htmlFor="room-code">输入 6 位房间码</label><div className="code-input"><input id="room-code" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="Q7K2P8" /><button disabled={busy} onClick={tryRemoteJoin}>{busy ? '连接中' : '加入'}</button></div><p>{cloudReady ? '连接到 CloudBase 实时房间' : '联机功能等待 CloudBase 参数，本机演示可立即使用。'}</p></div></section><section className="feature-strip">{steps.slice(1).map(([number, label, description]) => <div key={number}><span>{number}</span><b>{label}</b><p>{description}</p></div>)}</section></div>}

    {screen === 'setup' && <div className="workspace setup-page">
      <div className="page-heading"><button className="back-link" onClick={() => setScreen('home')}>← 返回</button><p className="eyebrow">创建牌局</p><h1>先把规则说清楚。</h1><p>可创建多电脑联机房间，也可先在这一台电脑上完整演示。</p></div>
      <div className="setup-grid"><section className="paper-card">
        <div className="field-row"><div><label htmlFor="owner-name">你的称呼</label><p>你会成为这局的房主</p></div><input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 12))} /></div>
        <div className="field-row field-row--stack"><div><label>玩家人数</label><p>可设置 3–10 人，重点优化 8 人局</p></div><div className="segmented segmented--many">{PLAYER_LIMIT_OPTIONS.map((limit) => <button className={playerLimit === limit ? 'is-selected' : ''} onClick={() => choosePlayerLimit(limit)} key={limit}>{limit} 人</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>卧底人数</label><p>3–8 人默认 1 名，9–10 人默认 2 名</p></div><div className="segmented">{undercoverOptions(playerLimit).map((count) => <button className={undercoverCount === count ? 'is-selected' : ''} onClick={() => setUndercoverCount(count)} key={count}>{count} 名</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>本轮挑战</label><p>每轮公开一条规则，目前由玩家自觉遵守</p></div><div className="segmented">{(['off', 'light', 'random'] as ChallengeMode[]).map((mode) => <button className={challengeMode === mode ? 'is-selected' : ''} onClick={() => setChallengeMode(mode)} key={mode}>{challengeModeLabel(mode)}</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>描述方式</label><p>统一公开更公平；依次公开更像线下发言</p></div><div className="segmented">{(['all_submitted', 'sequential'] as DescriptionRevealMode[]).map((mode) => <button className={descriptionRevealMode === mode ? 'is-selected' : ''} onClick={() => setDescriptionRevealMode(mode)} key={mode}>{descriptionModeLabel(mode)}</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>卧底猜词翻盘</label><p>全阵营每局一次，20 秒内猜中另一组词立即获胜</p></div><div className="segmented"><button className={!undercoverComebackEnabled ? 'is-selected' : ''} onClick={() => setUndercoverComebackEnabled(false)}>关闭</button><button className={undercoverComebackEnabled ? 'is-selected' : ''} onClick={() => setUndercoverComebackEnabled(true)}>开启</button></div></div>
        <div className="field-row field-row--stack"><div><label>猜词爆灯</label><p>任何存活玩家可主动猜词；猜错或超时立即退出</p></div><div className="segmented"><button className={!buzzerEnabled ? 'is-selected' : ''} onClick={() => setBuzzerEnabled(false)}>关闭</button><button className={buzzerEnabled ? 'is-selected' : ''} onClick={() => setBuzzerEnabled(true)}>开启</button></div></div>
        <div className="field-row field-row--stack"><div><label>自动进入下一轮</label><p>结果展示 10 秒后自动继续，房主可以暂停</p></div><div className="segmented"><button className={!autoAdvanceEnabled ? 'is-selected' : ''} onClick={() => setAutoAdvanceEnabled(false)}>关闭</button><button className={autoAdvanceEnabled ? 'is-selected' : ''} onClick={() => setAutoAdvanceEnabled(true)}>开启</button></div></div>
        <div className="field-row field-row--stack"><div><label>词语来源</label><p>开局后普通界面不会同时展示两组词</p></div><div className="segmented"><button className={!customWords ? 'is-selected' : ''} onClick={() => { const [a, b] = randomWordPair(); setCivilianWord(a); setUndercoverWord(b); setCustomWords(false); }}>系统随机</button><button className={customWords ? 'is-selected' : ''} onClick={() => { setCustomWords(true); setCivilianWord(''); setUndercoverWord(''); }}>自定义</button></div></div>
        <div className="word-grid"><label>词语 A<input value={civilianWord} onChange={(event) => { setCivilianWord(event.target.value); setCustomWords(true); }} placeholder="输入词语 A" aria-label="普通成员词语" /></label><label>词语 B<input value={undercoverWord} onChange={(event) => { setUndercoverWord(event.target.value); setCustomWords(true); }} placeholder="输入相近的词语 B" aria-label="卧底成员词语" /></label></div>
        <div className="create-actions"><button className="button button--primary button--wide" disabled={busy || !cloudReady} onClick={createRemote}>{busy ? '正在创建…' : '创建多电脑联机房间'} <span>→</span></button><button className="button button--outline button--wide" onClick={createDemo}>先在本机演示完整流程</button></div>{!cloudReady && <p className="setup-hint">联机按钮会在填入 CloudBase 参数后自动启用。</p>}
      </section><aside className="rules-card"><span className="stamp">本局规则</span><h2>{playerLimit} 人 / {undercoverCount} 名卧底</h2><ol><li>全员依次查看秘密词语，不显示角色</li><li>描述方式：{descriptionModeLabel(descriptionRevealMode)}</li><li>本轮挑战：{challengeModeLabel(challengeMode)}</li><li>猜词翻盘：{undercoverComebackEnabled ? '开启' : '关闭'}；猜词爆灯：{buzzerEnabled ? '开启' : '关闭'}</li><li>自动下一轮：{autoAdvanceEnabled ? '开启（10 秒）' : '关闭'}</li><li>首次平票仅对并列者复投</li><li>卧底人数不低于平民时获胜</li></ol><p>每位玩家进入房间后都能查看规则摘要。这是熟人娱乐模式，不防开发者工具查看牌局数据。</p></aside></div>
    </div>}

    {screen === 'game' && room && <div className="workspace game-page"><Progress room={room} /><div className="game-heading"><div><p className="eyebrow">{statusCopy(room)}</p><h1>{room.status === 'lobby' ? '确认玩家名单' : room.status === 'cards' ? '把电脑交给指定玩家' : room.status === 'discussion' ? '按本轮规则来描述。' : room.status === 'voting' ? (room.ballot === 2 ? '平票了，只投并列者。' : '请依次秘密投票。') : room.status === 'guessing' ? '正在进行特殊判定。' : room.status === 'finished' ? (room.winner === 'undercover' ? '流程已完成。' : '胜负已定。') : '这一轮，有结果了。'}</h1></div><div className="round-badge"><span>ROUND</span><b>{String(room.round).padStart(2, '0')}</b></div></div>
      <details className="public-rules" open={room.status === 'lobby' || room.status === 'discussion'}><summary>本局规则 · {descriptionModeLabel(room.descriptionRevealMode ?? 'all_submitted')} · 挑战 {challengeModeLabel(room.challengeMode ?? 'off')} · 爆灯 {room.buzzerEnabled ? '开启' : '关闭'}</summary><div><b>本轮公共规则：{getRoundChallenge(room, room.round)?.text ?? '无附加规则'}</b><span>描述方式：{descriptionModeLabel(room.descriptionRevealMode ?? 'all_submitted')}；挑战规则由玩家自觉遵守。</span><span>猜词翻盘 {room.undercoverComebackEnabled ? '开启' : '关闭'}；猜词爆灯 {room.buzzerEnabled ? '开启' : '关闭'}；自动下一轮 {(room.autoAdvanceEnabled ?? true) ? '开启' : '关闭'}。</span><button onClick={copyCurrentRule}>复制本轮规则</button></div></details>
      {room.status !== 'finished' && <div className="presence-actions" aria-label="玩家暂退与退出">{(remoteMode ? room.players.filter((player) => player.id === currentPlayerId) : room.players).filter((player) => player.alive).map((player) => <div key={player.id}><span>{player.name}{player.away ? ' · 暂退中' : ''}</span><button onClick={() => togglePlayerAway(player.id)}>{player.away ? '返回' : '暂退'}</button><button className="is-danger" onClick={() => permanentlyExitPlayer(player.id)}>退出</button></div>)}</div>}
      {(['discussion', 'voting', 'result'] as const).includes(room.status as 'discussion' | 'voting' | 'result') && !wordReviewPlayerId && (remoteMode ? wordReviewPlayer : room.players.some((player) => player.cardReady)) && <div className="word-review-actions">{remoteMode && wordReviewPlayer ? <button onClick={() => { setWordReviewPlayerId(wordReviewPlayer.id); setPrivacyGate(true); setRevealed(false); }}>再次查看自己的词语</button> : room.players.filter((player) => player.cardReady).map((player) => <button key={player.id} onClick={() => { setWordReviewPlayerId(player.id); setPrivacyGate(true); setRevealed(false); }}>{player.name} · 复看词语</button>)}</div>}
      {wordReviewPlayerId && wordReviewPlayer && (['discussion', 'voting', 'result'] as const).includes(room.status as 'discussion' | 'voting' | 'result') && <section className="private-word-review">{privacyGate ? <div className="privacy-gate"><span className="seat__avatar seat__avatar--large">{wordReviewPlayer.name.slice(0, 1)}</span><p>再次查看词语</p><h2>{wordReviewPlayer.name}</h2><span>请确认屏幕前只有你本人</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>我就是本人</button><button className="back-link" onClick={() => setWordReviewPlayerId(null)}>取消</button></div> : <div className={`identity-card ${revealed ? 'is-revealed' : ''}`}><div className="identity-card__cover"><span>按住鼠标或空格键</span><b>查看自己的词语</b><i>松手立即遮挡</i></div><div className="identity-card__secret"><span>仅你可见</span><p>自己的词语</p><strong>{room.assignments[wordReviewPlayer.id]?.word}</strong></div><button aria-label="按住再次查看自己的秘密词语" onPointerDown={() => setRevealed(true)} onPointerUp={() => setRevealed(false)} onPointerLeave={() => setRevealed(false)} onKeyDown={(event) => { if (event.code === 'Space') { event.preventDefault(); setRevealed(true); } }} onKeyUp={(event) => { if (event.code === 'Space') setRevealed(false); }} /><button className="word-review-close" onClick={() => { setRevealed(false); setWordReviewPlayerId(null); }}>关闭复看</button></div>}</section>}
      {room.status === 'lobby' && <section className="game-card lobby-card"><div className="section-title"><div><span className="panel-kicker">座位表</span><h2>{room.players.length}/{room.playerLimit} 人已就位</h2></div><span>{remoteMode ? '分享房间码邀请朋友' : '可直接改名'}</span></div><div className="lobby-list">{room.players.map((player) => <label className="lobby-player" key={player.id}><span>{String(player.seat).padStart(2, '0')}</span><input disabled={remoteMode} value={player.name} onChange={(event) => renamePlayer(player.id, event.target.value)} /><i>{player.id === room.ownerId ? '房主' : '玩家'}</i></label>)}</div>{!remoteMode || currentPlayerId === room.ownerId ? <button className="button button--primary button--wide" disabled={room.players.length !== room.playerLimit} onClick={startDealing}>{room.players.length === room.playerLimit ? '锁定名单并随机发牌' : `还差 ${room.playerLimit - room.players.length} 人`} <span>→</span></button> : <div className="waiting-line">等待房主在玩家到齐后发牌…</div>}</section>}
      {room.status === 'cards' && activeCardPlayer && <section className="private-stage"><aside className="player-queue"><span className="panel-kicker">个人信息进度</span><h2>{room.players.filter((player) => player.cardReady).length}/{room.players.length} 已确认</h2>{room.players.map((player) => <Seat player={player} key={player.id} />)}</aside><div className="private-card-wrap">{privacyGate ? <div className="privacy-gate"><span className="seat__avatar seat__avatar--large">{activeCardPlayer.name.slice(0, 1)}</span><p>下一位</p><h2>{activeCardPlayer.name}</h2><span>请确认身边没有人偷看屏幕</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>我就是本人</button></div> : <div className={`identity-card ${revealed ? 'is-revealed' : ''}`}><div className="identity-card__cover" aria-hidden={revealed}><span>按住鼠标或空格键</span><b>查看我的词语</b><i>松手立即遮挡</i></div><div className="identity-card__secret" aria-hidden={!revealed}><span>仅你可见</span><p>你的词语</p><strong>{room.assignments[activeCardPlayer.id].word}</strong></div><button aria-label="按住查看自己的秘密词语，不显示角色" onPointerDown={() => setRevealed(true)} onPointerUp={() => setRevealed(false)} onPointerLeave={() => setRevealed(false)} onKeyDown={(event) => { if (event.code === 'Space') { event.preventDefault(); setRevealed(true); } }} onKeyUp={(event) => { if (event.code === 'Space') setRevealed(false); }} /></div>}{!privacyGate && <button className="button button--primary button--wide" onClick={confirmCard} disabled={revealed}>已确认自己的词语 <span>→</span></button>}</div></section>}
      {room.status === 'cards' && remoteMode && !activeCardPlayer && <section className="waiting-panel"><span className="stamp">私牌已确认</span><h2>请把注意力放回桌边。</h2><p>还有 {eligibleVoters(room).filter((player) => !player.cardReady).length} 位在场玩家没有确认私牌；全部完成后会自动进入讨论。</p></section>}
      {room.status === 'discussion' && <section className="discussion-card">
        <div className="talk-mark"><span>{descriptionsAreRevealed(room, clockNow) ? formatCountdown(votingOpenRemainingSeconds) : formatCountdown(discussionRemainingSeconds)}</span>{descriptionsAreRevealed(room, clockNow) ? '投' : '填'}</div>
        <div>
          <span className="panel-kicker">第 {room.round} 轮本轮内容 · {descriptionModeLabel(room.descriptionRevealMode ?? 'all_submitted')}</span>
          <h2>{getRoundChallenge(room, room.round)?.text ?? '本轮自由表达'}</h2>
          <p>{(room.descriptionRevealMode ?? 'all_submitted') === 'sequential' ? '系统按座位顺序开放输入，每人独立拥有 120 秒；提交后立即公开，超时只跳过当前玩家。' : '每个人先独立提交；全员完成或 120 秒倒计时结束后，所有描述一次公开。'} 挑战规则只提示、不拦截提交。</p>
          {activeDiscussionPlayer && !descriptionsAreRevealed(room, clockNow) && <div className="round-content-form"><label htmlFor="round-content">{activeDiscussionPlayer.name} 的本轮内容 · {roundContentDraft.length} 字</label><div><input id="round-content" maxLength={ROUND_CONTENT_MAX_LENGTH} value={roundContentDraft} onChange={(event) => setRoundContentDraft(event.target.value)} placeholder="在此填写本轮内容" /><button className="button button--dark" disabled={!roundContentDraft.trim()} onClick={submitCurrentRoundContent}>提交本轮内容</button></div></div>}
          <div className="alive-row">{room.players.filter((player) => player.alive).map((player) => <span key={player.id}>{player.name} · {player.away ? '暂退' : getRoundContents(room)[player.id] ? isRoundContentVisible(room, player.id, remoteMode ? currentPlayerId : activeDiscussionPlayer?.id, clockNow) ? '已公开' : '已提交，等待公开' : (room.skippedDescriptionPlayerIds ?? []).includes(player.id) ? '本轮未提交' : getDescriptionTurnPlayer(room)?.id === player.id ? '当前填写' : '待提交'}</span>)}</div>
          {descriptionsAreRevealed(room, clockNow) && <div className="description-review"><h3>本轮描述已公开 · {votingOpenRemainingSeconds} 秒后自动开放投票</h3>{room.players.filter((player) => player.alive || getRoundContents(room)[player.id]).map((player) => <div key={player.id}><b>{player.name}</b><span>{getRoundContents(room)[player.id] ?? '本轮未提交'}</span></div>)}</div>}
          {(!remoteMode || currentPlayerId === room.ownerId) && (room.descriptionRevealMode ?? 'all_submitted') === 'sequential' && getDescriptionTurnPlayer(room) && <button className="button button--outline" onClick={skipCurrentDescription}>跳过 {getDescriptionTurnPlayer(room)?.name} 的本轮描述</button>}
          {!remoteMode || currentPlayerId === room.ownerId
            ? <button className="button button--primary" disabled={!canBeginVoting(room, clockNow)} onClick={beginVoting}>{canBeginVoting(room, clockNow) ? `立即开放投票（${votingOpenRemainingSeconds} 秒后自动）` : `等待描述公开 · ${formatCountdown(discussionRemainingSeconds)}`} <span>→</span></button>
            : <div className="waiting-line">{canBeginVoting(room, clockNow) ? `${votingOpenRemainingSeconds} 秒后自动开放投票…` : `本轮剩余 ${formatCountdown(discussionRemainingSeconds)}`}</div>}
          {descriptionsAreRevealed(room, clockNow) && room.buzzerEnabled && !room.buzzerUsedBy && <div className="buzzer-actions"><span>觉得自己可能是卧底？</span>{(remoteMode ? eligibleVoters(room).filter((player) => player.id === currentPlayerId) : eligibleVoters(room)).map((player) => <button key={player.id} onClick={() => startBuzzer(player.id)}>{remoteMode ? '我要猜词爆灯' : `${player.name} 猜词爆灯`}</button>)}</div>}
        </div>
      </section>}
      {room.status === 'voting' && <section className="voting-descriptions"><div><span className="panel-kicker">投票参考</span><h2>本轮所有公开描述</h2></div><div className="description-review">{room.players.filter((player) => player.alive || getRoundContents(room)[player.id]).map((player) => <div key={player.id}><b>{player.name}</b><span>{getRoundContents(room)[player.id] ?? '本轮未提交'}</span></div>)}</div>{room.buzzerEnabled && !room.buzzerUsedBy && <div className="buzzer-actions">{(remoteMode ? eligibleVoters(room).filter((player) => player.id === currentPlayerId) : eligibleVoters(room)).map((player) => <button key={player.id} onClick={() => startBuzzer(player.id)}>{remoteMode ? '我要猜词爆灯' : `${player.name} 猜词爆灯`}</button>)}</div>}</section>}
      {room.status === 'voting' && activeVoter && <section className="vote-layout"><aside className="vote-progress"><span className="panel-kicker">匿名投票</span><h2>{Object.keys(room.votes).length}/{eligibleVoters(room).length} 已提交</h2><p>本轮描述保留在上方供参考。实时票型不会展示，当前玩家提交后请把电脑交给下一位。</p><div className="meter"><i style={{ width: `${Object.keys(room.votes).length / eligibleVoters(room).length * 100}%` }} /></div></aside><div className="vote-card">{privacyGate ? <div className="privacy-gate privacy-gate--vote"><span className="seat__avatar seat__avatar--large">{activeVoter.name.slice(0, 1)}</span><p>轮到</p><h2>{activeVoter.name}</h2><span>其他人请暂时移开视线</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>开始秘密投票</button></div> : <><div className="section-title"><div><span className="panel-kicker">{room.ballot === 2 ? '复投候选人' : '选出你认为的卧底'}</span><h2>{activeVoter.name}，请投一票</h2></div><span>不能投自己</span></div><div className="candidate-grid">{eligibleCandidates(room).filter((candidate) => candidate.id !== activeVoter.id).map((candidate) => <button className={selectedCandidateId === candidate.id ? 'is-selected' : ''} onClick={() => setSelectedCandidateId(candidate.id)} key={candidate.id}><span>{candidate.name.slice(0, 1)}</span><b>{candidate.name}</b><i>{selectedCandidateId === candidate.id ? '已选择' : '选择'}</i></button>)}</div><button className="button button--primary button--wide" disabled={!selectedCandidateId} onClick={submitVote}>确认提交（之后不可查看） <span>→</span></button></>}</div></section>}
      {room.status === 'voting' && remoteMode && !activeVoter && <section className="waiting-panel"><span className="stamp">投票已提交</span><h2>{Object.keys(room.votes).length}/{eligibleVoters(room).length} 人已经投票</h2><p>提交内容已隐藏。等最后一票完成，所有人的页面会同时看到公开票数和裁判结果。</p><div className="meter"><i style={{ width: `${Object.keys(room.votes).length / eligibleVoters(room).length * 100}%` }} /></div></section>}
      {room.status === 'guessing' && activeComebackPlayer && <section className="comeback-panel">{privacyGate ? <div className="privacy-gate"><span className="seat__avatar seat__avatar--large">{activeComebackPlayer.name.slice(0, 1)}</span><p>{room.pendingGuessingReason === 'buzzer' ? '猜词爆灯' : '私密机会'}</p><h2>{activeComebackPlayer.name}</h2><span>请确认屏幕前只有你本人，倒计时正在继续</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>开始猜词</button></div> : <div className="comeback-form"><span className="stamp">{room.pendingGuessingReason === 'buzzer' ? '爆灯只能尝试一次' : '全阵营仅此一次'}</span><h2>猜出另一组词语</h2><strong>{formatCountdown(comebackRemainingSeconds)}</strong><p>{room.pendingGuessingReason === 'buzzer' ? '只有真正的卧底且完全猜中才能获胜；身份错误、猜错或超时都会立即退出。' : '只能提交一次；猜中后卧底阵营立即获胜，猜错或超时则正常退出。'}</p><input value={comebackDraft} onChange={(event) => setComebackDraft(event.target.value.slice(0, 30))} placeholder="输入另一组词语" aria-label="卧底猜词翻盘答案" autoFocus /><button className="button button--primary button--wide" disabled={!comebackDraft.trim()} onClick={submitComeback}>确认提交答案 <span>→</span></button></div>}</section>}
      {room.status === 'guessing' && !activeComebackPlayer && <section className="waiting-panel"><span className="stamp">{room.pendingGuessingReason === 'buzzer' ? '猜词爆灯' : '特殊判定'}</span><h2>{formatCountdown(comebackRemainingSeconds)}</h2><p>一名成员正在私密完成判定。结果提交或倒计时结束后会统一处理。</p></section>}
      {(room.status === 'result' || room.status === 'finished') && room.lastResult && <section className="result-layout"><div className={`verdict ${room.status === 'finished' ? 'is-final' : ''}`}><span className="stamp">裁判结果</span>{room.lastComebackResult?.correct ? <><p>本局结果</p><h2>流程已完成</h2><strong>猜词翻盘成功 · 正确答案：{room.civilianWord}</strong></> : eliminatedUndercoverName(room) ? <><p>成功找出卧底</p><h2>{eliminatedUndercoverName(room)}</h2><strong>{room.lastComebackResult ? `翻盘${room.lastComebackResult.timedOut ? '超时' : '失败'} · ` : ''}{room.status === 'finished' ? '所有卧底已经找出 · 平民胜利' : '仍有卧底 · 游戏继续'}</strong></> : room.status === 'finished' ? room.winner === 'undercover' ? <><p>本局结果</p><h2>流程已完成</h2><strong>卧底人数已不低于平民</strong></> : <><p>本局胜方</p><h2>平民阵营</h2><strong>所有卧底已经出局</strong></> : room.lastResult.noElimination ? <><p>第二次仍然平票</p><h2>本轮无人出局</h2><strong>游戏继续</strong></> : <><p>最高票玩家</p><h2>{playerName(room, room.lastResult.eliminatedId)}</h2><strong>本轮退出 · 游戏继续</strong></>}</div><div className="tally"><div className="section-title"><div><span className="panel-kicker">公开票数</span><h2>第 {room.lastResult.round} 轮{room.lastResult.ballot === 2 ? '复投' : ''}</h2></div><span>不公开谁投了谁</span></div>{Object.entries(room.lastResult.counts).sort((a, b) => b[1] - a[1]).map(([id, count]) => <div className="tally-row" key={id}><span>{playerName(room, id)}</span><i><b style={{ width: `${count / eligibleVoters(room).length * 100}%` }} /></i><strong>{count} 票</strong></div>)}{room.status === 'finished' && <div className="reveal-list"><h3>身份公开</h3>{room.players.map((player) => <div key={player.id}><span>{player.name}</span><b>{roleRevealCopy(room, player.id)}</b></div>)}</div>}{room.status === 'result' && (room.autoAdvanceEnabled ?? true) && <div className="auto-advance"><strong>{room.autoAdvancePaused ? '自动进入已暂停' : `${nextRoundRemainingSeconds} 秒后自动进入第 ${room.round + 1} 轮`}</strong></div>}{!remoteMode || currentPlayerId === room.ownerId ? room.status === 'finished' ? <button className="button button--primary button--wide" onClick={rematch}>原班人马换词再来一局 <span>→</span></button> : <div className="result-actions"><button className="button button--primary" onClick={continueGame}>立即进入第 {room.round + 1} 轮 <span>→</span></button>{(room.autoAdvanceEnabled ?? true) && <button className="button button--outline" onClick={toggleAutoAdvance}>{room.autoAdvancePaused ? '继续自动进入' : '暂停自动进入'}</button>}</div> : <div className="waiting-line">{room.status === 'result' && (room.autoAdvanceEnabled ?? true) ? (room.autoAdvancePaused ? '房主已暂停自动进入' : `${nextRoundRemainingSeconds} 秒后自动进入下一轮`) : '等待房主推进游戏…'}</div>}</div></section>}
    </div>}
    {guideOpen && <RulesGuide onClose={() => setGuideOpen(false)} />}
    {notice && <div className={`toast toast--${notice.kind}`} role="status">{notice.text}</div>}
  </main>;
}
