'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { getCloudStore, type SoupActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';
import { createPrivacyGuard, type PrivacyGuard } from '@/lib/privacy';
import {
  SOUP_MIN_PLAYERS, createManualSoupRoom, soupVerdictLabel,
  type SoupPendingAction, type SoupPrivateRound, type SoupPublicPost, type SoupQuestionVerdict, type SoupRoom, type SoupSolutionVerdict,
} from '@/lib/soup-game';
import { acceptSoupRoom, canEditSoupDraft, createSoupDraftController, soupRoundScope, type SoupDraftStatus } from '@/lib/soup-draft';
import { WorkbookColumns, WorkbookFeedback, WorkbookText, useWorkbookNotes, useWorkbookNotice } from './workbook-feedback';
import { ReleaseNotificationButton, ReleaseNotificationPanel } from './release-notification';

const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const sheets = [['play', '猜题区'], ['public', '公共提示区'], ['solution', '故事还原区'], ['people', '玩家与汤主'], ['guide', '玩法说明']] as const;
type SheetId = typeof sheets[number][0];
type ImageView = { url: string; title: string } | null;

const statusLabels: Record<SoupRoom['status'], string> = {
  lobby: '等待成员', host_preparing: '汤主录题', host_reading: '汤主阅读', investigating: '开放提问',
  judging_question: '汤主回答', judging_solution: '汤主判定', limit_reached: '问题已达上限',
  round_result: '本题揭晓', feedback: '本题揭晓', finished: '本局结束',
};

function row(values: ReactNode[]): ReactNode[] { return values; }
function readableError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : JSON.stringify(error ?? '');
  if (/STALE_ROUND|STALE_VERSION|STALE_STATE|WRONG_PHASE/.test(raw)) return '队列或阶段刚刚更新，请确认页面后重试。';
  if (/PGRST202|function.*v12.*does not exist|Could not find.*v12/.test(raw)) return 'A5 手动出题更新尚未完成，请管理员先执行 V12 增量 SQL。';
  return error instanceof Error && error.message ? error.message : fallback;
}
function safeImageUrl(value: string | null | undefined) { const clean = value?.trim() ?? ''; return /^https?:\/\//i.test(clean) ? clean : null; }
function queuePosition(queue: SoupPendingAction[], playerId: string) { const index = queue.findIndex((item) => item.playerId === playerId); return index < 0 ? 0 : index + 1; }
function ImageButton({ url, title, onOpen }: { url?: string | null; title: string; onOpen: (value: ImageView) => void }) {
  const safe = safeImageUrl(url);
  return safe ? <button className="soup-image-button" onClick={() => onOpen({ url: safe, title })}>查看图片</button> : <span>—</span>;
}

export default function SoupSpreadsheetMode() {
  const [ownerName, setOwnerName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<SoupRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [privateRound, setPrivateRound] = useState<SoupPrivateRound | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [solutionDraft, setSolutionDraft] = useState('');
  const [draftState, setDraftState] = useState<SoupDraftStatus>('loading');
  const [judgeNote, setJudgeNote] = useState('');
  const [publicKind, setPublicKind] = useState<'hint' | 'evidence'>('hint');
  const [publicText, setPublicText] = useState('');
  const [publicImageUrl, setPublicImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState<'surface' | 'bottom' | 'note' | null>(null);
  const [caseForm, setCaseForm] = useState({ surface: '', surfaceImageUrl: '', bottom: '', bottomImageUrl: '', keyFacts: '', boundary: '' });
  const [activeSheet, setActiveSheet] = useState<SheetId>('play');
  const [activeCell, setActiveCell] = useState('A1');
  const [notice, setNotice, noticeKind] = useWorkbookNotice('就绪 · 手动出题模式，开始前请每人准备一题。');
  const { note, setNote } = useWorkbookNotes(`${room?.code ?? ''}|${room?.round ?? ''}|${room?.version ?? ''}|${activeSheet}`);
  const [busy, setBusy] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [privateReload, setPrivateReload] = useState(0);
  const [confirmation, setConfirmation] = useState<'reveal_soup_bottom' | 'end_soup_game' | null>(null);
  const [imageView, setImageView] = useState<ImageView>(null);
  const [clockNow, setClockNow] = useState(0);
  const busyRef = useRef(false);
  const returnSheet = useRef<SheetId>('play');
  const draftController = useRef<ReturnType<typeof createSoupDraftController> | null>(null);
  const retryAction = useRef<{ key: string; actionId: string; room: SoupRoom } | null>(null);
  const privacy = useRef<PrivacyGuard | null>(null);
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    privacy.current = createPrivacyGuard({ onVisibilityChange: setSecretVisible, revealMs: 300_000, idleMs: 60_000 });
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' ? privacy.current?.mask('escape') : privacy.current?.activity();
    const onBlur = () => privacy.current?.mask('blur');
    const onVisibility = () => { if (document.hidden) privacy.current?.mask('hidden'); };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('blur', onBlur); document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); privacy.current?.dispose(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('blur', onBlur); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  useEffect(() => { privacy.current?.mask('sheet-change'); }, [activeSheet]);

  useEffect(() => {
    let disposed = false;
    const invitedCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) ?? '';
    if (invitedCode) window.queueMicrotask(() => setJoinCode(invitedCode));
    if (!cloudReady) return;
    const saved = window.localStorage.getItem('soup-active-remote'); if (!saved) return;
    void (async () => {
      try {
        const active = JSON.parse(saved) as { code: string; playerId: string };
        if (invitedCode && invitedCode !== active.code) return;
        const found = await getCloudStore().getSoupRoom(active.code);
        if (!disposed && found?.soupVersion === 2 && found.players.some((p) => p.id === active.playerId)) { setPlayerId(active.playerId); setRoom(found); setNotice('已恢复手动出题房间。'); }
      } catch { if (!disposed) setNotice('上次房间暂时无法恢复，可重新加入。', 'error'); }
    })();
    return () => { disposed = true; };
  }, [cloudReady, setNotice]);
  useEffect(() => {
    if (!room?.code || !playerId || !cloudReady) return;
    const code = room.code;
    return getCloudStore().watchSoupRoom(code, (incoming) => setRoom((current) => current?.code === code ? acceptSoupRoom(current, incoming) : current), (error) => setNotice(readableError(error, '房间同步失败'), 'error'));
  }, [cloudReady, playerId, room?.code, setNotice]);

  const draftRoomCode = room?.code ?? '';
  const draftRound = room?.round ?? 0;
  const draftSession = room?.sessionNo ?? 0;
  const draftEditable = Boolean(room && canEditSoupDraft(room, playerId));
  const formScope = `${draftRoomCode}:${draftSession}:${draftRound}:${playerId}:${privateReload}`;
  const [renderedFormScope, setRenderedFormScope] = useState(formScope);
  if (renderedFormScope !== formScope) {
    setRenderedFormScope(formScope); setQuestionDraft(''); setSolutionDraft(''); setDraftState('loading'); setPrivateRound(null); setSecretVisible(false);
    setCaseForm({ surface: '', surfaceImageUrl: '', bottom: '', bottomImageUrl: '', keyFacts: '', boundary: '' });
  }
  useEffect(() => {
    const context = { code: draftRoomCode, sessionNo: draftSession, round: draftRound };
    const scope = soupRoundScope(context, playerId);
    if (!draftRoomCode || !playerId || draftRound <= 0) return;
    let disposed = false; const cacheKey = `soup-draft-v12:${scope}`;
    const controller = createSoupDraftController({
      save: (question, solution, revision) => getCloudStore().saveSoupDraft(context, question, solution, revision),
      onChange: (value) => { setQuestionDraft(value.text); setSolutionDraft(value.solutionText); setDraftState(value.status); },
      cache: (text) => { try { if (text === null) sessionStorage.removeItem(cacheKey); else sessionStorage.setItem(cacheKey, text); } catch { /* optional */ } },
    });
    draftController.current = controller;
    void getCloudStore().getMySoupRound(draftRoomCode).then((packet) => {
      if (disposed || !packet || packet.sessionNo !== draftSession || packet.round !== draftRound) return;
      setPrivateRound(packet); let local: string | null = null; try { local = sessionStorage.getItem(cacheKey); } catch { /* optional */ }
      controller.hydrate(packet, local);
    }).catch((error) => { if (!disposed) setNotice(readableError(error, '个人工作区读取失败，请重试。'), 'error'); });
    const retry = () => { void controller.flush(); }; window.addEventListener('online', retry);
    return () => { disposed = true; controller.dispose(); window.removeEventListener('online', retry); if (draftController.current === controller) draftController.current = null; };
  }, [draftRoomCode, draftRound, draftSession, playerId, privateReload, setNotice]);
  useEffect(() => {
    draftController.current?.setEnabled(draftEditable); if (!draftEditable) return;
    const timer = window.setTimeout(() => { void draftController.current?.flush(); }, 550); return () => window.clearTimeout(timer);
  }, [draftEditable, questionDraft, solutionDraft]);

  const apply = useCallback(async (actionType: SoupActionType, payload: Record<string, unknown> = {}) => {
    if (!room || busyRef.current) return null;
    busyRef.current = true; setBusy(true);
    const key = JSON.stringify([room.code, room.round, room.status, room.version, actionType, payload]);
    const intent = retryAction.current?.key === key ? retryAction.current : { key, actionId: makeId('soup-action'), room }; retryAction.current = intent;
    try {
      const result = await getCloudStore().applySoupAction({ room: intent.room, actionId: intent.actionId, actionType, payload });
      retryAction.current = null; setRoom((current) => current?.code === result.state.code ? acceptSoupRoom(current, result.state) : current); setNotice(result.message || '操作已记录。'); return result.state;
    } catch (error) { setNotice(readableError(error, '操作未确认，请重试。'), 'error'); return null; }
    finally { busyRef.current = false; setBusy(false); }
  }, [room, setNotice]);

  const remember = (code: string, id: string) => { window.localStorage.setItem(`soup-player-${code}`, id); window.localStorage.setItem('soup-active-remote', JSON.stringify({ code, playerId: id })); };
  const createRemote = async () => {
    if (!cloudReady || !ownerName.trim()) return setNotice(!cloudReady ? '测试站尚未配置 CloudBase。' : '请填写称呼。', 'error');
    busyRef.current = true; setBusy(true);
    try { const seed = createManualSoupRoom(ownerName); const next = await getCloudStore().createSoupRoom(seed); remember(next.code, next.ownerId); setRoom(next); setPlayerId(next.ownerId); setNotice(`房间 ${next.code} 已创建；请提醒每个人提前准备一题。`); }
    catch (error) { setNotice(readableError(error, '创建房间失败'), 'error'); } finally { busyRef.current = false; setBusy(false); }
  };
  const joinRemote = async () => {
    const code = joinCode.trim().toUpperCase(); if (!cloudReady || !joinName.trim() || code.length !== 6) return setNotice('请填写称呼和六位房间编号。', 'error');
    busyRef.current = true; setBusy(true);
    try { const requestedId = window.localStorage.getItem(`soup-player-${code}`) ?? makeId('soup-player'); const joined = await getCloudStore().joinSoupRoom(code, requestedId, joinName.trim()); if (joined.room.soupVersion !== 2) throw new Error('这是旧版题库房间，请新建手动出题房间'); remember(code, joined.playerId); setRoom(joined.room); setPlayerId(joined.playerId); setNotice(`已加入房间 ${code}。`); }
    catch (error) { setNotice(readableError(error, '加入房间失败'), 'error'); } finally { busyRef.current = false; setBusy(false); }
  };

  const queue = room?.questionQueue ?? (room?.pendingAction ? [room.pendingAction] : []);
  const myQueuePosition = queuePosition(queue, playerId);
  const lastSubmittedAt = room?.lastQuestionAtByPlayer?.[playerId] ?? 0;
  const cooldownSeconds = clockNow <= 0 ? 0 : Math.max(0, Math.ceil((lastSubmittedAt + 10_000 - clockNow) / 1000));
  const isOwner = room?.ownerId === playerId;
  const isHost = room?.hostId === playerId;
  const activeCount = room?.players.filter((p) => p.alive && !p.away).length ?? 0;
  const canQueue = Boolean(room && room.status === 'investigating' && !isHost && !myQueuePosition && cooldownSeconds === 0);
  const head = queue[0] ?? null;
  const submitQueue = async (type: 'question' | 'solution') => {
    const content = (type === 'question' ? questionDraft : solutionDraft).trim(); if (!content) return setNotice(type === 'question' ? '请先填写一道是非问题。' : '请先写下完整故事还原。');
    const next = await apply(type === 'question' ? 'submit_soup_question' : 'submit_soup_solution', { content });
    if (next) { if (type === 'question') draftController.current?.update(''); else draftController.current?.updateSolution(''); }
  };
  const judge = (event: MouseEvent<HTMLButtonElement>) => { const verdict = event.currentTarget.dataset.verdict; void apply(head?.type === 'question' ? 'judge_soup_question' : 'judge_soup_solution', { verdict, note: judgeNote }).then((next) => { if (next) setJudgeNote(''); }); };
  const submitCase = async () => { if (!caseForm.surface.trim() || !caseForm.bottom.trim()) return setNotice('汤面和完整汤底都必须填写。', 'error'); const next = await apply('prepare_soup_case', caseForm); if (next) { setPrivateReload((value) => value + 1); setActiveSheet('play'); } };
  const publishPost = async () => { if (!publicText.trim() && !publicImageUrl.trim()) return setNotice('提示或证据至少需要文字或图片链接。'); const next = await apply('publish_soup_note', { kind: publicKind, text: publicText, imageUrl: publicImageUrl }); if (next) { setPublicText(''); setPublicImageUrl(''); } };
  const uploadImage = async (file: File | undefined, kind: 'surface' | 'bottom' | 'note') => {
    if (!file || !room) return;
    setUploadingImage(kind);
    try {
      const url = await getCloudStore().uploadSoupImage(room, file, kind);
      if (kind === 'surface') setCaseForm((value) => ({ ...value, surfaceImageUrl: url }));
      else if (kind === 'bottom') setCaseForm((value) => ({ ...value, bottomImageUrl: url }));
      else setPublicImageUrl(url);
      setNotice('图片上传完成；其他玩家仍需点击“查看图片”才会加载。');
    } catch (error) {
      setNotice(`图片上传失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setUploadingImage(null);
    }
  };

  const flowText = !room ? '创建或加入房间' : room.status === 'lobby'
    ? isOwner ? `等待至少 ${SOUP_MIN_PLAYERS} 人到齐，然后点击“随机汤主并开始”` : '等待负责人开始；请先准备一道海龟汤题目'
    : room.status === 'host_preparing' ? isHost ? '你是本题汤主：请在“玩家与汤主”录入提前准备的题目' : `等待汤主 ${room.hostName ?? ''} 录入题目`
    : room.status === 'investigating' ? isHost ? (head ? `请回答队首：${head.playerName} 的${head.type === 'question' ? '问题' : '还原'}` : '等待侦探加入待回答队列') : myQueuePosition ? `你的内容排在第 ${myQueuePosition} 位，等待汤主处理` : cooldownSeconds ? `回答已完成，${cooldownSeconds} 秒后可再次提交` : '你可以提交一条问题或故事还原'
    : room.status === 'limit_reached' ? isHost ? '问题已达上限：延长 5 问或公布汤底' : '有效问题已达上限，等待汤主处理'
    : room.status === 'round_result' ? isOwner ? '本题已揭晓：可以开始下一题' : '本题已揭晓，等待负责人开始下一题'
    : room.status === 'finished' ? '本局已结束' : '请查看当前区域的操作提示';
  const imageCell = (url: string | null | undefined, title: string) => <ImageButton url={url} title={title} onOpen={setImageView} />;
  const publicPosts = room?.publicPosts ?? [];
  const guideRows = [
    row(['手动出题模式', '开始前每个人都准备一题；系统随机指定汤主，本题不使用内置题库。', '', '', '', '', '']),
    row(['步骤', '谁操作', '要做什么', '完成标志', '队列规则', '图片规则', '']),
    row(['01 随机汤主', '负责人', '2–10 人到齐后开始', '系统随机指定汤主', '所有人担任过前不重复', '题目需要提前准备', '']),
    row(['02 录入题目', '汤主', '填写汤面、完整汤底和可选补充资料', '点击“提交并开放提问”', '只有汤主能看到汤底', '可上传图片或粘贴链接；其他人点击后才加载', '']),
    row(['03 排队提问', '所有侦探', '每人最多提前提交一条问题或还原', '队列显示自己的顺序', '汤主按队首回答；未回答前不能重复入队', '问题正文不自动展开图片', '']),
    row(['04 回答与冷却', '汤主／侦探', '汤主回答队首；该玩家提交满 10 秒且已回答后可再次提问', '队首自动移除', '其他人的排队内容继续保留', '提示、证据、结局图片均需点击查看', '']),
    row(['05 提示与还原', '汤主／侦探', '汤主可贴提示或证据；侦探在“故事还原区”提交完整还原', '还原成功后公开汤底', '问题最多 20 个，可延长 5 个一次', '文字和图片可任选或同时使用', '']),
  ];

  const rows: ReactNode[][] = (() => {
    if (activeSheet === 'guide') return guideRows;
    if (!room) return [
      row(['入口', '称呼', '房间编号', '模式说明', '操作', '状态', '']),
      row(['新建', <input value={ownerName} maxLength={24} placeholder="填写称呼" onChange={(e) => setOwnerName(e.target.value)} key="owner" />, '自动生成', '手动出题；每个人需提前准备题目', <button className="sheet-action" disabled={busy} onClick={createRemote} key="create">创建联机房间</button>, cloudReady ? '可用' : '缺少环境参数', '']),
      row(['加入', <input value={joinName} maxLength={24} placeholder="填写称呼" onChange={(e) => setJoinName(e.target.value)} key="join-name" />, <input value={joinCode} maxLength={6} placeholder="六位编号" onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} key="join-code" />, '汤主由系统随机指定', <button className="sheet-action" disabled={busy} onClick={joinRemote} key="join">加入房间</button>, '等待输入', '']),
      row(['开局前', '每人准备：汤面＋完整汤底', '可选准备图片链接', '至少 2 人', '双人局每题交换汤主', '流程见“流程说明”', '']),
    ];
    if (activeSheet === 'public') return [
      row(['公共提示区', '内容', '图片', '发布人', '操作', '状态', '']),
      ...(publicPosts.length ? publicPosts.map((post: SoupPublicPost, index) => row([`${post.kind === 'hint' ? '提示' : '证据'} ${index + 1}`, post.text || '仅图片', imageCell(post.imageUrl, `${post.kind === 'hint' ? '提示' : '证据'} ${index + 1}`), room.hostName ?? '汤主', '', '已公开', ''])) : [row(['—', '尚无公开提示或证据', '—', '—', '', '等待汤主按需发布', ''])]),
      row(['汤主发布', isHost ? <textarea value={publicText} maxLength={600} placeholder="填写提示或证据；可只发图片" onChange={(e) => setPublicText(e.target.value)} key="public-text" /> : '仅汤主可操作', isHost ? <div className="sheet-inline" key="public-image"><input value={publicImageUrl} placeholder="粘贴链接，或直接上传" onChange={(e) => setPublicImageUrl(e.target.value)} /><label className="sheet-action soup-file-picker">{uploadingImage === 'note' ? '上传中…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={Boolean(uploadingImage)} onChange={(e) => { void uploadImage(e.target.files?.[0], 'note'); e.currentTarget.value = ''; }} /></label></div> : '—', isHost ? <select value={publicKind} onChange={(e) => setPublicKind(e.target.value as 'hint' | 'evidence')} key="public-kind"><option value="hint">提示</option><option value="evidence">证据</option></select> : '—', isHost ? <button className="sheet-action" disabled={busy || Boolean(uploadingImage) || !['investigating', 'limit_reached'].includes(room.status)} onClick={publishPost} key="publish">公开贴出</button> : '', '', '公开后不能撤回']),
    ];
    if (activeSheet === 'solution') return [
      row(['故事还原区', '内容', '排队状态', '操作', '判定', '图片', '']),
      row(['我的完整还原', isHost ? '汤主不提交还原' : <textarea value={solutionDraft} maxLength={240} disabled={!draftEditable} placeholder="把完整因果和反转写清楚" onChange={(e) => draftController.current?.updateSolution(e.target.value)} key="solution" />, myQueuePosition ? `已排第 ${myQueuePosition} 位` : cooldownSeconds ? `冷却 ${cooldownSeconds}s` : canQueue ? '可提交' : '暂不可提交', <button className="sheet-action" disabled={busy || !canQueue || !solutionDraft.trim()} onClick={() => void submitQueue('solution')} key="submit-solution">提交还原</button>, '汤主判定成功／差一点／错误', '', '']),
      ...room.records.filter((record) => record.type === 'solution').map((record) => row([`还原 ${record.sequence}`, record.content, record.playerName, '', soupVerdictLabel(record.verdict), '', record.note ?? '—'])),
      row(['最终结果', room.revealedBottom ?? '尚未揭晓', room.result?.success ? `由 ${room.result.solverName} 还原成功` : room.status === 'round_result' ? '汤主已公布' : '进行中', '', '', imageCell(room.revealedBottomImageUrl, '最终结果图片'), '']),
    ];
    if (activeSheet === 'people') return [
      row(['玩家与汤主操作区', '内容', '状态', '操作一', '操作二', '操作三', '']),
      ...room.players.map((player) => row([player.seat, player.name, player.id === room.hostId ? '本题汤主' : player.id === room.ownerId ? '负责人／侦探' : '侦探', room.servedHostIds.includes(player.id) ? '已当过汤主' : '尚未当过', queuePosition(queue, player.id) ? `排队第 ${queuePosition(queue, player.id)} 位` : '未排队', '', ''])),
      ...(room.status === 'host_preparing' ? [
        row(['汤面', isHost ? <textarea value={caseForm.surface} maxLength={600} placeholder="所有人首先看到的谜面" onChange={(e) => setCaseForm((v) => ({ ...v, surface: e.target.value }))} key="surface" /> : `等待汤主 ${room.hostName} 录入`, isHost ? <div className="sheet-inline" key="surface-image"><input value={caseForm.surfaceImageUrl} placeholder="粘贴链接，或直接上传" onChange={(e) => setCaseForm((v) => ({ ...v, surfaceImageUrl: e.target.value }))} /><label className="sheet-action soup-file-picker">{uploadingImage === 'surface' ? '上传中…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={Boolean(uploadingImage)} onChange={(e) => { void uploadImage(e.target.files?.[0], 'surface'); e.currentTarget.value = ''; }} /></label></div> : '', '', '', '', '']),
        row(['完整汤底', isHost ? <textarea value={caseForm.bottom} maxLength={2000} placeholder="完整事实、因果和反转" onChange={(e) => setCaseForm((v) => ({ ...v, bottom: e.target.value }))} key="bottom" /> : '仅汤主可见', isHost ? <div className="sheet-inline" key="bottom-image"><input value={caseForm.bottomImageUrl} placeholder="粘贴链接，或直接上传" onChange={(e) => setCaseForm((v) => ({ ...v, bottomImageUrl: e.target.value }))} /><label className="sheet-action soup-file-picker">{uploadingImage === 'bottom' ? '上传中…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={Boolean(uploadingImage)} onChange={(e) => { void uploadImage(e.target.files?.[0], 'bottom'); e.currentTarget.value = ''; }} /></label></div> : '', '', '', '', '']),
        row(['补充资料', isHost ? <textarea value={caseForm.keyFacts} maxLength={1000} placeholder="可选：关键事实，帮助自己判定" onChange={(e) => setCaseForm((v) => ({ ...v, keyFacts: e.target.value }))} key="facts" /> : '隐藏', isHost ? <textarea value={caseForm.boundary} maxLength={1000} placeholder="可选：判定边界或可接受答案" onChange={(e) => setCaseForm((v) => ({ ...v, boundary: e.target.value }))} key="boundary" /> : '', isHost ? <button className="sheet-action" disabled={busy || Boolean(uploadingImage)} onClick={submitCase} key="prepare">提交并开放提问</button> : '', '', '', '图片支持 PNG/JPG/WebP/GIF，单张 5MB 内']),
      ] : []),
      ...(isHost && room.status !== 'host_preparing' && room.status !== 'lobby' ? [
        row(['汤主资料', <button aria-expanded={secretVisible} disabled={!privateRound} onClick={() => secretVisible ? privacy.current?.mask() : privacy.current?.reveal()} key="secret-toggle">{secretVisible ? '收起汤底' : '复看汤底'}</button>, secretVisible ? privateRound?.bottom ?? '正在读取' : '已隐藏', secretVisible ? (privateRound?.keyFacts.join('；') || '未填写关键事实') : '', secretVisible ? privateRound?.boundary ?? '未填写判定边界' : '', secretVisible ? imageCell(privateRound?.bottomImageUrl, '汤底参考图片') : '', 'Esc 或切换页面会隐藏']),
      ] : []),
      ...(head ? [row(['当前队首', `${head.playerName}：${head.content}`, head.type === 'question' ? '问题' : '故事还原', isHost && head.type === 'question' ? <span className="soup-judge-buttons" key="q-buttons">{(['yes', 'no', 'irrelevant', 'partial', 'rephrase'] as SoupQuestionVerdict[]).map((verdict) => <button data-verdict={verdict} disabled={busy} onClick={judge} key={verdict}>{soupVerdictLabel(verdict)}</button>)}</span> : isHost ? <span className="soup-judge-buttons" key="s-buttons">{(['success', 'close', 'wrong'] as SoupSolutionVerdict[]).map((verdict) => <button data-verdict={verdict} disabled={busy} onClick={judge} key={verdict}>{soupVerdictLabel(verdict)}</button>)}</span> : '等待汤主', isHost ? <input value={judgeNote} maxLength={160} placeholder="补充说明（可选）" onChange={(e) => setJudgeNote(e.target.value)} key="judge-note" /> : '', '', '只处理队首'])] : []),
      row(['题目控制', `${room.effectiveQuestionCount}/${room.maxQuestions} 个有效问题`, room.extended ? '已延长' : '未延长', isHost ? <button disabled={busy || room.status !== 'limit_reached' || room.extended} onClick={() => void apply('extend_soup_limit')} key="extend">延长 5 问</button> : '', isHost ? <button disabled={busy || !['investigating', 'limit_reached'].includes(room.status)} onClick={() => setConfirmation('reveal_soup_bottom')} key="reveal">公布汤底</button> : '', isOwner && room.status === 'round_result' ? <button className="sheet-action" disabled={busy} onClick={() => void apply('next_soup_round')} key="next">随机汤主 · 下一题</button> : '', isOwner && !['lobby', 'finished'].includes(room.status) ? <button disabled={busy} onClick={() => setConfirmation('end_soup_game')} key="end">结束本局</button> : '']),
    ];
    return [
      row(['猜题区', '内容', '玩家／顺序', '状态', '操作', '图片', '说明']),
      row(['当前汤面', room.surface ?? '等待汤主录入题目', room.hostName ? `汤主：${room.hostName}` : '尚未指定', statusLabels[room.status], '', imageCell(room.surfaceImageUrl, '汤面图片'), '手动出题']),
      row(['现在该谁做', flowText, '', '', '', '', '']),
      row(['我的问题', isHost ? '汤主负责回答' : <textarea value={questionDraft} maxLength={240} disabled={!draftEditable} placeholder="写一道能用“是／否”判断的问题" onChange={(e) => draftController.current?.update(e.target.value)} key="question" />, myQueuePosition ? `已排第 ${myQueuePosition} 位` : cooldownSeconds ? `冷却 ${cooldownSeconds}s` : canQueue ? '可提交' : '暂不可提交', `${draftState === 'saved' ? '草稿已保存' : draftState === 'saving' ? '正在保存' : draftState === 'error' ? '保存失败，本地保留' : '草稿'}`, <button className="sheet-action" disabled={busy || !canQueue || !questionDraft.trim()} onClick={() => void submitQueue('question')} key="submit-question">提交问题到待回答区</button>, '', '每人最多排一条']),
      row(['待回答队列', `${queue.length} 条`, head ? `队首：${head.playerName}` : '当前为空', head ? '汤主正在处理队首' : '可以提交', '', '', '回答后该玩家仍需满足 10 秒冷却']),
      ...queue.map((item, index) => row([index === 0 ? '正在回答' : `等待 ${index}`, item.content, item.playerName, item.type === 'question' ? '问题' : '故事还原', index === 0 && isHost ? '请到“玩家与汤主”回答' : '', '', item.playerId === playerId ? '我的排队内容' : ''])),
      ...room.records.filter((record) => record.type === 'question').slice(-8).reverse().map((record) => row([`已回答 ${record.sequence}`, record.content, record.playerName, soupVerdictLabel(record.verdict), '', '', record.note ?? '—'])),
    ];
  })();

  const formula = !room ? 'A5 · 手动出题房间' : `${statusLabels[room.status]} · ${flowText} · 队列 ${queue.length}`;
  const openGuide = () => { if (activeSheet !== 'guide') returnSheet.current = activeSheet; setActiveSheet('guide'); };
  const leaveView = () => { window.localStorage.removeItem('soup-active-remote'); setRoom(null); setPlayerId(''); setPrivateRound(null); setActiveSheet('play'); setNotice('已返回 A5 首页。'); };
  const copyInvite = async () => { if (!room) return; const invite = new URL(window.location.href); invite.search = ''; invite.searchParams.set('room', room.code); try { await navigator.clipboard.writeText(invite.toString()); setNotice('邀请链接已复制。'); } catch { setNotice('请复制地址栏链接并附上房间编号。', 'error'); } };

  return <main data-soup-sheet={activeSheet} className={`sheet-app workbook-unified soup-sheet${activeSheet === 'guide' ? ' sheet-app--guide' : ''}`}>
    <header className="sheet-titlebar"><span className="sheet-filemark" aria-hidden="true">表</span><div><strong>协作工作簿 · A5</strong><span>{room ? `编号 ${room.code} · ${statusLabels[room.status]}` : '手动出题模板'}</span></div><div className="sheet-title-actions"><a className="sheet-room-action" href="../">目录</a>{room && <button onClick={copyInvite}>复制链接</button>}<ReleaseNotificationButton open={notificationOpen} onToggle={() => setNotificationOpen((v) => !v)} /></div></header>
    <nav className="sheet-ribbon"><button className={activeSheet === 'play' ? 'is-current' : ''} onClick={() => setActiveSheet('play')}>猜题</button><button className={activeSheet === 'guide' ? 'is-current' : ''} onClick={openGuide}>流程</button>{activeSheet === 'guide' && <button onClick={() => setActiveSheet(returnSheet.current)}>返回原工作表</button>}<button disabled={!secretVisible} onClick={() => privacy.current?.mask('escape')}>隐藏汤底</button><span /></nav>
    <div className="sheet-formula"><span className="sheet-namebox">{activeCell}</span><span className="sheet-fx">fx</span><output>{formula}</output></div>
    {room && <div className="sheet-commandbar soup-flowbar"><strong>{flowText}</strong><span>队列规则：每人最多 1 条；汤主只回答队首；已回答且提交满 10 秒后可再次提问。</span>{isOwner && room.status === 'lobby' && <button className="sheet-primary-action" disabled={busy || activeCount < SOUP_MIN_PLAYERS} onClick={() => void apply('start_soup_game')}>随机汤主并开始</button>}<button className="workbook-note-trigger" onClick={() => setNote({ title: '当前流程与队列', text: `${flowText}\n\n每名侦探最多保留一条未回答内容。汤主按提交顺序只处理队首；回答完成后，该玩家还需满足本次提交后的 10 秒冷却才能再次入队。` })}>看说明</button></div>}
    {confirmation && <div className="sheet-commandbar soup-confirm"><strong>{confirmation === 'end_soup_game' ? '结束本局后不能继续提问。' : '公布汤底后，本题立即结束并清空队列。'}</strong><button disabled={busy} onClick={() => { void apply(confirmation); setConfirmation(null); }}>确认</button><button onClick={() => setConfirmation(null)}>取消</button></div>}
    {draftEditable && draftState === 'error' && <div className="sheet-commandbar"><span>草稿暂未同步，文字仍保留。</span><button onClick={() => void draftController.current?.flush()}>重试保存</button></div>}
    {draftEditable && draftState === 'conflict' && <div className="sheet-commandbar"><span>另一窗口保存过草稿，请选择保留哪一份。</span><button onClick={() => draftController.current?.resolveConflict(true)}>保留当前文字</button><button onClick={() => draftController.current?.resolveConflict(false)}>采用云端草稿</button></div>}
    <div className="sheet-workspace"><div className="sheet-canvas">{!room && <section className="hub-intro"><div><strong>手动出题 · 随机汤主</strong><p>每个人开局前准备一道题；系统随机指定本题汤主。侦探可各自提前排一条，汤主按队首回答。</p></div></section>}<div className="sheet-grid-scroll"><table className="sheet-grid" aria-label={sheets.find(([id]) => id === activeSheet)?.[1]}><WorkbookColumns count={7} /><thead><tr><th />{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((values, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{columns.map((column, columnIndex) => { const coordinate = `${column}${rowIndex + 1}`; const value = values[columnIndex]; return <td className={coordinate === activeCell ? 'is-active-cell' : ''} onClick={() => setActiveCell(coordinate)} key={column}>{activeSheet !== 'people' && typeof value === 'string' && value.length > 28 ? <WorkbookText text={value} title={`${coordinate} 完整内容`} onOpen={setNote} /> : value ?? ''}</td>; })}</tr>)}</tbody></table></div></div>
      {imageView && <aside className="soup-image-panel"><header><strong>{imageView.title}</strong><button onClick={() => setImageView(null)}>关闭</button></header><Image unoptimized src={imageView.url} alt={imageView.title} width={800} height={600} /><a href={imageView.url} target="_blank" rel="noreferrer">在新标签页打开</a></aside>}
      <ReleaseNotificationPanel open={notificationOpen} onClose={() => setNotificationOpen(false)} />
    </div>
    <WorkbookFeedback note={note} onClose={() => setNote(null)} status={notice} kind={noticeKind} />
    <footer className="sheet-tabs">{sheets.map(([id, label]) => <button disabled={!room && id !== 'play' && id !== 'guide'} className={activeSheet === id ? 'is-current' : ''} onClick={() => id === 'guide' ? openGuide() : setActiveSheet(id)} key={id}>{label}</button>)}{room && <button onClick={leaveView}>离开页面</button>}<a href="../">目录</a><span /><small>图片仅在点击后加载</small></footer>
  </main>;
}
