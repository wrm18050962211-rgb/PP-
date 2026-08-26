# Still 主 App 界面基线

Updated: 2026-08-26

## 固定基线

- 代码对照提交：`b415a90`（只用于比较界面和导航，不做整仓回退）。
- 当前主线：`codex/store-lite-main`。
- 截图参考：`docs/ui-baseline/`。
- 后续原则：保留当前数据库、API、安全、预约和合规实现，在这套界面上继续 Roadmap。

## 页面映射

1. `01-app-home.png`：黑底、双列作品流、顶部城市/频道/搜索筛选、悬浮黑色底栏。
2. `02-app-tail-mine.png`：浅色“我的”、黑色账号摘要、白色列表区、悬浮黑色底栏。
3. `03-app-inside-work-detail.png`：黑底沉浸式作品详情，图片是第一视觉信号。
4. `04-payment-page.png`：只参考浅色预约信息排版。Store Lite 1.0 不显示金额、托管、付款或退款语义，主按钮改为“提交预约申请”。

对应主 App 代码主要位于：

- `pp-app/src/layouts/ConsumerShell.tsx`
- `pp-app/src/features/user/HomeFeed.tsx`
- `pp-app/src/features/user/PostDetail.tsx`
- `pp-app/src/features/user/MinePage.tsx`
- `pp-app/src/features/user/CheckoutPage.tsx`

## 发布边界

- 默认 `npm run build`、`npm run preview` 和 `npm run ios:sync` 用主 App，便于持续恢复和验证截图界面。
- `npm run build:store-lite`、`npm run ios:sync:store-lite` 是首审发布入口，必须继续通过 Store Lite 路由、API、bundle、native 和 Release 守卫。
- 主 App Debug 中仍存在的支付、聊天、上传、附近频道、摄影师端和商家能力，不得进入 Store Lite Release。
- Store Lite 编译入口可以独立，但其页面必须沿用本文件的视觉语言，不得发展为另一套浅色极简产品壳。

## 验收

- 使用 430 x 932 iPhone 视口检查首页、作品详情、摄影师详情、预约申请、我的和登录。
- 检查安全区、键盘、弱网、空状态、错误重试、深链和返回栈。
- Store Lite Release 额外检查被排除路由和 API 无法从导航、深链或 bundle 进入。
