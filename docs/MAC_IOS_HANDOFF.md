# Mac iOS 接力说明

更新时间：2026-08-23

> 历史交接声明：本文记录 2026-07-23 的首次 Mac 迁移过程，工程状态和推进阶段已经过期。iOS 基础工程与早期真机基线已完成；当前不得再从“生成 iOS 壳”或“支付必须首发”开始。最新唯一节点状态读取 `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`，首审范围读取 `docs/APP_STORE_LAUNCH.md`。旧 bundle 命令仅用于历史恢复，不是当前发布流程。

## 当前目标

按照 `docs/APP_STORE_LAUNCH.md` 推进不含支付的 Store Lite 首审版本：消费者专用构建、真实内容、真实预约申请、合规入口、Release Archive 和 TestFlight。支付、完整地图、聊天、媒体上传和摄影师移动端均在首次上架后推进。

## 当前已确认状态

- 产品名称：Still
- 官网域名：`weareinframe.com`
- 企业邮箱已经开通。
- 腾讯云企业实名认证、域名注册和官网部署已经完成。
- Apple 专用企业邮箱账号及双重认证已经完成。
- iOS/Capacitor 工程和早期真机基线已经完成，具体 SHA 与验收以 `IOS-BASE-0` 为准。
- Windows 的真实 Feed/摄影师/作品服务端和统一安全基础已经完成。
- 当前 Capacitor App 名称为 `Still`，Bundle ID 的最终值以 Apple Team 和 `IOS-DELIVERY-1` 验收为准。
- 首审范围已经收敛为不含支付的 Store Lite；微信小程序、支付、完整地图、聊天、上传和摄影师端均不阻塞首次上架。

## 当前 Store Lite 仍需补齐

- Apple Developer Program 公司账号、正式 Team 与签名
- 腾讯短信真实验证码或 Roadmap 批准的替代账号方案
- 当前 Windows Store Lite 消费者/窄运营台/服务端检查点经用户批准后推送，并取得 GitHub CI 的 PostgreSQL 16 与双前端构建证据
- 正式生产数据库、窄运营台部署、稳定精选媒体、域名和 HTTPS 验收
- 隐私/协议/支持 URL、App Privacy、服务端受限审核账号，以及 territory/登录/备案结论
- 账号删除实际执行器、会话撤销、法定保留范围和处理 SLA；当前 App 内发起/查询/取消已完成
- Release Archive、真机 QA、TestFlight 和 App Store Connect 材料

Windows 已有的局部实现包括：消费者专用入口、编译期路由和模块白名单、无支付预约/举报/屏蔽/客服与数据请求、独立窄运营台、生产配置失败关闭、构建产物 SHA256 清单和 iOS Release 校验脚本。这些是 Mac 验收输入，不代表 `IOS-STORE-LITE-1` 已完成。

## Mac 最短接力步骤

只有用户批准并将当前本地检查点推送到远端后，才在 Mac 拉取对应完整 SHA。不要复制 Windows 的 `dist-store-lite`，也不要使用历史 bundle 覆盖当前工程。

```bash
cd ~/Documents/PP平台
git fetch origin
git switch codex/vertical-db-api
git pull --ff-only
git status --short --branch
cd pp-app
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

执行前必须确认上述四个 HTTPS URL 已正式批准并可从公网访问；命令中的域名不是“部署已完成”的证明。生产服务端 `CORS_ALLOWED_ORIGINS` 必须精确包含 `capacitor://localhost`，并在真机验证 API 请求成功；其他来源只允许实际部署的 HTTPS Web/Admin origin。`dist-store-lite/store-lite-release.json` 必须记录当前完整 Git SHA 且 `sourceTreeClean` 为 `true`；脏工作树生成物只能用于本地预览，不能通过 iOS Release/Archive guard。

在 Xcode 中只使用 Release 配置完成签名、真机和 Archive。Archive 阶段会再次核对 Store Lite route/API bundle、`ios/App/App/public`、最终构建内 public 目录、原生 runtime seal、Info.plist 权限和 Capacitor 版本；任何旧商业包覆盖、未提交源码或构建后篡改都会失败关闭。

## 新对话必读文件

按顺序读取：

1. `AGENTS.md`
2. `docs/MAC_IOS_HANDOFF.md`
3. `docs/APP_STORE_LAUNCH.md`
4. `docs/STILL_CODE_MODULE_ROADMAP.md`
5. `pp-app/README.md`

## 新对话首条提示词（已更新）

```text
请先读取 AGENTS.md、docs/MAC_IOS_HANDOFF.md、docs/APP_STORE_LAUNCH.md、
docs/STILL_CODE_MODULE_ROADMAP.md 和 pp-app/README.md。

以 DUAL_PLATFORM_RELEASE_ROADMAP 为唯一状态源，严格按照 APP_STORE_LAUNCH
推进不含支付的 Store Lite 首审版本。先检查当前 Mac 分支、iOS 工程、Xcode、
签名和 Roadmap 中最靠前且依赖完成的 iOS 节点；不要按本文的历史状态重做 iOS 壳。
首审构建必须编译排除支付、摄影师端、社区、完整地图、上传和泛私信。
```

## 历史恢复附录：2026-07-23 bundle

仅在无法访问当前远端仓库、必须恢复 2026-07-23 历史基线时使用旧 bundle：

```bash
mkdir -p ~/Documents
git clone ~/Downloads/PP-platform-mac-20260723.bundle ~/Documents/PP平台
cd ~/Documents/PP平台
git switch codex/vertical-db-api
git remote set-url origin https://github.com/wrm18050962211-rgb/PP-.git
git status --short --branch
```

然后在 Codex 中打开 `~/Documents/PP平台` 文件夹并创建新对话。

当前正常开发不得运行 `npm run ios:add` 重建已存在的 iOS 工程；先读取 Roadmap，检查当前分支、工程和签名状态，再按选中的 iOS 节点执行 `ios:sync` 或 Xcode 操作。
