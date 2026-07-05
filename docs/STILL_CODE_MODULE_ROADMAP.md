# Still App Store 上线代码事务清单与推进路线

这份文档用于指导当前代码从“可演示 MVP”推进到“可提交 App Store、可真实运营”的生产版本。它整合前端、后端、数据库、支付、地图定位、运营后台、合规、监控、推荐与增长模块。

当前结论：项目已经有较完整的业务雏形，但仍有大量模块停在 mock、localStorage、JSON store、演示数据或半接入状态。上线优先级不是继续堆新页面，而是把交易闭环、数据持久化、地图地址、合规入口和运营后台做稳。

## 0. 当前代码状态快照

### 已有基础

- 前端是 React + Vite + Capacitor，主要代码在 `pp-app/src`。
- 后端是 Node HTTP server，入口是 `server/server.mjs`。
- 数据库设计已覆盖用户、摄影师、服务区域、作品、订单、支付、聊天、审核、举报、钱包、账本，见 `database/schema.sql`。
- PostgreSQL read model 已有雏形，见 `server/store/postgresStore.mjs`。
- 订单、消息、审核相关 PostgreSQL 事务函数已拆出，见：
  - `server/store/postgresOrderWrites.mjs`
  - `server/store/postgresMessageWrites.mjs`
  - `server/store/postgresModerationWrites.mjs`
- 地图/定位已有一层粗骨架：
  - 类型：`GeoPoint`、`ServiceArea`、`lat/lng` 字段在 `pp-app/src/types/api.ts`
  - 前端定位：`pp-app/src/services/locationService.ts`
  - 匹配：`pp-app/src/services/matchingService.ts`
  - 数据库：`users.last_lat/last_lng`、`service_areas.lat/lng/radius_meters`、`orders.place_lat/place_lng`

### 还不到生产级的地方

- `pp-app/src/services/apiClient.ts` 生产环境仍会默认回退到 `http://127.0.0.1:8787`。
- 多数 service 仍是 API 优先、失败回退 mock，本地体验友好，但生产包不能这样。
- `pp-app/src/app/AppDataProvider.tsx` 的 `refreshOrders()` 仍返回空数组，订单状态没有真正从服务端刷新。
- 登录主要依赖 localStorage、本地验证码、mock role/session；后端 `activeSession` 是全局 store 状态，不是生产级 session。
- `server/store/postgresStore.mjs` 当前 `writes: false`、`transactions: false`，`save()` 未实现，线上不能只靠 JSON store。
- `pp-app/src/services/paymentService.ts` 在非小程序 runtime 下会直接调用 mock success path，生产 iOS App 不能这样处理真实支付。
- `pp-app/src/services/mediaService.ts` 本地会把图片读成 data URL，生产必须上传对象存储并入库。
- `pp-app/src/components/booking/LocationSelector.tsx` 只是区域选项，不是地图选点或 POI。
- `pp-app/src/services/locationService.ts` 只做浏览器/小程序定位，没有权限说明、POI 搜索、逆地理编码、订单地址快照。
- `pp-app/src/features/user/CompanionFinderPage.tsx` 的地点筛选是静态文本和语义匹配，未接真实地图距离和服务范围。
- 后台已有大页面和接口雏形，但运营闭环、权限、审计、退款、封禁、客服处理仍需生产化。

## 1. 必须补：App Store 可审、可跑、不会崩

这些事务不完成，不建议提交 App Store 或开放真实用户。

### 1.1 生产环境配置

代码事务：

- 修改 `pp-app/src/services/apiClient.ts`：
  - development 可默认本地 API。
  - production 必须配置 `VITE_API_BASE_URL`。
  - production 禁止默认 `127.0.0.1`。
- 增加前端环境判断：
  - `VITE_APP_ENV=production`
  - `VITE_ENABLE_MOCK=false`
  - `VITE_ENABLE_TEST_ROLE_SWITCH=false`
- 修改所有 service：
  - development 可 mock fallback。
  - production API 失败必须显示错误态，不能静默回退 mock 数据。
- 修改 `server/.env.example`：
  - 增加 `APP_ENV`
  - 增加 `PUBLIC_API_ORIGIN`
  - 增加 CORS 白名单变量
  - 增加地图供应商变量

验收标准：

- 生产构建包不连接本地地址。
- 生产 UI 不出现 mock、测试账号、角色切换、模拟支付字样。
- API 不可用时显示可理解的错误和重试入口。

### 1.2 真实账号与权限

代码事务：

- 后端新增真实 session/token 存储，不再依赖 `store.activeSession`。
- 前端 `authService.ts` 切换为真实登录优先：
  - 手机验证码或微信登录二选一先打通。
  - token 持久化。
  - 退出登录清理 token。
- 后端所有订单、聊天、举报、后台接口校验当前用户权限。
- 后台管理员和普通用户分离：
  - admin token
  - admin role/scope
  - admin action log

数据事务：

- 增加或落实现有表：
  - `users`
  - `admin_users`
  - `admin_action_logs`
  - 可新增 `user_sessions` 或接入托管 auth provider。

验收标准：

- 卸载重装后仍能登录。
- 用户只能看到自己的订单。
- 摄影师只能处理自己的订单。
- 管理员接口不能被普通用户访问。

### 1.3 PostgreSQL 真写入

代码事务：

- 完成 `server/store/postgresStore.mjs` 写入能力。
- 将 `server/server.mjs` 中订单、支付、消息、举报、审核写入路径接到 PostgreSQL transaction。
- 保留 JSON store 只用于本地 demo，不用于 production。
- `STORE_DRIVER=postgres` 时所有会改变业务状态的接口都不能调用 `save()` 抛错。

数据事务：

- 运行并验证 `database/schema.sql`。
- 确认 `database/prisma/schema.prisma` 与 SQL schema 保持一致。
- 增加 migration 流程和 seed 流程。

验收标准：

- `POST /api/orders` 写入 `orders/payments/order_status_logs/availability_slots`。
- 支付成功写入 `payments/orders/conversations/order_status_logs`。
- 消息写入 `messages/message_risk_events`。
- 举报写入 `reports/audit_cases`。

### 1.4 订单并发与幂等

代码事务：

- 接入 `server/store/postgresOrderWrites.mjs` 的 `select ... for update` 事务。
- 创建订单时锁定 `availability_slots`。
- 增加 `idempotencyKey`：
  - 创建订单
  - 创建支付
  - 支付回调
  - 取消订单
  - 退款申请
- 支付回调已 paid 时必须返回成功，不重复改账。
- 订单超时未支付时释放 slot。

数据事务：

- 新增 `idempotency_keys` 表，或在订单/支付表增加唯一业务键。
- `payments.payment_no` 保持唯一。
- `orders.order_no` 保持唯一。
- `availability_slots.locked_until` 必须被后台任务消费。

验收标准：

- 两个用户同时抢同一 slot，只有一个订单成功。
- 用户连点支付不会创建多笔有效订单。
- 支付平台重复回调不会重复入账。

### 1.5 支付生产闭环

代码事务：

- `paymentService.ts` 区分 mock 和 production：
  - production 不调用 `/mock-success`。
  - 支付后查询服务端支付状态。
- 后端真实预下单、回调验签、结果查询。
- 前端补支付成功、失败、取消、处理中、超时状态。
- App Store 审核说明明确：支付用于线下摄影/拍摄服务预约，不是数字内容购买。

数据事务：

- `payments.raw_callback` 脱敏保存。
- `refunds` 支持人工退款状态。
- `order_status_logs` 记录支付状态流转。

验收标准：

- 真机可完成一笔小额支付。
- 支付后重启 App 能从服务端恢复订单状态。
- 支付失败不会把订单误标为已支付。

### 1.6 地图定位与拍摄地点

这是前面漏掉但必须补的核心模块。它不是简单筛选项，而是订单履约数据。

代码事务：

- 新增 `MapLocationPicker` 或 `LocationPickerPage`：
  - 城市选择
  - POI 搜索
  - 地图选点
  - 使用当前位置
  - 手动填写地址
  - 确认拍摄地点
- 升级 `LocationSelector.tsx`：
  - 从静态区域按钮升级为地点摘要入口。
  - 可展示 `placeName/address/distance`。
- 升级 `locationService.ts`：
  - `requestConsumerLocation()`
  - `searchPlaces(keyword, city)`
  - `reverseGeocode(lat, lng)`
  - `saveUserLocation(lat, lng)`
  - 地图供应商适配层：Amap/Tencent/Apple/manual。
- 升级 `CreateOrderInput` 和 `AppOrder`：
  - `placeName`
  - `placeAddress`
  - `placeLat`
  - `placeLng`
  - `city`
  - `district`
  - `provider`
  - `providerPoiId`
- 修改 `POST /api/orders`：
  - 下单时保存地点快照。
  - 不能只保存一个文本 `place`。
- 修改 `matchingService.ts`：
  - 优先使用真实经纬度和 `service_areas.radius_meters`。
  - 无定位授权时允许城市/商圈手动搜索。
- 摄影师端 `ServiceRangeSettings.tsx`：
  - 支持添加服务中心点。
  - 支持服务半径。
  - 支持不接区域说明。
- App Store 权限说明：
  - 只在用户点击“使用当前位置/附近摄影师”时请求定位。
  - 用户拒绝定位后仍能手动搜索地点并下单。

数据事务：

- 建议新增 `places` 表：
  - `id`
  - `provider`
  - `provider_poi_id`
  - `city`
  - `district`
  - `name`
  - `address`
  - `lat`
  - `lng`
  - `place_type`
  - `safety_level`
  - `photo_friendly_score`
  - `enabled`
- 建议新增 `user_location_consents` 表：
  - 记录授权状态、授权时间、用途版本。
- 建议新增 `location_search_logs` 表：
  - 用于后续热门地点和推荐优化。
- 订单表继续保存地点快照：
  - `orders.place_name`
  - `orders.place_address`
  - `orders.place_lat`
  - `orders.place_lng`
  - 后续可补 `place_provider/place_poi_id/district`。
- `service_areas` 已有 `lat/lng/radius_meters`，第一版可直接用。

验收标准：

- 用户可不授权定位，通过搜索/手填完成预约。
- 用户授权定位后，可看到附近可服务摄影师。
- 订单详情显示准确拍摄地点和地址。
- 客服后台能看到订单地点快照。
- 同一订单的地点不会因 POI 后续改名而变化。

### 1.7 App Store 合规入口

代码事务：

- 我的页面补：
  - 隐私政策
  - 用户协议
  - 支付说明
  - 退款说明
  - 联系客服
  - 举报入口
  - 删除账号入口
- UGC 内容补：
  - 作品举报
  - 用户举报
  - 聊天举报
  - 屏蔽或限制沟通
- 管理后台补：
  - 举报列表
  - 内容审核
  - 用户封禁/解封
  - 处理记录

数据事务：

- `reports`
- `audit_cases`
- `admin_action_logs`
- 可新增 `account_deletion_requests`
- 可新增 `blocked_users`

验收标准：

- App 内可以发起删除账号。
- App 内可以举报用户/内容/订单。
- 后台能看到举报并处理。
- App Review 账号能跑通主流程。

### 1.8 移动端稳定性

代码事务：

- iPhone SE 小屏检查。
- safe area 检查。
- 键盘遮挡检查。
- 网络失败、空状态、加载态、重试。
- App 重启后恢复支付和订单状态。
- 前端错误边界和崩溃上报。

验收标准：

- TestFlight 主流程至少手测 20 次：
  - 登录
  - 浏览
  - 地图选点
  - 预约
  - 支付
  - 查看订单
  - 举报/客服
  - 删除账号入口

## 2. 影响真实运营：有人使用后能处理问题

### 2.1 Redis 与队列

代码事务：

- 引入 Redis。
- 引入 BullMQ 或同类队列。
- 任务：
  - 验证码限频
  - API 限流
  - 订单超时释放
  - 支付回调重试
  - 图片审核任务
  - 通知任务

数据事务：

- Redis 只存短期状态，不存订单主状态、支付结果、钱包余额。
- 订单、支付、账本以 PostgreSQL 为准。

### 2.2 后台运营工作台

代码事务：

- `AdminDashboard.tsx` 拆成生产可维护模块：
  - 订单管理
  - 用户管理
  - 摄影师审核
  - 作品审核
  - 举报处理
  - 支付/退款标记
  - 风控消息
- 后端补 admin API：
  - 订单查询和状态变更
  - 举报处理
  - 审核通过/拒绝
  - 冻结订单
  - 用户限制/封禁

数据事务：

- `admin_users`
- `admin_action_logs`
- `audit_logs`
- `audit_cases`
- `reports`

### 2.3 媒体上传与审核

代码事务：

- `mediaService.ts` 生产环境必须上传 COS/R2。
- 后端 `upload-policy` 返回真实临时凭证。
- 图片上传后写入 `post_images` 或对应草稿表。
- 支持图片压缩、宽高读取、封面裁剪。
- 身份证、人脸、作品、举报证据分 purpose 存储。

数据事务：

- `post_images`
- 可新增 `media_assets`
- `audit_cases` 关联图片审核。

### 2.4 通知系统

代码事务：

- 站内通知最小版：
  - 订单创建
  - 支付成功
  - 摄影师确认
  - 订单开始提醒
  - 客服/举报处理进度
- 后续再接短信、微信服务通知、Push。

数据事务：

- 新增 `notifications` 表。
- 队列异步发送通知。

### 2.5 监控、日志、告警

代码事务：

- 前端接入 Sentry 或同类崩溃监控。
- 后端结构化日志：
  - request id
  - user id
  - order id
  - payment no
  - duration
  - error code
- 支付失败、数据库错误、队列堆积需要告警。

数据事务：

- 日志不存敏感明文。
- 支付回调和 KYC 数据脱敏。

### 2.6 财务与结算

代码事务：

- 钱包余额不能直接改，必须通过 ledger entries 追加流水。
- 人工退款先支持后台标记，后续再接自动退款。
- 争议订单可冻结结算。

数据事务：

- `companion_wallets`
- `settlements`
- `ledger_entries`
- `refunds`

## 3. 影响增长和体验：更好用、更会增长

### 3.1 推荐与排序

第一版不要上复杂模型，先做规则排序。

代码事务：

- 首页排序：
  - 可预约优先
  - 地点/城市匹配
  - 作品质量分
  - 价格匹配
  - 评分
  - 完单数
  - 新人扶持
- 附近推荐：
  - 用户选点或定位后，按 `service_areas` 半径召回。
- 重排：
  - 避免同一个摄影师连续霸屏。
  - 保留不同价格带和风格多样性。

数据事务：

- `posts.quality_score`
- `companions.rating_avg/rating_count/completed_order_count`
- 可新增 `recommendation_snapshots`。

### 3.2 行为埋点

代码事务：

- 埋点事件：
  - post_view
  - post_click
  - location_search
  - map_pick_confirm
  - favorite
  - booking_start
  - order_created
  - payment_success
  - report_submit
  - not_interested

数据事务：

- 新增 `user_events` 表，或接 PostHog。
- 事件必须带匿名设备 id 和登录 user id 的映射策略。

### 3.3 搜索筛选与城市运营

代码事务：

- 搜索：
  - 城市
  - 商圈
  - POI
  - 场景
  - 风格
  - 价格
  - 时间
- 城市专题：
  - 热门路线
  - 热门拍摄点
  - 周末外景
  - 生日纪念

数据事务：

- `places.photo_friendly_score`
- `places.safety_level`
- `location_search_logs`
- 可新增 `editorial_collections`。

### 3.4 功能开关与实验

代码事务：

- 增加远程配置：
  - 推荐排序版本
  - 首页运营位
  - 预约表单版本
  - 支付文案
  - 维护公告
  - 强制升级

数据事务：

- 可用 `system_configs` 先承载。
- 后续可接 Unleash/Flagsmith。

## 4. 三阶段小步推进路线

### 阶段一：必须补

目标：App Store 可审、可提交 TestFlight、可跑完整交易闭环。

1. 冻结第一版范围：浏览作品、详情、地图选点、预约、定金支付、订单、客服/举报、我的。
2. 改生产配置：`VITE_API_BASE_URL` production 必填，生产禁用 mock fallback。
3. 增加环境开关：隐藏 mock 登录、mock 支付、测试角色切换。
4. 接真实登录：先完成手机号或微信登录之一。
5. 后端改 session/token：替换 `activeSession` 全局会话。
6. 接 PostgreSQL 写入：订单、支付、消息、举报、审核先落库。
7. 接订单事务：slot 锁定、支付成功、重复请求幂等。
8. 接地图基础能力：
   - 地点搜索/手填
   - 当前位置授权
   - 订单地点快照
   - 摄影师服务区域半径匹配
9. 支付生产闭环：预下单、回调验签、支付状态查询。
10. 补 App Store 合规入口：隐私、协议、退款、客服、举报、删除账号。
11. 补移动端错误态：loading、empty、error、retry、支付处理中。
12. 准备 App Review 账号和审核说明。
13. 跑最小验证：
    - `server`: `npm.cmd run check:mvp`
    - `pp-app`: `npm.cmd run build`
    - 真机/TestFlight 主流程 20 次。

### 阶段二：影响真实运营

目标：真实用户开始使用后，平台能处理支付、订单、举报、审核、退款和故障。

1. 上 Redis：验证码、限流、订单锁过期。
2. 上队列：订单超时、支付回调重试、通知、图片审核。
3. 拆后台运营工作台：订单、审核、举报、用户、财务。
4. 做管理员权限和操作审计。
5. 完成 COS/R2 真实上传和媒体入库。
6. 做站内通知和关键短信/微信通知。
7. 接崩溃监控和后端结构化日志。
8. 做数据库备份、恢复演练、migration 流程。
9. 完成退款/争议/冻结结算人工闭环。
10. 地点运营：
    - 后台编辑热门地点
    - 禁用风险地点
    - 配置地点安全提示

### 阶段三：影响增长和体验

目标：在稳定运营基础上提升转化、复访和供需匹配效率。

1. 增加 `user_events` 或接 PostHog。
2. 首页规则推荐上线。
3. 附近推荐上线：基于用户选点和服务半径。
4. 热门地点、热门路线、城市专题上线。
5. 收藏、浏览历史、相似作品推荐。
6. 摄影师质量分：响应率、完单率、取消率、评分、举报扣分。
7. 功能开关和 A/B 实验。
8. 数据足够后再做协同过滤或学习排序。

## 5. 代码模块审计清单

按模块推进时，先检查对应文件。

### 前端数据层

- `pp-app/src/services/apiClient.ts`
- `pp-app/src/services/feedService.ts`
- `pp-app/src/services/orderService.ts`
- `pp-app/src/services/messageService.ts`
- `pp-app/src/services/mediaService.ts`
- `pp-app/src/services/paymentService.ts`
- `pp-app/src/app/AppDataProvider.tsx`

重点问题：

- 生产禁用 mock fallback。
- 订单刷新不能空实现。
- 支付不能默认走 mock success。
- data URL 不能作为生产图片存储。

### 地图定位层

- `pp-app/src/services/locationService.ts`
- `pp-app/src/services/matchingService.ts`
- `pp-app/src/components/booking/LocationSelector.tsx`
- `pp-app/src/features/user/CompanionFinderPage.tsx`
- `pp-app/src/features/companion/ServiceRangeSettings.tsx`
- `pp-app/src/types/api.ts`
- `database/schema.sql`

重点问题：

- 从静态区域选项升级为 POI/地图选点。
- 从文本匹配升级为经纬度 + 服务半径匹配。
- 下单必须保存地点快照。
- 拒绝定位也要能手动选点。

### 后端存储层

- `server/server.mjs`
- `server/store/index.mjs`
- `server/store/jsonStore.mjs`
- `server/store/postgresStore.mjs`
- `server/store/postgresOrderWrites.mjs`
- `server/store/postgresMessageWrites.mjs`
- `server/store/postgresModerationWrites.mjs`

重点问题：

- JSON store 只用于 demo。
- PostgreSQL 写事务必须接入路由。
- 所有状态变化必须有权限、事务、日志。

### 数据库层

- `database/schema.sql`
- `database/prisma/schema.prisma`
- `database/seed_mvp.sql`
- `database/MIGRATION_PLAN.md`
- `database/QUERY_AND_TRANSACTION_GUIDE.md`

重点问题：

- 增加 places/location consent/location logs。
- 保持订单、支付、账本强一致。
- KYC、支付回调、手机号脱敏。
- migration、seed、备份、回滚流程必须可重复。

### 运营后台层

- `pp-app/src/features/admin/AdminDashboard.tsx`
- `pp-app/src/services/adminService.ts`
- `server/store/postgresModerationWrites.mjs`

重点问题：

- 大页面需要拆模块。
- 管理员权限和审计要落库。
- 举报、审核、退款、封禁要形成闭环。

## 6. 每次代码任务的最小完成标准

每个事务完成后必须留下：

- 代码改动。
- 数据结构或 migration。
- 最小验证命令。
- 失败/异常状态处理。
- 是否影响 App Store 审核说明。
- 本地 Git checkpoint。

前端改动超过文案级别时：

```powershell
cd pp-app
npm.cmd run build
```

后端/数据库改动时：

```powershell
cd server
npm.cmd run check:mvp
```

涉及地图定位时，至少验证：

- 拒绝定位后手动选点。
- 授权定位后附近匹配。
- 下单后订单详情地点不丢失。
- 后台可看到地点快照。

