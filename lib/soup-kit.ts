import type { SoupManualCaseInput, SoupPublicPost } from './soup-game.ts';

export const SOUP_KIT_MAX_BYTES = 32 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export interface SoupKitStage {
  id: string;
  title: string;
  afterQuestions: number;
  kind: 'hint' | 'evidence';
  text: string;
  image?: string;
}
export interface SoupKit {
  format: 'soup-kit-v1';
  title: string;
  surface: string;
  bottom: string;
  keyFacts: string;
  boundary: string;
  surfaceImage?: string;
  bottomImage?: string;
  images: Record<string, string>;
  stages: SoupKitStage[];
}
export interface PreparedSoupKit {
  title: string;
  form: Required<SoupManualCaseInput>;
  stages: (Omit<SoupKitStage, 'image'> & { imageUrl: string })[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('题材包格式不正确');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) throw new Error(`${name}不能为空且最多 ${max} 字`);
  return value.trim();
}
export function decodeKitImage(data: string): { type: string; bytes: Uint8Array } {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2].length % 4 !== 0 || match[2].length > Math.ceil(IMAGE_MAX_BYTES / 3) * 4) throw new Error('图片必须为内嵌 PNG/JPG/WebP/GIF，单张不超过 5 MB');
  const decoded = atob(match[2]);
  if (!decoded.length || decoded.length > IMAGE_MAX_BYTES) throw new Error('图片大小须在 5 MB 以内');
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  const signatures: Record<string, boolean> = {
    'image/png': [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n),
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/gif': decoded.startsWith('GIF87a') || decoded.startsWith('GIF89a'),
    'image/webp': decoded.startsWith('RIFF') && decoded.slice(8,12) === 'WEBP',
  };
  if (!signatures[match[1]]) throw new Error('图片内容与声明的格式不一致');
  return { type: match[1], bytes };
}
export function parseSoupKit(raw: string): SoupKit {
  if (new TextEncoder().encode(raw).length > SOUP_KIT_MAX_BYTES) throw new Error('题材包不能超过 32 MB');
  const v = object(JSON.parse(raw));
  if (v.format !== 'soup-kit-v1') throw new Error('请选择 soup-kit-v1 格式的题材包');
  const images: Record<string, string> = Object.create(null);
  const entries = Object.entries(object(v.images ?? {}));
  if (entries.length > 6) throw new Error('一个题材包最多包含 6 张图片');
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,48}$/.test(key) || ['__proto__','constructor','prototype'].includes(key)) throw new Error('图片编号无效');
    if (typeof value !== 'string') throw new Error('图片数据无效');
    decodeKitImage(value); images[key] = value;
  }
  const imageRef = (value: unknown) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !Object.hasOwn(images, value)) throw new Error('题材包引用了不存在的图片');
    return value;
  };
  if (!Array.isArray(v.stages) || v.stages.length > 6) throw new Error('阶段提示必须为数组，最多 6 条');
  const stageIds = new Set<string>();
  let lastThreshold = -1;
  const stages: SoupKitStage[] = v.stages.map(value => {
    const stage = object(value);
    const id = text(stage.id, '阶段编号', 48);
    if (stageIds.has(id)) throw new Error('阶段编号不可重复');
    stageIds.add(id);
    if (stage.kind !== 'hint' && stage.kind !== 'evidence') throw new Error('提示类型无效');
    const afterQuestions = stage.afterQuestions;
    if (typeof afterQuestions !== 'number' || !Number.isInteger(afterQuestions) || afterQuestions < 0 || afterQuestions > 25 || afterQuestions < lastThreshold) throw new Error('提示问数须按顺序设置为 0–25 的整数');
    lastThreshold = afterQuestions;
    return { id, title: text(stage.title, '提示标题', 60), afterQuestions, kind: stage.kind, text: text(stage.text, '提示正文', 600), image: imageRef(stage.image) };
  });
  return { format: 'soup-kit-v1', title: text(v.title, '题目名称', 80), surface: text(v.surface, '汤面', 600), bottom: text(v.bottom, '汤底', 2000), keyFacts: text(v.keyFacts, '关键事实', 1000, true), boundary: text(v.boundary, '判定边界', 1000, true), surfaceImage: imageRef(v.surfaceImage), bottomImage: imageRef(v.bottomImage), images, stages };
}

/** Uploads only referenced images. Future clues stay on the host's device until explicitly published. */
export async function prepareSoupKit(kit: SoupKit, upload: (data: string, kind: 'surface' | 'bottom' | 'note') => Promise<string>, progress: (done: number, total: number) => void = () => {}, uploaded = new Map<string, string>()): Promise<PreparedSoupKit> {
  const refs = new Map<string, 'surface' | 'bottom' | 'note'>();
  if (kit.surfaceImage) refs.set(kit.surfaceImage, 'surface');
  if (kit.bottomImage) refs.set(kit.bottomImage, 'bottom');
  for (const stage of kit.stages) if (stage.image && !refs.has(stage.image)) refs.set(stage.image, 'note');
  let done = 0; progress(done, refs.size);
  for (const [ref, kind] of refs) {
    if (!uploaded.has(ref)) uploaded.set(ref, await upload(kit.images[ref], kind));
    progress(++done, refs.size);
  }
  const imageUrl = (ref?: string) => ref ? uploaded.get(ref) ?? '' : '';
  return {
    title: kit.title,
    form: { surface: kit.surface, bottom: kit.bottom, keyFacts: kit.keyFacts, boundary: kit.boundary, surfaceImageUrl: imageUrl(kit.surfaceImage), bottomImageUrl: imageUrl(kit.bottomImage) },
    stages: kit.stages.map(({ image, ...stage }) => ({ ...stage, imageUrl: imageUrl(image) })),
  };
}
export function kitStagePublished(stage: PreparedSoupKit['stages'][number], posts: SoupPublicPost[]) {
  return posts.some(post => post.kind === stage.kind && post.text === stage.text && (post.imageUrl ?? '') === stage.imageUrl);
}
/** Whitelist the server payload: never spread the kit, which contains unreleased hints. */
export function soupCasePayload(form: Required<SoupManualCaseInput>): Record<string, string> {
  return { surface: form.surface, bottom: form.bottom, keyFacts: form.keyFacts, boundary: form.boundary, surfaceImageUrl: form.surfaceImageUrl, bottomImageUrl: form.bottomImageUrl };
}

export function restorePreparedSoupKit(raw: string): PreparedSoupKit {
  const value = object(JSON.parse(raw));
  const form = object(value.form);
  const stages = value.stages;
  if (!Array.isArray(stages)) throw new Error('缓存资料无效');
  const verified = parseSoupKit(JSON.stringify({ ...form, format: 'soup-kit-v1', title: value.title, images: {}, stages: stages.map(value => { const stage = object(value); return { ...stage, image: undefined }; }) }));
  const url = (value: unknown) => {
    if (value === '') return '';
    if (typeof value !== 'string' || value.length > 8000 || !/^https?:\/\//i.test(value)) throw new Error('缓存图片链接无效');
    return value;
  };
  return { title: verified.title, form: { surface: verified.surface, bottom: verified.bottom, keyFacts: verified.keyFacts, boundary: verified.boundary, surfaceImageUrl: url(form.surfaceImageUrl), bottomImageUrl: url(form.bottomImageUrl) }, stages: verified.stages.map((stage, i) => ({ id: stage.id, title: stage.title, kind: stage.kind, text: stage.text, afterQuestions: stage.afterQuestions, imageUrl: url(object(stages[i]).imageUrl) })) };
}
