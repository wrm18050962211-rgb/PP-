# Mac iOS 接力说明

更新时间：2026-07-23

## 当前目标

按照 `docs/APP_STORE_LAUNCH.md` 的模块顺序推进 Still iOS 首发版本。

当前应从“第 1 阶段：iOS 壳跑起来”开始：

1. 在 Mac 上安装并首次启动 Xcode。
2. 克隆本仓库迁移包。
3. 在 `pp-app` 安装依赖。
4. 生成 Capacitor iOS 工程。
5. 用 Xcode 打开工程。
6. 先跑通 iPhone 模拟器，再跑真机。

## 已确认状态

- 产品名称：Still
- 官网域名：`weareinframe.com`
- 企业邮箱已经开通。
- 腾讯云企业实名认证、域名注册和官网部署已经完成。
- Apple 专用企业邮箱账号及双重认证已经完成。
- Apple Developer Program 的 D-U-N-S 申请已经提交，目前为“待审核”。
- 微信小程序和微信开放平台移动应用暂缓，不作为当前阻塞项。
- Windows 上 `pp-app` 的生产构建已经通过。
- `npm run check:production-guards` 已通过。
- `server/scripts/check-mvp.mjs` 全部检查已通过。
- 当前 Capacitor App 名称为 `Still`。
- 当前 Bundle ID 为 `com.frameyu.still`。
- 当前尚未生成 `pp-app/ios` 目录，必须在 Mac 上执行。

## 当前仍需补齐

- Apple Developer Program 企业会员审核与付费
- Xcode 签名、iOS 模拟器和真机运行
- 真实对象存储
- 正式生产数据库部署
- 正式支付渠道与回调
- 后台独立部署
- 监控与备份
- TestFlight
- App Store Connect 审核材料

## 新对话必读文件

按顺序读取：

1. `AGENTS.md`
2. `docs/MAC_IOS_HANDOFF.md`
3. `docs/APP_STORE_LAUNCH.md`
4. `docs/STILL_CODE_MODULE_ROADMAP.md`
5. `pp-app/README.md`

## 新对话首条提示词

```text
请先读取 AGENTS.md、docs/MAC_IOS_HANDOFF.md、docs/APP_STORE_LAUNCH.md、
docs/STILL_CODE_MODULE_ROADMAP.md 和 pp-app/README.md。

严格按照 APP_STORE_LAUNCH 的模块推进顺序继续 Still iOS 首发版本。
当前从第 1 阶段“iOS 壳跑起来”开始。先检查 Mac、Xcode、Node、Git
和仓库状态，不要直接改业务代码。每次只带我完成一个小步骤，验证后再继续。

Apple D-U-N-S 申请目前待审核，微信小程序暂缓。
```

## Mac 克隆迁移包

把 `PP-platform-mac-20260723.bundle` 放入 Mac 的“下载”目录后，在终端运行：

```bash
mkdir -p ~/Documents
git clone ~/Downloads/PP-platform-mac-20260723.bundle ~/Documents/PP平台
cd ~/Documents/PP平台
git switch codex/vertical-db-api
git remote set-url origin https://github.com/wrm18050962211-rgb/PP-.git
git status --short --branch
```

然后在 Codex 中打开 `~/Documents/PP平台` 文件夹并创建新对话。

不要在 Mac 上直接运行 `npm run ios:add`，先让新对话检查 Xcode、Node 和
Capacitor 环境，确认无误后再执行。
