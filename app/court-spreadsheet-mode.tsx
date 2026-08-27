'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createCourtRoom, validateDefense, validateVote, type AbsurdCourtRoom } from '@/lib/court-game';
import { getCloudStore, type CourtActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';

const statusName: Record<string, string> = {
  lobby: '等待成员', defense: '匿名辩护', defense_reveal: '匿名公开', supplement: '补充圆谎',
  voting: '评选最佳狡辩', result: '本轮结果', finished: '最终排行',
};

function remaining(deadline: number | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

export default function CourtSpreadsheetMode() {
  const [ownerName, setOwnerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<AbsurdCourtRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordRound, setKeywordRound] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const [defense, setDefense] = useState('');
  const [supplement, setSupplement] = useState('');
  const [choices, setChoices] = useState<string[]>([]);
  const [notice, setNotice] = useState('欢迎进入离谱法堂：这里不找卧底，只评选最佳狡辩。');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const advancing = useRef(false);
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  const loadAssignment = useCallback(async (code: string, round: number) => {
    if (round <= 0) return;
    const assignment = await getCloudStore().getMyCourtAssignment(code);
    setKeywords(assignment?.round === round ? assignment.keywords : []);
    setKeywordRound(assignment?.round ?? 0);
    setShowKeys(false);
  }, []);

  useEffect(() => {
    if (!cloudReady) return;
    const saved = window.localStorage.getItem('court-active-remote');
    if (!saved) return;
    void (async () => {
      try {
        const active = JSON.parse(saved) as { code: string; playerId: string };
        const found = await getCloudStore().getCourtRoom(active.code);
        if (!found) return;
        setPlayerId(active.playerId);
        setRoom(found);
        if (found.status !== 'lobby') await loadAssignment(found.code, found.round);
        setNotice('已恢复上次打开的离谱法堂房间。');
      } catch {
        setNotice('上次房间暂时无法恢复，可重新输入房间编号加入。');
      }
    })();
  }, [cloudReady, loadAssignment]);

  const activeCode = room?.code ?? '';

  useEffect(() => {
    if (!activeCode || !playerId || !cloudReady) return;
    return getCloudStore().watchCourtRoom(activeCode, (next) => {
      setRoom(next);
      if (next.status === 'defense' && next.round !== keywordRound) {
        void loadAssignment(next.code, next.round).catch(() => setNotice('本轮私密关键词读取失败，请刷新后重试。'));
      }
    }, (error) => setNotice(error instanceof Error ? error.message : '房间同步失败'));
  }, [activeCode, cloudReady, keywordRound, loadAssignment, playerId]);

  const apply = useCallback(async (actionType: CourtActionType, payload: Record<string, unknown> = {}) => {
    if (!room) return null;
    try {
      const result = await getCloudStore().applyCourtAction({ room, actionId: makeId('court-action'), actionType, payload });
      setRoom(result.state);
      if (result.outcome === 'stale') setNotice('房间状态已经更新，请重新操作。');
      return result.state;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败');
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
    const hide = () => setShowKeys(false);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', escape);
    return () => { window.clearInterval(timer); window.removeEventListener('blur', hide); window.removeEventListener('keydown', escape); };
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
      const next = createCourtRoom(ownerName);
      await getCloudStore().createCourtRoom(next);
      remember(next.code, next.ownerId);
      setPlayerId(next.ownerId);
      setRoom(next);
      setNotice(`房间 ${next.code} 已创建。请朋友从离谱法堂页面输入编号加入。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建房间失败');
    } finally { setBusy(false); }
  };

  const joinRemote = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!joinName.trim() || code.length !== 6) return setNotice('请填写称呼和六位房间编号。');
    setBusy(true);
    try {
      const requestedId = window.localStorage.getItem(`court-player-${code}`) ?? makeId('court-player');
      const joined = await getCloudStore().joinRoom(code, requestedId, joinName.trim());
      if ((joined.room as unknown as { gameType?: string }).gameType !== 'absurd_court') throw new Error('该编号属于其他游戏房间');
      const next = joined.room as unknown as AbsurdCourtRoom;
      remember(code, joined.playerId);
      setPlayerId(joined.playerId);
      setRoom(next);
      if (next.status !== 'lobby') await loadAssignment(code, next.round);
      setNotice(`已加入房间 ${code}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加入房间失败');
    } finally { setBusy(false); }
  };

  const leaveView = () => {
    window.localStorage.removeItem('court-active-remote');
    setRoom(null); setPlayerId(''); setKeywords([]); setKeywordRound(0); setShowKeys(false);
    setDefense(''); setSupplement(''); setChoices([]); setNotice('已返回离谱法堂首页。');
  };

  const startRound = () => {
    void apply('start_court_game').then(async (next) => {
      if (next) await loadAssignment(next.code, next.round);
    });
  };

  const currentId = playerId;
  const myEntry = room?.publicEntries.find((entry) => entry.submissionId === `s-${currentId}-${room.round}`) ?? null;
  const entries = room?.publicEntries ?? [];
  const voteNeeded = room && room.expectedPlayerIds.length >= 5 ? 2 : 1;
  const isOwner = room?.ownerId === playerId;
  const latestResult = room?.roundResults.at(-1) ?? null;

  const submitDefense = () => {
    if (!room) return;
    try {
      validateDefense(defense, keywords);
      void apply('submit_court_defense', { defense: defense.trim() }).then((next) => {
        if (next) { setDefense(''); setShowKeys(false); setNotice('已匿名提交，公开前其他人看不到正文和关键词。'); }
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : '提交失败'); }
  };

  const submitSupplement = () => {
    const text = supplement.trim();
    if (text.length > 30) return setNotice('补充说明不能超过 30 字。');
    void apply('submit_court_supplement', { supplement: text }).then((next) => { if (next) setSupplement(''); });
  };

  const submitVote = () => {
    if (!room) return;
    try {
      validateVote(myEntry?.submissionId ?? null, choices, entries.map((entry) => entry.submissionId), room.expectedPlayerIds.length);
      void apply('submit_court_vote', { submissionIds: choices }).then((next) => {
        if (next) { setChoices([]); setNotice('选票已提交：等待评选本轮最佳狡辩。'); }
      });
    } catch (error) { setNotice(error instanceof Error ? error.message : '投票失败'); }
  };

  return <main className="sheet-app court-sheet">
    <header className="sheet-titlebar">
      <button className="sheet-filemark" onClick={leaveView}>表</button>
      <div><strong>{room ? `离谱法堂 · ${room.code}` : '离谱法堂 · 案件管理工作簿'}</strong><span>独立游戏 · 匿名狡辩评选</span></div>
      <div className="sheet-title-actions">{room && <><button onClick={() => navigator.clipboard?.writeText(room.code)}>复制房间编号</button><button onClick={leaveView}>返回首页</button></>}</div>
    </header>
    <nav className="sheet-ribbon"><button className="is-current">开始</button><button>案件</button><button>评选</button><span /><button onClick={() => setShowKeys(false)}>隐藏私密附件</button></nav>
    <div className="sheet-formula"><span className="sheet-namebox">A1</span><span className="sheet-fx">fx</span><output>{room ? `${statusName[room.status]} · 第 ${room.round}/3 轮 · ${remaining(room.phaseDeadlineAt, now)} 秒` : '不是找卧底，是选出最会圆谎的人'}</output></div>
    <section className="sheet-workspace"><div className="sheet-canvas">
      <div className="sheet-commandbar">
        {!room ? <span>独立游戏入口 · 创建新房间或加入朋友的离谱法堂</span> : room.status === 'lobby' ? <>{isOwner ? <button className="sheet-primary-action" disabled={room.players.length < 3 || busy} onClick={startRound}>开始第一轮</button> : <span>等待房主开始</span>}<span>当前 {room.players.length}/8 人，至少 3 人开始</span></> : <span>系统自动推进 · 当前阶段剩余 {remaining(room.phaseDeadlineAt, now)} 秒</span>}
      </div>
      <div className="sheet-grid-scroll"><table className="sheet-grid">
        <thead><tr><th /><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></thead>
        <tbody>{!room ? <>
          <tr><th>1</th><td>操作类型</td><td>你的称呼</td><td>六位房间编号</td><td>人数</td><td>执行</td><td>说明</td></tr>
          <tr><th>2</th><td>创建离谱法堂</td><td><input value={ownerName} onChange={(event) => setOwnerName(event.target.value.slice(0, 12))} placeholder="填写房主称呼" /></td><td>自动生成</td><td>3–8 人</td><td><button className="sheet-action" disabled={busy} onClick={createRemote}>创建联机房间</button></td><td>房主只需开始一次</td></tr>
          <tr><th>3</th><td>加入离谱法堂</td><td><input value={joinName} onChange={(event) => setJoinName(event.target.value.slice(0, 12))} placeholder="填写你的称呼" /></td><td><input value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="例如 Q7K2P8" /></td><td>自动识别</td><td><button className="sheet-action" disabled={busy} onClick={joinRemote}>加入房间</button></td><td>只接受离谱法堂编号</td></tr>
          <tr><th>5</th><td>怎么玩</td><td colSpan={5}>同一离谱罪名 → 使用两个私密关键词匿名辩护 → 公布突发证据 → 补充圆谎 → 匿名投票选最佳狡辩</td></tr>
          <tr><th>6</th><td>投票标准</td><td colSpan={5}>不是判断谁可疑；请把票投给最精彩、最合理或最离谱地把话圆回来的人。</td></tr>
        </> : <>
          <tr><th>1</th><td>成员列表</td><td>座位</td><td>称呼</td><td>状态</td><td colSpan={2}>房间编号 {room.code}</td></tr>
          {room.status === 'lobby' && room.players.map((player, index) => <tr key={player.id}><th>{2 + index}</th><td>{player.id === room.ownerId ? '房主' : '成员'}</td><td>{player.seat}</td><td>{player.name}{player.id === playerId ? '（你）' : ''}</td><td>{player.away ? '暂离' : '已加入'}</td><td colSpan={2}>等待开始</td></tr>)}
          {room.status !== 'lobby' && <><tr><th>2</th><td>案件登记</td><td>第 {room.round}/3 轮</td><td colSpan={2}>{room.caseText ?? '等待案件'}</td><td>{statusName[room.status]}</td><td>{room.status === 'defense' ? `${room.defenseSubmittedCount}/${room.expectedPlayerIds.length} 已辩护` : room.status === 'voting' ? `${room.voteSubmittedCount}/${room.expectedPlayerIds.length} 已投票` : '自动推进'}</td></tr>
          <tr><th>4</th><td>私密附件</td><td>本人关键词</td><td colSpan={3}>{showKeys ? keywords.join('、') : '···'}</td><td><button onClick={() => setShowKeys((value) => !value)}>{showKeys ? '遮挡' : '查看'}</button></td></tr>
          {room.status === 'defense' && <tr><th>5</th><td>匿名辩护</td><td colSpan={4}><input value={defense} onChange={(event) => setDefense(event.target.value.slice(0, 40))} placeholder="同时自然包含两个关键词，最多 40 字" /><small>{defense.length}/40 · 命中 {keywords.filter((keyword) => defense.includes(keyword)).length}/2</small></td><td><button className="sheet-action" onClick={submitDefense}>匿名提交</button></td></tr>}
          {room.status === 'defense_reveal' && <tr><th>5</th><td>匿名陈述</td><td colSpan={5}>{entries.map((entry) => <p key={entry.submissionId}><b>{entry.displayCode}</b>：{entry.defense}</p>)}</td></tr>}
          {room.status === 'supplement' && <><tr><th>5</th><td>突发证据</td><td colSpan={5}>{room.twistText}</td></tr><tr><th>6</th><td>补充圆谎</td><td colSpan={4}><input value={supplement} onChange={(event) => setSupplement(event.target.value.slice(0, 30))} placeholder="继续把话圆回来，最多 30 字" /></td><td><button className="sheet-action" disabled={!myEntry} onClick={submitSupplement}>提交补充</button></td></tr></>}
          {room.status === 'voting' && <>{entries.map((entry, index) => <tr key={entry.submissionId}><th>{6 + index}</th><td>{entry.displayCode}{entry.submissionId === myEntry?.submissionId ? '（你的陈述）' : ''}</td><td colSpan={4}>{entry.defense}<br />{entry.supplement ?? '未补充说明'}</td><td>{entry.submissionId !== myEntry?.submissionId && <button onClick={() => setChoices((current) => current.includes(entry.submissionId) ? current.filter((id) => id !== entry.submissionId) : current.length < voteNeeded ? [...current, entry.submissionId] : current)}>{choices.includes(entry.submissionId) ? '已选择' : '投给这条'}</button>}</td></tr>)}<tr><th>20</th><td>最佳狡辩评选</td><td colSpan={4}>请选择 {voteNeeded} 条最精彩的陈述；不能投自己，不显示实时票型。</td><td><button className="sheet-action" onClick={submitVote}>提交选票</button></td></tr></>}
          {['result', 'finished'].includes(room.status) && <>{entries.map((entry, index) => <tr key={entry.submissionId}><th>{5 + index}</th><td>{latestResult?.winnerIds.includes(entry.authorId ?? '') ? '本轮最佳狡辩' : entry.displayCode}</td><td>{entry.authorName ?? '待揭晓'}</td><td colSpan={2}>{entry.defense}<br />{entry.supplement ?? '未补充说明'}</td><td>{entry.roundVotes ?? 0} 票</td><td>{latestResult?.winnerIds.includes(entry.authorId ?? '') ? '并列时共享称号' : '本轮结果'}</td></tr>)}<tr><th>20</th><td>累计排行榜</td><td colSpan={4}>{[...room.players].sort((a, b) => (room.totalScores[b.id] ?? 0) - (room.totalScores[a.id] ?? 0)).map((player) => `${player.name} ${room.totalScores[player.id] ?? 0} 票`).join('；')}</td><td>{room.status === 'finished' ? '三轮完成' : '10 秒后进入下一轮'}</td></tr></>}
          </>}</>}
        </tbody>
      </table></div>
      {notice && <div className="sheet-toast sheet-toast--info">{notice}</div>}
    </div></section>
    <footer className="sheet-tabs"><button>＋</button><button className="is-current">法堂首页</button><button>成员列表</button><button>案件登记</button><button>私密附件</button><button>匿名陈述</button><button>判决统计</button><button>玩法说明</button></footer>
  </main>;
}
