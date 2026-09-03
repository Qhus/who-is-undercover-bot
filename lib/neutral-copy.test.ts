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

test('表格模式在输入框外和输入提示中同时展示公共规则', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(spreadsheetSource, /sheet-rule-banner/);
  assert.match(spreadsheetSource, /Round_.*公共规则/);
  assert.match(spreadsheetSource, /placeholder="填写本轮描述｜点击查看规则"/);
  assert.match(spreadsheetSource, /sheet-detail-popover/);
  assert.match(spreadsheetSource, /Round_.*完整规则/);
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
  for (const copy of ['已确认自己的词语', '再次查看自己的词语', '全部提交后公开', '我要猜词爆灯', '暂停自动进入']) {
    assert.match(`${immersiveSource}\n${spreadsheetSource}`, new RegExp(copy));
  }
  assert.match(spreadsheetSource, /本轮描述保持可见/);
  assert.match(spreadsheetSource, /room\.status === 'voting'.*getRoundContents/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /秒后自动开放投票/);
  assert.match(spreadsheetSource, /player\.alive && !player\.away \? getRoundContents\(room\)\[player\.id\].*'无需提交'/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /暂退/);
  assert.match(`${immersiveSource}\n${spreadsheetSource}`, /退出/);
});

test('谁是卧底体验增量包含空白牌提示、特殊操作确认和禁用原因', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const gameSource = readFileSync(new URL('./game.ts', import.meta.url), 'utf8');
  assert.match(gameSource, /PLAYER_NAME_MAX_LENGTH = 24/);
  assert.match(gameSource, /AUTO_ADVANCE_DELAY_MS = 7_000/);
  for (const copy of ['范围提示', '操作确认', '我已了解，继续', '输入多数玩家拿到的完整原词', '等待描述公开', '本局机会已使用']) {
    assert.match(`${immersiveSource}\n${spreadsheetSource}\n${gameSource}`, new RegExp(copy));
  }
  assert.match(spreadsheetSource, /specialActivityCopy/);
});

test('Excel 词语查看只占用 D 列且平民指认是表格内二次确认', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(spreadsheetSource, />···<\/button>/);
  assert.match(spreadsheetSource, /props\.wordReviewPlayer\?\.id === player\.id/);
  assert.match(spreadsheetSource, /reviewingThisPlayer \? reviewCopy : '复看词牌'/);
  assert.doesNotMatch(spreadsheetSource, /sheet-private-review/);
  assert.doesNotMatch(styles, /sheet-private-review/);
  assert.match(spreadsheetSource, /发起人/);
  assert.match(spreadsheetSource, /最终操作/);
  assert.match(spreadsheetSource, /确认指认/);
  assert.match(spreadsheetSource, /取消/);
});

test('版本通知由统一数据生成且当前版本始终位于首项', () => {
  assert.equal(CURRENT_RELEASE, RELEASE_NOTES[0]);
  assert.match(CURRENT_RELEASE.version, /^V\d+\.\d+(?:\.\d+)?$/);
  assert.equal(new Set(RELEASE_NOTES.map((release) => release.version)).size, RELEASE_NOTES.length);
  assert.ok(RELEASE_NOTES.every((release) => release.details.length >= 3));
});

test('目录和四个游戏页面共用非弹窗通知栏，谁是卧底将沉浸模式降级为兼容视图', () => {
  const hubSource = readFileSync(new URL('../app/game-hub.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const clueSource = readFileSync(new URL('../app/clue-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const courtSource = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const soupSource = readFileSync(new URL('../app/soup-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const notificationSource = readFileSync(new URL('../app/release-notification.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const notificationStyles = styles.slice(styles.indexOf('.sheet-notification-panel'), styles.indexOf('.sheet-tabs'));
  for (const source of [hubSource, spreadsheetSource, clueSource, courtSource, soupSource]) {
    assert.match(source, /ReleaseNotificationButton/);
    assert.match(source, /ReleaseNotificationPanel/);
  }
  assert.match(notificationSource, /通知 · \{CURRENT_RELEASE\.version\}/);
  assert.match(notificationSource, /release-notification-panel/);
  assert.match(notificationSource, /暂不记录已读状态，也不发送推送/);
  assert.match(spreadsheetSource, />兼容视图<\/button>/);
  assert.match(spreadsheetSource, /'当前流程'/);
  assert.match(spreadsheetSource, /'本局设置'/);
  assert.match(spreadsheetSource, /'轮次记录'/);
  assert.doesNotMatch(spreadsheetSource, /sheet-flow-guide/);
  assert.doesNotMatch(spreadsheetSource, /className="sheet-toolbar"/);
  assert.doesNotMatch(notificationStyles, /position:\s*fixed/);
  assert.doesNotMatch(notificationSource, /aria-modal="true"/);
});

test('四项游戏使用独立页面和独立入口', () => {
  const rootPage = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const hubPage = readFileSync(new URL('../app/game-hub.tsx', import.meta.url), 'utf8');
  const undercoverPage = readFileSync(new URL('../app/undercover/page.tsx', import.meta.url), 'utf8');
  const undercoverSheet = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const courtPage = readFileSync(new URL('../app/court/page.tsx', import.meta.url), 'utf8');
  const courtApp = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const cluePage = readFileSync(new URL('../app/clue/page.tsx', import.meta.url), 'utf8');
  const clueApp = readFileSync(new URL('../app/clue-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const soupPage = readFileSync(new URL('../app/soup/page.tsx', import.meta.url), 'utf8');
  const soupApp = readFileSync(new URL('../app/soup-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(rootPage, /GameHub/);
  assert.match(hubPage, /\['A2', '3–10 人'/);
  assert.match(hubPage, /\['A3', '2–8 人'/);
  assert.match(hubPage, /\['A4', '2–8 人'/);
  assert.match(hubPage, /\['A5', '3–10 人'/);
  assert.match(hubPage, /'摘要'/);
  assert.doesNotMatch(hubPage, /A2 · 谁是卧底|A4 · 离谱法堂|>谁是卧底<|>离谱法堂</);
  assert.match(hubPage, /\.\/undercover\//);
  assert.match(hubPage, /\.\/clue\//);
  assert.match(hubPage, /\.\/court\//);
  assert.match(hubPage, /\.\/soup\//);
  assert.match(undercoverPage, /GameApp/);
  assert.doesNotMatch(undercoverSheet, /离谱法堂|情况说明表（实验）/);
  assert.match(courtPage, /CourtSpreadsheetMode/);
  assert.match(courtApp, /创建离谱法堂/);
  assert.match(courtApp, /加入离谱法堂/);
  assert.match(courtApp, /不是找卧底，是分别选出最会狡辩和最像真的答案/);
  assert.doesNotMatch(courtApp, /demo-b|demo-c|创建本机演示/);
  assert.match(cluePage, /ClueSpreadsheetMode/);
  assert.match(clueApp, /获奖联想机制改编/);
  assert.match(clueApp, /相同内容仍按不同成员分别记录/);
  assert.match(clueApp, /最多尝试 3 次/);
  assert.match(soupPage, /SoupSpreadsheetMode/);
  assert.match(soupApp, /提交问题/);
  assert.match(soupApp, /提交还原/);
  assert.match(soupApp, /跳过本轮/);
  assert.match(soupApp, /我已看懂/);
});

test('四个游戏都支持返回目录和带房间编号的邀请链接', () => {
  const undercoverApp = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const undercoverSheet = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const courtApp = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const clueApp = readFileSync(new URL('../app/clue-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  const soupApp = readFileSync(new URL('../app/soup-spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(undercoverSheet, /返回摸鱼游戏工作台/);
  assert.match(courtApp, /返回摸鱼游戏工作台/);
  assert.match(clueApp, /返回摸鱼游戏工作台/);
  assert.match(soupApp, /href="\.\.\/"/);
  assert.match(undercoverApp, /searchParams\.set\('room', room\.code\)/);
  assert.match(courtApp, /searchParams\.set\('room', room\.code\)/);
  assert.match(clueApp, /searchParams\.set\('room', room\.code\)/);
  assert.match(soupApp, /searchParams\.set\('room', room\.code\)/);
  assert.match(undercoverApp, /URLSearchParams\(window\.location\.search\)/);
  assert.match(courtApp, /URLSearchParams\(window\.location\.search\)/);
  assert.match(clueApp, /URLSearchParams\(window\.location\.search\)/);
  assert.match(soupApp, /URLSearchParams\(window\.location\.search\)/);
});
