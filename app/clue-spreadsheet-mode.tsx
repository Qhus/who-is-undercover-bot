'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLUE_MAX_GUESS_ATTEMPTS,
  CLUE_MIN_PLAYERS,
  createClueRoom,
  formatGuessTime,
  rankGuessTimes,
  rankHintScores,
  validateClue,
  validateRatings,
  type ClueKingRoom,
  type CluePrivateRound,
} from '@/lib/clue-game';
import {
  CLUE_DIFFICULTY_LABELS,
  CLUE_MODE_LABELS,
  clueInputMaxLength,
  clueInputMinLength,
  clueInputPrompt,
  type ClueDifficulty,
  type ClueMode,
} from '@/lib/clue-content';
import { getCloudStore, type ClueActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';

const clueSheets = [
  ['home', '提示首页'],
  ['members', '成员状态'],
  ['clues', '本轮记录'],
  ['scores', '双榜单'],
  ['guide', '玩法说明'],
] as const;

type ClueSheetId = typeof clueSheets[number][0];

const statusName: Record<string, string> = {
  lobby: '等待成员',
  clue_writing: '填写关联词',
  guessing: '结果判断',
  rating: '质量评分',
  result: '本轮汇总',
  finished: '最终统计',
};

function remaining(deadline: number | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return fallback;
  const value = error as { code?: unknown; message?: unknown; msg?: unknown };
  const message = typeof value.message === 'string' ? value.message : typeof value.msg === 'string' ? value.msg : '';
  const code = typeof value.code === 'string' ? value.code : '';
  return message ? `${message}${code && !message.includes(code) ? `（${code}）` : ''}` : code || fallback;
}

export default function ClueSpreadsheetMode() {
  const [ownerName, setOwnerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<ClueMode>('free');
  const [difficulty, setDifficulty] = useState<ClueDifficulty>('normal');
  const [room, setRoom] = useState<ClueKingRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [privateRound, setPrivateRound] = useState<CluePrivateRound | null>(null);
  const [clueText, setClueText] = useState('');
  const [guessText, setGuessText] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [activeSheet, setActiveSheet] = useState<ClueSheetId>('home');
  const [notice, setNotice] = useState('联想协作记录：每人轮流负责判断，其他成员提交简短关联词；评分后还可送出一枚同行点赞。');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const scopeRef = useRef('');
  const advancing = useRef(false);
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  const loadPrivateRound = useCallback(async (code: string) => {
    const found = await getCloudStore().getMyClueRound(code);
    setPrivateRound(found);
    if (found?.clueConfirmed) setClueText(found.clueText);
  }, []);

  useEffect(() => {
    const invitedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) ?? '';
    if (invitedCode) window.queueMicrotask(() => setJoinCode(invitedCode));
    if (!cloudReady) return;
    const saved = window.localStorage.getItem('clue-active-remote');
    if (!saved) return;
    void (async () => {
      try {
        const active = JSON.parse(saved) as { code: string; playerId: string };
        if (invitedCode && active.code !== invitedCode) return;
        const found = await getCloudStore().getClueRoom(active.code);
        if (!found || found.clueVersion !== 3) return;
        setPlayerId(active.playerId);
        setRoom(found);
        if (found.round > 0) await loadPrivateRound(found.code);
        setNotice('已恢复上次打开的提示房间。');
      } catch {
        setNotice('上次房间暂时无法恢复，可重新输入房间编号加入。');
      }
    })();
  }, [cloudReady, loadPrivateRound]);

  const activeCode = room?.code ?? '';
  useEffect(() => {
    if (!activeCode || !playerId || !cloudReady) return;
    return getCloudStore().watchClueRoom(activeCode, setRoom, (error) => setNotice(readableError(error, '房间同步失败')));
  }, [activeCode, cloudReady, playerId]);

  useEffect(() => {
    if (!room || !playerId || room.round <= 0) return;
    const scope = `${room.code}-${room.sessionNo}-${room.round}`;
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    const draft = window.localStorage.getItem(`clue-draft-${scope}-${playerId}`) ?? '';
    setClueText(draft);
    setGuessText('');
    setRatings({});
    setPrivateRound(null);
    void loadPrivateRound(room.code).catch(() => setNotice('本轮私密信息暂时无法读取，请刷新重试。'));
  }, [loadPrivateRound, playerId, room]);

  useEffect(() => {
    if (!room || !playerId || !scopeRef.current || privateRound?.clueConfirmed) return;
    window.localStorage.setItem(`clue-draft-${scopeRef.current}-${playerId}`, clueText);
  }, [clueText, playerId, privateRound?.clueConfirmed, room]);

  const apply = useCallback(async (actionType: ClueActionType, payload: Record<string, unknown> = {}) => {
    if (!room) return null;
    try {
      const result = await getCloudStore().applyClueAction({ room, actionId: makeId('clue-v3-action'), actionType, payload });
      setRoom(result.state);
      setNotice(result.outcome === 'stale' ? '房间状态已经更新，请重新操作。' : result.message);
      return result.state;
    } catch (error) {
      setNotice(readableError(error, '操作失败'));
      return null;
    }
  }, [room]);

  useEffect(() => {
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (!room?.phaseDeadlineAt || time < room.phaseDeadlineAt || ['lobby', 'finished'].includes(room.status) || advancing.current) return;
      advancing.current = true;
      void apply('advance_clue_phase').finally(() => { advancing.current = false; });
    };
    tick();
    const timer = window.setInterval(tick, 700);
    return () => window.clearInterval(timer);
  }, [apply, room]);

  const remember = (code: string, id: string) => {
    window.localStorage.setItem(`clue-player-${code}`, id);
    window.localStorage.setItem('clue-active-remote', JSON.stringify({ code, playerId: id }));
  };

  const createRemote = async () => {
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!ownerName.trim()) return setNotice('请先填写你的称呼。');
    setBusy(true);
    try {
      const seed = createClueRoom(ownerName, mode, difficulty);
      const next = await getCloudStore().createClueRoom(seed, mode, difficulty);
      remember(next.code, next.ownerId);
      setPlayerId(next.ownerId);
      setRoom(next);
      setNotice(`房间 ${next.code} 已创建，请把邀请链接发给朋友。`);
    } catch (error) {
      setNotice(readableError(error, '创建房间失败'));
    } finally {
      setBusy(false);
    }
  };

  const joinRemote = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!joinName.trim() || code.length !== 6) return setNotice('请填写称呼和六位房间编号。');
    setBusy(true);
    try {
      const requestedId = window.localStorage.getItem(`clue-player-${code}`) ?? makeId('clue-player');
      const joined = await getCloudStore().joinClueRoom(code, requestedId, joinName.trim());
      remember(code, joined.playerId);
      setPlayerId(joined.playerId);
      setRoom(joined.room);
      setNotice(`已加入房间 ${code}。`);
    } catch (error) {
      setNotice(readableError(error, '加入房间失败'));
    } finally {
      setBusy(false);
    }
  };

  const leaveView = () => {
    window.localStorage.removeItem('clue-active-remote');
    setRoom(null);
    setPlayerId('');
    setPrivateRound(null);
    setClueText('');
    setGuessText('');
    setRatings({});
    setActiveSheet('home');
    scopeRef.current = '';
    setNotice('已返回提示首页。');
  };

  const copyInviteLink = async () => {
    if (!room) return;
    const invite = new URL(window.location.href);
    invite.search = '';
    invite.hash = '';
    invite.searchParams.set('room', room.code);
    try {
      await navigator.clipboard.writeText(invite.toString());
      setNotice('邀请链接已复制，群友打开后只需填写称呼。');
    } catch {
      setNotice('浏览器未允许复制，请复制地址栏链接并附上房间编号。');
    }
  };

  const confirmClue = () => {
    try {
      const clean = validateClue(clueText, privateRound?.targetWord ?? null, clueMaxLength, clueMinLength);
      void apply('confirm_clue', { clueText: clean }).then((next) => next && loadPrivateRound(next.code));
    } catch (error) {
      setNotice(readableError(error, '提示确认失败'));
    }
  };

  const submitGuess = async () => {
    const clean = guessText.trim();
    if (!clean) return setNotice('请先填写你的猜测。');
    const next = await apply('submit_clue_guess', { guessText: clean });
    if (next?.status === 'guessing') setGuessText('');
  };

  const confirmRatings = () => {
    try {
      validateRatings(ratings, room?.publicClues.map((clue) => clue.clueId) ?? []);
      void apply('confirm_clue_ratings', { ratings });
    } catch (error) {
      setNotice(readableError(error, '评分确认失败'));
    }
  };

  const submitPeerLike = (clueId: string) => {
    void apply('submit_peer_like', { clueId });
  };

  const isOwner = room?.ownerId === playerId;
  const isGuesser = room?.guesserId === playerId;
  const clueLocked = privateRound?.clueConfirmed || room?.clueStatuses[playerId] === 'confirmed';
  const hintRanking = useMemo(() => room ? rankHintScores(room) : [], [room]);
  const speedRanking = useMemo(() => room ? rankGuessTimes(room) : [], [room]);
  const latestResult = room?.roundResults.at(-1);
  const clueMaxLength = clueInputMaxLength({
    mode: room?.mode ?? mode,
    publicRuleId: room?.publicRuleId,
    roleId: privateRound?.roleId,
  });
  const clueMinLength = clueInputMinLength({
    mode: room?.mode ?? mode,
    roleId: privateRound?.roleId,
  });
  const cluePlaceholder = clueInputPrompt({
    mode: room?.mode ?? mode,
    publicRuleName: room?.publicRuleName,
    publicRuleText: room?.publicRuleText,
    roleName: privateRound?.roleName,
    roleRule: privateRound?.roleRule,
  });
  const canSkipResult = room?.status === 'result' && !latestResult?.correct && (isOwner || isGuesser);
  const peerLikeCount = room?.peerLikes ?? {};
  const uniqueAwardCount = room?.uniqueAwards ?? {};
  const peerLikeTopScore = Math.max(0, ...Object.values(peerLikeCount));
  const peerFavoriteIds = new Set(peerLikeTopScore > 0 ? Object.entries(peerLikeCount).filter(([, score]) => score === peerLikeTopScore).map(([id]) => id) : []);
  const peerLikeSubmitted = Boolean(room?.peerLikeVoterIds?.includes(playerId));
  const canPeerLike = Boolean(room && room.players.length >= 3 && !isGuesser && privateRound?.clueId && ['rating', 'result'].includes(room.status) && !peerLikeSubmitted);

  const clueScoreCell = (clue: ClueKingRoom['publicClues'][number]) => <div className="clue-cell-stack">
    <span>{clue.score ? `${clue.score} 分` : '已公开'}</span>
    {(clue.isMostUnique || clue.score === 4) && <span className="clue-award">✦ 本轮最独特</span>}
    {room?.status === 'result' && <span className="clue-peer-count">同行赞 {clue.peerLikeCount ?? 0}</span>}
    {canPeerLike && clue.clueId !== privateRound?.clueId && <button className="clue-peer-button" onClick={() => submitPeerLike(clue.clueId)}>同行点赞</button>}
  </div>;
  const clueActionCell = (clue: ClueKingRoom['publicClues'][number]) => room?.status === 'rating' && isGuesser
    ? <select value={ratings[clue.clueId] ?? ''} onChange={(event) => setRatings((current) => ({ ...current, [clue.clueId]: Number(event.target.value) }))}><option value="">评分</option><option value="1">1 分</option><option value="2">2 分</option><option value="3">3 分</option><option value="4">4 分·最独特</option></select>
    : clueScoreCell(clue);

  const tableRows = () => {
    if (activeSheet === 'guide') return <>
      <tr><th>1</th><td>一句话玩法</td><td colSpan={5}>每人轮流当一次猜题者；其他人看答案写提示，猜题者评分，提示者可给同行点赞，最后生成提示分、猜题速度与趣味称号。</td></tr>
      <tr><th>2</th><td>相同内容</td><td colSpan={5}>可以放心按自己的想法填写；相同内容仍按不同成员分别记录、分别计分。</td></tr>
      <tr><th>3</th><td>默认规则</td><td colSpan={5}>提示不能直接写出答案，也不要使用答案中的字；相同提示分别保留。每题如有特殊规则，会在填写处单独显示。</td></tr>
      <tr><th>4</th><td>质量评价</td><td colSpan={5}>1 分有点远，2 分说得通，3 分是好提示；4 分会标记“本轮最独特”。提示者还可给其他一条提示送出不计入总分的同行点赞。</td></tr>
      <tr><th>5</th><td>判断与推进</td><td colSpan={5}>负责人在 60 秒内最多尝试 3 次；猜中、三次未中或超时后都会公布答案并进入评分。</td></tr>
    </>;
    if (!room) return <tr><th>1</th><td>工作表</td><td colSpan={5}>请先返回“提示首页”创建或加入房间。</td></tr>;
    if (activeSheet === 'members') return <>
      <tr><th>1</th><td>席位</td><td>称呼</td><td>本轮角色</td><td>提示状态</td><td colSpan={2}>说明</td></tr>
      {room.players.map((player, index) => <tr key={player.id}><th>{index + 2}</th><td>{player.seat}</td><td>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.id === room.guesserId ? '猜题者' : room.status === 'lobby' ? '等待开始' : '提示者'}</td><td>{player.id === room.guesserId ? '无需提交提示' : room.clueStatuses[player.id] === 'confirmed' ? '已确认' : room.clueStatuses[player.id] === 'unconfirmed' ? '超时未确认' : '填写中'}</td><td colSpan={2}>{player.id === room.ownerId ? '房主' : '成员'}</td></tr>)}
    </>;
    if (activeSheet === 'scores') return <>
      <tr><th>1</th><td>提示大王排名</td><td>成员</td><td>累计提示分</td><td>猜题速度排名</td><td>成员</td><td>正确用时</td></tr>
      {room.players.map((_, index) => <tr key={index}><th>{index + 2}</th><td>{hintRanking[index] ? `第 ${hintRanking[index].rank} 名` : '—'}</td><td>{hintRanking[index]?.name ?? '—'}{hintRanking[index] && peerFavoriteIds.has(hintRanking[index].playerId) ? '（同行最爱）' : ''}</td><td>{hintRanking[index] ? `${hintRanking[index].score} 分 · 最独特 ${uniqueAwardCount[hintRanking[index].playerId] ?? 0} 次 · 同行赞 ${peerLikeCount[hintRanking[index].playerId] ?? 0}` : '—'}</td><td>{speedRanking[index]?.rank ? `第 ${speedRanking[index].rank} 名` : '未上榜'}</td><td>{speedRanking[index]?.name ?? '—'}</td><td>{formatGuessTime(speedRanking[index]?.elapsedMs ?? null)}</td></tr>)}
    </>;
    if (activeSheet === 'clues') return <>
      <tr><th>1</th><td>编号</td><td colSpan={2}>提示内容</td><td>本题角色</td><td>作者</td><td>评分</td></tr>
      {room.publicClues.length ? room.publicClues.map((clue, index) => <tr key={clue.clueId}><th>{index + 2}</th><td>{clue.displayCode}</td><td colSpan={2}>{clue.text}</td><td>{clue.roleName ? `${clue.roleName}：${clue.roleRule}` : room.publicRuleName ? `${room.publicRuleName}：${room.publicRuleText}` : '自由提示'}</td><td>{clue.authorName ?? '评分后揭晓'}</td><td>{clueActionCell(clue)}</td></tr>) : <tr><th>2</th><td>尚未汇总</td><td colSpan={5}>所有成员确认或倒计时结束后集中显示。</td></tr>}
    </>;
    return <tr><th>1</th><td>最近状态</td><td>{room.code}</td><td>第 {room.round}/{room.totalRounds || room.players.length} 轮</td><td>{statusName[room.status]}</td><td colSpan={2}>{notice}</td></tr>;
  };

  return <main className="sheet-app clue-sheet">
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={leaveView}>表</button>
      <div><strong>{room ? `提示填报表 · ${room.code}` : '提示填报表 · 联机工作簿'}</strong><span>联想协作机制 · 两项统计</span></div>
      <div className="sheet-title-actions"><a href="../" aria-label="返回摸鱼游戏工作台">目录</a>{room && <><button onClick={() => navigator.clipboard?.writeText(room.code)}>复制房间编号</button><button onClick={copyInviteLink}>复制邀请链接</button><button onClick={leaveView}>返回提示首页</button></>}</div>
    </header>
    <nav className="sheet-ribbon"><button className="is-current">开始</button><button onClick={() => setActiveSheet('clues')}>记录</button><button onClick={() => setActiveSheet('scores')}>排名</button><span /></nav>
    <div className="sheet-formula"><span className="sheet-namebox">A1</span><span className="sheet-fx">fx</span><output>{room ? `${statusName[room.status]} · ${room.guesserName ? `本轮负责人 ${room.guesserName}` : '等待开始'} · ${remaining(room.phaseDeadlineAt, now)} 秒` : '每人轮流负责判断；其他成员填写关联词；每轮结束后评价关联质量'}</output></div>
    <section className="sheet-workspace"><div className="sheet-canvas">
      <div className="sheet-commandbar">
        {!room ? <span>独立 A3 入口 · 2–8 人</span> : room.status === 'lobby' ? <>{isOwner ? <button className="sheet-primary-action" disabled={room.players.length < CLUE_MIN_PLAYERS || busy} onClick={() => void apply('start_clue_game')}>{room.players.length < CLUE_MIN_PLAYERS ? `还需 ${CLUE_MIN_PLAYERS - room.players.length} 人` : '开始第一轮'}</button> : <span>等待房主开始</span>}<span>每个人都会当一次猜题者，开始后不再加入新成员</span></> : room.status === 'finished' ? <>{isOwner && <button className="sheet-primary-action" onClick={() => void apply('restart_clue_game')}>再来一局</button>}<span>{isOwner ? '保留成员，清空本局积分并更换题目' : '等待房主决定是否再来一局'}</span></> : room.status === 'result' ? <>{canSkipResult && <button className="sheet-primary-action" onClick={() => void apply('skip_clue_result')}>提前进入下一轮</button>}<span>{latestResult?.correct ? '评分已完成，正在汇总本轮' : '未猜中，10 秒后自动进入下一轮'}</span></> : <span>系统自动推进 · 提示作者在评分确认前保持匿名</span>}
      </div>
      <div className="clue-mobile-controls">
        {!room ? <>
          <div><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 24))} placeholder="房主称呼" /><select value={mode} onChange={(event) => setMode(event.target.value as ClueMode)}>{Object.entries(CLUE_MODE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as ClueDifficulty)}>{Object.entries(CLUE_DIFFICULTY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button disabled={busy} onClick={createRemote}>创建房间</button></div>
          <div><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 24))} placeholder="你的称呼" /><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="六位编号" /><button disabled={busy} onClick={joinRemote}>加入</button></div>
        </> : room.status === 'clue_writing' && !isGuesser ? <div><input disabled={Boolean(clueLocked)} value={clueText} maxLength={clueMaxLength} onChange={(event) => setClueText(event.target.value)} placeholder={cluePlaceholder} title={cluePlaceholder} /><button disabled={Boolean(clueLocked)} onClick={confirmClue}>{clueLocked ? '内容已确认' : '确认内容'}</button></div>
          : room.status === 'guessing' && isGuesser ? <div><input value={guessText} maxLength={20} onChange={(event) => setGuessText(event.target.value)} placeholder={`还可尝试 ${CLUE_MAX_GUESS_ATTEMPTS - (room.guessAttemptCount ?? 0)} 次`} /><button onClick={() => void submitGuess()}>确认答案</button></div>
            : room.status === 'rating' && isGuesser ? <div><span>请为每条匿名提示评 1–4 分；4 分每轮最多一条</span><button onClick={confirmRatings}>确认全部评分</button></div> : null}
      </div>
      <div className="sheet-grid-scroll"><table className="sheet-grid">
        <thead><tr><th /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></thead>
        <tbody>{activeSheet !== 'home' ? tableRows() : !room ? <>
          <tr><th>1</th><td>操作</td><td>称呼</td><td>玩法模式</td><td>题目难度</td><td>执行</td><td>说明</td></tr>
          <tr><th>2</th><td>创建 A3 房间</td><td><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 24))} placeholder="填写称呼" /></td><td><select value={mode} onChange={(event) => setMode(event.target.value as ClueMode)}>{Object.entries(CLUE_MODE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td><td><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as ClueDifficulty)}>{Object.entries(CLUE_DIFFICULTY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td><td><button className="sheet-action" disabled={busy} onClick={createRemote}>创建联机房间</button></td><td>2–8 人</td></tr>
          <tr><th>3</th><td>加入 A3 房间</td><td><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 24))} placeholder="填写称呼" /></td><td><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="例如 Q7K2P8" /></td><td>跟随房主</td><td><button className="sheet-action" disabled={busy} onClick={joinRemote}>加入房间</button></td><td>开始后停止加入</td></tr>
          <tr><th>5</th><td>为什么值得玩</td><td colSpan={5}>基于成熟获奖联想机制改编：每个人独立提供关联词，相同想法也各自计分，最终比较“提示质量”和“判断速度”两项统计。</td></tr>
          <tr><th>6</th><td>一轮流程</td><td colSpan={5}>成员查看答案 → 各自秘密填一个关联词 → 集中公开 → 负责人最多尝试 3 次 → 公布答案并匿名评分 → 揭晓成员。</td></tr>
        </> : <>
          <tr><th>1</th><td>房间</td><td>{room.code}</td><td>轮次</td><td>{room.round}/{room.totalRounds || room.players.length}</td><td>猜题者</td><td>{room.guesserName ?? '等待开始'}</td></tr>
          {room.status === 'lobby' && <><tr><th>2</th><td>本局设置</td><td colSpan={2}>{CLUE_MODE_LABELS[room.mode]}</td><td>{CLUE_DIFFICULTY_LABELS[room.difficulty]}</td><td colSpan={2}>每人轮流猜一题</td></tr>{room.players.map((player, index) => <tr key={player.id}><th>{index + 3}</th><td>{player.id === room.ownerId ? '房主' : '成员'}</td><td>{player.seat}</td><td colSpan={2}>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>已加入</td><td>等待开始</td></tr>)}</>}
          {room.status === 'clue_writing' && <>
            <tr><th>10</th><td>本轮身份</td><td>{isGuesser ? '猜题者' : privateRound?.roleName ?? '提示者'}</td><td>答案</td><td>{isGuesser ? '不可见' : privateRound?.targetWord ?? '读取中…'}</td><td>{room.mode === 'public_rule' ? '公共规则' : room.mode === 'role_play' ? '我的角色' : '模式'}</td><td>{room.mode === 'public_rule' ? `${room.publicRuleName}：${room.publicRuleText}` : room.mode === 'role_play' ? `${privateRound?.roleName ?? '读取中'}：${privateRound?.roleRule ?? '读取中…'}` : '自由提示'}</td></tr>
            <tr><th>11</th><td>默认规则</td><td colSpan={5}>不要直接写出答案，也不要使用答案中的字；相同提示分别保留。</td></tr>
            {room.players.map((player, index) => <tr key={player.id}><th>{12 + index}</th><td>{player.id === room.guesserId ? '猜题者' : '提示状态'}</td><td colSpan={2}>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.id === room.guesserId ? '等待提示' : room.clueStatuses[player.id] === 'confirmed' ? '已确认' : '填写中'}</td><td colSpan={2}>{player.id === room.guesserId ? '看不到答案' : '正文暂不公开'}</td></tr>)}
            {!isGuesser && <tr><th>25</th><td>我的关联词</td><td colSpan={4}><input disabled={Boolean(clueLocked)} value={clueText} maxLength={clueMaxLength} onChange={(event) => setClueText(event.target.value)} placeholder={cluePlaceholder} title={cluePlaceholder} /><small>{clueText.length}/{clueMaxLength}{clueMinLength > 1 ? `，至少 ${clueMinLength} 字` : ''}</small></td><td><button className="sheet-action" disabled={Boolean(clueLocked)} onClick={confirmClue}>{clueLocked ? '内容已确认' : '确认内容'}</button></td></tr>}
          </>}
          {['guessing', 'rating', 'result'].includes(room.status) && <>
            <tr><th>10</th><td>提示编号</td><td colSpan={2}>完整提示</td><td>本题角色</td><td>作者</td><td>{room.status === 'rating' ? '评分' : '状态'}</td></tr>
            {room.publicClues.map((clue, index) => <tr key={clue.clueId}><th>{11 + index}</th><td>{clue.displayCode}</td><td colSpan={2}>{clue.text}</td><td>{clue.roleName ? `${clue.roleName}：${clue.roleRule}` : room.publicRuleName ? `${room.publicRuleName}：${room.publicRuleText}` : '自由提示'}</td><td>{clue.authorName ?? '暂不公开'}</td><td>{clueActionCell(clue)}</td></tr>)}
            {room.status === 'guessing' && <tr><th>25</th><td>结果判断</td><td colSpan={4}>{isGuesser ? <><input value={guessText} maxLength={20} onChange={(event) => setGuessText(event.target.value)} placeholder="填写你认为的答案" /><small>已尝试 {room.guessAttemptCount ?? 0}/{CLUE_MAX_GUESS_ATTEMPTS} 次，猜错可继续</small></> : `等待 ${room.guesserName} 判断；本轮最多尝试 ${CLUE_MAX_GUESS_ATTEMPTS} 次`}</td><td>{isGuesser ? <button className="sheet-action" onClick={() => void submitGuess()}>确认答案</button> : '等待中'}</td></tr>}
            {room.status === 'rating' && <><tr><th>25</th><td>评分参考</td><td colSpan={5}>答案：{room.revealedWord ?? '读取中'}。1 分有点远；2 分说得通；3 分是好提示；获评 4 分的提示会标记“本轮最独特”。</td></tr><tr><th>26</th><td>提示评分</td><td colSpan={4}>{isGuesser ? `${room.guessStatus === 'correct' ? '已猜中' : '本轮未猜中'}，请为每条匿名提示选择 1–4 分，确认后揭晓作者。` : room.players.length < 3 ? `等待 ${room.guesserName} 完成评分。` : peerLikeSubmitted ? '同行点赞已记录；等待猜题者完成评分。' : '可给其他一条匿名提示送出同行点赞；不投也不会阻塞下一轮。'}</td><td>{isGuesser ? <button className="sheet-action" onClick={confirmRatings}>确认全部评分</button> : peerLikeSubmitted ? '已点赞' : '可选'}</td></tr></>}
            {room.status === 'result' && <tr><th>25</th><td>{latestResult?.correct ? '猜题成功' : '本轮未猜中'}</td><td>答案：{room.revealedWord}</td><td colSpan={2}>作答：{latestResult?.guessText ?? '未提交'}</td><td>用时：{formatGuessTime(latestResult?.elapsedMs ?? null)}</td><td>{canSkipResult ? <button className="sheet-action" onClick={() => void apply('skip_clue_result')}>进入下一轮</button> : '10 秒后下一轮'}</td></tr>}
          </>}
          {room.status === 'finished' && <>
            <tr><th>10</th><td>提示大王排名</td><td>成员</td><td>累计提示分</td><td>猜题速度排名</td><td>成员</td><td>正确用时</td></tr>
            {room.players.map((_, index) => <tr key={index}><th>{11 + index}</th><td>{hintRanking[index] ? `第 ${hintRanking[index].rank} 名` : '—'}</td><td>{hintRanking[index]?.name ?? '—'}{hintRanking[index] && peerFavoriteIds.has(hintRanking[index].playerId) ? '（同行最爱）' : ''}</td><td>{hintRanking[index] ? `${hintRanking[index].score} 分 · 最独特 ${uniqueAwardCount[hintRanking[index].playerId] ?? 0} 次 · 同行赞 ${peerLikeCount[hintRanking[index].playerId] ?? 0}` : '—'}</td><td>{speedRanking[index]?.rank ? `第 ${speedRanking[index].rank} 名` : '未上榜'}</td><td>{speedRanking[index]?.name ?? '—'}</td><td>{formatGuessTime(speedRanking[index]?.elapsedMs ?? null)}</td></tr>)}
          </>}
        </>}</tbody>
      </table></div>
      {notice && <div className="sheet-toast sheet-toast--info">{notice}</div>}
    </div></section>
    <footer className="sheet-tabs"><button disabled aria-label="新增工作表不可用">＋</button>{clueSheets.map(([id, label]) => <button className={activeSheet === id ? 'is-current' : ''} onClick={() => setActiveSheet(id)} key={id}>{label}</button>)}</footer>
  </main>;
}
