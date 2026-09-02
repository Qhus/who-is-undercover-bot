# 摸鱼游戏工作台

一个 Excel 风格的轻量联机游戏工作台。根地址提供统一游戏目录，当前包含三个相互独立的游戏。

## 页面入口

- `/`：游戏目录，通过 A2、A3、A4 进入三项独立玩法；
- `/undercover/`：谁是卧底，负责私密发词、描述、匿名投票与自动判胜；
- `/clue/`：提示大王，每人轮流判断答案，其他成员独立提交关联词，命中后匿名评分并生成双榜单；
- `/court/`：离谱法堂，围绕成套案件进行匿名陈词、证据突袭、补述与陪审投票；
- 三个游戏都可复制带房间编号的邀请链接，群友打开后只需填写称呼；
- 返回游戏目录不会自动退出仍在进行的联机房间，重新进入时可恢复。

## 已实现

- 3–8 人默认 1 名卧底，9–10 人默认 2 名；3–4 人只允许 1 名卧底；
- 105 组分级趣味词库与自定义词对，最近 10 局自动避重；
- 按住鼠标或空格键只查看自己的秘密词语，不提示平民或卧底角色，失焦立即遮挡；
- 存活玩家匿名投票，不公开个人投票流向；
- 唯一高票淘汰、首次平票复投、二次平票无人出局；
- 最高票成员为卧底时明确显示“成功找出卧底”；
- 自动判断平民胜或卧底胜；
- 本机轮流演示模式与 CloudBase 多电脑联机模式；
- 刷新后恢复本机或联机牌局。
- 每轮由存活成员在页面提交最多 80 字的本轮内容；全部提交模式共用 120 秒，顺序模式每位玩家独立 120 秒；
- 创建时可选择关闭、轻度或随机挑战，每轮向全员同步一条公共表达规则；当前只提示和计字，不拦截提交；
- 可选卧底猜词翻盘：卧底阵营每局一次 20 秒机会，猜中另一组词立即获胜，猜错或超时正常退出；
- Excel 风格“表格低干扰模式”为主要开发与默认界面；原沉浸模式降级为兼容视图，只保持核心流程和状态同步；
- 通用电子表格界面、规则说明工作表、公式栏、活动单元格和下拉提交；
- 个人信息默认遮挡，点击显示 4 秒；Esc、窗口失焦、切后台和 60 秒闲置立即/自动恢复遮挡；
- 页面标题、分享摘要和流程通知在表格模式下使用中性文案。
- 确认后可在本局结束前随时私密复看自己的词语，不会重复确认或改变流程；
- 描述支持“全部提交后公开”和“按座位顺序公开”，投票与复投阶段持续展示本轮公开描述；
- 支持随时暂退/返回和永久退出；暂退不影响胜负，永久退出按淘汰处理；
- 可选主动爆灯：描述公开后全员同入口，真卧底猜中获胜，失败立即退出；
- 玩家称呼最多 24 字；公共挑战同时显示在描述输入框提示和表格规则区；
- 空白牌开局获得宽泛范围提示，系统词库自动匹配类别，自定义词组由房主填写提示；
- 猜词爆灯和平民爆灯指认操作前说明规则和后果，全体可见发起状态，不公开私密答案；
- D 列保持紧凑：输入框和特殊按钮只显示短标签，点击后在左下角查看完整规则或不可用原因；复看词牌在原按钮位置短暂显示词语；
- 结果页默认停留 7 秒后自动进入下一轮，房主可立即进入或暂停。
- Excel 模式的玩法说明以独立工作表呈现，保留绿色标题栏、公式栏和单元格风格，并可返回打开说明前的工作表；首页以 A2/A4 区分房主与玩家入口。
- 描述公开后显示 5 秒倒计时并自动开放投票，房主可提前开放；退出玩家当轮“本轮内容”显示“无需提交”。
- 本局结束后点击“换词再来一局”会保留玩家名单、重新分配身份，并保证新词组与上一局不同。
- 联机关键操作通过数据库房间锁和唯一操作 ID 合并；同时确认、提交描述或投票不会再覆盖其他玩家的结果，重复请求保持幂等。
- 游戏目录标题栏提供显示当前版本号的通知入口；更新说明在目录工作簿右侧窗格内展开，可查看完整版本内容，不使用弹窗、不记录已读状态且不发送推送；具体游戏页不再重复展示通知。
- 离谱法堂当前使用 V6 简易流程：案件、首次陈词、证据突袭、当庭补述和双项评选；陈词与补述各 5 分钟、投票 2 分钟，不包含辩护招式或玩家质询。
- 提示大王支持 2–8 人，可选自由、公共规则或角色扮演模式以及四档题目难度；角色每题重新分配。关联词填写 120 秒，判断阶段 60 秒内最多尝试 3 次；无论是否猜中都会公布答案并为匿名关联词评 1–4 分，4 分会标记“本轮最独特”。三人及以上时，提示者还可给其他一条提示送出不计入总分的同行点赞，最终生成双榜单、最独特次数和“同行最爱”称号。

## 本地运行

```bash
npm install
npm run dev -- --hostname localhost --port 43210
```

访问 `http://localhost:43210/` 查看游戏目录；三个游戏分别位于 `/undercover/`、`/clue/` 与 `/court/`。没有云参数时，谁是卧底仍可使用本机预览。

## CloudBase PostgreSQL

1. 在环境中启用匿名登录。
2. 在 SQL 编辑器执行 [`cloudbase/schema.sql`](cloudbase/schema.sql)。脚本创建 `games`、`game_members`、受控建房/加入函数和同房间 RLS。
3. 执行 [`cloudbase/concurrency-v2.sql`](cloudbase/concurrency-v2.sql)，创建并发操作表和受控操作函数；先不要执行文件末尾注释掉的权限收紧语句。
4. 执行 [`cloudbase/verify.sql`](cloudbase/verify.sql)，确认所有核验项均为 `true`。
5. 已有环境升级 V1.7.1 时，执行 [`cloudbase/experience-v3-3-undercover-ux.sql`](cloudbase/experience-v3-3-undercover-ux.sql)，再运行 [`cloudbase/verify-v3-3-undercover-ux.sql`](cloudbase/verify-v3-3-undercover-ux.sql)，将谁是卧底称呼上限同步提高到 24 字。
6. 新增提示大王时，执行 [`cloudbase/concurrency-v8-clue-king.sql`](cloudbase/concurrency-v8-clue-king.sql)，再运行 [`cloudbase/verify-v8-clue-king.sql`](cloudbase/verify-v8-clue-king.sql)，确认每行 `ok=true`。
7. 升级 A3 V1.8.1 时，执行 [`cloudbase/concurrency-v8-1-clue-experience.sql`](cloudbase/concurrency-v8-1-clue-experience.sql)，再运行 [`cloudbase/verify-v8-1-clue-experience.sql`](cloudbase/verify-v8-1-clue-experience.sql)，确认每行 `ok=true`。
8. 升级 A3 V1.9.0 时，执行 [`cloudbase/concurrency-v9-clue-role-modes.sql`](cloudbase/concurrency-v9-clue-role-modes.sql)，再运行 [`cloudbase/verify-v9-clue-role-modes.sql`](cloudbase/verify-v9-clue-role-modes.sql)，确认每行 `ok=true`。
9. 升级 A3 V1.9.1 时，执行 [`cloudbase/concurrency-v9-1-clue-rating.sql`](cloudbase/concurrency-v9-1-clue-rating.sql)，再运行 [`cloudbase/verify-v9-1-clue-rating.sql`](cloudbase/verify-v9-1-clue-rating.sql)，确认每行 `ok=true`。
10. 升级 A3 V1.9.2 时，执行 [`cloudbase/concurrency-v9-2-clue-peer-awards.sql`](cloudbase/concurrency-v9-2-clue-peer-awards.sql)，再运行 [`cloudbase/verify-v9-2-clue-peer-awards.sql`](cloudbase/verify-v9-2-clue-peer-awards.sql)，确认每行 `ok=true`。该脚本已包含 4 分约束修正，可直接接在 V3 后执行。
11. 复制 `.env.example` 为 `.env.local`，填写环境 ID、上海地域和 Publishable Key。
12. 安全来源中加入本地地址和最终 GitHub Pages 域名。

只允许将 Publishable Key 暴露到浏览器。不要把 CloudBase API Key、SecretId 或 SecretKey 写入环境文件或 GitHub。

当前开发机已经配置浏览器 Publishable Key；它不会被 Git 跟踪。2026-08-24 已在真实 CloudBase 环境成功执行完整 RLS schema，并确认两张表、三个函数、两表 RLS 和三条策略全部存在。浏览器真实链路已通过匿名建房、第二独立来源匿名加入、房主同步成员，以及第三匿名会话非成员查询返回 0 行。

`concurrency-v2.sql` 属于待人工执行的 V2 迁移。迁移执行并完成双浏览器验收后，再撤销普通成员对 `games.state/version` 的直接更新权限；旧线上前端仍运行时不得提前撤销，否则会中断现有联机操作。

本环境的 `auth.uid()` 返回 `text`，因此 `owner_uid` 和 `user_uid` 必须保持为 `text`；不要改成 `uuid`。如果旧脚本在第一条 `CREATE TABLE` 就报类型错误，说明初始化尚未发生，直接重新执行修正后的完整脚本即可。

## 验证

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:pages
```

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。在 GitHub 仓库的 Actions variables 中设置：

- `CLOUDBASE_ENV_ID`
- `CLOUDBASE_PUBLISHABLE_KEY`

然后在 Settings → Pages 中选择 GitHub Actions 作为来源。推送 `main` 后会先测试、构建，再部署 `out/`。

## 信任边界

这是熟人娱乐项目。谁是卧底与离谱法堂的部分旧状态仍保存在 `games.state`：正常界面只展示当前玩家应看到的信息，但同房成员可能通过开发者工具或直接数据库请求检查完整房间状态，因此这些模式不对抗同房成员主动作弊。

提示大王采用更严格的分层：答案、未公开提示、评分和揭晓前的作者关系保存在启用 RLS 的专用私密表中，不写入公开房间状态，并仅由受控 RPC 按玩家身份与游戏阶段返回。这里仍以熟人娱乐为威胁模型，不承诺抵御数据库管理员或服务端权限持有者。

表格模式只降低旁观者一眼识别游戏内容的概率，不承诺规避企业网络审计、终端监控、访问日志或管理制度。无障碍标签会如实说明按钮的游戏用途。
