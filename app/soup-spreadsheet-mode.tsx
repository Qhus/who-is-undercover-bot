'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { getCloudStore, type SoupActionType } from '@/lib/cloudbase-store';
import { makeId } from '@/lib/game';
import { createPrivacyGuard, type PrivacyGuard } from '@/lib/privacy';
import {
  SOUP_MIN_PLAYERS, createManualSoupRoom, soupVerdictLabel,
  type SoupPendingAction, type SoupPrivateRound, type SoupQuestionVerdict, type SoupRoom, type SoupSolutionVerdict,
} from '@/lib/soup-game';
import { acceptSoupRoom, canEditSoupDraft, createSoupDraftController, soupRoundScope, type SoupDraftStatus } from '@/lib/soup-draft';
import { SOUP_KIT_MAX_BYTES, decodeKitImage, parseSoupKit, prepareSoupKit, restorePreparedSoupKit, kitStagePublished, soupCasePayload, type SoupKit, type PreparedSoupKit } from '@/lib/soup-kit';
import { WorkbookFeedback, useWorkbookNotice } from './workbook-feedback';
import { ReleaseNotificationButton, ReleaseNotificationPanel } from './release-notification';
import { SoupWorksheet, SoupCellText, type SoupSheetRow } from './soup-worksheet';

const sheets = [['play', '当前记录'], ['history', '处理记录'], ['guide', '操作说明']] as const;
type SheetId = typeof sheets[number][0];
type ImageView = { url: string; title: string; private?: boolean; scope?: string } | null;

const statusLabels: Record<SoupRoom['status'], string> = {
  lobby: '成员准备', host_preparing: '内容录入', host_reading: '资料确认', investigating: '正在处理',
  judging_question: '待处理', judging_solution: '待确认', limit_reached: '额度已满',
  round_result: '本轮完成', feedback: '本轮完成', finished: '已结束',
};

function readableError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : JSON.stringify(error ?? '');
  if (/STALE_ROUND|STALE_VERSION|STALE_STATE|WRONG_PHASE/.test(raw)) return '队列或阶段刚刚更新，请确认页面后重试。';
  if (/PGRST202|function.*v13.*does not exist|Could not find.*v13/.test(raw)) return '指定汤主更新尚未完成，请管理员先执行 V13 增量 SQL，再开始题目。';
  return error instanceof Error && error.message ? error.message : fallback;
}
function safeImageUrl(value: string | null | undefined) { const clean = value?.trim() ?? ''; return /^https?:\/\//i.test(clean) ? clean : null; }
function queuePosition(queue: SoupPendingAction[], playerId: string) { const index = queue.findIndex((item) => item.playerId === playerId); return index < 0 ? 0 : index + 1; }

export function SoupHostPicker({ room, busy, onStart }: { room: SoupRoom; busy: boolean; onStart: (id: string) => void }) {
  const [selected, setSelected] = useState('');
  const candidates = room.players.filter(player => player.alive && !player.away);
  const host = candidates.find(player => player.id === selected);
  return <div aria-label="指定录入人">
    <div className="soup-inline"><label>本轮录入人<select aria-label="本轮录入人" value={host?.id ?? ''} onChange={e => setSelected(e.target.value)} disabled={busy}><option value="">请选择一位成员</option>{candidates.map(player => <option key={player.id} value={player.id}>{player.name}{player.id === room.ownerId ? '（负责人）' : ''}</option>)}</select></label>
      <button className="soup-primary" disabled={busy || candidates.length < SOUP_MIN_PLAYERS || !host} onClick={() => host && onStart(host.id)}>{busy ? '提交中…' : room.round ? '开始下一轮' : '开始本轮'}</button></div>
    <p className="soup-muted">{candidates.length < SOUP_MIN_PLAYERS ? `至少 ${SOUP_MIN_PLAYERS} 人，当前还需 ${SOUP_MIN_PLAYERS - candidates.length} 人加入。` : host ? `已选 ${host.name}：负责录入与处理，可连续担任。` : '选择已备好材料的成员，其他人不用提前准备。'}</p>
  </div>;
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
  const [notice, setNotice, noticeKind] = useWorkbookNotice('加入房间后，由负责人指定汤主；只有汤主需要准备题目。');
  const [busy, setBusy] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [privateReload, setPrivateReload] = useState(0);
  const [confirmation, setConfirmation] = useState<'reveal_soup_bottom' | 'end_soup_game' | null>(null);
  const [imageView, setImageView] = useState<ImageView>(null);
  const [clockNow, setClockNow] = useState(0);
  const [pendingKit, setPendingKit] = useState<{ scope: string; kit: SoupKit } | null>(null);
  const [kitState, setKitState] = useState<{ scope: string; kit: PreparedSoupKit } | null>(null);
  const [kitProgress, setKitProgress] = useState('');
  const [composer, setComposer] = useState<'question' | 'solution'>('question');
  const [caseInputMode, setCaseInputMode] = useState<'import' | 'manual'>('import');
  const [editImported, setEditImported] = useState(false);
  const kitUploads = useRef(new Map<string, string>());
  const kitImportBusy = useRef(false);
  const activeKitScope = useRef('');
  const busyRef = useRef(false);
  const returnSheet = useRef<SheetId>('play');
  const draftController = useRef<ReturnType<typeof createSoupDraftController> | null>(null);
  const retryAction = useRef<{ key: string; actionId: string; room: SoupRoom } | null>(null);
  const privacy = useRef<PrivacyGuard | null>(null);
  const cloudReady = Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID && process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    privacy.current = createPrivacyGuard({ onVisibilityChange: visible => { setSecretVisible(visible); if (!visible) setImageView(null); }, revealMs: 300_000, idleMs: 60_000 });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { privacy.current?.mask('escape'); setImageView(null); } else privacy.current?.activity(); };
    const onBlur = () => { privacy.current?.mask('blur'); setImageView(null); };
    const onVisibility = () => { if (document.hidden) { privacy.current?.mask('hidden'); setImageView(null); } };
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
        if (!disposed && found?.soupVersion === 2 && found.players.some((p) => p.id === active.playerId)) { setPlayerId(active.playerId); setRoom(found); setNotice('已恢复协作表。'); }
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
  const kitScope = `${draftRoomCode}:${draftSession}:${draftRound}:${playerId}`;
  useEffect(() => { activeKitScope.current = kitScope; return () => { activeKitScope.current = ''; }; }, [kitScope]);
  const draftEditable = Boolean(room && canEditSoupDraft(room, playerId));
  const formScope = `${draftRoomCode}:${draftSession}:${draftRound}:${playerId}:${privateReload}`;
  const [renderedFormScope, setRenderedFormScope] = useState(formScope);
  if (renderedFormScope !== formScope) {
    setRenderedFormScope(formScope); setQuestionDraft(''); setSolutionDraft(''); setDraftState('loading'); setPrivateRound(null); setSecretVisible(false);
    setCaseForm({ surface: '', surfaceImageUrl: '', bottom: '', bottomImageUrl: '', keyFacts: '', boundary: '' });
    setPublicText(''); setPublicImageUrl(''); setJudgeNote(''); setImageView(null); setConfirmation(null); setComposer('question'); setEditImported(false); setActiveSheet('play');
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
      if (packet.isHost) {
        try {
          const saved = sessionStorage.getItem(`soup-kit-v1:${scope}`);
          if (saved) {
            const kit = restorePreparedSoupKit(saved);
            setKitState({ scope, kit });
            // Only restore the form before submission; the server remains authoritative afterwards.
            if (!packet.bottom) setCaseForm(kit.form);
          }
        } catch { setNotice('本机题材包缓存不可用，可重新导入；已提交的汤底不受影响。', 'error'); }
      }
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
      retryAction.current = null; setRoom((current) => current?.code === result.state.code ? acceptSoupRoom(current, result.state) : current);
      if (!['applied', 'duplicate'].includes(result.outcome)) { setNotice(result.message || '页面已更新，请确认后重试；输入内容已保留。', 'error'); return null; }
      setNotice(result.message || '操作已记录。'); return result.state;
    } catch (error) { setNotice(readableError(error, '操作未确认，请重试。'), 'error'); return null; }
    finally { busyRef.current = false; setBusy(false); }
  }, [room, setNotice]);

  const remember = (code: string, id: string) => { window.localStorage.setItem(`soup-player-${code}`, id); window.localStorage.setItem('soup-active-remote', JSON.stringify({ code, playerId: id })); };
  const createRemote = async () => {
    if (!cloudReady || !ownerName.trim()) return setNotice(!cloudReady ? '测试站尚未配置 CloudBase。' : '请填写称呼。', 'error');
    busyRef.current = true; setBusy(true);
    try { const seed = createManualSoupRoom(ownerName); const next = await getCloudStore().createSoupRoom(seed); remember(next.code, next.ownerId); setRoom(next); setPlayerId(next.ownerId); setNotice(`房间 ${next.code} 已创建。先邀请成员，再指定一位准备好题目的汤主。`); }
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
  const myPending = queue.find(item => item.playerId === playerId);
  const lastSubmittedAt = room?.lastQuestionAtByPlayer?.[playerId] ?? 0;
  const cooldownSeconds = clockNow <= 0 ? 0 : Math.max(0, Math.ceil((lastSubmittedAt + 10_000 - clockNow) / 1000));
  const isOwner = room?.ownerId === playerId;
  const isHost = room?.hostId === playerId;
  const preparedKit = isHost && kitState?.scope === kitScope ? kitState.kit : null;
  const pendingImport = isHost && pendingKit?.scope === kitScope ? pendingKit.kit : null;
  const canQueue = Boolean(room && room.status === 'investigating' && !isHost && !myQueuePosition && cooldownSeconds === 0);
  const head = queue[0] ?? null;
  const submitQueue = async (type: 'question' | 'solution') => {
    const content = (type === 'question' ? questionDraft : solutionDraft).trim(); if (!content) return setNotice(type === 'question' ? '请先填写一道是非问题。' : '请先写下完整故事还原。');
    const next = await apply(type === 'question' ? 'submit_soup_question' : 'submit_soup_solution', { content });
    if (next) { if (type === 'question') draftController.current?.update(''); else draftController.current?.updateSolution(''); }
  };
  const judge = (event: MouseEvent<HTMLButtonElement>) => { const verdict = event.currentTarget.dataset.verdict; void apply(head?.type === 'question' ? 'judge_soup_question' : 'judge_soup_solution', { verdict, note: judgeNote }).then((next) => { if (next) setJudgeNote(''); }); };
  const submitCase = async () => { if (!caseForm.surface.trim() || !caseForm.bottom.trim()) return setNotice('汤面和完整汤底都必须填写。', 'error'); const next = await apply('prepare_soup_case', soupCasePayload(caseForm)); if (next) { setPrivateReload((value) => value + 1); setActiveSheet('play'); } };
  const publishPost = async () => { if (!publicText.trim() && !publicImageUrl.trim()) return setNotice('提示或证据至少需要文字或图片链接。'); const next = await apply('publish_soup_note', { kind: publicKind, text: publicText, imageUrl: publicImageUrl }); if (next) { setPublicText(''); setPublicImageUrl(''); } };
  const uploadImage = async (file: File | undefined, kind: 'surface' | 'bottom' | 'note') => {
    if (!file || !room) return;
    const scope = kitScope;
    setUploadingImage(kind);
    try {
      const url = await getCloudStore().uploadSoupImage(room, file, kind);
      if (activeKitScope.current !== scope) return;
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

  const readKit = async (file?: File) => {
    if (!file || !isHost || room?.status !== 'host_preparing' || kitImportBusy.current) return;
    const scope = kitScope;
    try {
      if (file.size > SOUP_KIT_MAX_BYTES) throw new Error('题材包不能超过 32 MB');
      const kit = parseSoupKit(await file.text());
      if (activeKitScope.current !== scope) return;
      kitUploads.current = new Map(); setPendingKit({ scope, kit });
      setNotice(`已读取《${kit.title}》。确认后上传图片并填入题目，尚未向侦探公开。`);
    } catch (error) { setNotice(readableError(error, '无法读取题材包'), 'error'); }
  };
  const importKit = async () => {
    if (!pendingImport || !room || !isHost || room.status !== 'host_preparing' || kitImportBusy.current || busyRef.current) return;
    const scope = kitScope;
    kitImportBusy.current = true; busyRef.current = true; setBusy(true);
    try {
      const kit = await prepareSoupKit(pendingImport, async (data, kind) => {
        if (activeKitScope.current !== scope) throw new Error('题次已变更，请回到当前题目重新导入');
        const { type, bytes } = decodeKitImage(data);
        return getCloudStore().uploadSoupImage(room, new File([bytes as BlobPart], 'kit-image', { type }), kind);
      }, (done, total) => setKitProgress(`上传图片 ${done}/${total}`), kitUploads.current);
      if (activeKitScope.current !== scope) return;
      setKitState({ scope, kit }); setCaseForm(kit.form); setPendingKit(null);
      try { sessionStorage.setItem(`soup-kit-v1:${scope}`, JSON.stringify(kit)); }
      catch { setNotice('题目已填入；浏览器无法保存本机缓存，刷新后需重新导入提示。', 'error'); return; }
      setNotice('题材包已填入。检查后点击“发布内容”；未发布提示只保留在本机汤主工作区。');
    } catch (error) { setNotice(`导入未完成，原题目保留；可重试：${readableError(error, '上传失败')}`, 'error'); }
    finally { kitImportBusy.current = false; busyRef.current = false; setBusy(false); setKitProgress(''); }
  };
  const publishStage = async (stage: PreparedSoupKit['stages'][number]) => {
    if (!room || !isHost || !['investigating', 'limit_reached'].includes(room.status) || kitStagePublished(stage, room.publicPosts ?? [])) return;
    const next = await apply('publish_soup_note', { kind: stage.kind, text: stage.text, imageUrl: stage.imageUrl });
    if (next) { privacy.current?.mask(); setNotice('这条提示已公开，其他待发提示仍保密。'); }
  };

  const publicPosts = room?.publicPosts ?? [];
  const nextStage = preparedKit?.stages.find(stage => !kitStagePublished(stage, publicPosts));
  const kitMatchesCase = Boolean(preparedKit && room?.surface === preparedKit.form.surface && privateRound?.bottom === preparedKit.form.bottom);
  const hasResult = Boolean(room && ['round_result', 'feedback', 'finished'].includes(room.status));
  const isPlaying = Boolean(room && ['investigating', 'limit_reached'].includes(room.status));
  const step = !room || room.status === 'lobby' ? 0 : room.status === 'host_preparing' ? 1 : hasResult ? 3 : 2;
  const myName = room?.players.find(player => player.id === playerId)?.name ?? '';
  const roleText = isHost ? '录入 / 处理' : isOwner ? '负责人' : '参与成员';
  const openGuide = () => { if (activeSheet !== 'guide') returnSheet.current = activeSheet; setActiveSheet('guide'); };
  const leaveView = () => { window.localStorage.removeItem('soup-active-remote'); setRoom(null); setPlayerId(''); setPrivateRound(null); setActiveSheet('play'); setNotice('已返回入口，可用原房间编号重新加入。'); };
  const copyInvite = async () => { if (!room) return; const invite = new URL(window.location.href); invite.search = ''; invite.searchParams.set('room', room.code); try { await navigator.clipboard.writeText(invite.toString()); setNotice('邀请链接已复制。'); } catch { setNotice(`请把房间编号 ${room.code} 发给成员。`, 'error'); } };
  const startWithHost = (hostId: string) => void apply(room?.status === 'lobby' ? 'start_soup_game' : 'next_soup_round', { hostId });
  const verdictText = (value: SoupQuestionVerdict | SoupSolutionVerdict) => ({ success: '通过并完成', close: '需补充', wrong: '未通过', rephrase: '需改写' }[value as string] ?? soupVerdictLabel(value));
  const picture = (url: string | null | undefined, title: string, isPrivate = false) => {
    const safe = safeImageUrl(url); if (!safe) return null;
    const open = imageView?.url === safe && imageView.scope === kitScope && (!isPrivate || secretVisible);
    return <div className="soup-picture"><button aria-expanded={open} onClick={() => setImageView(open ? null : { url: safe, title, private: isPrivate, scope: kitScope })}>{open ? `收起${title}` : `查看${title}`}</button>{open && <figure><Image unoptimized src={safe} alt={title} width={1600} height={1000} />{!isPrivate && <a href={safe} target="_blank" rel="noreferrer">打开原图</a>}<figcaption>Esc 或切走窗口后收起</figcaption></figure>}</div>;
  };
  const imageInput = (kind: 'surface' | 'bottom' | 'note', label: string) => <details className="soup-optional"><summary>{label}（可选）</summary>
    <label className="soup-upload">{uploadingImage === kind ? '上传中…' : '上传图片'}<input aria-label={`上传${label}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || Boolean(uploadingImage)} onChange={e => { void uploadImage(e.target.files?.[0], kind); e.currentTarget.value = ''; }} /></label>
    {(kind === 'note' ? publicImageUrl : kind === 'surface' ? caseForm.surfaceImageUrl : caseForm.bottomImageUrl) && <span className="soup-muted">已添加</span>}
    <label className="soup-field">或填写图片链接<input aria-label={`${label}链接`} placeholder="https://…" value={kind === 'note' ? publicImageUrl : kind === 'surface' ? caseForm.surfaceImageUrl : caseForm.bottomImageUrl} onChange={e => kind === 'note' ? setPublicImageUrl(e.target.value) : setCaseForm(value => ({ ...value, [kind === 'surface' ? 'surfaceImageUrl' : 'bottomImageUrl']: e.target.value }))} /></label>
  </details>;
  const roster = room && <div className="soup-member-list">{room.players.map(player => <span key={player.id}>{player.name}{player.id === playerId && '（你）'}{player.id === room.hostId ? ' · 录入人' : player.id === room.ownerId ? ' · 负责人' : ''}{(!player.alive || player.away) && ' · 暂不参与'}</span>)}</div>;
  const guideRows: SoupSheetRow[] = [
    { id: 'guide-1', label: '01 成员与分工', content: '负责人先指定录入人，即本题汤主。只有这位成员准备题目、掌握完整答案，其余成员负责提问。支持 2–10 人，也可连续指定同一人。', status: '开始前', action: <button onClick={() => setActiveSheet(returnSheet.current)}>返回刚才的页面</button> },
    { id: 'guide-2', label: '02 资料录入', content: '录入人选择“导入材料”或“手动填写”。公开内容是谜面；参考结论是完整答案，仅录入人可见。发布内容后，其他成员自动进入填写阶段。', status: '仅录入人' },
    { id: 'guide-3', label: '03 提问与还原', content: '在“本次填写”选择“问题”，提交能用是/否回答的一句话；想通以后改选“完整说明”，写清关键事实与因果。两份草稿分别保存，每人最多 1 条未回答内容。', status: '其他成员' },
    { id: 'guide-4', label: '04 判定与完成', content: '录入人按队首处理。问题可选是、否、无关、部分正确、需改写；完整说明可选通过并完成、需补充、未通过。通过后自动公开参考结论。负责人可指定下一轮录入人。', status: '按提交顺序' },
    { id: 'guide-more', label: '次数与附件', content: <><p>提交满 10 秒且上一条已回答后，才能再次提交。默认 20 个有效问题；“需改写”不占次数。额度用尽且队列清空后可延长一次 5 问。</p><p>补充资料由录入人决定何时公开。图片仅在点击后加载；Esc、切页或失焦后收起。个人参考资料默认隐藏。</p></>, status: '按需查看' },
  ];
  const entryRows: SoupSheetRow[] = [
    { id: 'join', label: '加入协作表', current: true, content: <form id="soup-join" className="soup-inline" onSubmit={e => { e.preventDefault(); void joinRemote(); }}><label>称呼<input aria-label="加入时的称呼" value={joinName} maxLength={24} placeholder="填写称呼" onChange={e => setJoinName(e.target.value)} autoComplete="nickname" /></label><label>编号<input aria-label="六位房间编号" value={joinCode} maxLength={6} placeholder="六位编号" onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></label></form>, status: '已有编号', action: <button form="soup-join" className="soup-primary" disabled={busy || !joinName.trim() || joinCode.length !== 6}>加入</button> },
    { id: 'create', label: '新建协作表', content: <form id="soup-create" className="soup-inline" onSubmit={e => { e.preventDefault(); void createRemote(); }}><label>称呼<input aria-label="创建时的称呼" value={ownerName} maxLength={24} placeholder="填写称呼" onChange={e => setOwnerName(e.target.value)} autoComplete="nickname" /></label><span className="soup-muted">创建后邀请成员，再指定录入人。</span></form>, status: '负责人操作', action: <button form="soup-create" disabled={busy || !ownerName.trim()}>创建</button> },
    { id: 'entry-help', label: '首次使用', content: '先进入同一张协作表，再按公式栏的“下一步”操作。只需录入人提前准备材料。', status: '2–10 人', action: <button onClick={openGuide}>查看操作说明</button> },
  ];
  const hostChoiceRow = (currentRoom: SoupRoom): SoupSheetRow => ({ id: `choose-${currentRoom.round}`, label: currentRoom.round ? '下一轮安排' : '指定录入人', current: true, content: isOwner ? <SoupHostPicker key={`host:${currentRoom.round}`} room={currentRoom} busy={busy} onStart={startWithHost} /> : '等待负责人指定。准备了材料的成员可以告知负责人。', status: isOwner ? '负责人操作' : '等待安排' });
  const lobbyRows: SoupSheetRow[] = room ? [
    { id: 'members', label: '参与成员', content: roster, status: `${room.players.length} 人已加入`, action: <button onClick={copyInvite}>复制邀请链接</button> }, hostChoiceRow(room),
  ] : [];
  const preparationRows: SoupSheetRow[] = room && isHost ? [
    { id: 'source', label: '资料来源', current: true, content: <div className="soup-inline" aria-label="题目来源"><button aria-pressed={caseInputMode === 'import'} onClick={() => setCaseInputMode('import')}>导入材料</button><button aria-pressed={caseInputMode === 'manual'} onClick={() => setCaseInputMode('manual')}>手动填写</button><span className="soup-muted">其他成员等待你发布公开内容。</span></div>, status: '仅你录入' },
    ...(caseInputMode === 'import' ? [{ id: 'kit', label: '材料文件', content: <><label className="soup-upload">选择 JSON 文件<input type="file" aria-label="选择材料文件" accept=".json,application/json" disabled={busy || Boolean(uploadingImage)} onChange={e => { void readKit(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>{pendingImport ? <p>{pendingImport.title} · {Object.keys(pendingImport.images).length} 张图片 / {pendingImport.stages.length} 条补充资料。确认后替换当前草稿。</p> : preparedKit ? <p className="soup-muted">已载入：{preparedKit.title}</p> : <p className="soup-muted">导入文字、图片和阶段提示，参考内容不会提前公开。</p>}</>, status: pendingImport ? '待确认' : preparedKit ? '已载入' : '待选择', action: pendingImport ? <div className="soup-actions"><button disabled={busy || Boolean(uploadingImage)} onClick={() => void importKit()}>{kitProgress || '确认导入'}</button><button disabled={busy} onClick={() => setPendingKit(null)}>取消</button></div> : null }] : []),
    ...(caseInputMode === 'import' && caseForm.surface ? [{ id: 'preview', label: '公开内容预览', content: <SoupCellText key={kitScope} text={caseForm.surface} />, status: '发布后可见', action: <button aria-expanded={editImported} onClick={() => setEditImported(value => !value)}>{editImported ? '收起编辑' : '检查 / 修改'}</button> }] : []),
    ...(caseInputMode === 'manual' || editImported ? [
      { id: 'surface-edit', label: '公开内容', content: <><textarea aria-label="公开内容" value={caseForm.surface} maxLength={600} placeholder="填写其他成员首先看到的内容" onChange={e => setCaseForm(value => ({ ...value, surface: e.target.value }))} />{imageInput('surface', '公开附件')}</>, status: '必填 · 将公开' },
      { id: 'bottom-edit', label: '参考结论', content: <><textarea aria-label="参考结论" value={caseForm.bottom} maxLength={2000} placeholder="写清完整事实、因果与反转" onChange={e => setCaseForm(value => ({ ...value, bottom: e.target.value }))} />{imageInput('bottom', '结论附件')}</>, status: '必填 · 仅你可见' },
      { id: 'criteria', label: '补充口径', content: <details><summary>关键事实与判定边界（可选）</summary><label className="soup-field">关键事实<textarea value={caseForm.keyFacts} maxLength={1000} onChange={e => setCaseForm(value => ({ ...value, keyFacts: e.target.value }))} /></label><label className="soup-field">判定边界<textarea value={caseForm.boundary} maxLength={1000} onChange={e => setCaseForm(value => ({ ...value, boundary: e.target.value }))} /></label></details>, status: '仅你可见' },
    ] : []),
    { id: 'publish', label: '完成录入', content: '只发布公开内容；参考结论在本轮完成后才向其他成员公开。', status: caseForm.surface.trim() && caseForm.bottom.trim() ? '可发布' : '请先完成必填项', action: <button className="soup-primary" disabled={busy || Boolean(uploadingImage) || !caseForm.surface.trim() || !caseForm.bottom.trim()} onClick={() => void submitCase()}>{busy ? '提交中…' : '发布内容'}</button> },
  ] : [{ id: 'waiting', label: '内容录入', content: `${room?.hostName ?? '录入人'} 正在准备内容。完成后此处自动更新，无需切页。`, status: '等待发布', action: <button onClick={openGuide}>查看操作说明</button> }];
  const publicRows: SoupSheetRow[] = publicPosts.length ? publicPosts.map((post, index) => ({ id: post.id, label: `补充资料 ${index + 1}`, content: <><SoupCellText text={post.text} />{picture(post.imageUrl, `补充附件 ${index + 1}`)}</>, status: '已公开' })) : [{ id: 'no-posts', label: '补充资料', content: '暂未补充，可先根据当前内容提交问题。', status: '—' }];
  const surfaceRow: SoupSheetRow = { id: 'surface', label: '当前内容', content: <><SoupCellText key={kitScope} text={room?.surface} />{picture(room?.surfaceImageUrl, '内容附件')}</>, status: `第 ${room?.round ?? 0} 轮`, action: <span className="soup-muted">录入：{room?.hostName}</span> };
  const queueStatus = myQueuePosition ? myQueuePosition === 1 ? '队首 · 等待处理' : `前面还有 ${myQueuePosition - 1} 条` : room?.status === 'limit_reached' ? '额度已满' : cooldownSeconds ? `${cooldownSeconds} 秒后可提交` : '可提交';
  const detectiveRows: SoupSheetRow[] = [surfaceRow,
    { id: 'compose', label: '本次填写', current: true, content: <><div className="soup-inline" aria-label="提交类型"><button aria-pressed={composer === 'question'} onClick={() => setComposer('question')}>问题</button><button aria-pressed={composer === 'solution'} onClick={() => setComposer('solution')}>完整说明</button><span className="soup-muted">{composer === 'question' ? '一次填写一个可用是 / 否回答的问题。' : '把关键事实与因果关系连起来。'}</span></div><textarea aria-label={composer === 'question' ? '本次问题' : '完整说明'} value={composer === 'question' ? questionDraft : solutionDraft} maxLength={240} disabled={!draftEditable} placeholder={composer === 'question' ? '例如：事情发生在同一天吗？' : '填写完整的事实与原因'} onChange={e => composer === 'question' ? draftController.current?.update(e.target.value) : draftController.current?.updateSolution(e.target.value)} /><span className="soup-muted">{(composer === 'question' ? questionDraft : solutionDraft).length}/240 字 · {draftState === 'saved' ? '草稿已保存' : draftState === 'saving' ? '保存中' : draftState === 'error' ? '草稿保留在本机' : '草稿'}</span></>, status: <span role="status">{queueStatus}</span>, action: <button className="soup-primary" disabled={busy || !canQueue || !(composer === 'question' ? questionDraft : solutionDraft).trim()} onClick={() => void submitQueue(composer)}>{myQueuePosition ? '已加入队列' : composer === 'question' ? '提交问题' : '提交说明'}</button> },
    ...(myPending ? [{ id: 'my-pending', label: '我的待处理', content: <SoupCellText text={myPending.content} />, status: queueStatus }] : []),
  ];
  const hostRows: SoupSheetRow[] = room ? [
    { id: 'judge', label: '当前待处理', current: true, content: head ? <><span className="soup-muted">{head.playerName} · {head.type === 'question' ? '问题' : '完整说明'}</span><SoupCellText key={head.id} text={head.content} /><details className="soup-optional"><summary>补充处理备注</summary><input aria-label="本条回答补充说明" value={judgeNote} maxLength={160} placeholder="需要补充的说明（可选）" onChange={e => setJudgeNote(e.target.value)} /></details></> : <span>{room.status === 'limit_reached' ? '队列已处理完，可延长额度或完成本轮。' : '尚无待处理内容，新的提交会自动出现在这里。'}</span>, status: <>{queue.length} 条待处理<br />有效次数 {room.effectiveQuestionCount}/{room.maxQuestions}</>, action: head ? <div className="soup-actions">{(head.type === 'question' ? ['yes', 'no', 'irrelevant', 'partial', 'rephrase'] : ['success', 'close', 'wrong']).map(verdict => <button className={verdict === 'success' ? 'soup-primary' : ''} key={verdict} data-verdict={verdict} disabled={busy} onClick={judge}>{verdictText(verdict as SoupQuestionVerdict | SoupSolutionVerdict)}</button>)}<small>{head.type === 'solution' ? '通过后公开参考结论。' : '“需改写”不计次数。'}</small></div> : null },
    ...(queue.length > 1 ? [{ id: 'rest-queue', label: '后续队列', content: <details><summary>查看其余 {queue.length - 1} 条</summary><ol>{queue.slice(1).map(item => <li key={item.id}>{item.playerName}：{item.content}</li>)}</ol></details>, status: '按提交顺序' }] : []),
    { id: 'private-toggle', label: '个人参考', content: !secretVisible ? '默认隐藏；查看后按 Esc、切页或切走窗口即可收起。' : '参考内容只对你显示，补充资料需要另行公开。', status: '仅你可见', action: <button aria-expanded={secretVisible} disabled={!privateRound} onClick={() => secretVisible ? privacy.current?.mask() : privacy.current?.reveal()}>{secretVisible ? '收起参考' : '查看参考'}</button> },
    ...(secretVisible ? [
      { id: 'private-answer', label: '参考结论', content: <details><summary>展开结论与判定口径</summary><SoupCellText text={privateRound?.bottom} />{!!privateRound?.keyFacts.length && <ul>{privateRound.keyFacts.map((fact, i) => <li key={i}>{fact}</li>)}</ul>}<SoupCellText text={privateRound?.boundary} />{picture(privateRound?.bottomImageUrl, '参考附件', true)}</details>, status: '仅你可见' },
      ...(preparedKit && kitMatchesCase ? [{ id: 'next-stage', label: '待发补充', content: nextStage ? <><strong>{nextStage.title}</strong><SoupCellText text={nextStage.text} />{picture(nextStage.imageUrl, '待发附件', true)}</> : '材料中的补充资料已全部公开。', status: nextStage ? `建议第 ${nextStage.afterQuestions} 问后` : '已完成', action: nextStage ? <button disabled={busy} onClick={() => void publishStage(nextStage)}>公开这条资料</button> : null }] : []),
      ...(preparedKit && !kitMatchesCase ? [{ id: 'kit-changed', label: '材料匹配', content: '内容已修改，阶段提示暂停自动匹配。核对后可在下方手动补充。', status: '请核对' }] : []),
      { id: 'custom-note', label: '手动补充', content: <details><summary>填写要公开的资料</summary><label className="soup-field">公开内容<textarea value={publicText} maxLength={600} placeholder="只填写现在准备公开的信息" onChange={e => setPublicText(e.target.value)} /></label><label className="soup-field">类型<select value={publicKind} onChange={e => setPublicKind(e.target.value as 'hint' | 'evidence')}><option value="hint">提示</option><option value="evidence">证据</option></select></label>{imageInput('note', '补充附件')}<button disabled={busy || Boolean(uploadingImage) || (!publicText.trim() && !publicImageUrl.trim())} onClick={() => void publishPost()}>公开补充</button><p className="soup-muted">公开后所有成员都能看到，不能撤回。</p></details>, status: '按需填写' },
    ] : []),
    { id: 'host-surface', label: '公开内容', content: <details><summary>查看其他成员看到的内容</summary><SoupCellText text={room.surface} />{picture(room.surfaceImageUrl, '内容附件')}</details>, status: '已公开' },
    { id: 'round-actions', label: '本轮管理', content: <details><summary>次数与完成操作</summary><div className="soup-actions">{room.status === 'limit_reached' && !room.extended && <button disabled={busy} onClick={() => void apply('extend_soup_limit')}>增加 5 次</button>}<button disabled={busy} onClick={() => setConfirmation('reveal_soup_bottom')}>提前完成本轮</button></div></details>, status: '按需操作' },
  ] : [];
  const records = room?.records ?? [];
  const recordRows = (all: boolean): SoupSheetRow[] => (all ? records : records.filter(record => ['question', 'solution'].includes(record.type)).slice(-3).reverse()).map(record => ({ id: `record-${record.sequence}`, label: `${record.sequence} · ${record.playerName}`, content: <SoupCellText text={record.content} />, status: record.verdict ? verdictText(record.verdict) : '已公开', action: record.note ? <span className="soup-muted">{record.note}</span> : null }));
  const recentRows: SoupSheetRow[] = [{ id: 'recent', label: '最近处理', content: records.length ? '最近确认的内容如下，完整过程保存在处理记录。' : '处理完成后，这里会显示最近记录。', status: `${records.length} 条记录`, action: <button onClick={() => setActiveSheet('history')}>全部记录</button> }, ...recordRows(false)];
  const resultRows: SoupSheetRow[] = room ? [
    { id: 'result', label: '处理结果', content: room.result?.success ? `${room.result.solverName} 的完整说明已通过，本轮已完成。` : '本轮已完成。', status: `${room.effectiveQuestionCount} 次有效问题`, action: <button onClick={() => setActiveSheet('history')}>查看处理记录</button> },
    { id: 'conclusion', label: '参考结论', content: <><SoupCellText text={room.revealedBottom ?? '本轮未录入参考内容。'} />{picture(room.revealedBottomImageUrl, '结论附件')}</>, status: '已公开' },
    ...(room.status === 'round_result' ? [hostChoiceRow(room)] : []),
  ] : [];
  let rows: SoupSheetRow[] = activeSheet === 'guide' ? guideRows : activeSheet === 'history' ? [
    { id: 'history-info', label: '处理记录', content: records.length ? `本轮共有 ${records.length} 条记录，按提交顺序排列。` : '尚无处理记录。', status: '公开记录', action: <button onClick={() => setActiveSheet('play')}>返回当前记录</button> }, ...recordRows(true),
  ] : !room ? entryRows : room.status === 'lobby' ? lobbyRows : room.status === 'host_preparing' ? preparationRows : hasResult ? resultRows : isPlaying ? [...(isHost ? hostRows : detectiveRows), ...publicRows, ...recentRows] : [{ id: 'sync', label: '当前状态', content: '正在同步，请稍候。', status: statusLabels[room.status] }];
  if (room && activeSheet === 'play') rows = [...rows, { id: 'room-actions', label: '协作表管理', content: <details><summary>成员与其他操作</summary>{roster}<div className="soup-actions"><button onClick={leaveView}>返回入口</button>{isOwner && !['lobby', 'finished'].includes(room.status) && <button disabled={busy} onClick={() => setConfirmation('end_soup_game')}>结束协作</button>}</div></details>, status: `${room.players.length} 人` }];
  if (draftEditable && (draftState === 'error' || draftState === 'conflict')) rows = [{ id: 'draft-error', label: '草稿同步', content: draftState === 'error' ? '暂未同步，文字仍保留。' : '另一个窗口保存过草稿，请选择要保留的版本。', status: '需要处理', action: draftState === 'error' ? <button onClick={() => void draftController.current?.flush()}>重试保存</button> : <div className="soup-actions"><button onClick={() => draftController.current?.resolveConflict(true)}>保留当前文字</button><button onClick={() => draftController.current?.resolveConflict(false)}>采用已同步草稿</button></div> }, ...rows];
  if (confirmation) rows = [{ id: 'confirmation', label: '操作确认', content: confirmation === 'end_soup_game' ? '结束整个协作流程？队列将清空，已提交的参考结论会公开。' : '现在完成本轮并向所有成员公开参考结论？未处理内容会清空。', status: '待确认', current: true, action: <div className="soup-actions"><button className="soup-primary" disabled={busy} onClick={() => { void apply(confirmation).then(next => { if (next) setConfirmation(null); }); }}>确认完成</button><button disabled={busy} onClick={() => setConfirmation(null)}>取消</button></div> }, ...rows];
  const nextAction = activeSheet === 'guide' ? '按步骤阅读；看完后返回刚才的工作表。' : activeSheet === 'history' ? '查看已确认内容；继续填写请返回“当前记录”。' : !room ? '已有编号就加入；组织者先创建，再邀请成员。' : room.status === 'lobby' ? isOwner ? '指定已备好材料的录入人，再点击“开始本轮”。' : '等待负责人指定录入人，其他成员无需提前准备。' : room.status === 'host_preparing' ? isHost ? '导入或填写材料，检查后点击“发布内容”。' : `等待 ${room.hostName} 发布内容，页面会自动更新。` : hasResult ? isOwner ? '查看参考结论；继续时先指定下一轮录入人。' : '查看参考结论，等待负责人安排下一轮。' : isHost ? head ? '处理当前队首；需要核对时点击“查看参考”。' : '等待成员提交，新内容会自动出现。' : myQueuePosition ? `${queueStatus}；处理结果会出现在下方。` : '在“本次填写”提交问题；想通后切换到“完整说明”。';
  const neutralNotice = notice.replace(/汤主/g, '录入人').replace(/侦探/g, '成员').replace(/汤面|谜面/g, '公开内容').replace(/汤底/g, '参考结论').replace(/题材包/g, '材料文件').replace(/揭晓/g, '完成').replace(/游戏/g, '流程');
  return <main className="sheet-app workbook-unified soup-sheet soup-quiet">
    <header className="sheet-titlebar"><span className="sheet-filemark" aria-hidden="true">表</span><div><strong>协作工作簿 · A5</strong><span>{room ? `${room.code} · ${statusLabels[room.status]}` : '协作记录表'}</span></div><div className="sheet-title-actions"><a href="../">目录</a>{room && <button onClick={copyInvite}>邀请成员</button>}<ReleaseNotificationButton open={notificationOpen} onToggle={() => setNotificationOpen(value => !value)} /></div></header>
    <div className="soup-stage-strip"><span>流程</span><ol aria-label="本题流程">{['成员', '录入', '处理', '完成'].map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined}>{String(index + 1).padStart(2, '0')} {title}</li>)}</ol><span className="soup-current-user">{room ? `${myName} · ${roleText}` : 'A5'}</span></div>
    <div className="sheet-formula"><span className="sheet-namebox">B{Math.max(0, rows.findIndex(row => row.current)) + 2}</span><span className="sheet-fx">fx</span><output>下一步：{nextAction}</output></div>
    <div className="sheet-workspace"><div className="soup-flow-scroll"><SoupWorksheet key={`${kitScope}:${activeSheet}`} rows={rows} label={sheets.find(([id]) => id === activeSheet)?.[1] ?? '当前记录'} /></div><ReleaseNotificationPanel open={notificationOpen} onClose={() => setNotificationOpen(false)} /></div>
    <WorkbookFeedback note={null} onClose={() => {}} status={neutralNotice} kind={noticeKind} />
    <footer className="sheet-tabs">{sheets.map(([id, label]) => <button key={id} disabled={!room && id === 'history'} className={activeSheet === id ? 'is-current' : ''} aria-current={activeSheet === id ? 'page' : undefined} onClick={() => id === 'guide' ? openGuide() : setActiveSheet(id)}>{label}</button>)}<span /><small>附件按需查看 · Esc 收起</small></footer>
  </main>;
}
