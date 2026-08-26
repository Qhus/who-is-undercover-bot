import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { neutralMessageCopy, neutralizeGameCopy } from './neutral-copy.ts';
import { CURRENT_RELEASE, RELEASE_NOTES } from './release-notes.ts';

test('低干扰通知替换明显游戏术语', () => {
  assert.equal(neutralizeGameCopy('发牌失败，请重新投票'), '个人信息失败，请重新提交选择');
  assert.equal(neutralizeGameCopy('玩家已淘汰，查看游戏记录'), '玩家已本轮退出，查看操作记录');
});

test('群聊与私聊模板使用中性文案', () => {
  assert.equal(neutralMessageCopy.selectionOpen(2), 'Round_02 已开放提交选择。');
  assert.equal(neutralMessageCopy.personalReady(7, 8), '个人信息确认进度：7/8 已完成。');
});

test('个人词语不标注玩家角色，命中卧底时明确提示', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(immersiveSource, /你的身份/);
  assert.doesNotMatch(spreadsheetSource, /查看你的身份和词语/);
  assert.match(immersiveSource, /成功找出卧底/);
  assert.match(spreadsheetSource, /成功找出卧底/);
});

test('表格模式在输入框外完整展示公共规则', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(spreadsheetSource, /sheet-rule-banner/);
  assert.match(spreadsheetSource, /Round_.*公共规则/);
  assert.match(spreadsheetSource, /placeholder="在此填写本轮内容"/);
  assert.doesNotMatch(spreadsheetSource, /placeholder=\{`\$\{getRoundChallenge/);
});

test('首页提供游玩步骤和完整规则入口', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(immersiveSource, /怎么玩？查看完整规则/);
  assert.match(immersiveSource, /游玩步骤与完整规则/);
  assert.match(spreadsheetSource, /玩法与完整规则/);
});

test('Excel 玩法说明保持表格界面并可返回原工作表', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(spreadsheetSource, /sheetTab === 'guide'/);
  assert.match(spreadsheetSource, /返回之前的工作表/);
  assert.match(spreadsheetSource, /返回后恢复：\{tabLabel\(returnSheetTab\)\}/);
  assert.match(spreadsheetSource, /创建房间（房主入口）/);
  assert.match(spreadsheetSource, /加入房间（玩家入口）/);
  assert.match(styles, /sheet-app--guide[\s\S]*white-space:normal/);
  assert.doesNotMatch(styles, /content:\s*"当前"/);
});

test('卧底获胜的结束标题统一为流程已完成', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(immersiveSource, /room\.winner === 'undercover'.*流程已完成/);
  assert.doesNotMatch(spreadsheetSource, /特殊判定成功：特殊成员方获胜/);
});

test('补充体验需求在 Excel 与沉浸模式都有操作入口', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  for (const copy of ['已确认自己的词语', '再次查看自己的词语', '全部提交后公开', '我要爆灯', '暂停自动进入']) {
    assert.match(`${immersiveSource}\n${spreadsheetSource}`, new RegExp(copy));
  }
  assert.match(spreadsheetSource, /本轮描述保持可见/);
  assert.match(spreadsheetSource, /room\.status === 'voting'.*getRoundContents/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /秒后自动开放投票/);
  assert.match(spreadsheetSource, /player\.alive && !player\.away \? getRoundContents\(room\)\[player\.id\].*'无需提交'/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /暂退/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /退出/);
});

test('版本通知由统一数据生成且当前版本始终位于首项', () => {
  assert.equal(CURRENT_RELEASE, RELEASE_NOTES[0]);
  assert.match(CURRENT_RELEASE.version, /^V\d+\.\d+$/);
  assert.equal(new Set(RELEASE_NOTES.map((release) => release.version)).size, RELEASE_NOTES.length);
  assert.ok(RELEASE_NOTES.every((release) => release.details.length >= 3));
});

test('Excel 主界面使用非弹窗通知栏并将沉浸模式降级为兼容视图', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const notificationStyles = styles.slice(styles.indexOf('.sheet-notification-panel'), styles.indexOf('.sheet-tabs'));
  assert.match(spreadsheetSource, /通知 · \{CURRENT_RELEASE\.version\}/);
  assert.match(spreadsheetSource, /sheet-notification-panel/);
  assert.match(spreadsheetSource, /暂不记录已读状态，也不发送推送/);
  assert.match(spreadsheetSource, />兼容视图<\/button>/);
  assert.doesNotMatch(notificationStyles, /position:\s*fixed/);
  assert.doesNotMatch(spreadsheetSource, /aria-modal="true"[^]*sheet-notification-panel/);
});
