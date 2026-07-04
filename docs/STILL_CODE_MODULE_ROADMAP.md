# Still 当前代码修改建议与推进步骤

这份文档基于 `pp-app/README.md` 和 `docs/APP_STORE_LAUNCH.md` 的 Still 定位，对当前 PP 项目做代码层面的推进拆解。

## 已完成的基础命名修改

第一步已将用户高感知的应用名称从 PP 切到 Still：

- `pp-app/index.html`：浏览器标题改为 `Still`。
- `pp-app/capacitor.config.ts`：iOS App 显示名改为 `Still`，Bundle ID 暂改为 `com.frameyu.still`。
- `pp-app/package.json` / `package-lock.json`：包名改为 `still-app`。
- `pp-app/src/features/user/PhotoCard.tsx`：图片卡片角标改为 `STILL EDITORIAL` / `STILL PHOTO`。
- `pp-app/src/features/user/OrdersPage.tsx`：默认水印改为 `Still preview`。

后续如果公司开发者账号或域名确定，应再确认正式 Bundle ID，例如 `com.frameyu.still` 是否与证书、App Store Connect 和隐私政策域名一致。

## 当前代码仍存在的旧定位

当前代码中仍有大量历史表达：

- `陪拍`、`约拍`、`写真`：偏工具和旧赛道表达；
- `陪拍者`：应逐步统一为 `摄影师` 或 `影像创作者`；
- `创作者`：作为用户端身份容易和摄影师/内容创作者混淆，建议逐步改为 `用户`、`拍摄用户` 或 `客户`；
- `PP`：仍存在于后端日志、订单号、数据库文档、seed 数据和历史协议中；
- 首页仍偏照片流和找摄影师，不够突出“场景 + 风格 + 可预约套餐”；
- 预约和订单流程已有较多能力，但拍前准备、套餐交付标准和可信信号还不够显性。

这些不应一次性全局替换，否则容易破坏已有类型、路由和数据结构。建议按下面阶段推进。

## 第 1 阶段：品牌和 App Store 可见层

目标：用户第一眼看到的是 Still，而不是 PP 或泛陪拍平台。

建议修改：

1. `pp-app/index.html`
   - 已改标题为 `Still`。

2. `pp-app/capacitor.config.ts`
   - 已改 `appName`。
   - 后续在 Mac 上重新执行 `npm run ios:sync` 后检查 Xcode 中的 Display Name。

3. 高曝光 UI 文案
   - 首页顶部和空状态避免使用 `陪拍平台`。
   - 底部导航“拍摄”可以保留，比“约拍/陪拍”更符合 Still。
   - App Store 截图和首屏文案建议使用：

```text
Still
留住此刻的样子
```

完成标准：

- iOS 桌面显示名是 Still；
- 浏览器标题是 Still；
- 首页、图片卡片、水印不再出现 PP 品牌；
- App Store 物料不把主品牌写成约拍或陪拍。

## 第 2 阶段：首页从作品流升级为场景入口

涉及文件：

- `pp-app/src/features/user/HomeFeed.tsx`
- `pp-app/src/features/user/PhotoFeed.tsx`
- `pp-app/src/features/user/PhotoCard.tsx`
- `pp-app/src/services/feedService.ts`
- `pp-app/src/data/mockApi.ts`

建议修改：

1. 保留瀑布流，但每张卡片增加 Still 风格信息：
   - 场景：城市旅行、周末外景、生日纪念、个人形象、展览/咖啡馆；
   - 风格：松弛、清冷、复古、街拍、自然光、夜景；
   - 可复拍：是否有固定路线/套餐；
   - 交付：拍摄时长、精修张数、价格范围。

2. 首页筛选从“活动类型”逐步改为“拍摄场景”：

```text
城市旅行
周末外景
生日纪念
个人形象
小红书出片
情侣/朋友
宠物友好
```

3. 搜索建议从旧的“女生摄影师/预算300内”逐步升级为：

```text
松弛街拍
夜景人像
周末外景
生日纪念
自然光
咖啡馆
城市旅行
个人形象
```

完成标准：

- 首页不只是“找摄影师”，而是先让用户看到“我想在哪个场景留下什么样子”。

## 第 3 阶段：摄影师详情页强化信任和套餐

涉及文件：

- `pp-app/src/features/user/PhotographerProfilePage.tsx`
- `pp-app/src/features/user/PostDetail.tsx`
- `pp-app/src/services/companionPackageService.ts`
- `pp-app/src/features/companion/CompanionPackageSettings.tsx`
- `pp-app/src/features/companion/CompanionProfileEdit.tsx`

建议修改：

1. 摄影师页增加可信信号：
   - 平台已审核；
   - 样片已核验；
   - 交付承诺；
   - 隐私和安全提示；
   - 取消/改期规则。

2. 套餐要比摄影师个人报价更标准：
   - 拍摄时长；
   - 地点/路线；
   - 原片/精修张数；
   - 交付时限；
   - 修图范围；
   - 是否包含动作指导、路线建议、穿搭建议。

3. 把 `陪拍者` 文案逐步替换为 `摄影师` 或 `影像创作者`。

完成标准：

- 用户能在详情页判断“这个价格能得到什么”和“平台如何保障交付”。

## 第 4 阶段：预约表单前置拍前准备

涉及文件：

- `pp-app/src/features/user/ConsultationRequestModal.tsx`
- `pp-app/src/components/booking/BookingModal.tsx`
- `pp-app/src/features/user/CheckoutPage.tsx`
- `pp-app/src/services/consultationService.ts`
- `pp-app/src/types/domain.ts`
- `pp-app/src/types/api.ts`

建议新增字段：

- 目标场景；
- 想要的感觉；
- 参考图；
- 是否需要路线建议；
- 是否需要动作指导；
- 是否需要穿搭建议；
- 是否有同行人数或特殊纪念日；
- 是否有隐私/不公开要求。

这些字段先作为 Still 拍前准备，不依赖 Vibe 上线。

完成标准：

- 用户提交咨询时，摄影师能看到完整拍摄意图；
- 后续订单和聊天可以围绕这些字段继续沟通。

## 第 5 阶段：订单和交付标准化

涉及文件：

- `pp-app/src/features/user/OrdersPage.tsx`
- `pp-app/src/features/companion/CompanionOrdersPage.tsx`
- `pp-app/src/services/orderWorkService.ts`
- `pp-app/src/services/orderSettlementService.ts`
- `pp-app/src/services/paymentService.ts`

建议修改：

1. 订单页明确套餐交付：
   - 已付定金/尾款；
   - 拍摄时间地点；
   - 交付时限；
   - 精修张数；
   - 原片范围；
   - 修图边界；
   - 取消退款规则。

2. 成片交付页把“共同编辑作品”弱化，突出：
   - 摄影师交付；
   - 用户确认；
   - 争议/客服；
   - 是否同步主页。

3. 水印和预览表达统一为 Still：
   - 默认 `Still preview` 已完成；
   - 后续可改为更克制的动态水印样式。

完成标准：

- 订单不是简单聊天记录，而是可追踪、可解释、可客服介入的服务合同。

## 第 6 阶段：摄影师端从陪拍工作台改为 Still Studio

涉及文件：

- `pp-app/src/layouts/RoleShell.tsx`
- `pp-app/src/features/companion/CompanionStudio.tsx`
- `pp-app/src/features/companion/CompanionOrdersPage.tsx`
- `pp-app/src/features/companion/CompanionConsultationsPage.tsx`
- `pp-app/src/features/companion/CompanionOnboarding.tsx`
- `pp-app/src/features/companion/PublishPost.tsx`

建议修改：

1. 导航和标题：
   - `陪拍者工作台` -> `Still Studio` 或 `摄影师工作台`；
   - `陪拍者入驻审核` -> `摄影师入驻审核`。

2. 发布作品：
   - 活动类型改为 Still 场景模板；
   - 发布时必须写清可复拍路线、适合人群、价格/时长范围。

3. 摄影师资料：
   - 强化风格标签、场景标签、交付标签；
   - 少强调“陪伴”，多强调“拍摄体验”和“交付标准”。

完成标准：

- 摄影师端知道自己不是普通陪拍者，而是在 Still 上提供标准化影像服务。

## 第 7 阶段：数据模型和后端命名渐进迁移

涉及文件：

- `server/server.mjs`
- `database/schema.sql`
- `database/prisma/schema.prisma`
- `database/API_CONTRACT.md`
- `database/QUERY_AND_TRANSACTION_GUIDE.md`
- `database/seed_mvp.sql`

当前数据库和后端大量使用 `companion`，不建议马上大改表名。短期可以保留内部字段，前端显示层统一成 `photographer` / `creator` / `Still`。

建议后续迁移路径：

1. 显示层先改文案；
2. 类型层增加别名，例如 `Companion` 继续兼容，但 UI 用 `photographer`；
3. API 响应字段后续逐步增加 `photographer` 别名；
4. 生产迁移前再决定是否重命名数据库表。

完成标准：

- 用户可见层没有旧定位；
- 内部代码保持稳定，不为命名重构牺牲当前 MVP。

## 推荐推进顺序

```text
1. 品牌名和 App 外壳改为 Still
2. 首页场景化
3. 摄影师详情页信任与套餐
4. 预约表单拍前准备
5. 订单交付标准化
6. 摄影师端 Still Studio
7. 后端和数据库命名渐进迁移
```

每个阶段完成后都应运行最小验证并创建本地检查点。前端 UI 或业务流程变更后，至少运行：

```powershell
cd pp-app
npm.cmd run build
```

