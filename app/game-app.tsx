'use client';

import { useEffect, useMemo, useState } from 'react';
import { applyBallotResult, canBeginVoting, challengeModeLabel, createRoom, dealRoom, eligibleCandidates, eligibleVoters, getRoundChallenge, getRoundContents, makeId, PLAYER_LIMIT_OPTIONS, resolveBallot, resolveUndercoverComeback, ROUND_CONTENT_MAX_LENGTH, startDiscussion, startNextRound, submitRoundContent as recordRoundContent, undercoverOptions, type ChallengeMode, type GameRoom, type Player } from '@/lib/game';
import { getCloudStore } from '@/lib/cloudbase-store';
import { randomWordPair } from '@/lib/words';
import SpreadsheetMode from './spreadsheet-mode';

type Screen = 'home' | 'setup' | 'game';
type DisplayMode = 'spreadsheet' | 'immersive';
type Notice = { kind: 'info' | 'error'; text: string } | null;
const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);
const steps = [['01', '建房', '选人数和词语'], ['02', '发牌', '轮流查看私牌'], ['03', '投票', '匿名提交选择'], ['04', '判定', '自动处理胜负']] as const;

function playerName(room: GameRoom, id: string | null | undefined): string {
  return room.players.find((player) => player.id === id)?.name ?? '无人';
}

function eliminatedUndercoverName(room: GameRoom): string | null {
  const eliminatedId = room.lastResult?.eliminatedId;
  return eliminatedId && room.assignments[eliminatedId]?.role === 'undercover' ? playerName(room, eliminatedId) : null;
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

function Seat({ player }: { player: Player }) {
  return <div className={`seat ${!player.alive ? 'is-out' : ''}`}><span className="seat__number">{String(player.seat).padStart(2, '0')}</span><span className="seat__avatar">{player.name.slice(0, 1)}</span><span className="seat__name">{player.name}</span><span className="seat__status">{player.alive ? (player.cardReady ? '已确认' : '在场') : '已出局'}</span></div>;
}

export default function GameApp() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('spreadsheet');
  const [screen, setScreen] = useState<Screen>('home');
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [ownerName, setOwnerName] = useState('房主');
  const [playerLimit, setPlayerLimit] = useState(8);
  const [undercoverCount, setUndercoverCount] = useState(1);
  const [civilianWord, setCivilianWord] = useState('');
  const [undercoverWord, setUndercoverWord] = useState('');
  const [customWords, setCustomWords] = useState(false);
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('off');
  const [undercoverComebackEnabled, setUndercoverComebackEnabled] = useState(false);
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
    const activeRemote = window.localStorage.getItem('undercover-active-remote');
    if (activeRemote && cloudReady) {
      try {
        const { code, playerId } = JSON.parse(activeRemote) as { code: string; playerId: string };
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
  const comebackDeadline = room?.status === 'guessing' ? room.comebackDeadlineAt : null;
  useEffect(() => {
    if (!discussionDeadline && !comebackDeadline) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [discussionDeadline, comebackDeadline]);

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
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && !player.cardReady) ?? null;
    return room.players.find((player) => player.id === revealPlayerId) ?? room.players.find((player) => !player.cardReady) ?? null;
  }, [room, revealPlayerId, remoteMode, currentPlayerId]);

  const activeVoter = useMemo(() => {
    if (!room || room.status !== 'voting') return null;
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && player.alive && !room.votes[player.id]) ?? null;
    return room.players.find((player) => player.id === votePlayerId && player.alive && !room.votes[player.id]) ?? room.players.find((player) => player.alive && !room.votes[player.id]) ?? null;
  }, [room, votePlayerId, remoteMode, currentPlayerId]);

  const activeDiscussionPlayer = useMemo(() => {
    if (!room || room.status !== 'discussion') return null;
    const contents = getRoundContents(room);
    if (remoteMode) return room.players.find((player) => player.id === currentPlayerId && player.alive && !contents[player.id]) ?? null;
    return room.players.find((player) => player.id === discussionPlayerId && player.alive && !contents[player.id])
      ?? room.players.find((player) => player.alive && !contents[player.id]) ?? null;
  }, [room, remoteMode, currentPlayerId, discussionPlayerId]);

  const activeComebackPlayer = useMemo(() => {
    if (!room || room.status !== 'guessing' || !room.pendingComebackPlayerId) return null;
    const player = room.players.find((item) => item.id === room.pendingComebackPlayerId) ?? null;
    if (remoteMode && player?.id !== currentPlayerId) return null;
    return player;
  }, [room, remoteMode, currentPlayerId]);

  const discussionRemainingSeconds = discussionDeadline ? Math.max(0, Math.ceil((discussionDeadline - clockNow) / 1000)) : 0;
  const comebackRemainingSeconds = comebackDeadline ? Math.max(0, Math.ceil((comebackDeadline - clockNow) / 1000)) : 0;

  function commitRoom(next: GameRoom) {
    setRoom(next);
    if (remoteMode) void getCloudStore().saveRoom(next).catch((error) => setNotice({ kind: 'error', text: error instanceof Error ? error.message : '同步失败' }));
  }

  useEffect(() => {
    if (!room || room.status !== 'guessing' || comebackRemainingSeconds > 0 || !room.pendingComebackPlayerId) return;
    const timeout = window.setTimeout(() => {
      const next = resolveUndercoverComeback(room, room.pendingComebackPlayerId!, '', Date.now());
      setRoom(next);
      if (remoteMode) void getCloudStore().saveRoom(next).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [room, comebackRemainingSeconds, remoteMode]);

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
    const base = createRoom({ ownerId, ownerName, playerLimit, undercoverCount, civilianWord, undercoverWord, challengeMode, undercoverComebackEnabled });
    const players: Player[] = Array.from({ length: playerLimit }, (_, index) => index === 0 ? base.players[0] : { id: makeId('player'), name: `玩家 ${index + 1}`, seat: index + 1, alive: true, cardReady: false });
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
      const next = createRoom({ ownerId, ownerName, playerLimit, undercoverCount, civilianWord, undercoverWord, challengeMode, undercoverComebackEnabled });
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

  function confirmCard() {
    if (!room || !activeCardPlayer) return;
    const players = room.players.map((player) => player.id === activeCardPlayer.id ? { ...player, cardReady: true } : player);
    const nextPlayer = players.find((player) => !player.cardReady);
    const everybodyReady = players.every((player) => player.cardReady);
    if (remoteMode) {
      const next = everybodyReady
        ? startDiscussion({ ...room, players })
        : { ...room, players, status: 'cards' as const, version: room.version + 1, updatedAt: Date.now() };
      commitRoom(next);
      setPrivacyGate(true); return;
    }
    if (!nextPlayer) { const next = startDiscussion({ ...room, players }); commitRoom(next); setDiscussionPlayerId(next.players.find((player) => player.alive)?.id ?? null); setRoundContentDraft(''); setRevealPlayerId(null); setPrivacyGate(true); return; }
    commitRoom({ ...room, players }); setRevealPlayerId(nextPlayer.id); setRevealed(false); setPrivacyGate(true);
  }

  function submitCurrentRoundContent() {
    if (!room || !activeDiscussionPlayer) return;
    try {
      const next = recordRoundContent(room, activeDiscussionPlayer.id, roundContentDraft);
      commitRoom(next);
      setRoundContentDraft('');
      if (!remoteMode) setDiscussionPlayerId(next.players.find((player) => player.alive && !getRoundContents(next)[player.id])?.id ?? null);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '本轮内容提交失败' }); }
  }

  function beginVoting() {
    if (!room) return;
    if (!canBeginVoting(room, Date.now())) return setNotice({ kind: 'info', text: '请等待全员提交本轮内容或倒计时结束' });
    const first = eligibleVoters(room)[0];
    commitRoom({ ...room, status: 'voting', ballot: 1, votes: {}, runoffCandidateIds: [], discussionDeadlineAt: null, version: room.version + 1, updatedAt: Date.now() });
    setVotePlayerId(first?.id ?? null); setSelectedCandidateId(null); setPrivacyGate(true);
  }

  function submitVote() {
    if (!room || !activeVoter || !selectedCandidateId) return;
    const votes = { ...room.votes, [activeVoter.id]: selectedCandidateId };
    const withVote = { ...room, votes, version: room.version + 1, updatedAt: Date.now() };
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
      commitRoom(next); setComebackDraft(''); setPrivacyGate(true);
    } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : '翻盘答案提交失败' }); }
  }

  function continueGame() { if (room) { const next = startNextRound(room); commitRoom(next); setDiscussionPlayerId(next.players.find((player) => player.alive)?.id ?? null); setRoundContentDraft(''); } }
  function rematch() { if (room) { const fresh = dealRoom({ ...room, status: 'lobby', players: room.players.map((player) => ({ ...player, alive: true, cardReady: false })) }); commitRoom(fresh); setRevealPlayerId(fresh.players[0]?.id ?? null); setPrivacyGate(true); } }
  async function copyRoomCode() { if (!room) return; try { await navigator.clipboard.writeText(room.code); } catch { /* clipboard may be unavailable */ } setNotice({ kind: 'info', text: `房间码 ${room.code} 已复制` }); }
  async function copyCurrentRule() { if (!room) return; const text = `本局设置：${challengeModeLabel(room.challengeMode ?? 'off')}挑战｜特殊判定${room.undercoverComebackEnabled ? '开启' : '关闭'}\nRound_${String(room.round).padStart(2, '0')}：${getRoundChallenge(room, room.round)?.text ?? '无附加规则'}\n挑战规则由玩家自觉遵守。特殊判定开启时，被选中的成员有一次 20 秒猜另一组词的机会，猜中立即胜利。`; try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable */ } setNotice({ kind: 'info', text: '本轮公共规则已复制' }); }
  function reset() { setScreen('home'); setRoom(null); setRemoteMode(false); setCurrentPlayerId(null); setRevealPlayerId(null); setVotePlayerId(null); setDiscussionPlayerId(null); setRoundContentDraft(''); setComebackDraft(''); setPrivacyGate(true); window.localStorage.removeItem('undercover-demo-room'); window.localStorage.removeItem('undercover-active-remote'); }

  if (displayMode === 'spreadsheet') return <SpreadsheetMode
    screen={screen} room={room} notice={notice} cloudReady={cloudReady} busy={busy} remoteMode={remoteMode}
    currentPlayerId={currentPlayerId} activeCardPlayer={activeCardPlayer} activeDiscussionPlayer={activeDiscussionPlayer} activeVoter={activeVoter} activeComebackPlayer={activeComebackPlayer} selectedCandidateId={selectedCandidateId}
    roundContentDraft={roundContentDraft} discussionRemainingSeconds={discussionRemainingSeconds} comebackDraft={comebackDraft} comebackRemainingSeconds={comebackRemainingSeconds} canOpenVoting={room ? canBeginVoting(room, clockNow) : false}
    ownerName={ownerName} playerLimit={playerLimit} undercoverCount={undercoverCount} civilianWord={civilianWord} undercoverWord={undercoverWord}
    customWords={customWords} challengeMode={challengeMode} undercoverComebackEnabled={undercoverComebackEnabled} joinCode={joinCode} joinName={joinName} onSwitchMode={switchDisplayMode} onOpenSetup={openSetup}
    onBackHome={() => setScreen('home')} onReset={reset} onCopyRoomCode={() => void copyRoomCode()} onCopyCurrentRule={() => void copyCurrentRule()} onJoin={() => void tryRemoteJoin()}
    onCreateDemo={createDemo} onCreateRemote={() => void createRemote()} onStartDealing={startDealing} onConfirmCard={confirmCard}
    onRoundContentDraft={(value) => setRoundContentDraft(value.slice(0, ROUND_CONTENT_MAX_LENGTH))} onSubmitRoundContent={submitCurrentRoundContent}
    onBeginVoting={beginVoting} onSubmitVote={submitVote} onComebackDraft={setComebackDraft} onSubmitComeback={submitComeback} onContinue={continueGame} onRematch={rematch} onOwnerName={setOwnerName}
    onPlayerLimit={choosePlayerLimit} onUndercoverCount={setUndercoverCount} onCivilianWord={(value) => { setCivilianWord(value); setCustomWords(true); }}
    onUndercoverWord={(value) => { setUndercoverWord(value); setCustomWords(true); }} onRandomWords={() => { const [a, b] = randomWordPair(); setCivilianWord(a); setUndercoverWord(b); setCustomWords(false); }}
    onCustomWords={() => { setCustomWords(true); setCivilianWord(''); setUndercoverWord(''); }} onChallengeMode={setChallengeMode} onUndercoverComebackEnabled={setUndercoverComebackEnabled} onJoinCode={setJoinCode} onJoinName={setJoinName}
    onRenamePlayer={renamePlayer} onCandidate={setSelectedCandidateId}
  />;

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={reset} aria-label="返回首页"><span className="brand__mark">卧</span><span>卧底裁判局</span></button><div className="topbar__right"><button className="mode-switch" onClick={switchDisplayMode} aria-label="切换到表格低干扰模式">表格模式</button><span className={`connection ${cloudReady ? 'is-online' : ''}`}><i />{cloudReady ? '联机已就绪' : '本机演示模式'}</span>{room && <button className="room-code" onClick={copyRoomCode}>房间 {room.code} · 复制</button>}</div></header>

    {screen === 'home' && <div className="home"><section className="hero"><div className="hero__copy"><p className="eyebrow">WHO IS THE UNDERCOVER · DESKTOP</p><h1>偷偷发牌，<br /><em>认真数票。</em></h1><p className="lede">不需要主持人。群里或线下照常聊，裁判器只在该出手的时候出现。</p><div className="hero__actions"><button className="button button--primary" onClick={openSetup}>创建一局 <span>→</span></button><span className="microcopy">3–10 人 · 匿名投票 · 自动判胜</span></div></div><div className="join-panel"><span className="panel-kicker">已有房间</span><h2>加入朋友的牌局</h2><label htmlFor="join-name">你的称呼</label><input className="plain-input" id="join-name" value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 12))} placeholder="例如：小王" /><label htmlFor="room-code">输入 6 位房间码</label><div className="code-input"><input id="room-code" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="Q7K2P8" /><button disabled={busy} onClick={tryRemoteJoin}>{busy ? '连接中' : '加入'}</button></div><p>{cloudReady ? '连接到 CloudBase 实时房间' : '联机功能等待 CloudBase 参数，本机演示可立即使用。'}</p></div></section><section className="feature-strip">{steps.slice(1).map(([number, label, description]) => <div key={number}><span>{number}</span><b>{label}</b><p>{description}</p></div>)}</section></div>}

    {screen === 'setup' && <div className="workspace setup-page">
      <div className="page-heading"><button className="back-link" onClick={() => setScreen('home')}>← 返回</button><p className="eyebrow">创建牌局</p><h1>先把规则说清楚。</h1><p>可创建多电脑联机房间，也可先在这一台电脑上完整演示。</p></div>
      <div className="setup-grid"><section className="paper-card">
        <div className="field-row"><div><label htmlFor="owner-name">你的称呼</label><p>你会成为这局的房主</p></div><input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 12))} /></div>
        <div className="field-row field-row--stack"><div><label>玩家人数</label><p>可设置 3–10 人，重点优化 8 人局</p></div><div className="segmented segmented--many">{PLAYER_LIMIT_OPTIONS.map((limit) => <button className={playerLimit === limit ? 'is-selected' : ''} onClick={() => choosePlayerLimit(limit)} key={limit}>{limit} 人</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>卧底人数</label><p>3–8 人默认 1 名，9–10 人默认 2 名</p></div><div className="segmented">{undercoverOptions(playerLimit).map((count) => <button className={undercoverCount === count ? 'is-selected' : ''} onClick={() => setUndercoverCount(count)} key={count}>{count} 名</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>本轮挑战</label><p>每轮公开一条规则，目前由玩家自觉遵守</p></div><div className="segmented">{(['off', 'light', 'random'] as ChallengeMode[]).map((mode) => <button className={challengeMode === mode ? 'is-selected' : ''} onClick={() => setChallengeMode(mode)} key={mode}>{challengeModeLabel(mode)}</button>)}</div></div>
        <div className="field-row field-row--stack"><div><label>卧底猜词翻盘</label><p>全阵营每局一次，20 秒内猜中另一组词立即获胜</p></div><div className="segmented"><button className={!undercoverComebackEnabled ? 'is-selected' : ''} onClick={() => setUndercoverComebackEnabled(false)}>关闭</button><button className={undercoverComebackEnabled ? 'is-selected' : ''} onClick={() => setUndercoverComebackEnabled(true)}>开启</button></div></div>
        <div className="field-row field-row--stack"><div><label>词语来源</label><p>开局后普通界面不会同时展示两组词</p></div><div className="segmented"><button className={!customWords ? 'is-selected' : ''} onClick={() => { const [a, b] = randomWordPair(); setCivilianWord(a); setUndercoverWord(b); setCustomWords(false); }}>系统随机</button><button className={customWords ? 'is-selected' : ''} onClick={() => { setCustomWords(true); setCivilianWord(''); setUndercoverWord(''); }}>自定义</button></div></div>
        <div className="word-grid"><label>词语 A<input value={civilianWord} onChange={(event) => { setCivilianWord(event.target.value); setCustomWords(true); }} placeholder="输入词语 A" aria-label="普通成员词语" /></label><label>词语 B<input value={undercoverWord} onChange={(event) => { setUndercoverWord(event.target.value); setCustomWords(true); }} placeholder="输入相近的词语 B" aria-label="卧底成员词语" /></label></div>
        <div className="create-actions"><button className="button button--primary button--wide" disabled={busy || !cloudReady} onClick={createRemote}>{busy ? '正在创建…' : '创建多电脑联机房间'} <span>→</span></button><button className="button button--outline button--wide" onClick={createDemo}>先在本机演示完整流程</button></div>{!cloudReady && <p className="setup-hint">联机按钮会在填入 CloudBase 参数后自动启用。</p>}
      </section><aside className="rules-card"><span className="stamp">本局规则</span><h2>{playerLimit} 人 / {undercoverCount} 名卧底</h2><ol><li>全员依次查看秘密词语，不显示角色</li><li>本轮挑战：{challengeModeLabel(challengeMode)}</li><li>猜词翻盘：{undercoverComebackEnabled ? '开启' : '关闭'}</li><li>首次平票仅对并列者复投</li><li>卧底人数不低于平民时获胜</li></ol><p>每位玩家进入房间后都能查看规则摘要。这是熟人娱乐模式，不防开发者工具查看牌局数据。</p></aside></div>
    </div>}

    {screen === 'game' && room && <div className="workspace game-page"><Progress room={room} /><div className="game-heading"><div><p className="eyebrow">{statusCopy(room)}</p><h1>{room.status === 'lobby' ? '确认玩家名单' : room.status === 'cards' ? '把电脑交给指定玩家' : room.status === 'discussion' ? '按本轮规则来描述。' : room.status === 'voting' ? (room.ballot === 2 ? '平票了，只投并列者。' : '请依次秘密投票。') : room.status === 'guessing' ? '正在进行特殊判定。' : room.status === 'finished' ? '胜负已定。' : '这一轮，有结果了。'}</h1></div><div className="round-badge"><span>ROUND</span><b>{String(room.round).padStart(2, '0')}</b></div></div>
      <details className="public-rules" open={room.status === 'lobby' || room.status === 'discussion'}><summary>本局规则 · 挑战 {challengeModeLabel(room.challengeMode ?? 'off')} · 猜词翻盘 {room.undercoverComebackEnabled ? '开启' : '关闭'}</summary><div><b>本轮公共规则：{getRoundChallenge(room, room.round)?.text ?? '无附加规则'}</b><span>挑战规则由玩家自觉遵守，不影响提交。</span><span>猜词翻盘开启时，卧底阵营全局只有一次 20 秒猜词机会，猜中立即获胜。</span><button onClick={copyCurrentRule}>复制本轮规则</button></div></details>
      {room.status === 'lobby' && <section className="game-card lobby-card"><div className="section-title"><div><span className="panel-kicker">座位表</span><h2>{room.players.length}/{room.playerLimit} 人已就位</h2></div><span>{remoteMode ? '分享房间码邀请朋友' : '可直接改名'}</span></div><div className="lobby-list">{room.players.map((player) => <label className="lobby-player" key={player.id}><span>{String(player.seat).padStart(2, '0')}</span><input disabled={remoteMode} value={player.name} onChange={(event) => renamePlayer(player.id, event.target.value)} /><i>{player.id === room.ownerId ? '房主' : '玩家'}</i></label>)}</div>{!remoteMode || currentPlayerId === room.ownerId ? <button className="button button--primary button--wide" disabled={room.players.length !== room.playerLimit} onClick={startDealing}>{room.players.length === room.playerLimit ? '锁定名单并随机发牌' : `还差 ${room.playerLimit - room.players.length} 人`} <span>→</span></button> : <div className="waiting-line">等待房主在玩家到齐后发牌…</div>}</section>}
      {room.status === 'cards' && activeCardPlayer && <section className="private-stage"><aside className="player-queue"><span className="panel-kicker">个人信息进度</span><h2>{room.players.filter((player) => player.cardReady).length}/{room.players.length} 已确认</h2>{room.players.map((player) => <Seat player={player} key={player.id} />)}</aside><div className="private-card-wrap">{privacyGate ? <div className="privacy-gate"><span className="seat__avatar seat__avatar--large">{activeCardPlayer.name.slice(0, 1)}</span><p>下一位</p><h2>{activeCardPlayer.name}</h2><span>请确认身边没有人偷看屏幕</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>我就是本人</button></div> : <div className={`identity-card ${revealed ? 'is-revealed' : ''}`}><div className="identity-card__cover" aria-hidden={revealed}><span>按住鼠标或空格键</span><b>查看我的词语</b><i>松手立即遮挡</i></div><div className="identity-card__secret" aria-hidden={!revealed}><span>仅你可见</span><p>你的词语</p><strong>{room.assignments[activeCardPlayer.id].word}</strong></div><button aria-label="按住查看自己的秘密词语，不显示角色" onPointerDown={() => setRevealed(true)} onPointerUp={() => setRevealed(false)} onPointerLeave={() => setRevealed(false)} onKeyDown={(event) => { if (event.code === 'Space') { event.preventDefault(); setRevealed(true); } }} onKeyUp={(event) => { if (event.code === 'Space') setRevealed(false); }} /></div>}{!privacyGate && <button className="button button--primary button--wide" onClick={confirmCard} disabled={revealed}>我记住词语了，交给下一位 <span>→</span></button>}</div></section>}
      {room.status === 'cards' && remoteMode && !activeCardPlayer && <section className="waiting-panel"><span className="stamp">私牌已确认</span><h2>请把注意力放回桌边。</h2><p>还有 {room.players.filter((player) => !player.cardReady).length} 位玩家没有确认私牌；全员完成后会自动进入讨论。</p></section>}
      {room.status === 'discussion' && <section className="discussion-card"><div className="talk-mark"><span>{formatCountdown(discussionRemainingSeconds)}</span>填</div><div><span className="panel-kicker">第 {room.round} 轮本轮内容</span><h2>{getRoundChallenge(room, room.round)?.text ?? '本轮自由表达'}</h2><p>这是所有玩家共同遵守的公开规则，目前只提示、不拦截提交。全员完成或倒计时结束后，由房主开放提交选择。</p>{activeDiscussionPlayer && <div className="round-content-form"><label htmlFor="round-content">{activeDiscussionPlayer.name} 的本轮内容 · {roundContentDraft.length} 字</label><div><input id="round-content" maxLength={ROUND_CONTENT_MAX_LENGTH} value={roundContentDraft} onChange={(event) => setRoundContentDraft(event.target.value)} placeholder="在此填写本轮内容" /><button className="button button--dark" disabled={!roundContentDraft.trim()} onClick={submitCurrentRoundContent}>提交本轮内容</button></div></div>}<div className="alive-row">{room.players.filter((player) => player.alive).map((player) => <span key={player.id}>{player.name} · {getRoundContents(room)[player.id] ? '已完成' : '待提交'}</span>)}</div>{!remoteMode || currentPlayerId === room.ownerId ? <button className="button button--primary" disabled={!canBeginVoting(room, clockNow)} onClick={beginVoting}>{canBeginVoting(room, clockNow) ? `开放第 ${room.round} 轮提交选择` : `等待本轮内容 · ${formatCountdown(discussionRemainingSeconds)}`} <span>→</span></button> : <div className="waiting-line">{canBeginVoting(room, clockNow) ? '等待负责人开放提交选择…' : `本轮剩余 ${formatCountdown(discussionRemainingSeconds)}`}</div>}</div></section>}
      {room.status === 'voting' && activeVoter && <section className="vote-layout"><aside className="vote-progress"><span className="panel-kicker">匿名投票</span><h2>{Object.keys(room.votes).length}/{eligibleVoters(room).length} 已提交</h2><p>实时票型不会展示。当前玩家提交后，请把电脑交给下一位。</p><div className="meter"><i style={{ width: `${Object.keys(room.votes).length / eligibleVoters(room).length * 100}%` }} /></div></aside><div className="vote-card">{privacyGate ? <div className="privacy-gate privacy-gate--vote"><span className="seat__avatar seat__avatar--large">{activeVoter.name.slice(0, 1)}</span><p>轮到</p><h2>{activeVoter.name}</h2><span>其他人请暂时移开视线</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>开始秘密投票</button></div> : <><div className="section-title"><div><span className="panel-kicker">{room.ballot === 2 ? '复投候选人' : '选出你认为的卧底'}</span><h2>{activeVoter.name}，请投一票</h2></div><span>不能投自己</span></div><div className="candidate-grid">{eligibleCandidates(room).filter((candidate) => candidate.id !== activeVoter.id).map((candidate) => <button className={selectedCandidateId === candidate.id ? 'is-selected' : ''} onClick={() => setSelectedCandidateId(candidate.id)} key={candidate.id}><span>{candidate.name.slice(0, 1)}</span><b>{candidate.name}</b><i>{selectedCandidateId === candidate.id ? '已选择' : '选择'}</i></button>)}</div><button className="button button--primary button--wide" disabled={!selectedCandidateId} onClick={submitVote}>确认提交（之后不可查看） <span>→</span></button></>}</div></section>}
      {room.status === 'voting' && remoteMode && !activeVoter && <section className="waiting-panel"><span className="stamp">投票已提交</span><h2>{Object.keys(room.votes).length}/{eligibleVoters(room).length} 人已经投票</h2><p>提交内容已隐藏。等最后一票完成，所有人的页面会同时看到公开票数和裁判结果。</p><div className="meter"><i style={{ width: `${Object.keys(room.votes).length / eligibleVoters(room).length * 100}%` }} /></div></section>}
      {room.status === 'guessing' && activeComebackPlayer && <section className="comeback-panel">{privacyGate ? <div className="privacy-gate"><span className="seat__avatar seat__avatar--large">{activeComebackPlayer.name.slice(0, 1)}</span><p>私密机会</p><h2>{activeComebackPlayer.name}</h2><span>请确认屏幕前只有你本人，倒计时正在继续</span><button className="button button--dark" onClick={() => setPrivacyGate(false)}>开始猜词</button></div> : <div className="comeback-form"><span className="stamp">全阵营仅此一次</span><h2>猜出另一组词语</h2><strong>{formatCountdown(comebackRemainingSeconds)}</strong><p>只能提交一次；猜中后卧底阵营立即获胜，猜错或超时则正常退出。</p><input value={comebackDraft} onChange={(event) => setComebackDraft(event.target.value.slice(0, 30))} placeholder="输入另一组词语" aria-label="卧底猜词翻盘答案" autoFocus /><button className="button button--primary button--wide" disabled={!comebackDraft.trim()} onClick={submitComeback}>确认提交翻盘答案 <span>→</span></button></div>}</section>}
      {room.status === 'guessing' && !activeComebackPlayer && <section className="waiting-panel"><span className="stamp">特殊判定</span><h2>{formatCountdown(comebackRemainingSeconds)}</h2><p>一名成员正在私密完成特殊判定。结果提交或倒计时结束后会统一公开。</p></section>}
      {(room.status === 'result' || room.status === 'finished') && room.lastResult && <section className="result-layout"><div className={`verdict ${room.status === 'finished' ? 'is-final' : ''}`}><span className="stamp">裁判结果</span>{room.lastComebackResult?.correct ? <><p>猜词翻盘成功</p><h2>卧底阵营</h2><strong>正确答案：{room.civilianWord}</strong></> : eliminatedUndercoverName(room) ? <><p>成功找出卧底</p><h2>{eliminatedUndercoverName(room)}</h2><strong>{room.lastComebackResult ? `翻盘${room.lastComebackResult.timedOut ? '超时' : '失败'} · ` : ''}{room.status === 'finished' ? '所有卧底已经找出 · 平民胜利' : '仍有卧底 · 游戏继续'}</strong></> : room.status === 'finished' ? <><p>本局胜方</p><h2>{room.winner === 'civilian' ? '平民阵营' : '卧底阵营'}</h2><strong>{room.winner === 'civilian' ? '所有卧底已经出局' : '卧底人数已不低于平民'}</strong></> : room.lastResult.noElimination ? <><p>第二次仍然平票</p><h2>本轮无人出局</h2><strong>游戏继续</strong></> : <><p>最高票玩家</p><h2>{playerName(room, room.lastResult.eliminatedId)}</h2><strong>本轮退出 · 游戏继续</strong></>}</div><div className="tally"><div className="section-title"><div><span className="panel-kicker">公开票数</span><h2>第 {room.lastResult.round} 轮{room.lastResult.ballot === 2 ? '复投' : ''}</h2></div><span>不公开谁投了谁</span></div>{Object.entries(room.lastResult.counts).sort((a, b) => b[1] - a[1]).map(([id, count]) => <div className="tally-row" key={id}><span>{playerName(room, id)}</span><i><b style={{ width: `${count / eligibleVoters(room).length * 100}%` }} /></i><strong>{count} 票</strong></div>)}{room.status === 'finished' && <div className="reveal-list"><h3>身份公开</h3>{room.players.map((player) => <div key={player.id}><span>{player.name}</span><b>{room.assignments[player.id].role === 'undercover' ? '卧底' : '平民'} · {room.assignments[player.id].word}</b></div>)}</div>}{!remoteMode || currentPlayerId === room.ownerId ? <button className="button button--primary button--wide" onClick={room.status === 'finished' ? rematch : continueGame}>{room.status === 'finished' ? '原班人马再来一局' : `进入第 ${room.round + 1} 轮`} <span>→</span></button> : <div className="waiting-line">等待房主推进游戏…</div>}</div></section>}
    </div>}
    {notice && <div className={`toast toast--${notice.kind}`} role="status">{notice.text}</div>}
  </main>;
}
