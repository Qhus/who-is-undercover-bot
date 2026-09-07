import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Compile the actual TSX in memory for server-render smoke tests. No browser/storage/network mocks
// are installed in the application; CloudBase calls fail immediately if a render attempts one.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const modules = new Map<string, Record<string, unknown>>();
function loadUi(path: string): Record<string, unknown> {
  const filename = resolve(root, path);
  const cached = modules.get(filename);
  if (cached) return cached;
  const exports: Record<string, unknown> = {};
  modules.set(filename, exports);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (id: string): unknown => {
    if (id === '@/lib/cloudbase-store') return { getCloudStore: () => { throw Error('UI render must not access CloudBase'); } };
    if (!id.startsWith('.') && !id.startsWith('@/')) return require(id);
    const target = id.startsWith('@/') ? resolve(root, id.slice(2)) : resolve(dirname(filename), id);
    if (/\.tsx?$/.test(target)) return loadUi(target);
    for (const ext of ['.tsx', '.ts']) {
      try { readFileSync(target + ext); } catch { continue; }
      return loadUi(target + ext);
    }
    throw Error('Missing UI dependency: ' + id);
  };
  new Function('require', 'exports', compiled)(localRequire, exports);
  return exports;
}
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');
const render = (file: string, props: Record<string, unknown> = {}, name = 'default') =>
  renderToStaticMarkup(createElement(loadUi(file)[name] as ComponentType<Record<string, unknown>>, props));
const a2Props = { screen: 'home', room: null, remoteMode: false, cloudReady: false, ownerName: '', joinName: '', joinCode: '' };
const pages = [
  ['app/game-hub.tsx', '目录', {}],
  ['app/spreadsheet-mode.tsx', 'A2', a2Props],
  ['app/clue-spreadsheet-mode.tsx', 'A3', {}],
  ['app/court-spreadsheet-mode.tsx', 'A4', {}],
  ['app/soup-spreadsheet-mode.tsx', 'A5', {}],
] as const;

test('five actual UI components render neutral headings, a grid and in-flow status', () => {
  for (const [path, id, props] of pages) {
    const html = render(path, props);
    assert.match(html, new RegExp('协作工作簿 · ' + id));
    assert.match(html, /<colgroup>/);
    assert.match(html, /class="workbook-status workbook-status--info" role="status"/);
    assert.doesNotMatch(html, /sheet-toast|sheet-detail-popover|sheet-toolbar/);
    assert.match(html, /玩法说明/);
  }
});

test('annotations escape content and have explicit close/collapse controls, errors use alert', () => {
  const html = render('app/workbook-feedback.tsx', {
    note: { title: '完整说明', text: '<script>不执行</script>\n第二行' },
    status: '尚未提交，请重试', kind: 'error', onClose: () => {},
  }, 'WorkbookFeedback');
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /aria-label="关闭完整批注"/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /aria-modal|role="dialog"/);
});

test('ordinary status does not implicitly open an annotation', () => {
  const html = render('app/workbook-feedback.tsx', { note: null, status: '草稿已保存', onClose: () => {} }, 'WorkbookFeedback');
  assert.match(html, /草稿已保存/);
  assert.doesNotMatch(html, /class="workbook-note"/);
});

test('each toolbar button has a handler or is explicitly disabled', () => {
  for (const [path] of pages) {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node, inToolbar = false) => {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement;
        const attrs = tag.attributes.properties.filter(ts.isJsxAttribute);
        const isToolbar = attrs.some((attr) => attr.name.getText(source) === 'className' && attr.initializer?.getText(source) === '"sheet-ribbon"');
        const toolbar = inToolbar || isToolbar;
        if (toolbar && tag.tagName.getText(source) === 'button') {
          assert.ok(attrs.some((attr) => ['onClick', 'disabled'].includes(attr.name.getText(source))), path + ': inert toolbar button');
        }
        ts.forEachChild(node, (child) => visit(child, toolbar));
      } else ts.forEachChild(node, (child) => visit(child, inToolbar));
    };
    visit(source);
  }
});

test('help navigation remembers the originating worksheet on every page', () => {
  for (const path of ['app/game-hub.tsx', 'app/clue-spreadsheet-mode.tsx', 'app/court-spreadsheet-mode.tsx', 'app/soup-spreadsheet-mode.tsx']) {
    assert.match(read(path), /return(?:Tab|Sheet)/);
    assert.match(read(path), /返回原工作表/);
  }
  assert.match(read('app/spreadsheet-mode.tsx'), /setSheetTab\(returnSheetTab === 'guide' \? 'members' : returnSheetTab\)/);
});

test('private cells and drafts are not automatic annotation sources', () => {
  const feedback = read('app/workbook-feedback.tsx');
  assert.doesNotMatch(feedback, /querySelector|innerHTML|textContent|localStorage|privateRound|targetWord|draftText/);
  assert.match(feedback, /state.scope !== scope\) setState\(\{ scope, note: null \}\)/);
  const a2 = read('app/spreadsheet-mode.tsx');
  const formula = a2.slice(a2.indexOf('const formulaValue'), a2.indexOf('const gameRows'));
  assert.doesNotMatch(formula, /currentAssignment|\.word|blankCardCopy/);
  assert.match(a2, /onNote=\{sheetTab === 'guide' \|\| sheetTab === 'rules' \|\| props.screen !== 'game' \? setDetailHint : undefined\}/);
  assert.match(a2, /round < room.round \|\| isRoundContentVisible\(room, player.id, props.currentPlayerId\)/);
  const soup = read('app/soup-spreadsheet-mode.tsx');
  const hostSheet = soup.slice(soup.indexOf("if (activeSheet === 'host')"), soup.indexOf("if (activeSheet === 'feedback')"));
  assert.doesNotMatch(hostSheet, /WorkbookText|setNote/);
  assert.match(soup, /activeSheet === 'guide' \|\| activeSheet === 'records'/);
});

test('desktop layout keeps feedback in flow and preserves readable long cells', () => {
  const css = read('app/workbook.css');
  assert.doesNotMatch(css, /position:\s*(?:fixed|absolute)/);
  assert.match(css, /min-width:960px/);
  assert.match(css, /white-space:pre-wrap/);
  assert.match(css, /:has\(>.sheet-notification-panel\)/);
  assert.match(css, /outline:2px/);
  assert.match(css, /input\[type="checkbox"\].*width:auto/);
});
