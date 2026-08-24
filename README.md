# 卧底裁判局

一个面向 6–12 人熟人娱乐局的桌面网页裁判器，只负责两件事：私密发牌、匿名投票判定。

## 已实现

- 6–8 人默认 1 名卧底，9–12 人默认 2 名；
- 系统词库与自定义词对；
- 按住鼠标或空格键查看私牌，失焦立即遮挡；
- 存活玩家匿名投票，不公开个人投票流向；
- 唯一高票淘汰、首次平票复投、二次平票无人出局；
- 自动判断平民胜或卧底胜；
- 本机轮流演示模式与 CloudBase 多电脑联机模式；
- 刷新后恢复本机或联机牌局。
- 沉浸模式与默认“表格低干扰模式”无损切换，并在本机保存界面偏好；
- 通用电子表格界面、工作表、公式栏、活动单元格和下拉提交；
- 个人信息默认遮挡，点击显示 4 秒；Esc、窗口失焦、切后台和 60 秒闲置立即/自动恢复遮挡；
- 页面标题、分享摘要和流程通知在表格模式下使用中性文案。

## 本地运行

```bash
npm install
npm run dev -- --hostname localhost --port 43210
```

访问 `http://localhost:43210/`。没有云参数时，使用“先在本机演示完整流程”。

## CloudBase PostgreSQL

1. 在环境中启用匿名登录。
2. 在 SQL 编辑器执行 [`cloudbase/schema.sql`](cloudbase/schema.sql)。脚本创建 `games`、`game_members`、受控建房/加入函数和同房间 RLS。
3. 复制 `.env.example` 为 `.env.local`，填写环境 ID、上海地域和 Publishable Key。
4. 安全来源中加入本地地址和最终 GitHub Pages 域名。

只允许将 Publishable Key 暴露到浏览器。不要把 CloudBase API Key、SecretId 或 SecretKey 写入环境文件或 GitHub。

当前开发机已经配置浏览器 Publishable Key；它不会被 Git 跟踪。联机前仍需在 CloudBase SQL 编辑器执行 RLS 脚本，不能将匿名角色开放为全库读写。

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

这是熟人娱乐项目。正常界面只展示当前玩家的私牌和投票进度，但不防开发者工具、直接网络请求、截图或主动篡改数据。数据库 RLS 的目标是阻止匿名用户遍历或修改未加入的房间，并非对抗同房间玩家作弊。

表格模式只降低旁观者一眼识别游戏内容的概率，不承诺规避企业网络审计、终端监控、访问日志或管理制度。无障碍标签会如实说明按钮的游戏用途。
