# MacBook 项目迁移与接力

Updated: 2026-08-26

## 唯一入口

- GitHub: `https://github.com/wrm18050962211-rgb/PP-.git`
- Branch: `codex/store-lite-main`
- Codex task: `Still Store Lite 主线开发与 Mac 接力`
- Roadmap source: `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`
- Release scope: `docs/APP_STORE_LAUNCH.md`

旧 bundle、旧分支、旧 worktree 和旧聊天只用于追溯，不用于判断当前进度。不要把 Windows 的 `server/data/store.json`、`dist*`、`node_modules`、旧 ZIP 或旧 iOS 构建产物复制到 Mac。

## Mac 拉取

```bash
mkdir -p ~/Documents
cd ~/Documents
git clone https://github.com/wrm18050962211-rgb/PP-.git PP平台
cd PP平台
git fetch origin
git switch codex/store-lite-main
git pull --ff-only
git status --short --branch
git rev-parse HEAD
```

如果仓库已经存在，跳过 `git clone`；先确认没有未提交修改，再执行 fetch、switch 和 pull。正常接力不创建新分支或 worktree。

## 敏感材料恢复

Windows 本地目录 `PRIVATE_SYNC_TO_MAC` 被 `.gitignore` 排除，不会上传 GitHub。先用你选择的加密方式把整个目录传到 Mac，再把 `server.env.private` 恢复为 `server/.env`。Apple 证书、描述文件、私钥和账号恢复信息应通过 Keychain/Xcode 或独立加密文件恢复，不能提交、粘贴到 Codex 消息或写入 Roadmap。

恢复后至少检查这些变量是否存在，但不要打印值：

```bash
cd ~/Documents/PP平台
test -f server/.env
grep -E '^(STORE_DRIVER|DATABASE_URL|TENCENTCLOUD_SECRET_ID|TENCENTCLOUD_SECRET_KEY|COS_BUCKET|COS_REGION)=' server/.env | cut -d= -f1
```

## 第一次 Mac 验收

```bash
cd ~/Documents/PP平台/pp-app
npm ci

export VITE_APP_ENV=production
export VITE_RELEASE_PROFILE=store_lite
export VITE_ENABLE_MOCK=false
export VITE_ENABLE_TEST_ROLE_SWITCH=false
export VITE_API_BASE_URL=https://api.weareinframe.com
export VITE_PRIVACY_URL=https://www.weareinframe.com/privacy
export VITE_TERMS_URL=https://www.weareinframe.com/terms
export VITE_SUPPORT_URL=https://www.weareinframe.com/support

npm run build:store-lite
npm run check:store-lite-integrity
npm run ios:sync:store-lite
npm run check:store-lite-native
npm run ios:open
```

在 Xcode 中使用 Release 配置选择正式 Team，核对最终 Bundle ID、版本号、权限、签名和 Archive。不要运行 `npm run ios:add` 重建已有工程。四个 HTTPS URL 必须先由用户确认已正式批准且公网可访问。

## 当前继续顺序

1. 确认 GitHub CI 对本分支的 PostgreSQL 16、Store Lite consumer 和 Store Lite admin 检查结果。
2. 完成 Mac Store Lite 构建、Capacitor sync、native guard、Xcode signing 和真机启动。
3. 用真实 API 验证短信登录、会话恢复、精选内容、摄影师详情、预约四状态、取消、举报、屏蔽、客服和数据权利。
4. 补齐政策 URL、审核账号、真实内容、首发 territory/备案结论、Release Archive 和 TestFlight。
5. 每次只推进 Roadmap 中最靠前且依赖完成的一个节点；完成后写入 commit、verification、unblock result 和 notes。

## 给 MacBook Codex 的首条提示词

```text
这是 Still 项目的唯一主线接力任务。仓库路径是 ~/Documents/PP平台，唯一开发分支是
codex/store-lite-main，任务名保持为“Still Store Lite 主线开发与 Mac 接力”。

先读取 AGENTS.md、PROJECT_CONSOLE.md、docs/MACBOOK_PROJECT_TRANSFER.md、
docs/DUAL_PLATFORM_RELEASE_ROADMAP.md、docs/APP_STORE_LAUNCH.md、
docs/MAC_IOS_HANDOFF.md 和 pp-app/README.md。先执行 git status --short --branch、
git rev-parse HEAD，并确认与 origin/codex/store-lite-main 对齐；不要新建分支、worktree
或另一个实现任务，也不要从旧 bundle 或其他 codex/* 分支恢复代码。

以 DUAL_PLATFORM_RELEASE_ROADMAP 为唯一状态源，以 APP_STORE_LAUNCH 为首审范围。
当前目标是无支付 Store Lite 1.0、Release Archive、真机 QA 和 TestFlight。支付、退款、
钱包、结算、摄影师移动端、社区、完整地图、媒体上传、泛聊天、商家组合、Push 和 AI
都不进入首审关键路径，也不能重新加回消费者构建。

先运行 Store Lite build、integrity、Capacitor sync 和 native guard，再检查 Xcode Team、
Bundle ID、Release signing 与最靠前且依赖已完成的 IOS/INT P0 节点。敏感目录由我在 Mac
本地解密；不要读取后把密码、token、证书内容、手机号、内部地址或完整账号打印到终端、
Roadmap、Git 或对话。每次只完成一个节点，做最小相关验证，更新 Roadmap，按 AGENTS.md
建立中文本地检查点；只有我明确要求同步时才 push 当前主线。
```
