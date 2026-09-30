import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseSoupKit, prepareSoupKit, restorePreparedSoupKit, soupCasePayload, kitStagePublished } from './soup-kit.ts';

const raw = readFileSync(new URL('../docs/soup-kits/extra-person/多出来的人-题材包.json', import.meta.url), 'utf8');
const source = JSON.parse(raw);
test('complete delivered kit respects the actual form limits and contains all three image assets', () => {
  const kit = parseSoupKit(raw);
  assert.equal(Object.keys(kit.images).length, 3);
  assert.equal(kit.stages.length, 3);
  assert.deepEqual(kit.stages.map(s => s.afterQuestions), [5,9,14]);
  assert.ok(kit.surface.length <= 600 && kit.bottom.length <= 2000 && kit.keyFacts.length <= 1000 && kit.boundary.length <= 1000);
});
test('reject missing references, executable image types, disguised images and duplicate stages before uploading', () => {
  for (const change of [
    { surfaceImage: 'missing' },
    { images: { surface: 'data:image/svg+xml;base64,PHN2Zz4=' } },
    { images: { ...source.images, surface: 'data:image/png;base64,PHNjcmlwdD4=' } },
    { stages: [source.stages[0], source.stages[0]] },
    { surface: 'x'.repeat(601) },
    { stages: [{ ...source.stages[0], afterQuestions: 26 }] },
    { stages: [{ ...source.stages[0], afterQuestions: 10 }, { ...source.stages[1], afterQuestions: 3 }] },
  ]) assert.throws(() => parseSoupKit(JSON.stringify({ ...source, ...change })));
});
test('upload failure retains successful images for retry and keeps the unopened evidence out of the case payload', async () => {
  const kit = parseSoupKit(raw);
  const uploaded = new Map<string, string>();
  const calls: string[] = [];
  await assert.rejects(prepareSoupKit(kit, async (_, kind) => {
    calls.push(kind);
    if (kind === 'bottom') throw Error('offline');
    return 'https://private.example/surface';
  }, undefined, uploaded), /offline/);
  const prepared = await prepareSoupKit(kit, async (_, kind) => { calls.push(kind); return `https://private.example/${kind}`; }, undefined, uploaded);
  assert.deepEqual(calls, ['surface','bottom','bottom','note']);
  assert.deepEqual(Object.keys(soupCasePayload(prepared.form)).sort(), ['surface','bottom','keyFacts','boundary','surfaceImageUrl','bottomImageUrl'].sort());
  const payload = JSON.stringify(soupCasePayload(prepared.form));
  assert.ok(!payload.includes(kit.stages[1].text));
  assert.ok(!payload.includes('private.example/note'));
  assert.ok(!payload.includes('data:image'));
  assert.deepEqual(restorePreparedSoupKit(JSON.stringify(prepared)), prepared);
});
test('stage publication derives from shared room evidence, so refresh does not publish it twice', async () => {
  const prepared = await prepareSoupKit(parseSoupKit(raw), async (_, kind) => `https://private.example/${kind}`);
  const stage = prepared.stages[1];
  const post = { id: 'e1', kind: stage.kind, text: stage.text, imageUrl: stage.imageUrl, createdAt: 1 };
  assert.equal(kitStagePublished(stage, []), false);
  assert.equal(kitStagePublished(stage, [post]), true);
  assert.equal(kitStagePublished(stage, [{ ...post, imageUrl: 'https://private.example/another' }]), false);
  assert.throws(() => restorePreparedSoupKit(JSON.stringify({ ...prepared, form: { ...prepared.form, bottomImageUrl: 'javascript:alert(1)' } })));
});
