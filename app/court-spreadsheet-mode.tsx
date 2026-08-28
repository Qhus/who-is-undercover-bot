'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCourtRoom,
  validateResponse,
  validateStatement,
  validateVote,
  type AbsurdCourtRoom,
  type CourtPhaseStatus,
  type CourtPrivateSubmission,
} from '@/lib/court-game';
import { getCloudStore, type CourtActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';

const statusName: Record<string, string> = {
  lobby: '等待成员',
  statement: '首次陈词',
  statement_reveal: '匿名公开',
  evidence: '证据突袭',
  response: '当庭补述',
  voting: '陪审团表决',
  result: '判决揭晓',
  finished: '最终排行',
};

function remaining(deadline: number | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function phaseStatusLabel(value: CourtPhaseStatus | undefined, voting = false) {
  if (value === 'away') return '暂离';
  if (value === 'confirmed') return voting ? '已确认双项选票' : '已确认';
  if (value === 'unconfirmed') return voting ? '未投票' : '未确认';
  if (value === 'unvoted') return '未投票';
  return '填写中';
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return fallback;
  const value = error as { code?: unknown; message?: unknown; msg?: unknown };
  const message = typeof value.message === 'string' ? value.message : typeof value.msg === 'string' ? value.msg : '';
  const code = typeof value.code === 'string' ? value.code : '';
  return message ? `${message}${code && !message.includes(code) ? `（${code}）` : ''}` : code || fallback;
}

export default function CourtSpreadsheetMode() {
  const [ownerName, setOwnerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<AbsurdCourtRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [privateSubmission, setPrivateSubmission] = useState<CourtPrivateSubmission | null>(null);
  const [statement, setStatement] = useState('');
  const [response, setResponse] = useState('');
  const [bestChoice, setBestChoice] = useState<string | null>(null);
  const [truthChoice, setTruthChoice] = useState<string | null>(null);
  const [notice, setNotice] = useState('欢迎进入离谱法堂：同案匿名陈词，最后评选最会狡辩和最像真的答案。');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const advancing = useRef(false);
  const draftScope = useRef('');
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  const loadSubmission = useCallback(async (code: string) => {
    const found = await getCloudStore().getMyCourtSubmission(code);
    setPrivateSubmission(found);
    if (found?.statementConfirmed) setStatement(found.statement);
    if (found?.responseConfirmed) setResponse(found.response);
  }, []);

  useEffect(() => {
    const invitedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) ?? '';
    if (invitedCode) window.queueMicrotask(() => setJoinCode(invitedCode));
    if (!cloudReady) return;
    const saved = window.localStorage.getItem('court-active-remote');
    if (!saved) return;
    void (async () => {
      try {
        const active = JSON.parse(saved) as { code: string; playerId: string };
        if (invitedCode && active.code !== invitedCode) return;
        const found = await getCloudStore().getCourtRoom(active.code);
        if (!found || found.courtVersion !== 6) return;
        setPlayerId(active.playerId);
        setRoom(found);
        if (found.round > 0) await loadSubmission(found.code);
        setNotice('已恢复上次打开的离谱法堂房间。');
      } catch {
        setNotice('上次房间暂时无法恢复，可重新输入房间编号加入。');
      }
    })();
  }, [cloudReady, loadSubmission]);

  const activeCode = room?.code ?? '';
  useEffect(() => {
    if (!activeCode || !playerId || !cloudReady) return;
    return getCloudStore().watchCourtRoom(activeCode, (next) => {
      setRoom(next);
    }, (error) => setNotice(readableError(error, '房间同步失败')));
  }, [activeCode, cloudReady, playerId]);

  useEffect(() => {
    if (!room || !playerId || room.round <= 0) return;
    const scope = `${room.code}-${room.sessionNo}-${room.round}`;
    if (draftScope.current === scope) return;
    draftScope.current = scope;
    const saved = window.localStorage.getItem(`court-draft-${scope}`);
    const draft = saved ? JSON.parse(saved) as { statement?: string; response?: string } : {};
    setStatement(draft.statement ?? '');
    setResponse(draft.response ?? '');
    setBestChoice(null);
    setTruthChoice(null);
    setPrivateSubmission(null);
    void loadSubmission(room.code).catch(() => setNotice('本人已确认内容暂时无法读取，请刷新重试。'));
  }, [loadSubmission, playerId, room]);

  useEffect(() => {
    if (!room || !playerId || room.round <= 0 || !draftScope.current) return;
    window.localStorage.setItem(`court-draft-${draftScope.current}`, JSON.stringify({ statement, response }));
  }, [playerId, response, room, statement]);

  const apply = useCallback(async (actionType: CourtActionType, payload: Record<string, unknown> = {}) => {
    if (!room) return null;
    try {
      const result = await getCloudStore().applyCourtAction({ room, actionId: makeId('court-v6-action'), actionType, payload });
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
      void apply('advance_court_phase').finally(() => { advancing.current = false; });
    };
    tick();
    const timer = window.setInterval(tick, 700);
    return () => window.clearInterval(timer);
  }, [apply, room]);

  const remember = (code: string, id: string) => {
    window.localStorage.setItem(`court-player-${code}`, id);
    window.localStorage.setItem('court-active-remote', JSON.stringify({ code, playerId: id }));
  };

  const createRemote = async () => {
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!ownerName.trim()) return setNotice('请先填写你的称呼。');
    setBusy(true);
    try {
      const seed = createCourtRoom(ownerName);
      const next = await getCloudStore().createCourtRoom(seed);
      remember(next.code, next.ownerId);
      setPlayerId(next.ownerId);
      setRoom(next);
      setNotice(`房间 ${next.code} 已创建。请朋友从离谱法堂页面输入编号加入。`);
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
      const requestedId = window.localStorage.getItem(`court-player-${code}`) ?? makeId('court-player');
      const joined = await getCloudStore().joinCourtRoom(code, requestedId, joinName.trim());
      remember(code, joined.playerId);
      setPlayerId(joined.playerId);
      setRoom(joined.room);
      if (joined.room.round > 0) await loadSubmission(code);
      setNotice(joined.room.status === 'lobby' ? `已加入房间 ${code}。` : `已加入房间 ${code}，你将从下一轮参与。`);
    } catch (error) {
      setNotice(readableError(error, '加入房间失败'));
    } finally {
      setBusy(false);
    }
  };

  const leaveView = () => {
    window.localStorage.removeItem('court-active-remote');
    setRoom(null);
    setPlayerId('');
    setPrivateSubmission(null);
    setStatement('');
    setResponse('');
    setBestChoice(null);
    setTruthChoice(null);
    draftScope.current = '';
    setNotice('已返回离谱法堂首页。');
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

  const confirmStatement = () => {
    try {
      validateStatement(statement);
      void apply('confirm_court_statement', { statement: statement.trim() }).then(async (next) => {
        if (next) await loadSubmission(next.code);
      });
    } catch (error) {
      setNotice(readableError(error, '确认失败'));
    }
  };

  const confirmResponse = () => {
    try {
      validateResponse(response);
      void apply('confirm_court_response', { response: response.trim() }).then(async (next) => {
        if (next) await loadSubmission(next.code);
      });
    } catch (error) {
      setNotice(readableError(error, '确认失败'));
    }
  };

  const confirmVote = () => {
    try {
      validateVote(privateSubmission?.submissionId ?? null, bestChoice, truthChoice, room?.publicEntries.map((entry) => entry.submissionId) ?? []);
      void apply('confirm_court_vote', { bestSubmissionId: bestChoice, truthSubmissionId: truthChoice });
    } catch (error) {
      setNotice(readableError(error, '确认失败'));
    }
  };

  const isOwner = room?.ownerId === playerId;
  const me = room?.players.find((player) => player.id === playerId);
  const isRoundPlayer = Boolean(room?.expectedPlayerIds.includes(playerId));
  const entries = room?.publicEntries ?? [];
  const latestResult = room?.roundResults.at(-1) ?? null;
  const statementLocked = room?.statementStatuses[playerId] === 'confirmed' || privateSubmission?.statementConfirmed;
  const responseLocked = room?.responseStatuses[playerId] === 'confirmed' || privateSubmission?.responseConfirmed;
  const voteLocked = room?.voteStatuses[playerId] === 'confirmed';
  const currentStatuses = room?.status === 'statement' ? room.statementStatuses : room?.status === 'response' ? room.responseStatuses : room?.status === 'voting' ? room.voteStatuses : null;

  return <main className="sheet-app court-sheet">
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={leaveView}>表</button>
      <div><strong>{room ? `离谱法堂 · ${room.code}` : '离谱法堂 · 案件管理工作簿'}</strong><span>独立游戏 · 匿名双项评选</span></div>
      <div className="sheet-title-actions"><a href="../" aria-label="返回摸鱼游戏工作台">目录</a>{room && <><button onClick={() => navigator.clipboard?.writeText(room.code)}>复制房间编号</button><button onClick={copyInviteLink}>复制邀请链接</button><button onClick={leaveView}>返回法堂首页</button></>}</div>
    </header>
    <nav className="sheet-ribbon"><button className="is-current">开始</button><button>案件</button><button>评选</button><span />{room && <button onClick={() => void apply('change_court_presence', { away: !me?.away })}>{me?.away ? '结束暂离' : '暂离'}</button>}</nav>
    <div className="sheet-formula"><span className="sheet-namebox">A1</span><span className="sheet-fx">fx</span><output>{room ? `${statusName[room.status]} · 第 ${room.round}/3 轮 · 局次 ${room.sessionNo} · ${remaining(room.phaseDeadlineAt, now)} 秒` : '不是找卧底，是分别选出最会狡辩和最像真的答案'}</output></div>
    <section className="sheet-workspace"><div className="sheet-canvas">
      <div className="sheet-commandbar">
        {!room ? <span>独立游戏入口 · 创建新房间或加入朋友的离谱法堂</span> : room.status === 'lobby' ? <>{isOwner ? <button className="sheet-primary-action" disabled={room.players.filter((player) => !player.away).length < 2 || busy} onClick={() => void apply('start_court_game')}>开始第一轮</button> : <span>等待房主开始</span>}<span>当前 {room.players.length}/8 人，至少 2 名未暂离成员开始</span></> : room.status === 'finished' ? <>{isOwner && <button className="sheet-primary-action" onClick={() => void apply('restart_court_game')}>再来一局</button>}<span>{isOwner ? '保留当前房间与成员，清空本局记录' : '等待房主决定是否再来一局'}</span></> : <><span>系统自动推进 · 全员确认会立即跳过等待，超时未确认不会阻塞</span></>}
      </div>
      <div className="court-mobile-controls">
        {!room ? <>
          <div><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 12))} placeholder="填写房主称呼" /><button disabled={busy} onClick={createRemote}>创建房间</button></div>
          <div><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 12))} placeholder="你的称呼" /><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="六位编号" /><button disabled={busy} onClick={joinRemote}>加入</button></div>
        </> : room.status === 'statement' ? <div><input disabled={!isRoundPlayer || Boolean(statementLocked) || me?.away} value={statement} onChange={(event) => setStatement(event.target.value.slice(0, 80))} placeholder={isRoundPlayer ? '首次陈词，最多 80 字' : '本轮旁听，无需提交'} /><button disabled={!isRoundPlayer || Boolean(statementLocked) || me?.away} onClick={confirmStatement}>{statementLocked ? '已确认' : '确认首次陈词'}</button></div>
          : room.status === 'response' ? <div><input disabled={!privateSubmission?.statementConfirmed || Boolean(responseLocked) || me?.away} value={response} onChange={(event) => setResponse(event.target.value.slice(0, 80))} placeholder={privateSubmission?.statementConfirmed ? '当庭补述，最多 80 字' : '本阶段无需提交'} /><button disabled={!privateSubmission?.statementConfirmed || Boolean(responseLocked) || me?.away} onClick={confirmResponse}>{responseLocked ? '已确认' : '确认当庭补述'}</button></div>
            : room.status === 'voting' ? <div className="court-vote-selects"><label>最会狡辩<select disabled={voteLocked || !isRoundPlayer || me?.away} value={bestChoice ?? ''} onChange={(event) => setBestChoice(event.target.value || null)}><option value="">选择一条陈述</option>{entries.filter((entry) => entry.submissionId !== privateSubmission?.submissionId).map((entry) => <option key={entry.submissionId} value={entry.submissionId}>{entry.displayCode}</option>)}</select></label><label>最像真的<select disabled={voteLocked || !isRoundPlayer || me?.away} value={truthChoice ?? ''} onChange={(event) => setTruthChoice(event.target.value || null)}><option value="">选择一条陈述</option>{entries.filter((entry) => entry.submissionId !== privateSubmission?.submissionId).map((entry) => <option key={entry.submissionId} value={entry.submissionId}>{entry.displayCode}</option>)}</select></label><button disabled={voteLocked || !isRoundPlayer || me?.away || !bestChoice || !truthChoice} onClick={confirmVote}>{voteLocked ? '双项选票已确认' : '确认两项选票'}</button></div> : null}
      </div>
      <div className="sheet-grid-scroll"><table className="sheet-grid">
        <thead><tr><th /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></thead>
        <tbody>{!room ? <>
          <tr><th>1</th><td>操作类型</td><td>你的称呼</td><td>六位房间编号</td><td>人数</td><td>执行</td><td>说明</td></tr>
          <tr><th>2</th><td>创建离谱法堂</td><td><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 12))} placeholder="填写房主称呼" /></td><td>自动生成</td><td>2–8 人</td><td><button className="sheet-action" disabled={busy} onClick={createRemote}>创建联机房间</button></td><td>房主只需开始一次</td></tr>
          <tr><th>3</th><td>加入离谱法堂</td><td><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 12))} placeholder="填写你的称呼" /></td><td><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="例如 Q7K2P8" /></td><td>自动识别</td><td><button className="sheet-action" disabled={busy} onClick={joinRemote}>加入房间</button></td><td>进行中的房间从下一轮参与</td></tr>
          <tr><th>5</th><td>怎么玩</td><td colSpan={5}>同一案件 → 首次陈词 → 证据突袭 → 当庭补述 → 最会狡辩与最像真的各投一票</td></tr>
          <tr><th>6</th><td>确认规则</td><td colSpan={5}>确认前可以修改，确认后锁定；所有人可见确认状态，但公开前看不到正文。</td></tr>
        </> : <>
          <tr><th>1</th><td>案件登记</td><td>第 {room.round}/3 轮</td><td>{room.caseTitle ?? '等待案件'}</td><td colSpan={2}>{room.charge ?? '房主开始后受理案件'}</td><td>{statusName[room.status]}</td></tr>
          {room.status === 'lobby' && room.players.map((player, index) => <tr key={player.id}><th>{2 + index}</th><td>{player.id === room.ownerId ? '房主' : '成员'}</td><td>{player.seat}</td><td>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.away ? '暂离' : '已加入'}</td><td>{(player.eligibleFromRound ?? 1) > 1 ? `第 ${player.eligibleFromRound} 轮参与` : '本局参与'}</td><td>房间 {room.code}</td></tr>)}
          {currentStatuses && room.players.filter((player) => room.expectedPlayerIds.includes(player.id)).map((player, index) => <tr key={player.id}><th>{2 + index}</th><td>{room.status === 'voting' ? '投票状态' : '确认状态'}</td><td>{player.seat}</td><td>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{phaseStatusLabel(currentStatuses[player.id], room.status === 'voting')}</td><td colSpan={2}>正文与票型不公开</td></tr>)}
          {room.status === 'statement' && <tr><th>12</th><td>首次陈词</td><td colSpan={4}><input disabled={!isRoundPlayer || Boolean(statementLocked) || me?.away} value={statement} onChange={(event) => setStatement(event.target.value.slice(0, 80))} placeholder={isRoundPlayer ? '围绕案件为自己辩护，最多 80 字' : '本轮旁听，无需提交'} /><small>{statement.length}/80 · 确认后锁定</small></td><td><button className="sheet-action" disabled={!isRoundPlayer || Boolean(statementLocked) || me?.away} onClick={confirmStatement}>{statementLocked ? '首次陈词已确认' : '确认首次陈词'}</button></td></tr>}
          {room.status === 'statement_reveal' && <tr><th>12</th><td>匿名陈词</td><td colSpan={5}>{entries.length ? entries.map((entry) => <p key={entry.submissionId}><b>{entry.displayCode}{entry.submissionId === privateSubmission?.submissionId ? '（你的陈述）' : ''}</b>：{entry.statement}</p>) : '本轮无人确认首次陈词'}</td></tr>}
          {room.status === 'evidence' && <><tr><th>12</th><td>证据突袭</td><td>{room.evidenceTitle}</td><td colSpan={4}>{room.evidence}</td></tr><tr><th>13</th><td>提示</td><td colSpan={5}>5 秒后开放当庭补述，请把新证据圆回来。</td></tr></>}
          {room.status === 'response' && <><tr><th>12</th><td>证据突袭</td><td>{room.evidenceTitle}</td><td colSpan={4}>{room.evidence}</td></tr><tr><th>13</th><td>当庭补述</td><td colSpan={4}><input disabled={!privateSubmission?.statementConfirmed || Boolean(responseLocked) || me?.away} value={response} onChange={(event) => setResponse(event.target.value.slice(0, 80))} placeholder={privateSubmission?.statementConfirmed ? '面对新证据继续圆谎，最多 80 字' : '首次陈词未确认，本阶段无需提交'} /><small>{response.length}/80 · 确认后锁定</small></td><td><button className="sheet-action" disabled={!privateSubmission?.statementConfirmed || Boolean(responseLocked) || me?.away} onClick={confirmResponse}>{responseLocked ? '当庭补述已确认' : '确认当庭补述'}</button></td></tr></>}
          {room.status === 'voting' && <><tr><th>12</th><td>共同证据</td><td>{room.evidenceTitle}</td><td colSpan={4}>{room.evidence}</td></tr>{entries.map((entry, index) => <tr key={entry.submissionId}><th>{13 + index}</th><td>{entry.displayCode}{entry.submissionId === privateSubmission?.submissionId ? '（你的陈述）' : ''}</td><td colSpan={3}>首次陈词：{entry.statement}<br />当庭补述：{entry.response ?? '未作补充说明'}</td><td><button disabled={voteLocked || entry.submissionId === privateSubmission?.submissionId} onClick={() => setBestChoice(entry.submissionId)}>{bestChoice === entry.submissionId ? '已选狡辩' : '最会狡辩'}</button></td><td><button disabled={voteLocked || entry.submissionId === privateSubmission?.submissionId} onClick={() => setTruthChoice(entry.submissionId)}>{truthChoice === entry.submissionId ? '已选可信' : '最像真的'}</button></td></tr>)}<tr><th>25</th><td>陪审团表决</td><td colSpan={4}>两项各选一条，可以选择同一条；不能投自己。书记员也交了一份匿名临场答辩。</td><td><button className="sheet-action" disabled={voteLocked || !isRoundPlayer || me?.away || !bestChoice || !truthChoice} onClick={confirmVote}>{voteLocked ? '双项选票已确认' : '确认两项选票'}</button></td></tr></>}
          {['result', 'finished'].includes(room.status) && <>{entries.map((entry, index) => { const bestWinner = Boolean(latestResult?.bestWinnerSubmissionIds.includes(entry.submissionId)); const truthWinner = Boolean(latestResult?.truthWinnerSubmissionIds.includes(entry.submissionId)); return <tr key={entry.submissionId}><th>{12 + index}</th><td>{bestWinner && truthWinner ? '双项胜出' : bestWinner ? '最会狡辩' : truthWinner ? '最像真的' : entry.displayCode}</td><td>{entry.isReference ? '书记员席' : entry.authorName ?? '待揭晓'}</td><td colSpan={2}>首次陈词：{entry.statement}<br />当庭补述：{entry.response ?? '未作补充说明'}</td><td>狡辩 {entry.bestVotes ?? 0} · 可信 {entry.truthVotes ?? 0}</td><td>{bestWinner || truthWinner ? room.verdictTemplate : '本轮结果'}</td></tr>; })}<tr><th>25</th><td>狡辩排行榜</td><td colSpan={4}>{[...room.players].sort((a, b) => (room.totalBestScores[b.id] ?? 0) - (room.totalBestScores[a.id] ?? 0)).map((player) => `${player.name} ${room.totalBestScores[player.id] ?? 0} 票`).join('；')}</td><td>{room.status === 'finished' ? '三轮完成' : '10 秒后进入下一轮'}</td></tr><tr><th>26</th><td>可信排行榜</td><td colSpan={4}>{[...room.players].sort((a, b) => (room.totalTruthScores[b.id] ?? 0) - (room.totalTruthScores[a.id] ?? 0)).map((player) => `${player.name} ${room.totalTruthScores[player.id] ?? 0} 票`).join('；')}</td><td>书记员席不计入累计榜</td></tr></>}
        </>}</tbody>
      </table></div>
      {notice && <div className="sheet-toast sheet-toast--info">{notice}</div>}
    </div></section>
    <footer className="sheet-tabs"><button>＋</button><button className="is-current">法堂首页</button><button>成员列表</button><button>案件登记</button><button>陈述记录</button><button>证据附件</button><button>陪审投票</button><button>判决统计</button><button>玩法说明</button><button>操作记录</button></footer>
  </main>;
}
