# Still App Store 上线代码事务清单与推进路线

这份文档用于指导当前代码从“可演示 MVP”推进到“可提交 App Store、可真实运营”的生产版本。它整合前端、后端、数据库、支付、地图定位、运营后台、合规、监控、推荐与增长模块。

当前结论：项目已经有较完整的业务雏形，但仍有大量模块停在 mock、localStorage、JSON store、演示数据或半接入状态。上线优先级不是继续堆新页面，而是把交易闭环、数据持久化、地图地址、合规入口和运营后台做稳。

运营后台不属于 C 端 App。MVP 本地阶段可以同仓开发、同端口演示，但初步上线或提交 TestFlight/App Store 前，后台必须从移动端用户包中拆出，作为单独的 Web Admin 发布、单独登录、单独权限和单独部署。

## 0A. 近期推进记录

本轮按“小步修改 + 验证 + 本地检查点”的节奏，优先推进了 `1.2A`、`1.2B` 和 `2.2` 中与后台隔离、权限边界、订单管理、审计可见性相关的事项：

- 前端已经区分移动端构建和后台构建：移动端构建排除 admin 入口，后台可单独 `build:admin`。
- Client、Photographer、Admin 的设置页路径和 token storage 已初步隔离，后台退出不再清理普通用户 token。
- 后端 admin 登录、退出、订单读取、订单状态变更已走 admin 专用 API。
- public app API 已阻断 admin token；订单、消息、上传等端内业务 API 已阻断匿名访问。
- 订单访问和订单状态变更补了权限 smoke：Client 不能看别人订单，Photographer 不能操作别人订单，Admin 不能直接走端内订单 API。
- 后台订单状态变更会写入 `adminActionLogs`，并在订单详情中显示该订单的操作记录。
- 后台安全事件接口已可读取登录失败、权限拒绝等 `securityEvents`，并在后台设置页展示最近安全事件。
- 前端生产保护继续收紧：`VITE_ENABLE_MOCK=false` 或 production 环境下，虚拟订单账本、默认演示订单、云域业务 localStorage 缓存都不再作为真实数据兜底。
- 订单刷新失败、生产 session 获取失败会进入统一错误提示，不再静默吞掉或伪装成本地成功。
- 前端登录态来源继续收紧：生产环境不再承认本地登录标记，Client/Photographer 需要 public token，Admin 需要 admin token；后台退出也不再生成普通本地 session。
- 新增前端 `check:production-guards`，用于防止生产 API、mock fallback、登录态、本地云域缓存、移动端/后台入口隔离等保护被误删。
- 后端生产 guard 已补充 mock 用户登录和本地管理员登录禁用检查，并纳入 `check:mvp`。
- 摄影师端底栏已移除“敬请期待”待开放入口，旧 `/companion/creators` 路由改为回到摄影师咨询页；未使用的 ComingSoon 页面已删除。
- 用户端、摄影师端、后台和 feed 样例中的生产可见“演示/MVP/待开放/虚拟样例”文案已清理，前端 `check:production-guards` 已增加可见源码扫描，防止这些词重新进入生产可见页面。
- 后端种子 feed 返回文案已同步改为“精选样片/可预约参考”，服务启动日志和微信支付 User-Agent 已去掉 `MVP` 标识。
- 后端生产 guard 已继续补充匿名访问、public token 访问 admin API、admin token 访问 public API 的权限矩阵检查，并断言权限拒绝会写入 `securityEvents`。
- JSON store 保存时已不再持久化 `activeSession`，加载旧 store 时也会强制清空 `activeSession`；当前 `activeSession` 只作为请求处理过程中的临时上下文，真实恢复登录依赖 `sessions[]` token。
- 前端生产保护继续补齐：媒体上传、图片消息、摄影师接单设置、套餐设置、公开资料、收藏关注、咨询和成片协作都已纳入 `check:production-guards` 或 mock fallback 禁用边界，`VITE_ENABLE_MOCK=false`/production 下不再用本地共享缓存冒充真实云端数据。
- 后端 `securityEvents` 运行时镜像已补充 `targetKey`、`metadata`、`ip`、`userAgent` 等上下文字段，并加入 `check-runtime-audit-gateway` 覆盖。
- 后端新增 `check-session-boundary` 并纳入 `check:mvp`，用于防止后续误恢复或误持久化 ambient `activeSession`。
- PostgreSQL store 已暴露并分步接入 `orderWrites`、`messageWrites`、`moderationWrites` 三类业务写入 gateway；`server.mjs` 中的订单创建、支付成功、微信支付成功/关闭/失败回调、订单确认/完成/取消、后台订单状态、消息发送、举报创建、后台风控动作、后台审核处理已开始走 Postgres transaction。
- Postgres 模式下，支付状态查询和订单会话读取已收紧为只读或已有读模型返回，避免 GET/读取类接口偷偷创建 JSON 本地状态。
- 订单幂等已补数据库结构、Prisma model、Postgres `idempotencyWrites` gateway，并接入 `POST /api/orders` 创建路径和 `confirm/complete/cancel` 订单动作；支付成功回调和订单动作事务内部也补了重复请求幂等跳过。
- Postgres 模式已补支付关闭/失败终态回调事务，并补了 pending payment 超时释放事务与运行时入口：超时订单会关闭 pending payment、取消订单、释放 slot 并写入状态日志。
- 新增 `npm run check:postgres-live` 可选检查：配置 `DATABASE_URL` 时会连接真实 PostgreSQL，检查关键表、幂等表字段和 slot 锁语法；未配置时明确 skipped。
- pending payment 超时释放已抽出 `paymentExpiryJob` 和 `npm run job:expire-payments` 独立入口；当前可由服务端请求入口或外部调度器调用，后续再接正式队列/cron/云任务。
- 后端 admin session 默认角色已收紧为纯 `admin`：JSON/demo session 和 Postgres session 映射都不再把 `consumer/companion` 混入 admin roles，并已补 smoke 与 session gateway 检查。
- 新增 schema parity 检查，自动比对 `database/schema.sql` 的表和 Prisma `@@map` 是否一一对应，并纳入 `server` 的 `check:mvp`。
- 新增后台路由边界检查：除 `/api/admin/auth/login` 外，所有后台处理函数必须显式调用 `requireAdminSession(store)`，防止后续新增后台入口时漏掉 admin gate。
- Postgres 订单写入层已补 `markRefundTerminal` gateway：退款成功/失败/拒绝可写回 `refunds`，成功时把 `refunding` 订单推进到 `refunded` 并写订单状态日志；后续还需接真实退款 provider 回调或退款处理 job。
- 新增微信退款通知入口 `/api/payments/wechat/refund-notify`，会将微信退款终态映射到 `markRefundTerminal`；当前仍需继续补平台证书轮换和退款重试队列。
- 微信支付/退款通知已补签名校验骨架：服务端保留 raw body，并在解密 resource 前用 `WECHAT_PAY_PLATFORM_PUBLIC_KEY(_PATH)` 校验 `Wechatpay-*` 请求头；后续还需接平台证书轮换和回调重试队列。
- 新增 `provider_callback_events` 数据库表和 Prisma 映射，先为微信支付/退款回调的原始事件、处理状态、失败原因和后续重试队列打底；下一步再接 Postgres 写入 gateway 和真实回调处理链路。
- Postgres 已新增 `providerCallbackWrites` gateway：可以记录 provider 原始回调、标记 processed、标记 retrying/failed；下一步把微信支付/退款通知入口接入该 gateway。
- 微信支付/退款通知入口已接入 `providerCallbackWrites`：签名通过后先记录回调事件，业务写入成功后标记 processed，找不到业务对象或写入失败时标记 retrying；下一步再补独立重试 job。
- `providerCallbackWrites` 已补 `claimDue`：后续重试任务可以用 `for update skip locked` 安全领取到期 retrying 回调，避免多 worker 重复处理同一条事件。
- 新增 `providerCallbackRetryJob` 和 `npm run job:retry-provider-callbacks`：可领取到期回调、调用 provider processor、成功标记 processed、失败按退避时间重新排队；后续还需补微信支付/退款事件的具体重放 processor。
- 当前仍未完成生产级事项：真实数据库 CI/迁移流水线、独立队列/定时任务系统、更多退款/支付回调重试覆盖、session/admin_action_logs/audit_logs/security_events 的生产级闭环验证、后台进一步拆模块，以及初步上线前独立部署。

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
- 登录主要依赖 localStorage、本地验证码、mock role/session；后端 `activeSession` 已不再落盘，但仍是请求处理内的临时上下文，还需要继续抽象成统一鉴权中间层。
- `server/store/postgresStore.mjs` 当前 `writes: false`、`transactions: false`，`save()` 未实现，线上不能只靠 JSON store。
- `pp-app/src/services/paymentService.ts` 在非小程序 runtime 下会直接调用 mock success path，生产 iOS App 不能这样处理真实支付。
- `pp-app/src/services/mediaService.ts` 本地会把图片读成 data URL，生产必须上传对象存储并入库。
- `pp-app/src/components/booking/LocationSelector.tsx` 只是区域选项，不是地图选点或 POI。
- `pp-app/src/services/locationService.ts` 只做浏览器/小程序定位，没有权限说明、POI 搜索、逆地理编码、订单地址快照。
- `pp-app/src/features/user/CompanionFinderPage.tsx` 的地点筛选是静态文本和语义匹配，未接真实地图距离和服务范围。
- 后台已有大页面和接口雏形，但运营闭环、权限、审计、退款、封禁、客服处理仍需生产化。
- 运营后台仍在 `pp-app/src/features/admin` 并通过 `/admin` 挂在同一个前端路由中；这只适合本地演示，初步上线前必须从 App Store 移动端包中移除或拆到独立 Admin App。

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

### 1.2B 权限、会话与审计落地顺序

这一节用于把 `1.2` 和 `1.2A` 里分散的账号、权限、后台隔离、审计事项变成明确执行顺序。当前代码已经有权限判断骨架、订单隔离和 admin API 拦截雏形，但仍处在 MVP/JSON store 阶段，不算生产级。

建议按下面顺序小步推进：

1. 先把 admin 和普通用户的 session 彻底分离：
   - 移动端只使用 Client/Photographer session。
   - 后台只使用 admin session。
   - admin 登录、退出、token storage、返回路由都不能影响 Client/Photographer。
   - 普通用户 token 不能进入 `/api/admin/*`，admin token 不能直接当作普通用户身份访问 C 端个人数据。

2. 再把后端 admin API、订单 API、消息 API 的权限校验抽成统一中间层：
   - `requireAuth`
   - `requireRole`
   - `requireAdmin`
   - `requireOrderAccess`
   - `requireCompanionOrderAccess`
   - `requireSelfOrAdmin`
   业务函数内部可以保留二次保护，但入口层必须先拦截明显越权请求。

3. 然后把 session 和审计数据从 JSON store 接到 PostgreSQL：
   - `user_sessions` 或等价 session 表。
   - `admin_users`
   - `admin_action_logs`
   - `audit_logs`
   - 登录失败、权限拒绝、管理员敏感操作都要有可追踪记录。

4. 最后补权限测试矩阵：
   - 普通用户访问 admin API 必须失败。
   - admin session 访问 C 端个人路由或普通用户 API 必须失败或被转到后台受控 API。
   - Client 访问别人订单必须失败。
   - Photographer 访问或操作非自己订单必须失败。
   - 未登录访问订单、消息、后台接口必须失败。

验收标准：

- 会话边界清楚：Client、Photographer、Admin 三套身份不会互相穿透。
- 资源边界清楚：订单、消息、举报、后台审核都按当前身份和资源归属判断。
- 审计边界清楚：后台敏感操作、权限拒绝、登录异常都有日志。
- 测试边界清楚：每个关键越权场景都有自动化检查。

### 1.2A 运营后台与移动端物理隔离

这项从第 8 章工程升级前移为上线前硬门槛。运营后台可以继续在同一个仓库里开发，但不能进入面向 Client/Photographer 的 App Store 移动端包。

代码事务：

- 新建独立后台入口，短期可用 `pp-app/src/app/AdminApp.tsx` 或后续 `apps/admin` 承载。
- 移动端入口只挂载 Client/Photographer 路由，不再包含 `/admin`、`AdminDashboard`、后台 mock 数据或后台登录页。
- 后台入口只挂载 `/admin` 系列路由，不复用移动端 tab、个人中心、设置页返回逻辑。
- 后台使用独立 session key、admin token、admin API client 和权限判断。
- 生产移动端构建必须能通过环境变量或独立入口排除 admin bundle。
- 后台生产构建必须独立部署到内部门户或受保护域名，不通过 App Store 分发。

数据与权限事务：

- 后端 admin API 必须使用 `admin_users`、`admin role/scope` 和 `admin_action_logs`。
- 普通用户 token 不能访问 admin API。
- admin token 不能访问普通用户端的个人页面，只能通过受控后台 API 查看必要运营数据。

验收标准：

- App Store/TestFlight 包内没有运营后台入口。
- 访问移动端任意路由时，不会加载后台大模块。
- 访问后台必须单独登录管理员身份。
- 后台退出不会改变 Client/Photographer 的移动端登录态。
- 管理员敏感操作均写入审计日志。

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
6. 拆出运营后台入口：移动端包只保留 Client/Photographer，Admin 单独入口、单独登录、单独构建。
7. 接 PostgreSQL 写入：订单、支付、消息、举报、审核先落库。
8. 接订单事务：slot 锁定、支付成功、重复请求幂等。
9. 接地图基础能力：
   - 地点搜索/手填
   - 当前位置授权
   - 订单地点快照
   - 摄影师服务区域半径匹配
10. 支付生产闭环：预下单、回调验签、支付状态查询。
11. 补 App Store 合规入口：隐私、协议、退款、客服、举报、删除账号。
12. 补移动端错误态：loading、empty、error、retry、支付处理中。
13. 准备 App Review 账号和审核说明。
14. 跑最小验证：
    - `server`: `npm.cmd run check:mvp`
    - `pp-app`: `npm.cmd run build`
    - 真机/TestFlight 主流程 20 次。

### 阶段二：影响真实运营

目标：真实用户开始使用后，平台能处理支付、订单、举报、审核、退款和故障。

1. 上 Redis：验证码、限流、订单锁过期。
2. 上队列：订单超时、支付回调重试、通知、图片审核。
3. 在独立 Admin App 内拆运营工作台模块：订单、审核、举报、用户、财务。
4. 完善管理员权限和操作审计。
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

- 初步上线前要从移动端 App 入口拆出，独立为 Web Admin。
- 短期可以同仓维护，但生产移动端包不能包含后台路由和后台大模块。
- 大页面需要拆模块。
- 管理员权限和审计要落库。
- 举报、审核、退款、封禁要形成闭环。

## 6. 本轮 longrun 模块级审计结论

这一节专门回答“当前模块划分下，哪些粗糙、哪些缺失、哪些演示/废代码会影响上线”。结论来自当前仓库静态扫描，并参考高 star 平台项目的常见做法：

- [Cal.com/Cal.diy](https://github.com/calcom/cal.com) 这类预约平台把 PostgreSQL、Prisma、环境密钥、开发种子账号和生产部署边界分开。
- [Appwrite](https://github.com/appwrite/appwrite) 把 Auth、Database、Storage、Messaging、Realtime 作为平台基础能力，而不是散落在页面里。
- [Medusa](https://github.com/medusajs/medusa) 把交易平台拆成可组合 commerce modules，避免所有交易状态都堆在一个大 server 文件里。
- [Novu](https://github.com/novuhq/novu) 把通知、偏好、provider、workflow 独立成基础设施，适合参考你的订单/审核/客服通知体系。

### 6.1 生产阻塞模块

这些不改，不建议真实上线或提交正式审核：

- API 与环境层：`pp-app/src/services/apiClient.ts` 默认 `http://127.0.0.1:8787`，生产构建必须改成 `VITE_API_BASE_URL` 必填，并禁止 mock fallback。
- 登录与 session：`pp-app/src/services/authService.ts` 依赖 localStorage、本地验证码、`switchMockRole()`；`server/server.mjs` 仍使用 `store.activeSession` 作为请求内上下文。JSON store 已不再持久化该字段，但生产仍必须继续收敛到真实 token/session 与统一鉴权中间层。
- 订单刷新：`pp-app/src/app/AppDataProvider.tsx` 的 `refreshOrders()` 还是空数组，订单状态无法真实恢复。
- 支付：`pp-app/src/services/paymentService.ts` 非小程序 runtime 会调用 `/mock-success`；生产支付必须改成服务端状态查询 + 支付回调验签。
- PostgreSQL 写入：`server/store/postgresStore.mjs` 标记 `writes: false`、`transactions: false`，`save()` 未实现。生产不能继续用 JSON store 承载订单、支付、消息、审核。
- CORS 与安全：`server/server.mjs` 使用 `Access-Control-Allow-Origin: '*'`，生产需要白名单、鉴权中间件、rate limit、request id、结构化错误。
- 运营后台入口：`/admin` 仍挂在移动端前端包里。初步上线前必须拆成独立 Admin 入口或独立 Web App，App Store 包不能包含后台路由和后台大模块。
- 地图下单：`LocationSelector.tsx` 仍是静态区域按钮，`locationService.ts` 只做定位，缺 POI、逆地理编码、地点快照。
- 媒体：`mediaService.ts`、`CompanionProfileEdit.tsx`、`messageService.ts` 存在 data URL 本地图片流，生产必须走对象存储和媒体表。

### 6.2 影响真实运营的粗糙模块

这些能让 demo 跑起来，但真实用户一进来会很难运营：

- `server/server.mjs` 是 1800 行左右的业务单体，订单、支付、登录、媒体、审核、seed、CORS 都在一起。建议拆 `routes/`、`services/`、`auth/`、`payments/`、`orders/`、`moderation/`。
- `pp-app/src/features/admin/AdminDashboard.tsx` 是大而全页面，混合 demo 指标、审核、订单、风控 UI。建议拆成运营模块，并由真实 admin API 驱动。
- `pp-app/src/features/user/HomeFeed.tsx`、`OrdersPage.tsx`、`CompanionFinderPage.tsx`、`MessagesPage.tsx` 都偏大，后续接真实错误态、分页、埋点、地图时维护成本会很高。
- `adminService.ts` 仍导入 `mockApi`，很多 admin 操作 API 不可用时返回成功，生产会造成运营误判。
- `messageService.ts` 使用 localStorage 共享会话和 mockConversation，缺真实消息同步、消息发送失败重试、会话分页、推送通知。
- `consultationService.ts`、`orderWorkService.ts` 仍使用 localStorage。生产如果保留，数据会丢失且跨设备不可恢复。
- `matchingService.ts` API 失败时返回空数组，缺明确错误态；附近匹配需要服务半径、距离排序、城市兜底。
- `creatorProfileService.ts`、`userCollectionService.ts` 仍依赖虚拟作品/虚拟收藏统计，会影响真实增长数据判断。

### 6.3 缺失但上线应补的模块

当前仓库还缺这些平台底座：

- `auth/session` 模块：token 签发、刷新、撤销、设备会话、管理员 session。
- `config/env` 模块：集中校验生产环境变量，启动时 fail fast。
- `request middleware`：鉴权、角色权限、CORS 白名单、rate limit、request id、错误码。
- `admin-app` 模块：独立后台入口、独立构建、独立 session、独立 API client、独立部署。
- `idempotency` 模块：订单创建、支付创建、支付回调、退款、取消都要有幂等键。
- `queue/jobs` 模块：订单超时释放、支付回调重试、通知发送、图片审核、日志聚合。
- `notifications` 模块：站内信、短信/微信服务通知、Push 的统一事件入口。
- `places/location` 模块：POI、地图选点、地点快照、热门地点、风险地点、定位授权记录。
- `media_assets` 模块：上传策略、对象存储回调、宽高/大小/用途、审核状态。
- `audit/security` 模块：管理员操作日志、风控事件、用户封禁、内容处理记录。
- `observability` 模块：前端崩溃上报、后端结构化日志、支付/数据库/队列告警。
- `appstore/compliance` 模块：隐私协议、删除账号、举报入口、审核账号、权限文案、数据使用说明。

### 6.4 演示代码、废代码与上线风险清单

这些文件不一定都要删除，但必须在生产构建中隔离、禁用或替换：

- 必须生产禁用：
  - `server/server.mjs` 的 `/api/auth/wechat/mock-login`。
  - `server/server.mjs` 的 `/api/payments/:id/mock-success`。
  - `server/server.mjs` 的 `seedVirtualData()`、`seedVirtualTradeData()` 自动注入虚拟内容。
  - `pp-app/src/services/authService.ts` 的本地验证码、测试角色切换、mock session。
  - `pp-app/src/features/auth/AuthPages.tsx` 中展示“本地测试验证码”的 UI。
  - `pp-app/src/services/paymentService.ts` 的 mock success fallback。
  - `pp-app/src/services/apiClient.ts` 的生产默认本地 API。
- 只能开发环境保留：
  - `pp-app/src/data/mock.ts`
  - `pp-app/src/data/mockApi.ts`
  - `pp-app/src/services/virtualOrderLedger.ts`
  - `pp-app/src/services/scopedStorage.ts`
  - `docs/TEST_ACCOUNTS.md`
  - `docs/LOCAL_CLOUD_STORAGE.md`
  - `server/data/store.json`
  - `database/seed_mvp.sql`
- 候选删除或改成真实页面：
  - `pp-app/src/features/companion/CompanionComingSoonPage.tsx`，当前 `/companion/creators` 仍是 coming soon。
  - `HomeFeed.tsx` 里的 `demoMapPoints`、`nearbyDemoScore`。
  - `AdminDashboard.tsx` 里的 `Demo Creator` 等演示行。
  - `accountDirectory.ts` 里的虚拟摄影师测试账号生成逻辑。
- 不应入库或不应影响审核：
  - `pp-app/dist/`
  - `pp-app/node_modules/`
  - `pp-app/*.log`
  - `server/logs/`
  - `server/*.log`
  - `database/generated/`
  - `.codex-dev-logs/`

当前这些日志和构建产物在 git 状态中是 ignored，没有被跟踪，这是好事；后续继续保持不要提交。

### 6.5 推荐的清理顺序

1. 先做生产环境开关：一处判断 `isProductionApp()`，所有 mock/login/payment/local fallback 都挂到这个开关下。
2. 再做 API 层硬失败：生产 API 失败显示错误，不回退 mock。
3. 然后替换登录/session：先让真实用户身份贯穿订单、消息、后台。
4. 拆出后台入口：移动端生产包排除 `/admin`，Admin 独立登录、独立构建、独立部署。
5. 接 PostgreSQL 写事务：订单、支付、消息、审核优先。
6. 加地图地点快照：下单必须保存 `placeName/placeAddress/placeLat/placeLng/providerPoiId`。
7. 清理 UI 演示痕迹：测试验证码、角色切换、mock 支付、coming soon、Demo 文案。
8. 最后拆大文件：先按业务边界迁移，不做无目标重构。

## 7. 每次代码任务的最小完成标准

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

## 8. 从业务 App 升级到平台型全栈工程

这一节主要是 App Store 上线后的工程升级路线。注意：运营后台从移动端包中拆出已经前移到 `1.2A`，属于初步上线前硬门槛；本节的 `apps/admin` 更偏向后续 monorepo 化、共享包抽取和独立部署体验完善。

### 8.1 工程组织：从单 App 到 monorepo

参考方向：Cal.com/Cal.diy、Medusa、Novu。

当前状态：
- 前端在 `pp-app/src`。
- 后端在 `server/server.mjs` 和 `server/store`。
- 数据库在 `database`。
- 类型主要集中在前端 `pp-app/src/types`，前后端共享不足。

可升级模块：
- 新建 `packages/shared`：放订单状态、支付状态、用户角色、API DTO、错误码。
- 新建 `packages/db`：放 schema、migration、数据库 client、transaction helper。
- 新建 `packages/ui`：沉淀按钮、表单、弹窗、地图选择器、订单状态组件。
- 新建 `apps/mobile` 或继续保留 `pp-app`：承载 Capacitor App。
- 新建或完善 `apps/admin`：在 `1.2A` 已经拆出后台入口的基础上，做成完整独立后台应用。
- 新建 `apps/api`：替代单文件 `server/server.mjs`。

版本任务：
1. 先只抽 `packages/shared`，让前后端共用 `OrderStatus`、`PaymentStatus`、`UserRole`。
2. 再抽 `packages/db`，统一数据库访问和 migration。
3. 完善 `apps/admin` 的独立发布、独立权限、独立路由和后台组件库。

你能学到：
- monorepo。
- package boundary。
- shared types。
- internal SDK。

### 8.2 API 架构：从手写路由到模块化服务

参考方向：Appwrite 的平台服务分层、Medusa 的模块化 commerce services。

当前状态：
- `server/server.mjs` 同时处理 auth、feed、order、payment、message、moderation、media、seed。
- 权限、校验、错误、日志散落在业务函数中。

可升级模块：
- `server/routes/auth.mjs`
- `server/routes/orders.mjs`
- `server/routes/payments.mjs`
- `server/routes/messages.mjs`
- `server/routes/media.mjs`
- `server/routes/admin.mjs`
- `server/middleware/auth.mjs`
- `server/middleware/requireRole.mjs`
- `server/middleware/rateLimit.mjs`
- `server/middleware/errorHandler.mjs`
- `server/services/orderService.mjs`
- `server/services/paymentService.mjs`
- `server/services/locationService.mjs`

版本任务：
1. 先抽 middleware：鉴权、角色、错误码、request id。
2. 再抽订单和支付 service，因为它们最需要事务和幂等。
3. 最后抽 feed、message、admin，降低前期风险。

你能学到：
- middleware。
- service layer。
- API contract。
- error taxonomy。
- 模块边界设计。

### 8.3 权限系统：从角色判断到 RBAC/ABAC

参考方向：Directus、Appwrite、Supabase。

当前状态：
- 用户角色大致有 consumer、companion、admin。
- 后台权限和普通用户权限没有形成完整权限矩阵。

可升级模块：
- `permissions` 表：定义 `order.read:any`、`order.read:own`、`audit.write` 等权限。
- `role_permissions` 表：角色和权限绑定。
- `resource_policies`：按资源判断，例如“摄影师只能处理自己的订单”。
- `admin_action_logs`：记录管理员操作。
- 前端 `ProtectedRoute` 升级为 `RequirePermission`。

版本任务：
1. 先做硬编码权限矩阵。
2. 再落库成 `permissions/role_permissions`。
3. 最后做资源级 ABAC，例如订单 owner、companionId、城市运营权限。

你能学到：
- RBAC。
- ABAC。
- least privilege。
- audit log。

### 8.4 实时系统：从普通聊天到实时同步

参考方向：Supabase Realtime、Appwrite Realtime、Novu Inbox。

当前状态：
- `messageService.ts` 仍有 localStorage/mockConversation 兜底。
- 没有在线状态、消息 ACK、多端同步。

可升级模块：
- `conversations` 和 `messages` 增加 cursor pagination。
- WebSocket gateway：订单消息、客服消息、审核通知。
- `message_delivery_receipts`：sent、delivered、read。
- `presence`：摄影师在线、客服在线。
- Push/站内信 fallback：离线时转通知。

版本任务：
1. 先做轮询版消息同步，保证数据正确。
2. 再加 WebSocket 只推“有新消息”的事件。
3. 最后加已读回执、在线状态、多端同步。

你能学到：
- WebSocket。
- event-driven sync。
- delivery receipt。
- offline-first。

### 8.5 搜索系统：从筛选到搜索工程

参考方向：大型 marketplace、CMS、内容平台。

当前状态：
- 首页、陪拍查找、地点筛选多为前端文本筛选和静态规则。
- 地图部分还没有 POI 搜索、地理索引、搜索日志。

可升级模块：
- `searchService`：统一搜索作品、摄影师、地点、城市专题。
- `places` 建地理索引。
- 接入 Meilisearch、Typesense 或 Elasticsearch。
- `search_logs`：记录关键词、城市、点击、转化。
- 支持拼音、同义词、热门搜索、无结果推荐。

版本任务：
1. 先用 PostgreSQL 实现基础搜索和地理距离排序。
2. 数据量上来后接搜索引擎。
3. 再做搜索日志和排序优化。

你能学到：
- full-text search。
- geo search。
- ranking。
- search analytics。

### 8.6 CMS 与运营内容：从写死配置到可运营后台

参考方向：Strapi、Directus。

当前状态：
- 热门地点、专题、首页运营位、部分筛选项更像代码里的配置。
- 后台主要偏审核/订单，还没有内容发布系统。

可升级模块：
- `editorial_collections`：城市专题、热门路线、拍摄灵感。
- `content_blocks`：首页 banner、运营位、规则说明。
- `places` 后台管理：热门地点、安全提示、禁用地点。
- `draft/published` 状态。
- 内容版本和发布时间。

版本任务：
1. 先做热门地点后台配置。
2. 再做城市专题和首页运营位。
3. 最后做草稿、发布、版本回滚。

你能学到：
- CMS data model。
- content workflow。
- draft/publish。
- editorial operations。

### 8.7 插件和第三方集成：从写死 provider 到可替换能力

参考方向：Cal.com integrations、Medusa modules、Novu providers。

当前状态：
- 地图、支付、短信、对象存储、通知都可以接，但容易写死某一个供应商。

可升级模块：
- `paymentProvider`：WeChat Pay、Stripe、mock。
- `mapProvider`：Tencent Map、Amap、Apple Map、manual。
- `smsProvider`：Aliyun、Tencent Cloud、Twilio。
- `storageProvider`：COS、S3、R2。
- `notificationProvider`：站内、短信、微信服务通知、Push。
- provider 配置放入后台或环境变量，不散落在业务代码。

版本任务：
1. 先给地图和对象存储做 provider interface。
2. 再给支付做 provider interface，但生产只启用一个。
3. 最后把通知做成事件驱动 provider。

你能学到：
- adapter pattern。
- provider abstraction。
- webhook verification。
- integration config。

### 8.8 测试体系：从能 build 到可持续交付

参考方向：所有成熟高 star 项目的 CI。

当前状态：
- 已有 `npm.cmd run build`。
- 后端有 `check:mvp` 和 smoke。
- 还缺系统性的单元、集成、E2E、并发测试。

可升级模块：
- 前端：Vitest + Testing Library。
- 浏览器 E2E：Playwright，覆盖登录、地图选点、下单、支付状态、举报。
- 后端：订单事务、支付回调、权限矩阵、消息风控单元测试。
- 数据库：migration 测试、seed 测试、rollback 测试。
- 并发：同一 slot 双人抢单测试。
- CI：每次 PR 自动跑 lint、typecheck、unit、build、smoke。

版本任务：
1. 先补订单/支付/权限的后端测试。
2. 再补 App 主流程 E2E。
3. 最后把测试接入 GitHub Actions。

你能学到：
- test pyramid。
- contract testing。
- E2E。
- CI quality gate。

### 8.9 DevOps 与云原生：从本地运行到稳定发布

参考方向：Appwrite、Supabase、自托管平台项目。

当前状态：
- 项目有本地前后端和数据库资料，但缺完整部署工程。

可升级模块：
- `Dockerfile`：api、admin、app build。
- `docker-compose.yml`：api、PostgreSQL、Redis、对象存储模拟、队列 worker。
- GitHub Actions：build、test、deploy。
- Nginx/Caddy：HTTPS、反向代理、静态资源。
- 环境分层：dev、staging、production。
- 备份和恢复脚本。
- release checklist。

版本任务：
1. 先做 `docker-compose` 本地一键启动。
2. 再做 staging 部署。
3. 最后做生产发布、回滚、备份恢复演练。

你能学到：
- Docker。
- CI/CD。
- environment promotion。
- deployment rollback。
- backup/restore。

### 8.10 安全工程：从基本鉴权到安全治理

参考方向：Appwrite、Supabase、Directus 的安全边界。

当前状态：
- 当前路线已经覆盖生产鉴权、CORS、支付验签、举报合规。
- 但还没有系统安全工程。

可升级模块：
- 输入校验 schema：所有 API request body 都必须验证。
- 输出脱敏：手机号、openid、支付回调、身份证信息。
- 文件上传安全：MIME、大小、后缀、病毒扫描、图片重新编码。
- secret 管理：密钥不进仓库，支持 rotation。
- 依赖漏洞扫描：`npm audit` 或 GitHub Dependabot。
- 安全审计日志：登录失败、权限拒绝、管理员敏感操作。
- 数据导出/删除：用户隐私权利闭环。

版本任务：
1. 先补输入校验和错误码。
2. 再补敏感数据脱敏和日志规范。
3. 最后做安全扫描、密钥轮换、用户数据导出。

你能学到：
- OWASP Top 10。
- secure upload。
- secrets management。
- privacy engineering。

### 8.11 数据与增长工程：从埋点到实验平台

参考方向：高 star SaaS 和 marketplace 项目。

当前状态：
- 路线中已有 `user_events`、推荐、热门地点、A/B 实验，但还没形成数据平台。

可升级模块：
- `event_schema`：统一事件定义、属性、版本。
- `user_events`：匿名设备、登录用户、session、来源。
- funnel：浏览作品 -> 地图选点 -> 预约 -> 支付。
- cohort：新用户、复购用户、摄影师留存。
- feature flags：首页排序、地图入口、支付文案、推荐策略。
- experiment assignment：实验分组和曝光日志。
- metrics dashboard：转化率、支付成功率、取消率、响应率。

版本任务：
1. 先做 10 个核心事件。
2. 再做漏斗和留存报表。
3. 最后做 feature flag 和 A/B 实验。

你能学到：
- event taxonomy。
- analytics pipeline。
- feature flag。
- A/B testing。

### 8.12 开源协作与开发者体验

参考方向：所有高 star 项目的 README、CONTRIBUTING、issue/PR workflow。

当前状态：
- 当前文档对自己很有用，但还不是别人能快速参与的开源项目。

可升级模块：
- `README.md`：项目介绍、技术栈、本地启动、测试账号、架构图。
- `CONTRIBUTING.md`：开发流程、分支规则、提交规范。
- `SECURITY.md`：漏洞报告方式。
- `.github/ISSUE_TEMPLATE` 和 `.github/PULL_REQUEST_TEMPLATE.md`。
- `docs/architecture.md`：模块图、数据流、订单状态机。
- `docs/runbook.md`：故障处理、回滚、备份恢复。
- `docs/api.md`：接口契约。

版本任务：
1. 先补本地启动和架构图。
2. 再补贡献规范和 PR 模板。
3. 最后补 runbook、API 文档和安全政策。

你能学到：
- DX。
- technical writing。
- open-source workflow。
- operational runbook。

### 8.13 建议版本路线

这些不是一次性重构，而是按版本推进：

#### V1：真实运营版

完成前面“必须补”和“影响真实运营”的任务：
- 真实登录。
- PostgreSQL 写入。
- 订单并发和支付闭环。
- 地图选点和地点快照。
- 合规入口。
- 后台处理闭环。
- Redis、队列、通知、监控。

#### V2：平台工程版

目标是把项目从“能跑”变成“能长期维护”：
- 拆 `server/server.mjs`。
- 建 `packages/shared`。
- 建 middleware 和 service layer。
- 做 RBAC/ABAC。
- 做测试体系和 CI。
- 做 Docker 本地一键启动。

#### V3：运营增长版

目标是让平台更会增长、更好运营：
- 搜索系统。
- CMS 运营内容。
- 地点运营后台。
- 埋点漏斗。
- feature flag。
- 推荐规则和实验。

#### V4：开放平台版

目标是接近高 star 平台项目的工程质感：
- provider/plugin abstraction。
- Webhook 平台。
- 开发者文档。
- API token。
- 多租户/团队权限。
- Realtime gateway。
- 开源协作规范。

### 8.14 学习时不要平均用力

如果你的目标是成为能独立交付产品的全栈，优先级是：

1. 订单、支付、数据库事务、权限、安全。
2. 部署、监控、日志、备份、回滚。
3. 测试、CI、代码组织、模块拆分。
4. 搜索、实时、通知、队列。
5. CMS、增长、实验、插件化。

这个顺序的原因很简单：先学会让真实业务不出事故，再学会让工程长期长大。

## 9. AI 赋能模块：API + RAG 的产品升级路线

这一节用于指导后续版本把 AI 能力接入 Still 平台。原则是：不训练模型，优先通过 AI API、结构化输出、function calling、RAG、moderation 和少量业务规则完成产品增强。

参考高 star 项目的启发：
- Dify：重点不是聊天本身，而是 AI workflow、RAG pipeline、agent capabilities、model management、observability 和 API 化接入。
- Flowise/Langflow：把 AI 能力拆成可组合节点，但 Still 第一阶段不需要做可视化工作流平台。
- Open WebUI：多模型、多 provider、RAG、RBAC、插件、用量和成本分析值得参考。
- Chatwoot：AI 最适合先放进客服和支持流程，减少重复人工，并辅助复杂会话。
- CopilotKit：适合学习 human-in-the-loop、共享状态、AI 生成 UI 和用户确认。
- LobeHub：把 agent 当成工作单元，但 Still 只需要轻量任务助手，不需要完整 agent 团队。
- Vane/Perplexica：AI 搜索可以做成不同搜索模式，例如地点找、灵感找、预算找、场景找。

### 9.1 AI 接入总原则

产品原则：
- AI 负责生成草稿、提取结构化信息、总结、解释、辅助审核。
- 订单、支付、退款、封禁、身份审核、结算等关键动作必须由业务规则或人工确认。
- AI 输出必须可编辑、可撤回、可追踪。
- 用户侧 AI 结果要用“建议”“草稿”“推荐理由”等文案，避免让用户误以为平台承诺一定正确。

技术原则：
- 前端不直连 AI API，统一走后端。
- API key 只放服务端环境变量。
- 所有 AI 请求记录业务场景、用户、prompt 版本、模型、token 成本和结果采纳情况。
- 所有结构化结果必须经过 schema 校验。
- RAG 知识库只放平台规则、客服 SOP、审核规则、地点运营资料等可控内容。
- 高风险场景必须进人工审核队列。

### 9.2 AI Gateway：所有 AI 能力的入口

先做这个模块，再做具体功能。

新增后端结构：
```text
server/routes/ai.mjs
server/services/ai/aiClient.mjs
server/services/ai/aiPromptService.mjs
server/services/ai/aiUsageLogger.mjs
server/services/ai/aiGuardrailService.mjs
server/services/ai/aiRagService.mjs
```

关联现有文件：
- `server/server.mjs`
- `server/.env.example`
- `pp-app/src/services/apiClient.ts`

建议新增环境变量：
```text
OPENAI_API_KEY=
AI_DEFAULT_TEXT_MODEL=
AI_DEFAULT_FAST_MODEL=
AI_ENABLE_USER_FEATURES=false
AI_ENABLE_ADMIN_FEATURES=false
AI_DAILY_USER_LIMIT=
AI_DAILY_ADMIN_LIMIT=
AI_RAG_VECTOR_STORE_ID=
```

建议新增数据库表：
```text
ai_requests
ai_outputs
ai_feedback
ai_prompt_templates
ai_usage_daily
```

`ai_requests` 至少记录：
- `id`
- `user_id`
- `role`
- `feature`
- `business_object_type`
- `business_object_id`
- `prompt_version`
- `model`
- `status`
- `input_tokens`
- `output_tokens`
- `cost_estimate`
- `created_at`

第一版接口：
```text
POST /api/ai/post-copy
POST /api/ai/booking-intent
POST /api/ai/support-answer
POST /api/ai/moderate-message
POST /api/ai/admin-summary
POST /api/ai/feedback
```

验收标准：
- 前端没有任何 AI provider key。
- 每次 AI 调用都能在后台查到日志。
- 超过限额时返回明确错误。
- prompt 可以按版本回滚。

### 9.3 AI 发布助手：提高摄影师供给质量

产品目标：
- 帮摄影师更快发布高质量作品。
- 降低新摄影师不会写标题、标签、套餐说明的问题。
- 提升首页内容可读性和搜索可召回能力。

关联现有文件：
- `pp-app/src/features/companion/PublishPost.tsx`
- `pp-app/src/features/companion/CompanionProfileEdit.tsx`
- `pp-app/src/features/companion/CompanionPackageSettings.tsx`
- `pp-app/src/services/companionProfileService.ts`
- `pp-app/src/services/companionPackageService.ts`
- `pp-app/src/services/feedService.ts`

AI 能力：
- 根据已有输入生成作品标题。
- 根据拍摄地点、风格、图片说明生成标签。
- 润色摄影师简介。
- 生成套餐卖点。
- 给发布表单做完整度建议。

接口：
```text
POST /api/ai/post-copy
POST /api/ai/profile-polish
POST /api/ai/package-copy
POST /api/ai/publish-checklist
```

输入示例：
```json
{
  "city": "杭州",
  "placeName": "西湖",
  "styleTags": ["日系", "清新"],
  "targetUser": "生日写真",
  "rawDescription": "周末可以拍，1小时，给底片"
}
```

输出示例：
```json
{
  "title": "西湖日系生日写真，轻松自然出片",
  "tags": ["日系", "生日", "西湖", "清新", "单人写真"],
  "description": "适合想要自然氛围的生日写真，拍摄约 1 小时，提供基础调色和精选建议。",
  "warnings": ["套餐是否包含精修数量还不够清楚"]
}
```

前端交互：
- 按钮文案：`AI 帮我润色`
- 输出必须显示为可编辑草稿。
- 用户点击“采用”后才写入表单。

验收标准：
- AI 草稿不直接发布。
- 每次采用都记录 `ai_feedback`。
- 用户能恢复原文。

### 9.4 AI 预约意图识别：把自然语言变成筛选条件

产品目标：
- 用户不需要理解所有筛选项，也能表达需求。
- 提升从浏览到预约的转化率。

关联现有文件：
- `pp-app/src/features/user/CompanionFinderPage.tsx`
- `pp-app/src/features/user/HomeFeed.tsx`
- `pp-app/src/features/user/CheckoutPage.tsx`
- `pp-app/src/services/matchingService.ts`
- `pp-app/src/services/locationService.ts`

AI 能力：
- 提取拍摄场景：生日、情侣、毕业、探店、旅行、头像。
- 提取风格：日系、港风、清新、夜景、情绪片。
- 提取预算。
- 提取时间偏好。
- 提取地点意图。
- 把一句话转成 `matchingService` 可用的参数。

接口：
```text
POST /api/ai/booking-intent
POST /api/ai/recommendation-explanation
```

输入示例：
```json
{
  "text": "我想周末在市中心拍生日照，预算 300 到 500，想要日系一点"
}
```

输出示例：
```json
{
  "scene": "birthday",
  "styles": ["日系", "清新"],
  "budgetMin": 300,
  "budgetMax": 500,
  "timePreference": "weekend",
  "placeKeyword": "市中心",
  "missingFields": ["具体日期", "人数"]
}
```

前端交互：
- 搜索框增加自然语言入口。
- 解析后展示筛选 chips，让用户确认。
- 用户确认后再调用真实匹配接口。

验收标准：
- AI 只负责解析，不直接创建订单。
- 解析失败时回退普通筛选。
- 推荐理由不能编造不存在的摄影师能力。

### 9.5 客服 RAG：平台规则和订单问题问答

产品目标：
- 降低重复客服问题。
- 帮客服更快处理退款、争议、审核、预约说明。
- 提高 App Store 审核时的合规可解释性。

关联现有文件：
- `pp-app/src/features/user/MessagesPage.tsx`
- `pp-app/src/features/admin/AdminDashboard.tsx`
- `pp-app/src/services/messageService.ts`
- `pp-app/src/services/adminService.ts`
- `docs/APP_STORE_LAUNCH.md`
- `docs/STILL_CODE_MODULE_ROADMAP.md`

RAG 知识库内容：
- 用户协议。
- 隐私政策。
- 退款规则。
- 支付说明。
- 摄影师审核规则。
- 聊天和私下交易处理规则。
- 举报处理 SOP。
- 地点安全说明。
- App Review 审核说明。

建议新增结构：
```text
docs/knowledge/
  refund_policy.md
  privacy_policy.md
  user_agreement.md
  creator_review_sop.md
  moderation_sop.md
  location_safety_sop.md
  app_review_notes.md
```

建议新增数据库表：
```text
knowledge_documents
knowledge_chunks
knowledge_sync_jobs
```

接口：
```text
POST /api/ai/support-answer
POST /api/ai/order-summary
POST /api/ai/reply-draft
POST /api/ai/rag/reindex
```

用户侧能力：
- 问“怎么退款”。
- 问“摄影师迟到了怎么办”。
- 问“可以改地点吗”。

客服侧能力：
- 一键总结订单上下文。
- 一键生成回复草稿。
- 标出规则依据。

验收标准：
- 回答必须带引用来源或规则名称。
- 无依据时回答“不确定，请转人工”。
- 不能编造退款承诺。
- 所有客服 AI 回复默认是草稿。

### 9.6 AI 审核和风控：辅助而不是代替人工

产品目标：
- 降低违规内容、骚扰、诈骗、私下交易风险。
- 减轻管理员审核压力。
- 给人工审核提供可解释摘要。

关联现有文件：
- `pp-app/src/services/messageService.ts`
- `pp-app/src/services/mediaService.ts`
- `pp-app/src/services/adminService.ts`
- `server/store/postgresModerationWrites.mjs`
- `pp-app/src/features/admin/AdminDashboard.tsx`

AI 能力：
- 聊天文本风险分类。
- 用户简介风险提示。
- 作品标题/描述风险提示。
- 举报内容摘要。
- 给审核员生成建议处理理由。

风险分类建议：
```text
harassment
sexual_content
scam
private_transaction
abuse
underage_risk
dangerous_location
identity_fraud
spam
normal
```

接口：
```text
POST /api/ai/moderate-message
POST /api/ai/moderate-profile
POST /api/ai/moderate-post
POST /api/ai/report-summary
```

建议落库：
```text
message_risk_events
audit_cases
reports
ai_outputs
```

处理策略：
- 低风险：正常通过，只记录分数。
- 中风险：提示用户修改或进入人工队列。
- 高风险：限制发送或隐藏，进入人工复核。

验收标准：
- AI 不能直接永久封号。
- AI 不能直接拒绝身份审核。
- AI 风控必须有人工复核入口。
- 管理员能看到 AI 建议和原始内容。

### 9.7 AI 搜索和灵感推荐

产品目标：
- 让用户从“筛选条件”变成“表达需求”。
- 帮用户发现地点、风格、摄影师和套餐。

关联现有文件：
- `pp-app/src/features/user/HomeFeed.tsx`
- `pp-app/src/features/user/CompanionFinderPage.tsx`
- `pp-app/src/services/feedService.ts`
- `pp-app/src/services/locationService.ts`
- `pp-app/src/services/matchingService.ts`
- `pp-app/src/services/userCollectionService.ts`

搜索模式：
- 快速找：预算、时间、地点明确。
- 灵感找：用户不知道拍什么，让 AI 推荐主题。
- 地点找：围绕地图、POI、商圈找摄影师。
- 场景找：生日、毕业、情侣、探店、夜景。

接口：
```text
POST /api/ai/search-intent
POST /api/ai/search-suggestions
POST /api/ai/feed-explanation
```

第一版不要让 AI 直接排序全量 feed。更稳的做法：
1. AI 解析用户意图。
2. 业务搜索召回摄影师和帖子。
3. 规则排序。
4. AI 只生成解释和补充搜索建议。

验收标准：
- 搜索结果来自真实数据库。
- AI 解释不能说数据库里不存在的能力。
- 用户可以切回普通筛选。

### 9.8 地点和拍摄方案助手

产品目标：
- 把地图模块从“选点”升级成“拍摄方案”。
- 提升预约前的确定感。

关联现有文件：
- `pp-app/src/services/locationService.ts`
- `pp-app/src/services/matchingService.ts`
- `pp-app/src/components/booking/LocationSelector.tsx`
- `pp-app/src/features/companion/ServiceRangeSettings.tsx`

AI 能力：
- 根据地点生成拍摄建议。
- 根据时间生成光线和路线建议。
- 根据用户场景推荐地点。
- 根据摄影师服务半径解释是否可服务。

RAG 知识库：
- 热门地点。
- 风险地点。
- 地点安全提示。
- 城市专题。
- 拍摄路线。

接口：
```text
POST /api/ai/location-plan
POST /api/ai/place-suggestions
```

验收标准：
- 地点推荐必须来自 `places` 或地图 provider 返回结果。
- 安全提示不可省略。
- 用户拒绝定位时仍可手动输入。

### 9.9 创作者成长助手

产品目标：
- 帮摄影师提高资料质量、服务质量和接单转化。
- 让平台供给质量稳定变好。

关联现有文件：
- `pp-app/src/features/companion/CompanionStudio.tsx`
- `pp-app/src/features/companion/CompanionIncomePage.tsx`
- `pp-app/src/features/companion/CompanionPackageSettings.tsx`
- `pp-app/src/services/orderSettlementService.ts`
- `pp-app/src/services/companionBookingSettingsService.ts`

AI 能力：
- 资料完整度诊断。
- 套餐描述优化建议。
- 根据浏览、收藏、预约、成交数据解释转化问题。
- 给摄影师生成本周改进建议。

接口：
```text
POST /api/ai/creator-profile-audit
POST /api/ai/creator-growth-tips
```

验收标准：
- 建议要基于真实数据，不要泛泛鼓励。
- 涉及价格时只给区间建议，不做强制改价。
- 不展示其他摄影师隐私数据。

### 9.10 运营后台 AI 助手

产品目标：
- 让运营每天快速知道平台发生了什么。
- 让问题订单、举报、审核、客服压力可见。

关联现有文件：
- `pp-app/src/features/admin/AdminDashboard.tsx`
- `pp-app/src/services/adminService.ts`
- `server/store/postgresModerationWrites.mjs`
- `server/store/postgresOrderWrites.mjs`

AI 能力：
- 今日运营日报。
- 风险订单摘要。
- 重复客服问题聚类。
- 举报原因聚类。
- 摄影师审核建议。
- 搜索无结果分析。

接口：
```text
POST /api/ai/admin-daily-brief
POST /api/ai/ops-insight
POST /api/ai/audit-case-summary
```

建议日报结构：
```json
{
  "orders": "今日新增订单、支付成功、取消和退款情况",
  "risks": "高风险消息、举报、异常订单",
  "supply": "新摄影师、待审核资料、低质量供给",
  "growth": "热门搜索、无结果搜索、转化异常",
  "actions": ["建议人工处理的事项"]
}
```

验收标准：
- AI 日报必须能跳转到真实订单、举报、审核 case。
- 运营建议不能自动执行。
- 所有高风险事项需要人工确认。

### 9.11 AI 前端交互组件

新增前端组件：
```text
pp-app/src/services/aiService.ts
pp-app/src/components/ai/AiDraftButton.tsx
pp-app/src/components/ai/AiSuggestionPanel.tsx
pp-app/src/components/ai/AiFeedbackBar.tsx
pp-app/src/components/ai/AiSourceCitations.tsx
```

组件规范：
- `AiDraftButton`：触发 AI 生成。
- `AiSuggestionPanel`：展示建议和草稿。
- `AiFeedbackBar`：采纳、不准确、没帮助。
- `AiSourceCitations`：客服 RAG 引用来源。

交互规则：
- 默认不自动覆盖用户输入。
- 默认不自动提交业务动作。
- AI 生成内容必须可编辑。
- AI 失败时不影响主流程。

### 9.12 AI 数据、成本和质量评估

为什么必须做：
- 没有日志就不知道 AI 是否真的提升转化。
- 没有反馈就无法迭代 prompt。
- 没有成本控制容易失控。

建议指标：
- AI 发布草稿采纳率。
- AI 预约解析后下单转化率。
- 客服 AI 自助解决率。
- 客服草稿采用率。
- 审核 AI 命中后人工确认率。
- 每个功能每日 token 成本。
- AI 输出投诉率。

建议新增后台视图：
- AI 使用量。
- AI 成本。
- AI 采纳率。
- AI 高风险输出。
- prompt 版本表现。

### 9.13 AI 安全边界

AI 不允许直接执行：
- 创建订单。
- 支付。
- 退款。
- 结算。
- 永久封号。
- 通过身份审核。
- 删除用户数据。
- 代表用户发送敏感消息。

AI 可以辅助：
- 生成草稿。
- 总结上下文。
- 提取结构化条件。
- 推荐下一步。
- 生成审核建议。
- 生成客服回复草稿。

高风险防护：
- 所有 AI 输入都要经过权限检查。
- 用户只能让 AI 处理自己可见的数据。
- 管理员 AI 总结不能泄露无权限数据。
- Prompt 中要明确“不得编造平台政策、价格、退款承诺”。
- RAG 没检索到依据时必须转人工。

### 9.14 AI 版本路线

#### AI V0：基础设施版

目标：先有统一 AI 接入，避免后续散乱。

任务：
1. 新增 `server/routes/ai.mjs`。
2. 新增 `server/services/ai/aiClient.mjs`。
3. 新增 `ai_requests/ai_outputs/ai_feedback`。
4. 后端统一限流和日志。
5. 前端新增 `aiService.ts`。

验收：
- 可以完成一次 AI 调用。
- 可以查到调用日志。
- 可以关闭所有 AI 功能。

#### AI V1：转化和供给版

目标：先做最直接提升体验和供给质量的功能。

任务：
1. AI 发布助手。
2. AI 资料润色。
3. AI 套餐描述。
4. AI 预约意图识别。

验收：
- 摄影师可采用 AI 草稿。
- 用户自然语言能转成筛选条件。
- AI 失败不影响发布和预约。

#### AI V2：客服和风控版

目标：降低真实运营压力。

任务：
1. 客服 RAG。
2. 订单摘要。
3. 回复草稿。
4. 消息风险分类。
5. 举报摘要。

验收：
- 客服回答有知识来源。
- 高风险内容进入人工队列。
- AI 不自动做处罚。

#### AI V3：搜索、地点和运营版

目标：提升发现效率和运营效率。

任务：
1. AI 搜索意图。
2. AI 地点方案。
3. AI 创作者成长建议。
4. AI 运营日报。

验收：
- 搜索结果来自真实数据。
- 地点建议来自地图/地点库。
- 运营日报可跳转到真实业务对象。

#### AI V4：轻量 Agent 和工作流版

目标：在业务稳定后再做自动化工作流。

任务：
1. 客服助手可以多轮追问。
2. 运营助手可以生成待办。
3. 审核助手可以组装 case 材料。
4. 支持 human-in-the-loop 确认。

验收：
- 所有工作流都有暂停和人工确认。
- 所有自动化步骤有审计日志。
- 任意 AI 工作流可以关闭。

### 9.15 最推荐的落地顺序

1. AI Gateway。
2. AI 发布助手。
3. AI 预约意图识别。
4. 客服 RAG。
5. AI 审核和举报摘要。
6. AI 搜索和地点方案。
7. 创作者成长助手。
8. 运营日报。
9. 轻量 agent 工作流。

这个顺序的核心判断：先做能直接提升供给和转化的 AI，再做能降低运营成本的 AI，最后才做更复杂的 agent 化。
