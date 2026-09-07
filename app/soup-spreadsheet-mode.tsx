'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { getCloudStore, type SoupActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';
import { createPrivacyGuard, type PrivacyGuard } from '@/lib/privacy';
import {
  SOUP_MIN_PLAYERS, createSoupRoom, soupVerdictLabel, validateSoupFeedback,
  type SoupFeedbackInput, type SoupPrivateRound, type SoupQuestionVerdict, type SoupRoom, type SoupSolutionVerdict,
} from '@/lib/soup-game';
import { ReleaseNotificationButton, ReleaseNotificationPanel } from './release-notification';
import { acceptSoupRoom, canEditSoupDraft, createSoupDraftController, soupRoundScope, type SoupDraftStatus } from '@/lib/soup-draft';

const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const soupSheets = [['home', '当前汤面'], ['members', '玩家轮次'], ['records', '问答记录'], ['host', '汤主资料'], ['feedback', '题后反馈'], ['guide', '玩法说明']] as const;
type SoupSheetId = typeof soupSheets[number][0];

const statusLabels: Record<SoupRoom['status'], string> = {
  lobby: '等待成员', host_reading: '汤主阅读', investigating: '轮流调查', judging_question: '等待判定',
  judging_solution: '等待判定', limit_reached: '问题已达上限', feedback: '题后反馈', finished: '本局结束',
};

const categoryLabels: Record<string, string> = {
  daily_misunderstanding: '日常误会', office_fun: '职场趣事', animal_behavior: '动物行为',
  transport: '交通出行', tech_life: '科技生活', perspective: '视角错位',
};

function readableError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : JSON.stringify(error ?? '');
  if (/STALE_ROUND|STALE_VERSION|WRONG_PHASE/.test(raw)) return '当前题次或阶段已更新，请确认页面后重试。';
  if (/PGRST202|function.*v11.*does not exist|Could not find.*v11/.test(raw)) return 'A5 可靠性更新尚未完成，请管理员先执行 V10.1 增量 SQL。';
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== 'object') return fallback;
  const value = error as { code?: unknown; message?: unknown; msg?: unknown };
  const message = typeof value.message === 'string' ? value.message : typeof value.msg === 'string' ? value.msg : '';
  const code = typeof value.code === 'string' ? value.code : '';
  return message ? `${message}${code && !message.includes(code) ? `（${code}）` : ''}` : code || fallback;
}

function formatElapsed(ms: number | undefined) {
  if (ms === undefined) return '—';
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function row(values: ReactNode[]): ReactNode[] { return values; }

export default function SoupSpreadsheetMode() {
  const [ownerName, setOwnerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<SoupRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [privateRound, setPrivateRound] = useState<SoupPrivateRound | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftState, setDraftState] = useState<SoupDraftStatus>('loading');
  const [judgeNote, setJudgeNote] = useState('');
  const [feedback, setFeedback] = useState<SoupFeedbackInput>({ difficulty: 'just_right', ambiguous: false, unsuitable: false, note: '' });
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SoupSheetId>('home');
  const [activeCell, setActiveCell] = useState('A1');
  const [notice, setNotice] = useState('调查记录：一名成员掌握完整资料，其余成员轮流提出是非问题或尝试还原。');
  const [busy, setBusy] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [privateReload, setPrivateReload] = useState(0);
  const [confirmation, setConfirmation] = useState<'reveal_soup_bottom' | 'end_soup_game' | null>(null);
  const scopeRef = useRef('');
  const busyRef = useRef(false);
  const viewEpoch = useRef(0);
  const returnSheet = useRef<SoupSheetId>('home');
  const draftController = useRef<ReturnType<typeof createSoupDraftController> | null>(null);
  const retryAction = useRef<{ key: string; actionId: string; room: SoupRoom } | null>(null);
  const privacy = useRef<PrivacyGuard | null>(null);
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  useEffect(() => {
    // Long reference material needs reading time; A2's four-second word card stays unchanged.
    privacy.current = createPrivacyGuard({ onVisibilityChange: setSecretVisible, revealMs: 300_000, idleMs: 60_000 });
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' ? privacy.current?.mask('escape') : privacy.current?.activity();
    const onBlur = () => privacy.current?.mask('blur');
    const onVisibility = () => { if (document.hidden) privacy.current?.mask('hidden'); };
    const onActivity = () => privacy.current?.activity();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('wheel', onActivity, { passive: true });
    return () => {
      privacy.current?.dispose();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('wheel', onActivity);
    };
  }, []);

  useEffect(() => { privacy.current?.mask('sheet-change'); }, [activeSheet]);

  useEffect(() => {
    let disposed = false;
    const epoch = viewEpoch.current;
    const invitedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) ?? '';
    if (invitedCode) window.queueMicrotask(() => setJoinCode(invitedCode));
    if (!cloudReady) return;
    const saved = window.localStorage.getItem('soup-active-remote');
    if (!saved) return;
    void (async () => {
      try {
        const active = JSON.parse(saved) as { code: string; playerId: string };
        if (invitedCode && invitedCode !== active.code) return;
        const found = await getCloudStore().getSoupRoom(active.code);
        if (disposed || epoch !== viewEpoch.current || !found || found.soupVersion !== 1 || !found.players.some((p) => p.id === active.playerId)) return;
        setPlayerId(active.playerId);
        setRoom(found);
        setNotice('已恢复上次打开的调查房间。');
      } catch {
        if (!disposed && epoch === viewEpoch.current) setNotice('上次房间暂时无法恢复，可重新输入房间编号加入。');
      }
    })();
    return () => { disposed = true; };
  }, [cloudReady]);

  useEffect(() => {
    if (!room?.code || !playerId || !cloudReady) return;
    const code = room.code;
    return getCloudStore().watchSoupRoom(code, (incoming) => setRoom((current) => current?.code === code ? acceptSoupRoom(current, incoming) : current), (error) => setNotice(readableError(error, '房间同步失败')));
  }, [cloudReady, playerId, room?.code]);

  const draftRoomCode = room?.code ?? '';
  const draftRound = room?.round ?? 0;
  const draftSession = room?.sessionNo ?? 0;
  const draftEditable = Boolean(room && canEditSoupDraft(room, playerId));
  const formScope = `${draftRoomCode}:${draftSession}:${draftRound}:${playerId}:${privateReload}`;
  const [renderedFormScope, setRenderedFormScope] = useState(formScope);
  if (renderedFormScope !== formScope) {
    setRenderedFormScope(formScope);
    setDraftText(''); setDraftState('loading'); setPrivateRound(null); setSecretVisible(false);
    setFeedback({ difficulty: 'just_right', ambiguous: false, unsuitable: false, note: '' }); setFeedbackSent(false);
  }
  const actionScope = `${formScope}:${room?.status}:${room?.pendingAction?.id}`;
  const [renderedActionScope, setRenderedActionScope] = useState(actionScope);
  if (renderedActionScope !== actionScope) {
    setRenderedActionScope(actionScope); setJudgeNote(''); setConfirmation(null);
  }
  useEffect(() => {
    const context = { code: draftRoomCode, sessionNo: draftSession, round: draftRound };
    const scope = soupRoundScope(context, playerId);
    scopeRef.current = scope;
    privacy.current?.mask('sheet-change');
    if (!draftRoomCode || !playerId || draftRound <= 0) return;
    let disposed = false;
    const cacheKey = `soup-draft:${scope}`;
    const controller = createSoupDraftController({
      save: (text, revision) => getCloudStore().saveSoupDraft(context, text, revision),
      onChange: (value) => { setDraftText(value.text); setDraftState(value.status); },
      cache: (text) => { try { if (text === null) sessionStorage.removeItem(cacheKey); else sessionStorage.setItem(cacheKey, text); } catch { /* Cloud save remains available without browser storage. */ } },
    });
    draftController.current = controller;
    void getCloudStore().getMySoupRound(draftRoomCode).then((found) => {
      if (disposed || !found || found.sessionNo !== draftSession || found.round !== draftRound) return;
      setPrivateRound(found);
      setFeedbackSent(found.feedbackSubmitted ?? false);
      let local: string | null = null;
      try { local = sessionStorage.getItem(cacheKey); } catch { /* Storage can be disabled. */ }
      controller.hydrate(found, local);
    }).catch((error) => { if (!disposed) setNotice(readableError(error, '个人工作区暂时无法读取，请点击“重新读取”。')); });
    const retry = () => { void controller.flush(); };
    window.addEventListener('online', retry);
    return () => { disposed = true; controller.dispose(); window.removeEventListener('online', retry); if (draftController.current === controller) draftController.current = null; };
  }, [draftRoomCode, draftRound, draftSession, playerId, privateReload]);

  useEffect(() => {
    draftController.current?.setEnabled(draftEditable);
    if (!draftEditable) return;
    const timer = window.setTimeout(() => { void draftController.current?.flush(); }, 550);
    return () => window.clearTimeout(timer);
  }, [draftEditable, draftText, draftRoomCode, draftRound, draftSession, privateReload]);

  const apply = useCallback(async (actionType: SoupActionType, payload: Record<string, unknown> = {}) => {
    if (!room || busyRef.current) return null;
    busyRef.current = true;
    const epoch = viewEpoch.current;
    const key = JSON.stringify([room.code, room.sessionNo, room.round, room.status, room.actionCycle, room.currentDetectiveId, room.pendingAction?.id, actionType, payload]);
    const intent = retryAction.current?.key === key ? retryAction.current : { key, actionId: makeId('soup-action'), room };
    retryAction.current = intent;
    setBusy(true);
    try {
      const result = await getCloudStore().applySoupAction({ room: intent.room, actionId: intent.actionId, actionType, payload });
      retryAction.current = null;
      if (epoch !== viewEpoch.current) return null;
      setRoom((current) => current?.code === result.state.code ? acceptSoupRoom(current, result.state) : current);
      setNotice(result.outcome === 'stale' ? '状态已更新，请确认当前轮次后重试。' : result.message);
      return result.state;
    } catch (error) {
      if (epoch === viewEpoch.current) setNotice(readableError(error, '操作未确认，可重试；本地草稿仍保留。'));
      return null;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }, [room]);

  const remember = (code: string, id: string) => {
    window.localStorage.setItem(`soup-player-${code}`, id);
    window.localStorage.setItem('soup-active-remote', JSON.stringify({ code, playerId: id }));
  };

  const createRemote = async () => {
    if (busyRef.current) return;
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!ownerName.trim()) return setNotice('请先填写你的称呼。');
    busyRef.current = true;
    viewEpoch.current += 1;
    setBusy(true);
    try {
      const seed = createSoupRoom(ownerName);
      const next = await getCloudStore().createSoupRoom(seed);
      remember(next.code, next.ownerId);
      setRoom(next);
      setPlayerId(next.ownerId);
      setNotice(`房间 ${next.code} 已创建，请把邀请链接发给朋友。`);
    } catch (error) {
      setNotice(readableError(error, '创建房间失败'));
    } finally { setBusy(false); busyRef.current = false; }
  };

  const joinRemote = async () => {
    if (busyRef.current) return;
    const code = joinCode.trim().toUpperCase();
    if (!cloudReady) return setNotice('测试站尚未配置 CloudBase 环境变量。');
    if (!joinName.trim() || code.length !== 6) return setNotice('请填写称呼和六位房间编号。');
    busyRef.current = true;
    viewEpoch.current += 1;
    setBusy(true);
    try {
      const requestedId = window.localStorage.getItem(`soup-player-${code}`) ?? makeId('soup-player');
      const joined = await getCloudStore().joinSoupRoom(code, requestedId, joinName.trim());
      remember(code, joined.playerId);
      setRoom(joined.room);
      setPlayerId(joined.playerId);
      setNotice(`已加入房间 ${code}。`);
    } catch (error) {
      setNotice(readableError(error, '加入房间失败'));
    } finally { setBusy(false); busyRef.current = false; }
  };

  const submitFormal = (type: 'question' | 'solution') => {
    const content = draftText.trim();
    if (!content) return setNotice(type === 'question' ? '请先在草稿格填写一道能用“是/否”判断的问题。' : '请先写下完整还原。');
    void apply(type === 'question' ? 'submit_soup_question' : 'submit_soup_solution', { content });
  };

  const submitFeedback = async () => {
    if (!room || busyRef.current) return;
    const scope = scopeRef.current;
    busyRef.current = true; setBusy(true);
    try {
      const clean = validateSoupFeedback(feedback);
      await getCloudStore().submitSoupFeedback(room, clean);
      if (scope !== scopeRef.current) return;
      setFeedbackSent(true);
      setNotice('本题反馈已记录，谢谢。');
    } catch (error) { if (scope === scopeRef.current) setNotice(readableError(error, '反馈提交失败')); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const leaveView = () => {
    if (busyRef.current) return;
    viewEpoch.current += 1;
    draftController.current?.dispose();
    privacy.current?.mask('sheet-change');
    window.localStorage.removeItem('soup-active-remote');
    setRoom(null); setPlayerId(''); setPrivateRound(null); setDraftText(''); setActiveSheet('home'); scopeRef.current = '';
    setNotice('已返回调查首页。');
  };

  const copyInvite = async () => {
    if (!room) return;
    const invite = new URL(window.location.href);
    invite.search = ''; invite.hash = ''; invite.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(invite.toString()); setNotice('邀请链接已复制。'); }
    catch { setNotice('浏览器未允许复制，请复制地址栏并附上房间编号。'); }
  };

  const isOwner = room?.ownerId === playerId;
  const isHost = room?.hostId === playerId;
  const isCurrentDetective = room?.currentDetectiveId === playerId;
  const activeCount = room?.players.filter((player) => player.alive && !player.away).length ?? 0;
  const feedbackComplete = Boolean(room && room.feedbackCount >= activeCount);
  const awaitingHost = room?.status === 'judging_question' || room?.status === 'judging_solution';
  const judgeQuestion = (event: MouseEvent<HTMLButtonElement>) => { void apply('judge_soup_question', { verdict: event.currentTarget.dataset.verdict, note: judgeNote }); };
  const judgeSolution = (event: MouseEvent<HTMLButtonElement>) => { void apply('judge_soup_solution', { verdict: event.currentTarget.dataset.verdict, note: judgeNote }); };

  const openGuide = () => { if (activeSheet !== 'guide') returnSheet.current = activeSheet; setActiveSheet('guide'); };

  const guideRows = [
    row(['步骤', '谁操作', '要做什么', '完成标志', '规则', '遇到问题', '']),
    row(['01 开始煲汤', '负责人', '3–10 人到齐后开始', '随机选出汤主', '人人担任过汤主前不重复', '人数不足不能开始', '']),
    row(['02 阅读资料', '汤主', '打开“汤主资料”，查看汤底、关键事实和参考判定', '点击“我已看懂”', '侦探只能看到汤面', 'Esc、切换工作表或离开窗口即隐藏；闲置 60 秒也会隐藏', '']),
    row(['03 轮流行动', '当前侦探', '提交问题、提交还原、跳过本轮三选一', '出现待判定记录', '其他侦探可同时改自己的草稿', '草稿自动保存，不等于正式提交', '']),
    row(['04 汤主判定', '汤主', '为问题或还原选择结论', '系统自动换下一人', '“请换个问法”不计有效问题', '可在判定前填写补充说明', '']),
    row(['05 上限处理', '汤主', '20 问未解可延长 5 问一次或揭晓', '进入反馈', '每题最多两个提示', '完整记录见“问答记录”', '']),
    row(['06 题后反馈', '所有人', '评价难度、歧义与内容适宜度', '全员提交后负责人点“下一碗”', '反馈关联当前题卡版本', '有人不能继续时，负责人可结束本局', '']),
  ];

  const rows: ReactNode[][] = (() => {
    if (activeSheet === 'guide') return guideRows;
    if (!room) return [
      row(['入口', '称呼', '房间编号', '说明', '操作', '状态', '']),
      row(['新建', <input value={ownerName} maxLength={24} placeholder="填写称呼" onChange={(event) => setOwnerName(event.target.value)} key="owner" />, '自动生成', `至少 ${SOUP_MIN_PLAYERS} 人`, <button className="sheet-action" disabled={busy} onClick={createRemote} key="create">创建联机房间</button>, cloudReady ? '可用' : '缺少环境参数', '']),
      row(['加入', <input value={joinName} maxLength={24} placeholder="填写称呼" onChange={(event) => setJoinName(event.target.value)} key="join-name" />, <input value={joinCode} maxLength={6} placeholder="六位编号" onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} key="join-code" />, '打开邀请链接时会自动带入编号', <button className="sheet-action" disabled={busy} onClick={joinRemote} key="join">加入房间</button>, '等待输入', '']),
      row(['玩法', '一人查看完整汤底', '其余人轮流行动', '提问、还原或跳过三选一', '汤主判定后自动换人', '题后收集反馈', '']),
    ];

    if (activeSheet === 'members') return [
      row(['座位', '成员', '本题身份', '当前状态', '已担任汤主', '行动顺序', '备注']),
      ...room.players.map((player) => row([
        player.seat, player.name, room.round === 0 ? '待分配' : player.id === room.hostId ? '汤主' : '侦探',
        player.away ? '暂退' : player.id === room.currentDetectiveId ? '当前行动' : player.alive ? '在线' : '已退出',
        room.servedHostIds.includes(player.id) ? '是' : '否', room.detectiveOrder.indexOf(player.id) >= 0 ? room.detectiveOrder.indexOf(player.id) + 1 : '—',
        player.id === room.ownerId ? '负责人' : '',
      ])),
    ];

    if (activeSheet === 'records') return [
      row(['序号', '玩家', '类型', '内容', '汤主判定', '补充说明', '计入问题数']),
      ...(room.records.length ? room.records.map((record) => row([
        record.sequence, record.playerName, record.type === 'question' ? '问题' : record.type === 'solution' ? '还原' : record.type === 'skip' ? '跳过' : '提示',
        record.content, soupVerdictLabel(record.verdict), record.note ?? '—', record.counted ? '是' : '否',
      ])) : [row(['—', '—', '—', '尚无正式记录', '—', '—', '—'])]),
    ];

    if (activeSheet === 'host') return [
      row(['项目', '内容', '用途', '可见范围', '', '', '']),
      row(['资料开关', isHost ? <button disabled={!privateRound} aria-expanded={secretVisible} onClick={() => secretVisible ? privacy.current?.mask() : privacy.current?.reveal()} key="bottom">{secretVisible ? '收起资料' : '查看汤底资料'}</button> : '仅本题汤主可见', 'Esc 可立即隐藏', '汤主', '', '', '']),
      row(['完整汤底', isHost && secretVisible ? privateRound?.bottom : '隐藏', '判断完整还原', '汤主', '', '', '']),
      row(['关键事实', isHost && secretVisible ? privateRound?.keyFacts.join('；') : '隐藏', '核对推理进度', '汤主', '', '', '']),
      row(['等价答案', isHost && secretVisible ? privateRound?.equivalentAnswers.join('；') : '隐藏', '接受合理同义还原', '汤主', '', '', '']),
      row(['判定边界', isHost && secretVisible ? privateRound?.boundary : '隐藏', '处理歧义', '汤主', '', '', '']),
      ...(isHost && secretVisible ? (privateRound?.hints ?? []).map((hint, index) => row([`预设提示 ${index + 1}`, hint, index < room.hintsUsed ? '已公开' : '尚未公开', '汤主', '', '', ''])) : []),
      ...(isHost && secretVisible ? (privateRound?.commonQuestions ?? []).map((item, index) => row([`参考 ${index + 1}`, item.question, soupVerdictLabel(item.verdict), item.note ?? '—', '', '', ''])) : []),
    ];

    if (activeSheet === 'feedback') return [
      row(['项目', '选择', '说明', '提交', '进度', '', '']),
      row(['难度感受', <select disabled={feedbackSent || room.status !== 'feedback'} value={feedback.difficulty} onChange={(event) => setFeedback((value) => ({ ...value, difficulty: event.target.value as SoupFeedbackInput['difficulty'] }))} key="difficulty"><option value="too_easy">太简单</option><option value="just_right">刚刚好</option><option value="too_hard">太难</option></select>, '三选一', <button className="sheet-action" disabled={busy || !privateRound || room.status !== 'feedback' || feedbackSent} onClick={submitFeedback} key="feedback">{feedbackSent ? '已提交' : '提交反馈'}</button>, `${room.feedbackCount}/${activeCount}`, '', '']),
      row(['补充标记', <span className="soup-choice-line" key="flags"><label><input disabled={feedbackSent || room.status !== 'feedback'} type="checkbox" checked={feedback.ambiguous} onChange={(event) => setFeedback((value) => ({ ...value, ambiguous: event.target.checked }))} /> 有歧义</label><label><input disabled={feedbackSent || room.status !== 'feedback'} type="checkbox" checked={feedback.unsuitable} onChange={(event) => setFeedback((value) => ({ ...value, unsuitable: event.target.checked }))} /> 内容不适</label></span>, '可多选', '', '', '', '']),
      row(['文字反馈', <textarea disabled={feedbackSent || room.status !== 'feedback'} aria-label="文字反馈" value={feedback.note ?? ''} maxLength={300} placeholder="可选：哪里卡住、哪里最好玩" onChange={(event) => setFeedback((value) => ({ ...value, note: event.target.value }))} key="note" />, '最多 300 字', '', '', '', '']),
      row(['本题结果', room.result ? room.result.success ? `已还原 · ${room.result.solverName}` : '已揭晓' : '尚未结束', `${room.result?.validQuestions ?? 0} 个有效问题`, `${room.result?.hintsUsed ?? 0} 次提示`, formatElapsed(room.result?.elapsedMs), '', '']),
      row(['完整汤底', room.revealedBottom ?? '结束后展示', '', '', '', '', '']),
    ];

    return [
      row(['项目', '内容', '当前人员', '进度', '操作一', '操作二', '说明']),
      row(['房间编号', room.code, `${activeCount}/${room.playerLimit}`, statusLabels[room.status], <button onClick={copyInvite} key="copy">复制邀请链接</button>, <button disabled={busy} onClick={leaveView} key="leave">仅离开页面</button>, `第 ${room.round || 0} 题`]),
      row(['当前汤面', room.surface ?? '开始后显示', room.hostName ? `汤主：${room.hostName}` : '尚未分配', room.caseCategory ? `${categoryLabels[room.caseCategory]} · ${{ easy: '简单', normal: '普通', hard: '困难' }[room.difficulty ?? 'normal']}` : '—', '', '', '']),
      row(['行动轮次', room.currentDetectiveName ?? '—', `第 ${room.actionCycle || 0} 轮`, `${room.effectiveQuestionCount}/${room.maxQuestions} 个有效问题`, '', '', room.extended ? '已延长一次' : '尚未延长']),
      row(['我的草稿', isHost ? '汤主无需填写' : <textarea aria-label="我的独立草稿" disabled={!draftEditable || !privateRound} value={draftText} maxLength={240} placeholder="等待时可先写，轮到你再正式提交" onChange={(event) => draftController.current?.update(event.target.value)} key="draft" />, isHost ? '汤主' : `${{ loading: '读取中', idle: '待保存', saving: '保存中', saved: '已保存', error: '保存失败，本地保留', conflict: '草稿版本待确认' }[draftState]} · ${draftText.length}/240`,
        room.status === 'feedback' || room.status === 'finished' ? '本题已结束' : isCurrentDetective ? '轮到你' : '等待中',
        <button disabled={busy || !privateRound || !isCurrentDetective || room.status !== 'investigating'} onClick={() => submitFormal('question')} key="question">提交问题</button>,
        <button disabled={busy || !privateRound || !isCurrentDetective || room.status !== 'investigating'} onClick={() => submitFormal('solution')} key="solution">提交还原</button>,
        <button disabled={busy || !isCurrentDetective || room.status !== 'investigating'} onClick={() => void apply('skip_soup_turn')} key="skip">跳过本轮</button>]),
      row(['待汤主判定', room.pendingAction?.content ?? '—', room.pendingAction?.playerName ?? '—', room.pendingAction?.type === 'question' ? '问题' : room.pendingAction?.type === 'solution' ? '还原' : '—',
        awaitingHost && isHost ? <span className="soup-judge-buttons" key="judge-question">{room.status === 'judging_question' && (['yes', 'no', 'irrelevant', 'partial', 'rephrase'] as SoupQuestionVerdict[]).map((verdict) => <button disabled={busy} data-verdict={verdict} onClick={judgeQuestion} key={verdict}>{soupVerdictLabel(verdict)}</button>)}{room.status === 'judging_solution' && (['success', 'close', 'wrong'] as SoupSolutionVerdict[]).map((verdict) => <button disabled={busy} data-verdict={verdict} onClick={judgeSolution} key={verdict}>{soupVerdictLabel(verdict)}</button>)}</span> : awaitingHost ? '等待汤主' : '—',
        awaitingHost && isHost ? <input value={judgeNote} maxLength={160} placeholder="补充说明（可选）" onChange={(event) => setJudgeNote(event.target.value)} key="judge-note" /> : '',
        room.status === 'judging_question' ? '“请换个问法”不计有效问题' : '判定后自动换人']),
      row(['公开提示', room.publicHints.length ? room.publicHints.join('；') : '尚未使用', `${room.hintsUsed}/2`, '', isHost ? <button disabled={busy || !['investigating', 'limit_reached'].includes(room.status) || room.hintsUsed >= 2} onClick={() => void apply('use_soup_hint')} key="hint">给一点提示</button> : '', '', '提示公开后不能撤回']),
      row(['问题上限', `${room.effectiveQuestionCount}/${room.maxQuestions}`, room.status === 'limit_reached' ? '等待汤主处理' : '—', '', isHost ? <button disabled={busy || room.status !== 'limit_reached' || room.extended} onClick={() => void apply('extend_soup_limit')} key="extend">延长 5 问</button> : '', isHost ? <button disabled={busy || !['investigating', 'limit_reached', 'judging_question', 'judging_solution'].includes(room.status)} onClick={() => setConfirmation('reveal_soup_bottom')} key="reveal">公布汤底</button> : '', '每题只可延长一次']),
      row(['最新记录', room.records.at(-1)?.content ?? '尚无', room.records.at(-1)?.playerName ?? '—', soupVerdictLabel(room.records.at(-1)?.verdict ?? null), '', '', '完整记录见“问答记录”工作表']),
      row(['题后处理', room.revealedBottom ?? '成功还原或汤主公布后显示', `${room.feedbackCount}/${activeCount} 已反馈`, room.status === 'feedback' ? <button onClick={() => setActiveSheet('feedback')} key="go-feedback">填写反馈</button> : '', isOwner ? <button className="sheet-action" disabled={busy || room.status !== 'feedback' || !feedbackComplete} onClick={() => void apply('next_soup_round')} key="next">下一碗</button> : '', isOwner ? <button disabled={busy || room.status === 'lobby' || room.status === 'finished'} onClick={() => setConfirmation('end_soup_game')} key="end">结束本局</button> : '', feedbackComplete ? '反馈已收齐' : room.status === 'feedback' ? '请完成题后反馈' : '']),
    ];
  })();

  const formula = !room ? 'A5：创建或加入调查房间' : activeSheet === 'home'
    ? `${statusLabels[room.status]} · ${room.currentDetectiveName ? `当前：${room.currentDetectiveName}` : '等待开始'} · ${room.effectiveQuestionCount}/${room.maxQuestions} 问`
    : `${soupSheets.find(([id]) => id === activeSheet)?.[1]} · 房间 ${room.code} · 第 ${room.round} 题`;

  return <main data-soup-sheet={activeSheet} className={`sheet-app soup-sheet${activeSheet === 'guide' ? ' sheet-app--guide' : ''}`}>
    <header className="sheet-titlebar">
      <span className="sheet-filemark" aria-hidden="true">表</span>
      <div><strong>协作工作簿 · A5</strong><span>{room ? `编号 ${room.code} · ${statusLabels[room.status]}` : '调查记录模板'}</span></div>
      <div className="sheet-title-actions"><a className="sheet-room-action" href="../">目录</a>{room && <button onClick={copyInvite}>复制链接</button>}<ReleaseNotificationButton open={notificationOpen} onToggle={() => setNotificationOpen((open) => !open)} /></div>
    </header>
    <nav className="sheet-ribbon"><button className={activeSheet === 'home' ? 'is-current' : ''} onClick={() => setActiveSheet('home')}>开始</button><button onClick={openGuide}>帮助</button>{activeSheet === 'guide' && <button onClick={() => setActiveSheet(returnSheet.current)}>返回原工作表</button>}<button onClick={() => privacy.current?.mask('escape')}>隐藏敏感内容</button><span /></nav>
    <div className="sheet-toolbar" aria-hidden="true"><span>撤销</span><span>重做</span><i /><b>系统字体</b><b>11</b><i /><strong>B</strong><em>I</em><u>U</u><i /><span>左对齐</span><span>自动换行</span><span>筛选</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output>{formula}</output></div>
    {room && <div className="sheet-commandbar">
      {isOwner && room.status === 'lobby' && <button className="sheet-primary-action" disabled={busy || activeCount < SOUP_MIN_PLAYERS} onClick={() => void apply('start_soup_game')}>开始煲汤</button>}
      {isHost && room.status === 'host_reading' && <button className="sheet-primary-action" disabled={busy || !privateRound} onClick={() => void apply('acknowledge_soup_host')}>我已看懂</button>}
      {isHost && activeSheet !== 'host' && <button onClick={() => setActiveSheet('host')}>汤主资料</button>}
      {activeSheet === 'host' && <button onClick={() => setActiveSheet('home')}>返回当前汤面</button>}
      {!privateRound && room.round > 0 && <button disabled={busy} onClick={() => setPrivateReload((value) => value + 1)}>重新读取</button>}
      {isCurrentDetective && room.status === 'investigating' && <strong>轮到你：在草稿格填写后，选择问题、还原或跳过。</strong>}
      {awaitingHost && <strong>{isHost ? '请判定当前提交。' : `等待汤主 ${room.hostName ?? ''} 判定。`}</strong>}
    </div>}
    {confirmation && <div className="sheet-commandbar soup-confirm" role="group" aria-label="操作确认"><strong>{confirmation === 'end_soup_game' ? '结束本局将停止所有行动，并公开本题汤底。' : '公布后将结束本题，所有人都能看到汤底。'}</strong><button disabled={busy} onClick={() => { void apply(confirmation); setConfirmation(null); }}>确认{confirmation === 'end_soup_game' ? '结束' : '公布'}</button><button onClick={() => setConfirmation(null)}>取消</button></div>}
    {draftEditable && !isHost && draftState === 'error' && <div className="sheet-commandbar"><span>草稿暂未同步，当前文字仍保留。</span><button onClick={() => void draftController.current?.flush()}>重试保存</button></div>}
    {draftEditable && !isHost && draftState === 'conflict' && <div className="sheet-commandbar"><span>本地草稿与云端不同，请选择保留哪一份。</span><button onClick={() => draftController.current?.resolveConflict(true)}>保存当前文字</button><button onClick={() => draftController.current?.resolveConflict(false)}>采用云端草稿</button></div>}
    <div className="sheet-workspace">
      <div className="sheet-canvas">
        {!room && <section className="hub-intro"><div><span>使用说明</span><strong>A5 · 汤底侦探</strong><p>3–10 人，一人掌握完整资料，其余成员在表格内轮流提问和还原；题库当前为盲测候选内容。</p></div></section>}
        <div className="sheet-grid-scroll"><table className="sheet-grid" aria-label={soupSheets.find(([id]) => id === activeSheet)?.[1]}><thead><tr><th />{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((values, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{columns.map((column, columnIndex) => { const coordinate = `${column}${rowIndex + 1}`; return <td className={coordinate === activeCell ? 'is-active-cell' : ''} onClick={() => setActiveCell(coordinate)} key={column}>{values[columnIndex] ?? ''}</td>; })}</tr>)}</tbody></table></div>
      </div>
      <ReleaseNotificationPanel open={notificationOpen} onClose={() => setNotificationOpen(false)} />
    </div>
    {notice && <div className="soup-status" role="status">{notice}</div>}
    <footer className="sheet-tabs">{soupSheets.map(([id, label]) => <button disabled={!room && id !== 'home' && id !== 'guide'} className={activeSheet === id ? 'is-current' : ''} onClick={() => id === 'guide' ? openGuide() : setActiveSheet(id)} key={id}>{label}</button>)}<a href="../">目录</a><span /><small>汤底仅本题汤主可见</small></footer>
  </main>;
}
