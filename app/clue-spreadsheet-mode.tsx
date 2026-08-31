'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CLUE_MAX_LENGTH,
  CLUE_MIN_PLAYERS,
  createClueRoom,
  formatGuessTime,
  rankGuessTimes,
  rankHintScores,
  validateClue,
  validateRatings,
  type ClueKingRoom,
  type CluePrivateRound,
  type ClueRuleMode,
} from '@/lib/clue-game';
import { getCloudStore, type ClueActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';

const clueSheets = [
  ['home', '提示首页'],
  ['members', '成员状态'],
  ['clues', '本轮提示'],
  ['scores', '双榜单'],
  ['guide', '玩法说明'],
] as const;

type ClueSheetId = typeof clueSheets[number][0];

const statusName: Record<string, string> = {
  lobby: '等待成员',
  clue_writing: '填写提示',
  guessing: '猜题中',
  rating: '提示评分',
  result: '本轮结果',
  finished: '最终排行',
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
  const [ruleMode, setRuleMode] = useState<ClueRuleMode>('off');
  const [room, setRoom] = useState<ClueKingRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [privateRound, setPrivateRound] = useState<CluePrivateRound | null>(null);
  const [clueText, setClueText] = useState('');
  const [guessText, setGuessText] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [activeSheet, setActiveSheet] = useState<ClueSheetId>('home');
  const [notice, setNotice] = useState('成熟联想机制的联机积分改编：人人轮流猜，提示不去重，猜中后给提示评分。');
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
        if (!found || found.clueVersion !== 1) return;
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
      const result = await getCloudStore().applyClueAction({ room, actionId: makeId('clue-v1-action'), actionType, payload });
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
      const seed = createClueRoom(ownerName, ruleMode);
      const next = await getCloudStore().createClueRoom(seed, ruleMode);
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
      const clean = validateClue(clueText, privateRound?.targetWord ?? null, room?.challengeId ?? null);
      void apply('confirm_clue', { clueText: clean }).then((next) => next && loadPrivateRound(next.code));
    } catch (error) {
      setNotice(readableError(error, '提示确认失败'));
    }
  };

  const submitGuess = () => {
    const clean = guessText.trim();
    if (!clean) return setNotice('请先填写你的猜测。');
    void apply('submit_clue_guess', { guessText: clean });
  };

  const confirmRatings = () => {
    try {
      validateRatings(ratings, room?.publicClues.map((clue) => clue.clueId) ?? []);
      void apply('confirm_clue_ratings', { ratings });
    } catch (error) {
      setNotice(readableError(error, '评分确认失败'));
    }
  };

  const isOwner = room?.ownerId === playerId;
  const isGuesser = room?.guesserId === playerId;
  const clueLocked = privateRound?.clueConfirmed || room?.clueStatuses[playerId] === 'confirmed';
  const hintRanking = useMemo(() => room ? rankHintScores(room) : [], [room]);
  const speedRanking = useMemo(() => room ? rankGuessTimes(room) : [], [room]);
  const latestResult = room?.roundResults.at(-1);

  const tableRows = () => {
    if (activeSheet === 'guide') return <>
      <tr><th>1</th><td>一句话玩法</td><td colSpan={5}>每人轮流当一次猜题者；其他人看答案写提示，猜中后逐条评 1–3 分，最后生成提示分与猜题速度双榜单。</td></tr>
      <tr><th>2</th><td>重复提示</td><td colSpan={5}>不会删除。内容相同的提示会分别保留、分别评分。</td></tr>
      <tr><th>3</th><td>提示限制</td><td colSpan={5}>基础规则为 1–8 字且不能直接写出答案；房主可开启随机限制，让部分轮次增加字数或禁用词挑战。</td></tr>
      <tr><th>4</th><td>评分规则</td><td colSpan={5}>只有猜中才进入评分；猜题者在作者揭晓前为每条提示选择 1、2 或 3 分，确认后锁定。</td></tr>
      <tr><th>5</th><td>自动推进</td><td colSpan={5}>全部提示确认后立即开放猜题；超时也会继续，不需要房主逐轮点击。</td></tr>
    </>;
    if (!room) return <tr><th>1</th><td>工作表</td><td colSpan={5}>请先返回“提示首页”创建或加入房间。</td></tr>;
    if (activeSheet === 'members') return <>
      <tr><th>1</th><td>席位</td><td>称呼</td><td>本轮角色</td><td>提示状态</td><td colSpan={2}>说明</td></tr>
      {room.players.map((player, index) => <tr key={player.id}><th>{index + 2}</th><td>{player.seat}</td><td>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.id === room.guesserId ? '猜题者' : room.status === 'lobby' ? '等待开始' : '提示者'}</td><td>{player.id === room.guesserId ? '无需提交提示' : room.clueStatuses[player.id] === 'confirmed' ? '已确认' : room.clueStatuses[player.id] === 'unconfirmed' ? '超时未确认' : '填写中'}</td><td colSpan={2}>{player.id === room.ownerId ? '房主' : '成员'}</td></tr>)}
    </>;
    if (activeSheet === 'scores') return <>
      <tr><th>1</th><td>提示大王排名</td><td>成员</td><td>累计提示分</td><td>猜题速度排名</td><td>成员</td><td>正确用时</td></tr>
      {room.players.map((_, index) => <tr key={index}><th>{index + 2}</th><td>{hintRanking[index] ? `第 ${hintRanking[index].rank} 名` : '—'}</td><td>{hintRanking[index]?.name ?? '—'}</td><td>{hintRanking[index]?.score ?? 0}</td><td>{speedRanking[index]?.rank ? `第 ${speedRanking[index].rank} 名` : '未上榜'}</td><td>{speedRanking[index]?.name ?? '—'}</td><td>{formatGuessTime(speedRanking[index]?.elapsedMs ?? null)}</td></tr>)}
    </>;
    if (activeSheet === 'clues') return <>
      <tr><th>1</th><td>编号</td><td colSpan={3}>提示内容</td><td>作者</td><td>评分</td></tr>
      {room.publicClues.length ? room.publicClues.map((clue, index) => <tr key={clue.clueId}><th>{index + 2}</th><td>{clue.displayCode}</td><td colSpan={3}>{clue.text}</td><td>{clue.authorName ?? '评分后揭晓'}</td><td>{clue.score ? `${clue.score} 分` : '待评分'}</td></tr>) : <tr><th>2</th><td>尚未公开</td><td colSpan={5}>提示全部确认或倒计时结束后，会在这里同时公开；重复提示不会删除。</td></tr>}
    </>;
    return <tr><th>1</th><td>最近状态</td><td>{room.code}</td><td>第 {room.round}/{room.totalRounds || room.players.length} 轮</td><td>{statusName[room.status]}</td><td colSpan={2}>{notice}</td></tr>;
  };

  return <main className="sheet-app clue-sheet">
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={leaveView}>表</button>
      <div><strong>{room ? `提示填报表 · ${room.code}` : '提示填报表 · 联机工作簿'}</strong><span>获奖联想机制改编 · 双榜单积分</span></div>
      <div className="sheet-title-actions"><a href="../" aria-label="返回摸鱼游戏工作台">目录</a>{room && <><button onClick={() => navigator.clipboard?.writeText(room.code)}>复制房间编号</button><button onClick={copyInviteLink}>复制邀请链接</button><button onClick={leaveView}>返回提示首页</button></>}</div>
    </header>
    <nav className="sheet-ribbon"><button className="is-current">开始</button><button onClick={() => setActiveSheet('clues')}>提示</button><button onClick={() => setActiveSheet('scores')}>排名</button><span /></nav>
    <div className="sheet-formula"><span className="sheet-namebox">A1</span><span className="sheet-fx">fx</span><output>{room ? `${statusName[room.status]} · ${room.guesserName ? `本轮猜题者 ${room.guesserName}` : '等待开始'} · ${remaining(room.phaseDeadlineAt, now)} 秒` : '人人轮流猜一次；提示不去重；猜中后由猜题者评分'}</output></div>
    <section className="sheet-workspace"><div className="sheet-canvas">
      <div className="sheet-commandbar">
        {!room ? <span>独立 A3 入口 · 3–8 人 · 推荐 4 人以上</span> : room.status === 'lobby' ? <>{isOwner ? <button className="sheet-primary-action" disabled={room.players.length < CLUE_MIN_PLAYERS || busy} onClick={() => void apply('start_clue_game')}>{room.players.length < CLUE_MIN_PLAYERS ? `还需 ${CLUE_MIN_PLAYERS - room.players.length} 人` : '开始第一轮'}</button> : <span>等待房主开始</span>}<span>每个人都会当一次猜题者，开始后不再加入新成员</span></> : room.status === 'finished' ? <>{isOwner && <button className="sheet-primary-action" onClick={() => void apply('restart_clue_game')}>再来一局</button>}<span>{isOwner ? '保留成员，清空本局积分并更换题目' : '等待房主决定是否再来一局'}</span></> : <span>系统自动推进 · 提示作者在评分确认前保持匿名</span>}
      </div>
      <div className="clue-mobile-controls">
        {!room ? <>
          <div><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 24))} placeholder="房主称呼" /><select value={ruleMode} onChange={(event) => setRuleMode(event.target.value as ClueRuleMode)}><option value="off">普通提示</option><option value="random">随机限制</option></select><button disabled={busy} onClick={createRemote}>创建房间</button></div>
          <div><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 24))} placeholder="你的称呼" /><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="六位编号" /><button disabled={busy} onClick={joinRemote}>加入</button></div>
        </> : room.status === 'clue_writing' && !isGuesser ? <div><input disabled={Boolean(clueLocked)} value={clueText} maxLength={CLUE_MAX_LENGTH} onChange={(event) => setClueText(event.target.value)} placeholder="填写 1–8 字提示" /><button disabled={Boolean(clueLocked)} onClick={confirmClue}>{clueLocked ? '提示已确认' : '确认提示'}</button></div>
          : room.status === 'guessing' && isGuesser ? <div><input value={guessText} maxLength={20} onChange={(event) => setGuessText(event.target.value)} placeholder="只有一次作答机会" /><button onClick={submitGuess}>确认答案</button></div>
            : room.status === 'rating' && isGuesser ? <div><span>请在表格中为每条匿名提示评 1–3 分</span><button onClick={confirmRatings}>确认全部评分</button></div> : null}
      </div>
      <div className="sheet-grid-scroll"><table className="sheet-grid">
        <thead><tr><th /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></thead>
        <tbody>{activeSheet !== 'home' ? tableRows() : !room ? <>
          <tr><th>1</th><td>操作</td><td>称呼</td><td>房间编号</td><td>提示难度</td><td>执行</td><td>说明</td></tr>
          <tr><th>2</th><td>创建 A3 房间</td><td><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 24))} placeholder="填写称呼" /></td><td>自动生成</td><td><select value={ruleMode} onChange={(event) => setRuleMode(event.target.value as ClueRuleMode)}><option value="off">普通提示</option><option value="random">随机限制</option></select></td><td><button className="sheet-action" disabled={busy} onClick={createRemote}>创建联机房间</button></td><td>3–8 人</td></tr>
          <tr><th>3</th><td>加入 A3 房间</td><td><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 24))} placeholder="填写称呼" /></td><td><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="例如 Q7K2P8" /></td><td>跟随房主</td><td><button className="sheet-action" disabled={busy} onClick={joinRemote}>加入房间</button></td><td>开始后停止加入</td></tr>
          <tr><th>5</th><td>为什么值得玩</td><td colSpan={5}>源自德国年度游戏获奖联想机制的联机积分改编：不删除重复提示，每人轮流猜题，猜中后逐条评分，最终争夺“提示大王”和“猜题速度”双榜单。</td></tr>
          <tr><th>6</th><td>一轮流程</td><td colSpan={5}>提示者看答案 → 各自秘密填一个提示 → 同时公开 → 猜题者作答一次 → 猜中后匿名评分 → 揭晓作者。</td></tr>
        </> : <>
          <tr><th>1</th><td>房间</td><td>{room.code}</td><td>轮次</td><td>{room.round}/{room.totalRounds || room.players.length}</td><td>猜题者</td><td>{room.guesserName ?? '等待开始'}</td></tr>
          {room.status === 'lobby' && room.players.map((player, index) => <tr key={player.id}><th>{index + 2}</th><td>{player.id === room.ownerId ? '房主' : '成员'}</td><td>{player.seat}</td><td colSpan={2}>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>已加入</td><td>{room.ruleMode === 'random' ? '随机提示限制' : '普通提示'}</td></tr>)}
          {room.status === 'clue_writing' && <>
            <tr><th>10</th><td>本轮角色</td><td>{isGuesser ? '你是猜题者' : '你是提示者'}</td><td>答案</td><td>{isGuesser ? '不可见' : privateRound?.targetWord ?? '读取中…'}</td><td>额外限制</td><td>{room.challengeText ?? '无'}</td></tr>
            {room.players.map((player, index) => <tr key={player.id}><th>{11 + index}</th><td>{player.id === room.guesserId ? '猜题者' : '提示状态'}</td><td colSpan={2}>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.id === room.guesserId ? '等待提示' : room.clueStatuses[player.id] === 'confirmed' ? '已确认' : '填写中'}</td><td colSpan={2}>{player.id === room.guesserId ? '看不到答案' : '正文暂不公开'}</td></tr>)}
            {!isGuesser && <tr><th>25</th><td>我的提示</td><td colSpan={4}><input disabled={Boolean(clueLocked)} value={clueText} maxLength={CLUE_MAX_LENGTH} onChange={(event) => setClueText(event.target.value)} placeholder="填写 1–8 字提示" /><small>{clueText.length}/{CLUE_MAX_LENGTH} · 重复提示不会删除</small></td><td><button className="sheet-action" disabled={Boolean(clueLocked)} onClick={confirmClue}>{clueLocked ? '提示已确认' : '确认提示'}</button></td></tr>}
          </>}
          {['guessing', 'rating', 'result'].includes(room.status) && <>
            <tr><th>10</th><td>提示编号</td><td colSpan={3}>完整提示</td><td>作者</td><td>{room.status === 'rating' ? '评分' : '状态'}</td></tr>
            {room.publicClues.map((clue, index) => <tr key={clue.clueId}><th>{11 + index}</th><td>{clue.displayCode}</td><td colSpan={3}>{clue.text}</td><td>{clue.authorName ?? '暂不公开'}</td><td>{room.status === 'rating' && isGuesser ? <select value={ratings[clue.clueId] ?? ''} onChange={(event) => setRatings((current) => ({ ...current, [clue.clueId]: Number(event.target.value) }))}><option value="">评分</option><option value="1">1 分</option><option value="2">2 分</option><option value="3">3 分</option></select> : clue.score ? `${clue.score} 分` : '已公开'}</td></tr>)}
            {room.status === 'guessing' && <tr><th>25</th><td>猜题作答</td><td colSpan={4}>{isGuesser ? <input value={guessText} maxLength={20} onChange={(event) => setGuessText(event.target.value)} placeholder="填写答案，仅可提交一次" /> : `等待 ${room.guesserName} 作答`}</td><td>{isGuesser ? <button className="sheet-action" onClick={submitGuess}>确认答案</button> : '等待中'}</td></tr>}
            {room.status === 'rating' && <tr><th>25</th><td>提示评分</td><td colSpan={4}>{isGuesser ? '请为每条匿名提示选择 1–3 分；确认后才揭晓作者。' : `已猜中，等待 ${room.guesserName} 完成提示评分。`}</td><td>{isGuesser ? <button className="sheet-action" onClick={confirmRatings}>确认全部评分</button> : '等待中'}</td></tr>}
            {room.status === 'result' && <tr><th>25</th><td>{latestResult?.correct ? '猜题成功' : '本轮未猜中'}</td><td>答案：{room.revealedWord}</td><td colSpan={2}>作答：{latestResult?.guessText ?? '未提交'}</td><td>用时：{formatGuessTime(latestResult?.elapsedMs ?? null)}</td><td>10 秒后下一轮</td></tr>}
          </>}
          {room.status === 'finished' && <>
            <tr><th>10</th><td>提示大王排名</td><td>成员</td><td>累计提示分</td><td>猜题速度排名</td><td>成员</td><td>正确用时</td></tr>
            {room.players.map((_, index) => <tr key={index}><th>{11 + index}</th><td>{hintRanking[index] ? `第 ${hintRanking[index].rank} 名` : '—'}</td><td>{hintRanking[index]?.name ?? '—'}</td><td>{hintRanking[index]?.score ?? 0}</td><td>{speedRanking[index]?.rank ? `第 ${speedRanking[index].rank} 名` : '未上榜'}</td><td>{speedRanking[index]?.name ?? '—'}</td><td>{formatGuessTime(speedRanking[index]?.elapsedMs ?? null)}</td></tr>)}
          </>}
        </>}</tbody>
      </table></div>
      {notice && <div className="sheet-toast sheet-toast--info">{notice}</div>}
    </div></section>
    <footer className="sheet-tabs"><button disabled aria-label="新增工作表不可用">＋</button>{clueSheets.map(([id, label]) => <button className={activeSheet === id ? 'is-current' : ''} onClick={() => setActiveSheet(id)} key={id}>{label}</button>)}</footer>
  </main>;
}
