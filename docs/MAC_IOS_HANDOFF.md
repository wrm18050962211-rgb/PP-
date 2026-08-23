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
- Store Lite 消费者专用构建和路由白名单
- 真实预约申请、受保护运营处理入口、举报、客服和账号删除 API
- 正式生产数据库、稳定精选媒体、域名和 HTTPS 验收
- 隐私/协议/支持 URL、App Privacy、服务端受限审核账号，以及 territory/登录/备案结论
- Release Archive、真机 QA、TestFlight 和 App Store Connect 材料

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
