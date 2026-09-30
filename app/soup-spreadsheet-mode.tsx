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

const sheets = [['play', '当前题目'], ['history', '问答记录'], ['guide', '玩法说明']] as const;
type SheetId = typeof sheets[number][0];
type ImageView = { url: string; title: string; private?: boolean; scope?: string } | null;

const statusLabels: Record<SoupRoom['status'], string> = {
  lobby: '等待成员', host_preparing: '汤主录题', host_reading: '汤主阅读', investigating: '开放提问',
  judging_question: '汤主回答', judging_solution: '汤主判定', limit_reached: '问题已达上限',
  round_result: '本题揭晓', feedback: '本题揭晓', finished: '本局结束',
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
  return <section className="soup-card" aria-label="指定汤主">
    <span className="soup-eyebrow">负责人操作</span><h2>{room.round ? '下一题，谁来当汤主？' : '先选一位汤主'}</h2>
    <p className="soup-muted">选择准备了题目、知道答案的人。其他成员负责猜题，不用提前出题。</p>
    <label className="soup-field">本题汤主<select value={host?.id ?? ''} onChange={e => setSelected(e.target.value)} disabled={busy}><option value="">请选择一位成员</option>{candidates.map(player => <option key={player.id} value={player.id}>{player.name}{player.id === room.ownerId ? '（负责人）' : ''}</option>)}</select></label>
    <button className="soup-primary" disabled={busy || candidates.length < SOUP_MIN_PLAYERS || !host} onClick={() => host && onStart(host.id)}>{busy ? '正在开始…' : host ? `让 ${host.name} 准备题目` : '选好汤主后开始'}</button>
    <p className="soup-muted">{candidates.length < SOUP_MIN_PLAYERS ? `还需要 ${SOUP_MIN_PLAYERS - candidates.length} 位成员加入。` : host ? `确认后只有 ${host.name} 录题；汤面发布前，其他人看不到答案。` : '每题都由你指定，也可以让同一人继续出题。'}</p>
  </section>;
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
      setNotice('题材包已填入。检查后点击“发布谜面，开始提问”；未发布提示只保留在本机汤主工作区。');
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
  const roleText = isHost ? '你是汤主 · 出题并回答' : room?.status === 'lobby' ? isOwner ? '你是负责人 · 邀请成员并指定汤主' : '等待负责人指定汤主' : '你是侦探 · 提问并还原故事';
  const openGuide = () => { if (activeSheet !== 'guide') returnSheet.current = activeSheet; setActiveSheet('guide'); };
  const leaveView = () => { window.localStorage.removeItem('soup-active-remote'); setRoom(null); setPlayerId(''); setPrivateRound(null); setActiveSheet('play'); setNotice('已返回入口，可用原房间编号重新加入。'); };
  const copyInvite = async () => { if (!room) return; const invite = new URL(window.location.href); invite.search = ''; invite.searchParams.set('room', room.code); try { await navigator.clipboard.writeText(invite.toString()); setNotice('邀请链接已复制，发给一起玩的成员即可。'); } catch { setNotice(`请复制地址栏链接，或把房间编号 ${room.code} 发给成员。`, 'error'); } };
  const startWithHost = (hostId: string) => void apply(room?.status === 'lobby' ? 'start_soup_game' : 'next_soup_round', { hostId });
  const picture = (url: string | null | undefined, title: string, isPrivate = false) => {
    const safe = safeImageUrl(url); if (!safe) return null;
    const open = imageView?.url === safe && imageView.scope === kitScope && (!isPrivate || secretVisible);
    return <div className="soup-picture"><button aria-expanded={open} onClick={() => setImageView(open ? null : { url: safe, title, private: isPrivate, scope: kitScope })}>{open ? `收起${title}` : `查看${title}`}</button>{open && <figure><Image unoptimized src={safe} alt={title} width={1600} height={1000} />{!isPrivate && <a href={safe} target="_blank" rel="noreferrer">打开原图，放大看细节</a>}</figure>}</div>;
  };
  const imageInput = (kind: 'surface' | 'bottom' | 'note', label: string) => <div className="soup-image-input">
    <label className="soup-upload">{uploadingImage === kind ? '图片上传中…' : `上传${label}`}<input aria-label={`上传${label}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || Boolean(uploadingImage)} onChange={e => { void uploadImage(e.target.files?.[0], kind); e.currentTarget.value = ''; }} /></label>
    {(kind === 'note' ? publicImageUrl : kind === 'surface' ? caseForm.surfaceImageUrl : caseForm.bottomImageUrl) && <span className="soup-muted">已添加图片</span>}
    <details><summary>已有图片链接</summary><input aria-label={`${label}链接`} placeholder="https://…" value={kind === 'note' ? publicImageUrl : kind === 'surface' ? caseForm.surfaceImageUrl : caseForm.bottomImageUrl} onChange={e => kind === 'note' ? setPublicImageUrl(e.target.value) : setCaseForm(value => ({ ...value, [kind === 'surface' ? 'surfaceImageUrl' : 'bottomImageUrl']: e.target.value }))} /></details>
  </div>;
  const roster = room && <ul className="soup-roster">{room.players.map(player => <li key={player.id}><span><b>{player.name}</b>{player.id === playerId && '（你）'}</span><span className="soup-muted">{player.id === room.hostId && room.status !== 'lobby' ? '本题汤主' : player.id === room.ownerId ? '负责人' : '成员'}{(!player.alive || player.away) && ' · 暂不参与'}</span></li>)}</ul>;
  const guide = <section className="soup-card soup-guide"><span className="soup-eyebrow">第一次玩，先看这三件事</span><h1>一起还原一个反常的故事</h1><ol><li><strong>一人知道答案，其他人猜。</strong>负责人先指定汤主。只有汤主需要准备题目和答案，随后发布谜面。</li><li><strong>提能用“是／否”回答的问题。</strong>例如：“事情发生在同一天吗？”每人最多 1 条未回答内容，汤主按提交顺序回答。提交满 10 秒且已回答后，才能再次提交。</li><li><strong>想通了，就提交完整还原。</strong>解释关键事实和因果关系。汤主判定成功后，大家一起看答案和结局图。</li></ol><details><summary>次数、提示和图片的规则</summary><p>默认 20 个有效问题。“请换个问法”不计次数，其他问题判定计数。问题上限且队列清空后，汤主可延长一次 5 问或直接揭晓。</p><p>线索由汤主决定何时公开；没有自动发放。图片仅在点击后加载。完整答案、判定资料和待发线索仅汤主可见；Esc、切换页面或失焦后隐藏。</p><p>每题都可以重新指定汤主，也可以由同一人继续出题。负责人管理房间，汤主负责当前题目，两者可以是同一个人。</p></details><button onClick={() => setActiveSheet(returnSheet.current)}>返回刚才的页面</button></section>;
  const history = <section className="soup-card"><span className="soup-eyebrow">已确认的信息都在这里</span><h1>问答记录</h1>{room?.records.length ? <ol className="soup-history">{room.records.map(record => <li key={record.sequence}><div><span className="soup-muted">{record.sequence} · {record.playerName} · {record.type === 'solution' ? '完整还原' : record.type === 'hint' ? '公开线索' : '问题'}</span><strong>{record.verdict ? soupVerdictLabel(record.verdict) : '已公开'}</strong></div><p>{record.content}</p>{record.note && <p className="soup-muted">汤主补充：{record.note}</p>}</li>)}</ol> : <p className="soup-muted">还没有问答。大家开始提问后，回答会按顺序保存在这里。</p>}<button onClick={() => setActiveSheet('play')}>返回当前题目</button></section>;
  const entry = <><section className="soup-intro"><span className="soup-eyebrow">2–10 人 · 一人出题，大家猜</span><h1>先和朋友进同一个房间</h1><p>拿到邀请就加入；想组织一局就创建。进房后再指定汤主，不用每个人都准备题目。</p></section><div className="soup-two-columns">
    <form className="soup-card" onSubmit={e => { e.preventDefault(); void joinRemote(); }}><h2>我有房间编号</h2><label className="soup-field">你的称呼<input value={joinName} maxLength={24} placeholder="大家怎么称呼你" onChange={e => setJoinName(e.target.value)} autoComplete="nickname" /></label><label className="soup-field">六位房间编号<input value={joinCode} maxLength={6} placeholder="例如 ABC234" onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></label><button className="soup-primary" disabled={busy || !joinName.trim() || joinCode.length !== 6}>加入房间</button></form>
    <form className="soup-card" onSubmit={e => { e.preventDefault(); void createRemote(); }}><h2>我来组织一局</h2><p className="soup-muted">创建后把邀请链接发给朋友。你可以自己当汤主，也可以指定别人。</p><label className="soup-field">你的称呼<input value={ownerName} maxLength={24} placeholder="填写你的称呼" onChange={e => setOwnerName(e.target.value)} autoComplete="nickname" /></label><button disabled={busy || !ownerName.trim()}>创建房间</button></form>
  </div><p className="soup-entry-help">还不懂怎么玩？ <button className="soup-text-button" onClick={openGuide}>看 30 秒玩法说明</button></p></>;
  const lobby = room && <div className="soup-two-columns"><section className="soup-card"><span className="soup-eyebrow">房间 {room.code}</span><h1>等朋友到齐</h1><p>已有 {room.players.length} 人加入，至少 {SOUP_MIN_PLAYERS} 人就能玩。</p>{roster}<button onClick={copyInvite}>复制邀请链接</button></section>{isOwner ? <SoupHostPicker key={`host:${room.round}`} room={room} busy={busy} onStart={startWithHost} /> : <section className="soup-card"><h2>等待负责人指定汤主</h2><p>如果你准备了题目，告诉负责人选你。否则，等汤主发布谜面就可以开始猜。</p><p className="soup-muted">猜题时只会看到谜面与公开线索，答案由汤主保管。</p></section>}</div>;
  const preparation = room && (isHost ? <section className="soup-card soup-preparation" aria-label="准备题目"><span className="soup-eyebrow">你是本题汤主 · 只有你能看到这里</span><h1>准备一道题，大家就能开始猜</h1><p className="soup-muted">谜面会公开给大家；答案与判定资料会保持私密。</p>
    <div className="soup-segment" aria-label="题目来源"><button aria-pressed={caseInputMode === 'import'} onClick={() => setCaseInputMode('import')}>我有题材包</button><button aria-pressed={caseInputMode === 'manual'} onClick={() => setCaseInputMode('manual')}>我自己写题</button></div>
    {caseInputMode === 'import' && <div className="soup-import-box"><label className="soup-upload">选择海龟汤题材包<input type="file" aria-label="选择海龟汤题材包" accept=".json,application/json" disabled={busy || Boolean(uploadingImage)} onChange={e => { void readKit(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label><p className="soup-muted">选择含题目与图片的 JSON 文件，一次填好所有材料。不公开包内答案。</p>{pendingImport && <div><strong>《{pendingImport.title}》</strong><p>{Object.keys(pendingImport.images).length} 张图片 · {pendingImport.stages.length} 条阶段提示。将替换当前草稿并上传图片。</p><div className="soup-actions"><button disabled={busy || Boolean(uploadingImage)} onClick={() => void importKit()}>{kitProgress || '确认上传并填入草稿'}</button><button disabled={busy} onClick={() => setPendingKit(null)}>取消导入</button></div></div>}{preparedKit && !pendingImport && <p className="soup-ready">已载入《{preparedKit.title}》。阶段提示会在开局后保留给你逐条发布。</p>}</div>}
    {caseInputMode === 'import' && caseForm.surface && <section className="soup-surface-preview"><h2>大家将看到的谜面</h2><p className="soup-story">{caseForm.surface}</p><button aria-expanded={editImported} onClick={() => setEditImported(value => !value)}>{editImported ? '收起编辑' : '检查或修改题目与答案'}</button></section>}
    {(caseInputMode === 'manual' || editImported) && <div className="soup-two-columns soup-case-editor"><div><label className="soup-field">谜面（公开，必填）<textarea value={caseForm.surface} maxLength={600} placeholder="所有人首先看到的谜面" onChange={e => setCaseForm(value => ({ ...value, surface: e.target.value }))} /></label>{imageInput('surface', '汤面图片')}</div><div><label className="soup-field">完整答案（仅你可见，必填）<textarea value={caseForm.bottom} maxLength={2000} placeholder="写清完整事实、因果与反转" onChange={e => setCaseForm(value => ({ ...value, bottom: e.target.value }))} /></label>{imageInput('bottom', '结局图片')}</div><details className="soup-full-width"><summary>补充判定资料（可不填）</summary><label className="soup-field">关键事实<textarea value={caseForm.keyFacts} maxLength={1000} placeholder="哪些关键点必须猜到" onChange={e => setCaseForm(value => ({ ...value, keyFacts: e.target.value }))} /></label><label className="soup-field">判定边界<textarea value={caseForm.boundary} maxLength={1000} placeholder="哪些说法可接受，哪些只算差一点" onChange={e => setCaseForm(value => ({ ...value, boundary: e.target.value }))} /></label></details></div>}
    <div className="soup-publish-row"><button className="soup-primary" disabled={busy || Boolean(uploadingImage) || !caseForm.surface.trim() || !caseForm.bottom.trim()} onClick={() => void submitCase()}>{busy ? '请稍候…' : '发布谜面，开始提问'}</button><span className="soup-muted">{caseForm.surface.trim() && caseForm.bottom.trim() ? '只公开谜面；完整答案直到揭晓才公开。' : '需要先填好谜面和完整答案。'}</span></div>
  </section> : <section className="soup-card soup-waiting"><span className="soup-eyebrow">题目准备中</span><h1>{room.hostName} 正在准备题目</h1><p>准备完成后，这里会自动出现谜面。你不用切换页面。</p><div className="soup-tip"><strong>等会儿你只需做两件事</strong><p>先提是非问题，逐步排除可能；想通以后，提交一段完整还原。</p><p className="soup-muted">例如：“他知道这件事吗？”比“到底发生了什么？”更适合提问。</p></div></section>);
  const surface = room && <section className="soup-card"><span className="soup-eyebrow">第 {room.round} 题 · 汤主 {room.hostName}</span><h2>当前谜面</h2><p className="soup-story">{room.surface}</p>{picture(room.surfaceImageUrl, '汤面图片')}</section>;
  const evidence = <section className="soup-card"><h2>公开线索 <span className="soup-count">{publicPosts.length}</span></h2>{publicPosts.length ? publicPosts.map((post, index) => <article className="soup-evidence" key={post.id}><strong>{post.kind === 'hint' ? '提示' : '证据'} {index + 1}</strong>{post.text && <p className="soup-story">{post.text}</p>}{picture(post.imageUrl, `线索图片 ${index + 1}`)}</article>) : <p className="soup-muted">暂时没有补充线索。先从谜面提问，汤主会在需要时给出提示。</p>}</section>;
  const detectiveComposer = room && <section className="soup-card" aria-label="提问与还原"><h2>下一步，轮到你推理</h2><div className="soup-segment" aria-label="提交类型"><button aria-pressed={composer === 'question'} onClick={() => setComposer('question')}>提一个问题</button><button aria-pressed={composer === 'solution'} onClick={() => setComposer('solution')}>我想提交答案</button></div><label className="soup-field">{composer === 'question' ? '写一个能用“是／否”回答的问题' : '把关键事实与因果关系连起来'}<textarea value={composer === 'question' ? questionDraft : solutionDraft} maxLength={240} disabled={!draftEditable} placeholder={composer === 'question' ? '例如：他们当时在同一个地方吗？' : '我认为完整的故事是……'} onChange={e => composer === 'question' ? draftController.current?.update(e.target.value) : draftController.current?.updateSolution(e.target.value)} /></label><div className="soup-compose-status"><span className="soup-muted">{(composer === 'question' ? questionDraft : solutionDraft).length}/240 字 · {draftState === 'saved' ? '草稿已保存' : draftState === 'saving' ? '保存中' : draftState === 'error' ? '草稿保留在本机' : '草稿'}</span><button className="soup-primary" disabled={busy || !canQueue || !(composer === 'question' ? questionDraft : solutionDraft).trim()} onClick={() => void submitQueue(composer)}>{myQueuePosition ? '已加入队列' : composer === 'question' ? '提交问题' : '提交完整还原'}</button></div>
    {myPending && <div className="soup-question-focus"><span className="soup-muted">你已提交的{myPending.type === 'question' ? '问题' : '完整还原'}</span><p>{myPending.content}</p></div>}
    <p className="soup-queue-status" role="status">{myQueuePosition ? myQueuePosition === 1 ? '你的内容在队首，等待汤主回答。回答会出现在下方。' : `你的内容已提交，前面还有 ${myQueuePosition - 1} 条。可以继续思考，回答后再提交。` : room.status === 'limit_reached' ? '问题额度已用完，等待汤主延长或揭晓。' : cooldownSeconds ? `上一条已回答，再过 ${cooldownSeconds} 秒可以提交。` : queue.length ? `目前有 ${queue.length} 条待回答，你可以加入队列。` : '现在可以提交。每人最多保留一条未回答内容。'}</p>
  </section>;
  const recentAnswers = room && <section className="soup-card"><div className="soup-section-heading"><h2>刚刚确认了什么</h2><button onClick={() => setActiveSheet('history')}>全部问答</button></div>{room.records.filter(record => record.type === 'question' || record.type === 'solution').length ? <ol className="soup-history">{room.records.filter(record => record.type === 'question' || record.type === 'solution').slice(-3).reverse().map(record => <li key={record.sequence}><div><span>{record.playerName}</span><strong>{soupVerdictLabel(record.verdict)}</strong></div><p>{record.content}</p>{record.note && <p className="soup-muted">{record.note}</p>}</li>)}</ol> : <p className="soup-muted">汤主回答后，这里会显示最近的问答。</p>}</section>;
  const hostJudge = room && <section className="soup-card" aria-label="回答队首"><span className="soup-eyebrow">汤主操作 · {room.effectiveQuestionCount}/{room.maxQuestions} 个有效问题</span><h1>{head ? '回答这一条，就能继续推进' : room.status === 'limit_reached' ? '本题已达到问题上限' : room.records.length ? '等待侦探继续提问' : '等侦探提出第一个问题'}</h1>{head ? <><div className="soup-question-focus"><span className="soup-muted">{head.playerName} · {head.type === 'question' ? '问题' : '完整还原'}</span><p>{head.content}</p></div><div className="soup-verdicts">{(head.type === 'question' ? ['yes', 'no', 'irrelevant', 'partial', 'rephrase'] : ['success', 'close', 'wrong']).map(verdict => <button className={verdict === 'success' ? 'soup-primary' : ''} key={verdict} data-verdict={verdict} disabled={busy} onClick={judge}>{verdict === 'success' ? '还原成功，揭晓答案' : soupVerdictLabel(verdict as SoupQuestionVerdict | SoupSolutionVerdict)}</button>)}</div><details className="soup-optional"><summary>需要给这条回答补充一句话</summary><input aria-label="本条回答补充说明" value={judgeNote} maxLength={160} placeholder="例如：前半句正确，请把后半句拆开问" onChange={e => setJudgeNote(e.target.value)} /></details><p className="soup-muted">{head.type === 'question' ? '遇到开放式问题或多个问题混在一起，选“请换个问法”，不占问题次数。' : '判“还原成功”后，本题结束，答案与结局图对所有人公开。'}</p></> : <p className="soup-muted">{room.status === 'limit_reached' ? '队列已经处理完。可以延长一次 5 问，或直接揭晓答案。' : '无需切页。新问题会自动出现在这里；你也可以在下方查看私密资料或发布线索。'}</p>}{queue.length > 1 && <details className="soup-optional"><summary>后面还有 {queue.length - 1} 条等待回答</summary><ol>{queue.slice(1).map(item => <li key={item.id}>{item.playerName}：{item.content}</li>)}</ol></details>}{room.status === 'limit_reached' && !room.extended && <button className="soup-primary" disabled={busy} onClick={() => void apply('extend_soup_limit')}>再给大家 5 个问题</button>}<details className="soup-optional"><summary>大家想结束这道题</summary><button disabled={busy} onClick={() => setConfirmation('reveal_soup_bottom')}>提前揭晓答案</button></details></section>;
  const hostReference = <section className="soup-card" aria-label="汤主私密资料"><div className="soup-section-heading"><div><span className="soup-eyebrow">仅汤主可见</span><h2>答案与待发线索</h2></div><button aria-expanded={secretVisible} disabled={!privateRound} onClick={() => secretVisible ? privacy.current?.mask() : privacy.current?.reveal()}>{secretVisible ? '隐藏私密资料' : '查看私密资料'}</button></div>{!secretVisible ? <p className="soup-muted">需要判定或给提示时再展开。Esc、切页或失焦后自动收起。</p> : <div className="soup-private-content">
    <details><summary>完整答案与判定口径</summary><p className="soup-story">{privateRound?.bottom}</p>{privateRound?.keyFacts.length ? <ul>{privateRound.keyFacts.map((fact, i) => <li key={i}>{fact}</li>)}</ul> : null}<p className="soup-story">{privateRound?.boundary}</p>{picture(privateRound?.bottomImageUrl, '汤底参考图片', true)}</details>
    {preparedKit && kitMatchesCase && <div className="soup-stage-preview"><h3>下一条待发线索</h3>{nextStage ? <><p className="soup-muted">{preparedKit.stages.filter(stage => kitStagePublished(stage, publicPosts)).length}/{preparedKit.stages.length} 条已公开 · 建议第 {nextStage.afterQuestions} 问后或卡住时发放</p><strong>{nextStage.title}</strong><p className="soup-story">{nextStage.text}</p>{picture(nextStage.imageUrl, '待发证据图片', true)}<button disabled={busy} onClick={() => void publishStage(nextStage)}>把这条线索公开给所有人</button></> : <p>题材包中的线索已全部公开。</p>}</div>}
    {preparedKit && !kitMatchesCase && <p className="soup-muted">题目已修改，题材包提示暂停自动匹配。请核对后在下方手动发布。</p>}
    <details className="soup-optional"><summary>{preparedKit ? '另外补充一条线索' : '给大家一条提示或证据'}</summary><label className="soup-field">要公开的内容<textarea value={publicText} maxLength={600} placeholder="只填写现在准备公开的信息" onChange={e => setPublicText(e.target.value)} /></label><label className="soup-field">类型<select value={publicKind} onChange={e => setPublicKind(e.target.value as 'hint' | 'evidence')}><option value="hint">提示</option><option value="evidence">证据</option></select></label>{imageInput('note', '线索图片')}<button disabled={busy || Boolean(uploadingImage) || (!publicText.trim() && !publicImageUrl.trim())} onClick={() => void publishPost()}>公开这条线索</button><p className="soup-muted">公开后所有成员都能看到，不能撤回。</p></details>
  </div>}</section>;
  const play = <div className="soup-play-layout"><div className="soup-stack">{isHost ? <>{hostJudge}{hostReference}<details className="soup-card"><summary>查看侦探看到的谜面</summary>{surface}</details></> : <>{surface}{detectiveComposer}</>}{recentAnswers}</div><aside className="soup-stack" aria-label="本题公开资料">{evidence}<details className="soup-card"><summary>本题成员与职责</summary>{roster}</details></aside></div>;
  const result = room && <div className="soup-stack"><section className="soup-card"><span className="soup-eyebrow">第 {room.round} 题 · 已揭晓</span><h1>{room.result?.success ? `${room.result.solverName} 还原成功！` : room.revealedBottom ? '一起看看完整的故事' : '本局已结束'}</h1>{room.revealedBottom ? <><p className="soup-story">{room.revealedBottom}</p>{picture(room.revealedBottomImageUrl, '结局图片')}<p className="soup-muted">本题用了 {room.effectiveQuestionCount} 个有效问题 · 公开了 {publicPosts.length} 条线索</p><button onClick={() => setActiveSheet('history')}>回看推理过程</button></> : <p>汤主还没有提交题目，本局已结束。</p>}</section>{room.status === 'round_result' && (isOwner ? <SoupHostPicker key={`next:${room.round}`} room={room} busy={busy} onStart={startWithHost} /> : <section className="soup-card"><h2>等负责人安排下一题</h2><p className="soup-muted">你准备了新题目，可以告诉负责人选你当汤主。</p></section>)}</div>;

  return <main className="sheet-app workbook-unified soup-sheet soup-v13">
    <header className="sheet-titlebar"><span className="sheet-filemark" aria-hidden="true">表</span><div><strong>协作工作簿 · A5</strong><span>{room ? `房间 ${room.code} · ${statusLabels[room.status]}` : '汤底侦探'}</span></div><div className="sheet-title-actions"><a href="../">目录</a>{room && <button onClick={copyInvite}>邀请成员</button>}<ReleaseNotificationButton open={notificationOpen} onToggle={() => setNotificationOpen(value => !value)} /></div></header>
    {room && <div className="soup-progress-bar"><ol aria-label="本题流程">{['指定汤主', '准备题目', '提问还原', '揭晓答案'].map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined} className={index < step ? 'is-complete' : ''}><span>{index + 1}</span>{title}</li>)}</ol><p>{myName} · {roleText}</p></div>}
    <div className="sheet-workspace"><div className="soup-flow-scroll"><div className="soup-flow-content">
      {confirmation && <section className="soup-confirmation" role="alert"><h2>{confirmation === 'end_soup_game' ? '结束整个房间的游戏？' : '现在向所有人揭晓答案？'}</h2><p>{confirmation === 'end_soup_game' ? '当前队列会清空，所有人停止提问；已提交的答案会公开。' : '当前题目会结束，未回答的内容会清空。'}</p><div className="soup-actions"><button className="soup-primary" disabled={busy} onClick={() => { void apply(confirmation).then(next => { if (next) setConfirmation(null); }); }}>确认{confirmation === 'end_soup_game' ? '结束' : '揭晓'}</button><button disabled={busy} onClick={() => setConfirmation(null)}>继续玩</button></div></section>}
      {draftEditable && (draftState === 'error' || draftState === 'conflict') && <section className="soup-confirmation"><p>{draftState === 'error' ? '草稿暂未同步，文字仍保留。' : '另一个窗口保存过草稿，请选择要保留的版本。'}</p>{draftState === 'error' ? <button onClick={() => void draftController.current?.flush()}>重试保存</button> : <div className="soup-actions"><button onClick={() => draftController.current?.resolveConflict(true)}>保留当前文字</button><button onClick={() => draftController.current?.resolveConflict(false)}>采用已同步草稿</button></div>}</section>}
      {activeSheet === 'guide' ? guide : activeSheet === 'history' ? history : !room ? entry : room.status === 'lobby' ? lobby : room.status === 'host_preparing' ? preparation : hasResult ? result : isPlaying ? play : <section className="soup-card"><h1>{statusLabels[room.status]}</h1><p>等待房间状态同步。</p></section>}
      {room && activeSheet === 'play' && <details className="soup-room-actions"><summary>房间操作</summary><div className="soup-actions"><button onClick={leaveView}>返回入口</button>{isOwner && !['lobby','finished'].includes(room.status) && <button disabled={busy} onClick={() => setConfirmation('end_soup_game')}>结束整个房间</button>}</div></details>}
    </div></div><ReleaseNotificationPanel open={notificationOpen} onClose={() => setNotificationOpen(false)} /></div>
    <WorkbookFeedback note={null} onClose={() => {}} status={notice} kind={noticeKind} />
    <footer className="sheet-tabs">{sheets.map(([id, label]) => <button key={id} disabled={!room && id === 'history'} className={activeSheet === id ? 'is-current' : ''} aria-current={activeSheet === id ? 'page' : undefined} onClick={() => id === 'guide' ? openGuide() : setActiveSheet(id)}>{label}</button>)}<span /><small>图片仅在点击后加载</small></footer>
  </main>;
}
