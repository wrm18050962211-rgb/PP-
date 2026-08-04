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
- 新增 `providerCallbackRetryJob` 和 `npm run job:retry-provider-callbacks`：可领取到期回调、调用 provider processor、成功标记 processed、失败按退避时间重新排队。
- 新增微信支付/退款回调重放 processor：`job:retry-provider-callbacks` 已显式接入 `createWechatCallbackProcessors`，可从原始回调事件解密 resource、重放支付成功/关闭和退款成功/失败/关闭，并用 `check:wechat-callback-processors` 纳入 `check:mvp`。
- 微信支付/退款实时通知入口的 Postgres 副作用 ID 已改用 UUID：回调事件、支付成功会话、订单状态日志和退款成功状态日志不会再把演示前缀 ID 写进 UUID 列，并由 `check:postgres-wechat-notify-route` 守住。
- 订单创建入口的 Postgres ID 已改用 UUID：Postgres 模式下订单、支付、幂等记录、状态日志和加购项行 ID 不再使用本地演示前缀 ID，并由 `check:postgres-order-route` 守住。
- 支付成功、用户订单动作和后台订单状态入口的 Postgres 副作用 ID 已改用 UUID：会话、状态日志、结算、账本和退款草稿 ID 不再使用本地演示前缀 ID，并由对应 route check 守住。
- 消息、举报、审核处理和后台风控动作入口的 Postgres 写入 ID 已改用 UUID：消息、风控事件、举报、审核 case、审计日志和管理员动作日志 ID 不再使用本地演示前缀 ID，并由对应 route check 守住。
- 运行时审计镜像的 Postgres 写入 ID 已改用 UUID：`recordAuditLog`、`recordAdminAction`、`recordSecurityEvent` 在 Postgres 模式下不再把演示前缀 ID 写入审计/安全表，并由 `check:runtime-audit-gateway` 守住。
- 新增 `check:postgres-id-hygiene` 并纳入 `check:mvp`：统一防止 Postgres gateway draft 重新使用本地演示前缀 ID。
- `check:postgres-live` 已增强 session/audit/security 检查：真实 PostgreSQL CI 会验证 `user_sessions`、`audit_logs`、`admin_action_logs`、`security_events` 的关键字段存在。
- 新增 `maintenanceJob` 和 `npm run job:maintenance`：统一串联 pending payment 超时释放与 provider callback 重试，作为后续接 cron/云任务/队列 worker 的第一版稳定入口，并由 `check:maintenance-job` 纳入 `check:mvp`。
- `maintenanceJob` 已改为 fail-soft：单个子任务失败会记录失败结果并继续运行后续维护任务，避免支付释放或回调重试其中一侧短暂故障拖垮全部定时维护。
- 新增 GitHub Actions 初步 CI：push/PR 会跑 server `check:mvp`、可选真实库检查、前端 production guard、移动端构建和后台构建；后续可继续扩展到真实 PostgreSQL service、lint/typecheck 分层和部署流水线。
- CI 的 server job 已接入 PostgreSQL 16 service：会导入 `database/schema.sql` 后运行 `check:postgres-live`，用于提前发现 schema 无法落库、关键表缺失或锁语法不兼容的问题。
- `check:postgres-live` 已增强 provider callback 检查：确认 `provider_callback_events` 的队列字段存在，并验证到期回调领取查询可使用 `for update skip locked`。
- `check:postgres-live` 已改为使用 `psql` CLI 执行真实库检查，避免 server 包为了 CI live check 额外引入 `pg` 运行依赖；CI 会安装 PostgreSQL client 后执行。
- 新增 `check:ci-workflow` 并纳入 `check:mvp`：静态确认 CI 仍包含 Postgres service、schema 导入、server MVP、真实库检查、前端 production guard、移动端构建和后台构建。
- 新增 `database/POSTGRES_CLOUD_RUNBOOK.md` 和 `check:postgres-launch-readiness`：用于租腾讯云/阿里云 PostgreSQL 前确认 schema、seed、live check、maintenance job、CI 和云数据库接入文档齐全，明确数据库可先进入联调阶段，但图片/视频仍应走对象存储，支付、后台独立部署、监控和备份仍需继续补。
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

### 1.9 业务侧上线材料、备案与资质准备

这一节不是代码任务，但必须和代码推进并行。Still 如果要进入中国区 App Store、国内安卓市场，或者把 API/官网部署在中国内地云服务器上，业务侧材料要提前准备；不要等代码完成后才开始办备案和支付入网。

公司主体的股东实缴、日常记账、月度申报、财务报表与工商年报统一参考：[`COMPANY_FINANCE_COMPLIANCE.md`](COMPANY_FINANCE_COMPLIANCE.md)。

#### 1.9.1 域名和公司云账号

业务任务：

1. 先确定正式域名：
   - 主官网域名，例如 `still.xxx`、`stillapp.xxx`、`frameyu.xxx` 或其他品牌域名。
   - API 子域名，例如 `api.xxx.com`。
   - 后台子域名，例如 `admin.xxx.com`。
2. 尽量用公司主体注册域名，不用个人主体：
   - 域名注册主体建议与“帧遇科技有限公司”一致或有关联。
   - 域名实名认证信息要和后续备案主体匹配。
3. 选择主要云服务商：
   - 腾讯云：更适合微信支付、腾讯 COS、腾讯云 PostgreSQL、腾讯位置服务放在同一生态。
   - 阿里云：更适合高德地图、阿里云 RDS、OSS、备案流程放在同一生态。
4. 用“帧遇科技有限公司”完成云账号企业实名认证。

代码/配置关联：

- `VITE_API_BASE_URL` 最终指向生产 API 域名。
- 后端 `PUBLIC_API_ORIGIN`、`CORS_ALLOWED_ORIGINS` 要写入官网、App、后台允许访问的域名。
- 后台独立部署时应使用独立后台域名，不混在移动端 App 包里。

#### 1.9.2 ICP 备案

适用条件：

- 官网、API、后台服务器如果部署在中国内地云服务器上，需要做 ICP 备案。
- 备案通常通过服务器接入商提交，例如腾讯云或阿里云，不是直接在代码仓库里完成。

业务侧准备：

- 公司营业执照。
- 法人身份证。
- 网站/App 负责人身份证。
- 负责人手机号、邮箱。
- 公司注册地址。
- 公司客服电话。
- 已完成实名认证的域名。
- 云服务器或备案服务码。
- 网站名称和服务内容说明。
- 隐私政策 URL。
- 用户协议 URL。
- 联系我们/客服页面。
- 真实性核验材料，按云服务商和管局要求执行。
- 可能需要公章或授权书，视主体、地区和经办人情况而定。

Still 的备案描述建议保持朴素、准确：

```text
生活方式摄影服务预约平台，提供摄影师作品展示、拍摄预约、订单沟通、客服与举报处理等服务。
```

避免把首版备案描述写成新闻、出版、医疗、金融、直播、网络文化、社交交友等容易触发前置审批或更重资质判断的类别。

代码/产品关联：

- 官网需要有极简可访问页面。
- 官网底部需要预留备案号展示位置。
- 隐私政策、用户协议、退款规则、客服联系方式要有正式 URL。

#### 1.9.3 APP 备案

适用条件：

- Still 如果要上中国区 App Store 或国内安卓应用市场，需要准备 APP 备案。
- APP 备案通常需要先确定 App 基础信息和服务器域名。

业务侧准备：

- App 名称：`Still` 或最终确定的中英文名称。
- App 图标。
- App 简介。
- App 类别。
- iOS Bundle ID，例如 `com.frameyu.still`。
- Android 包名，如果后续上安卓。
- App 版本号。
- App 负责人。
- 服务器域名。
- 隐私政策 URL。
- 用户协议 URL。
- 客服联系方式。
- App 截图。
- App 权限说明：
  - 相册：上传头像、作品、聊天图片或成片。
  - 相机：拍摄头像、现场素材或认证材料。
  - 定位：查找附近拍摄地点、摄影师服务范围和订单地点。
  - 通知：订单状态、聊天、支付和服务提醒。
- 主要功能说明：
  - 浏览摄影作品。
  - 预约摄影师。
  - 订单沟通。
  - 支付。
  - 举报。
  - 个人中心。

产品/代码关联：

- App 内“设置/关于 Still”要预留 APP 备案号展示位。
- 备案号应放在显著位置，并按应用商店/备案要求指向或说明工信部备案系统。
- App Store Connect 中国区上架信息需要填写对应备案信息。

#### 1.9.4 公安联网备案

适用条件：

- ICP 备案完成、网站或 App 开通后，通常需要在规定期限内完成公安联网备案。

业务侧准备：

- ICP 备案号。
- 公司主体信息。
- 负责人信息。
- 域名。
- 网站/App 服务说明。
- 安全负责人联系方式。

产品/代码关联：

- 官网底部可预留公安备案号展示位。
- App 的“关于 Still”或合规信息页可展示备案与公安备案信息。

#### 1.9.5 支付入网与平台交易资质预判

业务任务：

- 申请微信支付/支付宝商户。
- 准备营业执照、法人身份证、对公账户、商户简称、客服电话、经营类目、App 名称、服务说明、协议和退款规则。
- 明确 Still 的收款模型：
  - 平台只收定金或服务费。
  - 平台代收后再与摄影师结算。
  - 用户直接向摄影师支付，平台只做撮合。
- 如果做“摄影师入驻 + 用户下单 + 平台抽佣/分账”，需要提前让支付服务商或法务确认是否涉及 ICP 许可证、EDI 许可证、支付分账合规、资金池或二清风险。

代码/产品关联：

- 支付 provider、退款 provider、分账或结算方案要和业务模型一致。
- App Store 审核说明要明确：支付用于线下摄影/拍摄服务预约，不是数字内容购买。
- 后台需要订单、退款、结算、对账和纠纷处理记录。

#### 1.9.6 地图服务商与定位合规

业务任务：

- 选择高德开放平台或腾讯位置服务。
- 完成开发者账号和必要的企业认证。
- 创建 iOS/Android/Web/API Key。
- 配置 Bundle ID、域名、调用白名单或安全限制。
- 评估商业用量、定价和授权。

代码/产品关联：

- 地图 provider 不写死在业务代码里，至少通过配置切换。
- 隐私政策要列明地图 SDK、定位权限、设备信息和位置数据用途。
- 用户拒绝定位时，仍能手动搜索或填写地点。
- 不自行采集或制作地图底图，不做测绘业务；第一版只使用持牌地图服务商 API。

#### 1.9.7 未来国内安卓上架：软件著作权

适用条件与优先级：

- 软件著作权登记不作为 Still 当前 TestFlight、App Store 首发的前置条件，不应因此推迟 iOS 上线。
- 当 Still 确定启动国内安卓应用市场上架时，将软件著作权登记纳入安卓发布准备，并在提交国内安卓渠道审核前完成。
- 第一阶段只登记一个能够独立运行、功能相对稳定的 Still 移动端业务版本；运营后台或服务端以后形成可独立部署、许可的软件时，再判断是否分别登记。

申请前准备：

- 冻结一个可构建、可运行的安卓候选版本，保留对应 Git commit、版本号和真实开发完成日期。
- 软件全称、简称、安卓上架名称、APP 备案名称和开发者主体尽量保持一致；建议候选全称为 `Still 生活方式影像服务平台软件 V1.0`，简称为 `Still`，最终以实际上架名称为准。
- 如果由“帧遇科技有限公司”作为著作权人，先确认公司成立前的创始人代码、员工职务开发代码、外包或合作开发代码均已有清晰的书面权属或转让文件。
- 盘点 React、Capacitor、图标库等第三方依赖及其许可证，不把第三方依赖、`node_modules`、构建产物或生成代码作为自主开发成果申报。
- 准备软件著作权登记申请表、公司主体证明、源程序鉴别材料和用户手册/设计说明书等文档鉴别材料。
- 源程序材料只选取 Still 自主业务代码，提交前清除密钥、Token、手机号、测试账号、数据库连接信息和 `.env` 内容；确有商业秘密时评估例外交存或封存方式。
- 通过中国版权保护中心官方渠道提交登记；代理服务仅在材料整理或权属关系复杂时按需使用。

验收标准：

- 软著证书上的权利人、软件名称、简称和版本与国内安卓上架材料不存在无说明的冲突。
- 登记版本对应的源代码快照、申请材料、权属文件和证书由公司统一归档。
- 安卓应用市场要求版权证明时，可以直接提交软著证书；如通过授权主体上架，同时备好授权链文件。

#### 1.9.8 当前最实际的业务准备顺序

1. 确定腾讯云或阿里云作为主云服务商。
2. 用“帧遇科技有限公司”完成云账号企业实名认证。
3. 注册公司主体域名，并完成域名实名认证。
4. 准备营业执照、法人身份证、负责人身份证。
5. 准备公司手机号、邮箱、客服电话。
6. 准备 Still 的隐私政策、用户协议、退款规则、删除账号说明。
7. 做一个极简官网页面：介绍 Still、联系方式、隐私政策、用户协议。
8. 购买满足备案条件的中国内地云资源。
9. 提交 ICP 备案。
10. ICP 通过后，提交 APP 备案。
11. 备案号拿到后，放进官网底部和 App 设置页。
12. 完成公安联网备案。
13. 再去 App Store Connect 填备案信息，上中国区。
14. 支付入网、地图企业认证、对象存储、短信/通知服务并行推进。
15. 仅在启动国内安卓上架时，冻结安卓候选版本、清理软件权属并申请软件著作权；软著不阻塞当前 iOS 首发。

### 1.10 基础运维九项上线门槛

这一节属于 P0 发布门槛，不再放到“有真实用户后再补”。只要 Still 的 API、官网、Admin、TestFlight 或 App Store 版本有任意一个对外提供服务，就必须按本节推进。

#### 1.10.1 外部监控和崩溃发现

- 使用独立于生产服务器的外部监控，每 1-5 分钟检查官网、API `/api/health` 和必要政策 URL。
- 外部监控不能只判断端口存活，还要验证 HTTPS、响应状态、响应时间和健康检查关键字段。
- iOS 接入崩溃上报，事件必须包含环境、App version、build number 和可追溯的 Git commit，但不得包含 token、手机号、支付字段和聊天明文。
- 后端数据库连接失败、支付/退款回调失败、维护任务失败、磁盘空间不足和连续 5xx 必须进入告警。
- 告警至少到达一个主要负责人和一个备用负责人，并完成一次测试告警。

#### 1.10.2 生产权限和 AI 操作边界

- 生产服务器使用独立低权限运行账号，日常发布账号与 root 分离。
- AI 可以生成命令、检查清单、部署脚本和日志分析建议，但不得持有长期 root/SSH 权限、生产密钥、数据库管理员密码或支付私钥。
- AI 建议的生产变更必须由人审阅目标、影响、回滚命令和验证方式后再执行；删除、迁移、权限、支付、证书和数据库操作必须显式确认。
- 线上排障优先只读查看日志、指标和健康状态，不允许为了快速修复直接编辑生产源码。
- 生产凭据只进入云密钥管理、受控环境变量或专用密码库，不进入 Git、聊天记录、截图和运维清单。

#### 1.10.3 数据异地备份和恢复演练

- PostgreSQL 开启托管自动备份，并定义首发阶段的 RPO、RTO、保留周期和恢复负责人。
- 至少保留一份与生产实例故障域分离的备份；只在同一台服务器复制数据库文件不算备份。
- COS/OSS 媒体开启版本控制、生命周期或等价保护，明确误删和覆盖后的恢复方式。
- 上线前必须从备份恢复到隔离环境，验证关键用户、订单、支付、消息和审计数据可读。
- 每次 schema 高风险迁移前创建可恢复备份，并记录恢复点、迁移版本和回滚条件。

#### 1.10.4 域名、证书和政策 URL 生命周期

- 域名使用公司主体账号管理，开启自动续费并设置负责人和备用联系人。
- HTTPS 证书开启自动续期，持续验证续期任务，而不是只确认当前证书有效。
- 域名和证书至少配置 30/14/7 天到期提醒；API、Admin、官网和政策 URL 都要覆盖。
- DNS、证书或政策 URL 变化必须先在 staging 验证，再更新 App 配置和审核材料。

#### 1.10.5 账单、配额和资源用量预警

- 云服务器、PostgreSQL、COS/CDN、短信、地图、监控和其他付费 Provider 都要登记预算与计费方式。
- 配置 50%/80%/100% 预算告警；有硬配额的服务同时配置安全上限或限流策略。
- 账单告警必须通知真实负责人，不能只留在云控制台。
- 不对数据库、支付回调等关键服务设置会造成数据损坏的自动停机；超预算时优先限流非关键能力并人工决策。
- 每月检查费用趋势、异常调用和闲置资源。

#### 1.10.6 禁止在线改代码，发布必须可回滚

- 生产源码和配置不得通过 `vim`、面板编辑器或临时文件直接修改。
- 发布物必须由已验证的 Git commit 构建，记录 commit SHA、构建时间、数据库迁移和操作者。
- 采用版本目录或等价的不可变发布方式；切换版本后运行健康检查，失败自动或人工回滚上一版本。
- 数据库迁移与应用发布分开评估；不可逆迁移必须先停下确认，不得把“回滚代码”误认为“数据库也已回滚”。

#### 1.10.7 Git 作为唯一版本来源

- 代码、非敏感配置模板、迁移、部署脚本和运维 Runbook 都进入 Git。
- 每个 staging/production 版本必须能映射到唯一 commit SHA；App build、后端版本和 Admin 版本都要记录。
- 只提交与当前节点相关的文件，不提交 `.env`、密钥、日志、数据库备份、构建产物和临时发布压缩包。
- 本地检查点用于回滚和审阅；只有用户确认版本可发布后才推送正式分支或创建 release。

#### 1.10.8 AI 生成专属运维清单

- AI 可根据 Still 的环境生成日/周/月清单、发布前检查、故障排查和恢复步骤。
- 清单必须写明环境、目标资源、只读检查、变更步骤、回滚步骤、验证方法和需要人工确认的高风险操作。
- 清单由人审阅后以非敏感 Runbook 形式进入 Git；云账号、手机号、密钥和真实内部地址不写入仓库。
- 云控制台状态、账单、证书和备份成功记录必须由真实系统验证，不能把 AI 生成文字当作完成证据。

#### 1.10.9 持续巡检和事故响应

- 明确工作日和非工作时段的主要负责人、备用负责人、告警确认时限和升级路径。
- 建立事故分级、止损、回滚、数据恢复、用户通知、证据保留和复盘模板。
- 发布后至少设置一个观察窗口，检查崩溃、5xx、支付、短信、数据库、磁盘、延迟和账单异常。
- 上线前完成一次测试告警、一次应用回滚和一次数据库恢复演练；未提供脱敏证据不得标记完成。

对应详细节点：

| 责任端 | 主要节点 | 交付重点 |
| --- | --- | --- |
| Windows | `WIN-DELIVERY-1`、`WIN-OBS-1`、`WIN-BACKUP-1` | 不可变发布、Git SHA、回滚、后端观测、备份与恢复 |
| Mac/iOS | `IOS-CRASH-1` | 崩溃、网络失败、版本与 commit 映射 |
| User/External | `EXT-CLOUD-1`、`EXT-COST-1`、`EXT-DOMAIN-1`、`EXT-OBS-1`、`EXT-RUNBOOK-1` | 云资源、账单、证书、外部监控、权限和应急责任 |
| Integration | `INT-OPS-1` | 联合执行告警、回滚、恢复和发布追溯验收 |

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

### 2.5 运行可观测性深化

P0 的外部可用性、崩溃上报、关键错误告警和发布追溯必须先按 `1.10` 完成。本节是在真实运营量出现后继续提高诊断效率和容量判断，不得用本节尚未实施作为跳过 P0 监控的理由。

代码事务：

- 扩展前端崩溃、性能、网络错误和版本分布观测。
- 扩展后端结构化日志：
  - request id
  - user id
  - order id
  - payment no
  - duration
  - error code
- 支付失败、数据库错误、队列堆积需要告警。
- 增加 SLI/SLO、慢查询、容量趋势、告警降噪和月度可用性回顾。

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

### 3.5 用户拍摄偏好档案：先沉淀数据，再接 AI

核心判断：这个模块应该尽早上线，但第一版不依赖视觉 AI，也不要求用户导入大量日常照片。先验证用户是否愿意表达偏好、摄影师是否会使用、是否能减少拍前沟通并提高满意度，再逐步增加 AI 自动理解能力。

产品目标：
- 把摄影师难以长期记住的用户偏好，沉淀成用户自己拥有、可编辑、可删除、可授权的长期档案。
- 区分“长期偏好”和“本次拍摄需求”，避免把一次生日、旅行或特殊风格误判成永久偏好。
- 下单时生成不可被后续修改影响的订单需求快照，让摄影师在拍前快速理解陌生用户。
- 拍摄完成后通过选片和反馈提出档案更新建议，只有用户确认后才写入长期档案。
- 让用户更换摄影师时仍能复用历史偏好，提高用户对 Still 的长期价值感，而不是只依赖同一摄影师记忆熟客。

第一版产品范围：
- “我的拍摄偏好”轻量问卷：想要的感觉、抓拍/摆拍、引导强度、镜头紧张程度、修图边界、不希望出现的问题、隐私与展示偏好。
- 平台样片的“喜欢这个风格 / 不适合我”及原因标签。
- 用户可选上传少量喜欢、不喜欢和参考图片；第一版不申请读取整个系统相册，不要求批量导入。
- 自动生成可编辑的“拍摄偏好卡”，第一版可使用规则模板，不依赖模型。
- 下单时默认引用长期档案，由用户确认、临时覆盖或关闭；确认后保存 `booking_preference_snapshot`。
- 拍后反馈：最喜欢/不满意的成片、原因标签、互动方式是否合适、是否沿用本次偏好。
- 摄影师端只展示用户明确授权且与当前订单有关的信息，不能看到用户未授权的历史照片或其他订单隐私。

建议结构化字段：
```text
长期偏好
  desired_feelings
  disliked_styles
  capture_mode            # 抓拍 / 摆拍 / 混合
  guidance_level
  interaction_preferences
  retouch_boundaries
  recurring_concerns
  media_preferences
  privacy_preferences

本次拍摄需求
  scene
  styles
  reference_media_ids
  wanted_results
  avoid_results
  route_advice_needed
  pose_guidance_needed
  outfit_advice_needed
```

建议新增数据表：
```text
user_shooting_preferences
user_preference_references
booking_preference_snapshots
shooting_preference_feedback
preference_change_logs
```

数据原则：
- 结构化字段是事实源；未来 AI 生成的文字摘要只是可重新生成的展示层，不能成为唯一存储。
- 每条 AI 建议要记录来源、置信度和用户确认状态，未经确认不能写入长期偏好。
- 用户可以按单次订单覆盖长期偏好，历史订单快照不能被后来修改反向覆盖。
- 参考图、成片和偏好档案分别配置访问权限、保留期限、导出和删除能力。
- 不把“外貌缺陷”“身材问题”作为产品标签；只描述用户确认的拍摄方式、构图、光线、互动和修图偏好。

建议接口：
```text
GET    /api/me/shooting-preferences
PUT    /api/me/shooting-preferences
POST   /api/me/shooting-preferences/references
DELETE /api/me/shooting-preferences/references/:id
POST   /api/orders/:id/preference-snapshot
POST   /api/orders/:id/shooting-feedback
```

首轮验证指标：
- 偏好档案开始率、完成率和授权率。
- 从档案完成到预约开始、支付成功的转化变化。
- 摄影师查看率、摄影师“对本次拍摄有帮助”反馈率。
- 拍前重复沟通次数和需求变更次数是否下降。
- 有偏好快照订单与无偏好快照订单的满意度、退款/投诉差异。
- 用户对系统建议的确认、修改和拒绝比例；高修改率代表字段或推断方式需要调整。

验收标准：
- 没有 AI 时也能完成档案、订单快照、摄影师查看和拍后反馈闭环。
- 用户不建立档案仍可正常搜索、预约和支付。
- 摄影师只能看到当前订单已授权的最小必要信息。
- 用户可以查看、修改、撤回授权和删除偏好数据。
- 数据结构可以被后续 AI 偏好助手直接复用，不需要推翻重做。

### 3.6 双边忠诚度：先让平台更值得留下，再做权益激励

核心判断：摄影是低频服务，不能照搬外卖的日活、连续签到或高频优惠模型。Still 要培养的不是“用户永远只找一个摄影师”，而是两种可持续关系：用户下一次有拍摄需求时仍优先回到 Still；摄影师有档期和获客需求时仍愿意在 Still 发布、报价、履约和经营回头客。

产品原则：

- 用户复约同一摄影师和带着偏好档案更换摄影师都算平台忠诚，不能只优化单一摄影师绑定。
- 摄影师留存先依靠高质量线索、复约客户、交易保障、结算确定性、可信作品证明和省时间的工作台，再考虑降佣或奖励。
- 忠诚度功能不能新增一条平行交易链路。必须复用“需求卡 → 摄影师报价 → 用户付定金 → 尾款托管 → 拍摄/交付 → 双方确认 → 平台结算”。
- 当前 `CheckoutPage` 的直接全额支付遗留路由应关闭或重定向到统一咨询流程；否则复约、需求快照、佣金和权益会产生两套事实源。
- 首单不增加强制步骤。偏好、关注、档期提醒、保存常约摄影师和拍后反馈均可跳过。
- 不把打击跳单作为唯一留存手段。平台必须先提供私下交易无法稳定获得的偏好复用、可信履约记录、取消/争议保障、交付留底和服务恢复。

#### 3.6.1 固定推进顺序

阶段 0：先补交易事实源，不新增忠诚度页面。

1. 咨询、摄影师报价和需求卡从 localStorage 迁到 PostgreSQL。
2. 用户接受报价时保存不可变 `booking_requirement_snapshot`，包含当次偏好、参考作品/媒体、时间地点、交付数量、修图边界、报价版本和授权。
3. 统一支付语义：用户拍摄前支付尾款到平台托管，完成后平台“结算尾款”给摄影师；不能把支付与结算混成同一个动作。
4. 完成真实通知、客服、取消/争议、交付留底、结算和分析事件，否则后续复约与成长指标不可信。

阶段 1：P2A 非补贴留存 MVP，优先级最高。

用户端只增加四个轻入口：

1. 完成订单页的“再次预约这位摄影师”。
2. “我的”中的“常约摄影师”，由已完成平台订单生成，不要求用户手工管理复杂分组。
3. 再次预约时提供“沿用上次需求/偏好草稿”，但必须重新选择档期并确认当前价格、地点、授权和新订单快照。
4. 用户主动订阅后，才发送常约/收藏摄影师开放档期提醒；可以设置频率和一键退订。

摄影师端只增加四个轻入口：

1. 咨询卡显示最小回头客摘要，例如“已完成 2 次平台订单”，不显示手机号和其他订单详情。
2. 复用常用报价说明、交付说明和附加项模板，减少重复输入；模板不能绕过用户确认。
3. 工作台显示响应、报价、完单、按时交付、评分、复约和结算状态的可解释摘要。
4. 清楚展示平台托管、取消补偿、争议冻结和预计结算，使留在平台交易有直接价值。

阶段 2：P2B 可信供给与成长体系，在阶段 1 真正有人使用后上线。

摄影师和作品使用两套证据，不能混为一个认证：

```text
photographer_verification
  identity_verified
  capability_reviewed
  platform_fulfillment_eligible
  status / reason / reviewed_at / appeal_status

work_provenance
  platform_order_verified       # 来自已完成 Still 订单，真实性最强
  externally_created_reviewed   # 站外作品，经人工/版权审核
  externally_created_declared   # 摄影师自述来源，可信度较低
```

- 平台认证摄影师可获得认证标识、搜索/专题资格、可信曝光和成长权益，但曝光规则必须公开主要因素、可申诉并可人工纠正。
- 非认证摄影师仍可发布作品和冷启动，只是认证状态和作品来源必须如实展示。
- 不采用“认证摄影师以后只能上传平台订单作品”的规则。站外作品仍有展示价值；平台订单成片通过来源标识获得更高交易可信度。
- 摄影师等级优先使用经过裁定的真实履约指标，不以发帖数量、在线时长、单次投诉或不透明 AI 分数决定。
- 第一版不做公开排行榜，避免摄影师为了分数拒绝难单、诱导好评或过度内卷。

阶段 3：P3A 经济权益试点，必须经过指标和单位经济闸门。

候选方案按推荐顺序逐项实验，不要求全部落地：

1. 服务恢复额度：仅用于平台责任或明确服务失败后的人工/规则化补救，优先修复信任。
2. 摄影师成长权益：更快结算、专题资格、工具额度或阶段性降佣，优先奖励稳定履约而不是单纯成交额。
3. 用户复约权益：限定订单、限定有效期的小额复约优惠；先验证增量复购，不做常态价格战。
4. 推荐奖励：只在被推荐用户完成真实订单并过退款期后入账，设置预算和反作弊。
5. 可选会员：只有用户确实存在多场景拍摄、权益能覆盖真实成本且不依赖强制续费时再试点。

每次只开启一个最小实验，所有金额、佣金和资格由服务端版本化规则和账本计算，支持退款冲正、预算上限、城市/人群灰度与 Kill Switch。领取量、点击量和补贴 GMV 不能单独证明成功。

阶段 4：P3B AI 降低操作成本，不改变权益事实源。

- 用 AI 整理长期偏好、历史订单和本次需求，生成用户可确认的复约草稿。
- 为摄影师总结当前订单必要的偏好和历史关系摘要，不展示原始推理或无关订单。
- 为摄影师提供可解释的经营建议，例如响应速度、报价流失和复约变化；不能自动处罚、降权或改佣金。
- 只有结构化非 AI 闭环和真实指标证明有价值后，才使用用户主动选择的少量照片增强个人摄影 Skill。

#### 3.6.2 最小数据模型与接口

第一阶段优先复用 `orders`、`consultations`、收藏/关注、通知、偏好、评价和结算，不要一开始建立庞大 CRM。建议最小新增或派生：

```text
user_photographer_relationships     # 完单次数、最近完单、是否常约；不保存私下联系方式
rebooking_drafts                    # 从历史订单生成、短期保存、支付前重新确认
photographer_verifications          # 认证状态、证据、原因、复核和申诉
work_provenance_records             # 作品来源和对应平台订单/人工审核
photographer_metric_snapshots       # 可解释指标快照，不直接等同永久等级
service_recovery_records            # 原因、额度、责任、领取和冲正
```

经济实验获批后再新增：

```text
loyalty_rule_versions
loyalty_ledger_entries
commission_rule_versions
experiment_assignments
```

建议接口：

```text
GET  /api/me/photographer-relationships
POST /api/orders/:id/rebook-draft
POST /api/photographers/:id/availability-subscription
DELETE /api/photographers/:id/availability-subscription
GET  /api/companion/me/growth-summary
GET  /api/companion/me/verification
POST /api/companion/me/verification/appeals
GET  /api/posts/:id/provenance
POST /api/orders/:id/service-recovery        # 管理员/规则受控
```

经济实验接口在批准后单独评审，不能把优惠计算硬编码在 iOS/Web 客户端。

#### 3.6.3 指标与继续/停止闸门

摄影低频，核心观察窗口使用 90/180 天，而不是 D1/D7 打开次数。

用户侧：

- 完成订单到再次发起咨询、再次支付的 90/180 天比例。
- 同摄影师复约率与跨摄影师偏好复用率，二者分开统计。
- “再次预约”草稿创建、完成和在档期/价格确认处退出的比例。
- 用户因托管、交付留底、服务恢复或偏好复用选择平台内交易的研究反馈。
- 复约订单取消、争议、退款和满意度是否优于首单。

摄影师侧：

- 30/90 天仍发布有效档期并响应咨询的供给留存率。
- 有效询价率、报价响应时间、报价接受率、按时交付、完单和复约客户比例。
- 摄影师通过平台获得的净收入、结算时效、服务成本和申诉纠正率。
- 认证/来源标识是否提高转化，同时是否伤害新摄影师冷启动。

经济实验必须同时满足：增量复约或供给留存改善、贡献毛利与回收期在预算内、投诉/退款/跳单不恶化、对照组差异可解释。若没有增量、需要持续扩大补贴或使双端操作明显变复杂，应关闭而不是继续叠功能。

第一批明确不做：

- 签到、每日任务、复杂积分商城和公开财富榜。
- 默认营销 Push、未经同意的自动回访和摄影师批量触达用户。
- 摄影师导出用户手机号、跨订单隐私或完整个人偏好档案。
- 强制独家、认证摄影师只能上传平台订单作品、仅凭关键词就自动处罚跳单。
- 一次上线会员、优惠券、推荐奖、降佣和成长值，导致无法归因。

## 4. 四阶段小步推进路线

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
14. 并行业务侧准备：
    - 确定主云服务商和公司主体云账号。
    - 注册公司主体域名并完成实名认证。
    - 准备官网、隐私政策、用户协议、退款规则、删除账号说明。
    - 提交 ICP 备案。
    - ICP 通过后提交 APP 备案。
    - 预留官网底部和 App 关于页的备案号展示。
    - 准备公安联网备案材料。
    - 启动微信/支付宝商户入网、地图开发者企业认证、对象存储账号配置。
15. 完成基础运维 P0：
    - 外部监控和 iOS 崩溃上报可触发测试事件。
    - 后端发布可追溯到 Git commit，并完成一次应用回滚。
    - PostgreSQL 自动备份、异地副本和隔离恢复演练完成。
    - 域名/证书 30/14/7 天提醒与云资源 50%/80%/100% 账单告警生效。
    - 生产权限、AI 操作边界、持续巡检和事故响应 Runbook 已由人审阅。
16. 跑最小验证：
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
7. 在 P0 监控基础上补 SLO、性能趋势、慢查询、队列积压和告警降噪。
8. 把一次性备份/回滚验证升级为定期恢复演练、migration 演练和事故复盘。
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
6. 上线非 AI 的拍摄偏好档案、订单需求快照和拍后反馈闭环；先验证使用价值，不等待视觉模型。
7. 上线不依赖补贴的双边忠诚度 MVP：再次预约、常约摄影师、需求/偏好草稿复用、可选档期提醒、回头客摘要和摄影师收益/结算保障。
8. 上线摄影师认证与作品来源证据，建立可解释、可申诉的成长指标；不做公开排行榜，不禁止站外作品。
9. 功能开关和 A/B 实验。
10. 只有复约、摄影师留存和单位经济基线成立后，才逐项试点服务恢复、成长权益、复约优惠、降佣、推荐奖励或会员。
11. 数据足够后再做协同过滤、学习排序和 AI 偏好/复约/摄影师经营建议。

### 阶段四：未来国内安卓上架

目标：在 iOS 首发和基础运营稳定后，准备国内安卓渠道所需的安装包、备案、版权和渠道审核材料。

1. 确认安卓渠道范围、最终 App 名称、开发者主体和 Android 包名。
2. 生成并验证一个可构建、可运行的安卓候选版本，冻结对应 Git commit 和版本号。
3. 确认公司成立前代码、员工代码、外包/合作代码的权属文件完整，并归档第三方开源许可证。
4. 按 `1.9.7` 准备源程序、用户手册和公司主体材料，申请 Still 软件著作权。
5. 取得软著证书后，核对证书名称、简称、版本、权利人与 APP 备案及安卓应用市场资料的一致性。
6. 完成安卓权限、隐私清单、SDK 清单、签名、兼容性和各应用市场审核要求。
7. 提交国内安卓渠道审核；软著只作为这一阶段的版权/权属材料，不回溯成为 iOS 首发阻塞项。

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
- 项目已有 systemd、Nginx、健康检查和初步 CI，但缺完整的不可变发布、外部监控、告警、异地备份和恢复闭环。

可升级模块：
- `Dockerfile`：api、admin、app build。
- `docker-compose.yml`：api、PostgreSQL、Redis、对象存储模拟、队列 worker。
- GitHub Actions：build、test、deploy。
- Nginx/Caddy：HTTPS、反向代理、静态资源。
- 环境分层：dev、staging、production。
- 备份和恢复脚本。
- 不可变 release、Git SHA 标识和回滚脚本。
- 外部可用性、证书到期、容量和账单告警。
- 生产权限与 AI 操作边界。
- 日/周/月运维 Runbook、事故响应和发布观察窗口。

版本任务：
1. 先固化当前 systemd/Nginx 部署的版本目录、Git SHA、健康检查和回滚流程。
2. 再补 staging/production 隔离、外部监控、证书/账单告警和异地备份。
3. 上线前联合执行测试告警、应用回滚和数据库恢复演练。
4. 容器化和 `docker-compose` 作为后续工程化升级，不阻塞首个安全发布。

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

拍摄偏好档案是 AI 的前置产品基础，不是必须等待 AI 才能上线的功能。先按 `3.5` 完成结构化档案、订单快照、用户授权和拍后反馈；AI 后续只负责整理、发现模式、提出可解释建议，不能替用户定义偏好。

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

### 9.4A AI 拍摄偏好助手：从用户表达走向可确认的个人摄影档案

产品目标：
- 在 `3.5` 的非 AI 偏好档案已经可用后，降低用户表达偏好的成本。
- 把问卷、收藏、参考图、订单需求和拍后反馈整理成摄影师可快速理解的拍摄说明卡。
- 帮助用户发现“自己更容易满意的拍摄方式”，但不评价外貌、吸引力或身体缺陷。
- 逐步形成可跨摄影师复用、按拍摄场景调用的个人摄影偏好 Skill。

产品顺序：
1. 先用结构化问卷和规则模板生成偏好卡，不调用视觉模型。
2. 接文字模型：整理用户原话、发现信息冲突、追问缺失字段、生成可编辑摘要。
3. 接拍后反馈：根据用户喜欢/不满意的成片及原因生成“档案更新草稿”。
4. 数据和授权流程稳定后，只分析用户主动选择的少量图片；不在第一版申请全相册权限或要求批量导入。
5. 多次真实使用后，才形成带版本、场景和置信度的个人摄影 Skill。

输入来源：
- 用户明确填写的长期偏好。
- 当前订单的场景、风格、地点、时间和互动需求。
- 用户在 Still 内主动标记喜欢或不喜欢的作品及原因。
- 用户主动选择并授权处理的少量参考图或历史成片。
- 拍后选片、满意/不满意原因和用户确认过的档案更新。

AI 输出要求：
- 区分 `observations`、`suggestions` 和 `confirmed_preferences`，不能混写。
- 每条建议包含来源、适用场景、置信度和确认状态。
- 输出措辞聚焦构图、角度、光线、动作、互动和修图方式，不使用“脸型缺陷”“身材问题”“不好看”等评价。
- “过去照片里经常出现”不等于“用户喜欢”；必须通过追问或用户确认才能成为长期偏好。
- 用户可以选择“加入长期偏好”“仅用于本次拍摄”“不是”“暂不确定”。

建议接口：
```text
POST /api/ai/preference-summary
POST /api/ai/preference-questions
POST /api/ai/preference-update-draft
POST /api/ai/photo-pattern-review
```

建议结构化输出：
```json
{
  "observations": [
    {
      "field": "capture_mode",
      "value": "dynamic_candid",
      "source": ["favorite_post:123", "order_feedback:456"],
      "applicableScenes": ["daily", "travel"],
      "confidence": 0.72
    }
  ],
  "questions": ["日常拍摄时，你是否更喜欢边走边拍，而不是定点摆姿势？"],
  "updateDraft": [],
  "requiresUserConfirmation": true
}
```

隐私和安全边界：
- 照片分析必须由用户主动触发，并在触发前说明处理目的、数据范围和删除方式。
- 默认只处理用户本次选择的图片，不扫描整个系统相册，不把原图默认用于模型训练。
- 原图、视觉特征、AI 观察和用户确认后的偏好分层存储，分别支持删除和权限控制。
- 不推断种族、健康、性取向等敏感属性，不输出吸引力评分，不生成医学或身体诊断。
- 涉及儿童、私密空间或敏感场景时采用更严格的上传、授权、展示和保留策略。

验收标准：
- AI 关闭或失败时，`3.5` 的档案和订单流程仍完整可用。
- 所有长期档案变化都有用户确认和变更记录。
- 摄影师只接收当前订单需要的最终偏好卡，不接收原始 AI 推理或无关照片。
- 用户能解释“这条建议从哪里来”，并能拒绝、修改和删除。
- 上线少量图片分析前，先证明结构化档案能提高摄影师查看率、减少重复沟通或提升订单满意度。

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
- 结合已确认偏好生成构图、静态姿势、人物站位和镜头焦段参考卡。

产品边界：
- 所有机位、光线、路线、构图和姿势输出都标记为“参考方案”，不是标准化施工单或交付验收条款。
- 摄影师可以采用、调整或忽略，并补充自己的判断；用户可以收藏、删改或关闭参考卡，不能据此要求摄影师机械复刻。
- 不把“执行 AI 建议的比例”用于摄影师排名、处罚或争议自动判责；记录采用反馈只用于评估是否减少沟通和提升满意度。
- 第一版只做预约前/拍摄前的静态卡片，不做实时取景框、连续姿势纠正、自动连拍或后台持续摄像。

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
POST /api/ai/shoot-plan
```

验收标准：
- 地点推荐必须来自 `places` 或地图 provider 返回结果。
- 安全提示不可省略。
- 用户拒绝定位时仍可手动输入。
- 参考卡显示地点/天气/时间等依据及有效范围，摄影师可以标记采用、调整或忽略。
- 用前期沟通轮次、参考卡采纳/调整原因和订单满意度评估价值，不追求创作动作标准化。

### 9.8A 拍后质检与摄影师后处理 Copilot

产品目标：
- 让 AI 先承担重复、可撤销的整理和技术检查，降低摄影师选片、批量基础调整与整理用户意见的时间。
- 将用户确认过的偏好转成可比较的后处理草稿，使成片更接近用户审美，同时保留摄影师的创作判断和最终交付权。

建议分两步上线：

1. 拍后质检与选片：连拍/相似照片分组、重复检测、模糊/闭眼/明显曝光问题提示、候选选片和理由；这些结果只作为建议，摄影师可恢复被排除照片。
2. 后处理 Copilot：在摄影师选择的照片上生成批量白平衡、曝光、色彩和保守轻修草稿；把用户的修改意见拆成对应照片、部位、目标和状态明确的任务，由摄影师确认、调整或拒绝。

建议最小数据链：

```text
order_media_original
  -> ai_quality_observation
  -> ai_selection_suggestion
  -> ai_edit_draft
  -> photographer_approved_version
  -> user_delivery_version
```

建议接口：

```text
POST /api/ai/media-quality-review
POST /api/ai/selection-suggestions
POST /api/ai/edit-drafts
POST /api/orders/:id/edit-feedback
POST /api/media/:id/versions/:versionId/approve
```

固定边界：
- 只处理当前订单明确授权且位于平台受控媒体链路中的照片，不默认扫描系统相册或摄影师本地图库。
- 原片永不覆盖；每个观察、草稿和确认版本记录来源照片、模型/参数、成本、操作者、时间和删除状态，可回退、导出和按规则删除。
- 摄影师拥有最终选片、调色、修图和交付确认权；AI 失败或关闭时继续使用人工流程。
- 自动瘦身、改变五官、换脸、生成不存在的服饰/场景等高敏修改不进入第一版；后续如评估，必须有明确授权和可见标识。
- 用户只能查看有权访问的交付候选和修改状态，不能读取摄影师内部工作底稿、其他订单媒体或原始模型推理。

成功指标：
- 摄影师单订单选片与基础修图耗时、从拍摄到首次交付的周期、用户修改轮次、草稿采用/调整/拒绝比例、订单满意度和单订单 AI 成本。
- 若只增加处理成本、不能减少耗时或返修，停止扩大；不能用“作品是否完全符合 AI 风格”衡量摄影师质量。

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
- 偏好卡生成后用户确认率、修改率和拒绝率。
- AI 档案更新建议的采纳率，以及被标记“不准确/令人不适”的比例。
- 摄影师查看偏好卡后认为有帮助的比例。
- 少量照片分析相对纯问卷是否带来可测量的满意度提升。
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
- AI 不能把照片观察直接写成用户长期偏好，必须由用户明确确认。
- AI 不能进行吸引力评分、外貌缺陷判定、身体诊断或敏感属性推断。
- 用户照片默认按最小数量、最短保留和最小授权范围处理，摄影师不得看到未授权原图。

### 9.14 AI 版本路线

#### AI 前置 P0：非 AI 偏好档案

目标：先验证“用户愿意表达、摄影师愿意使用、结果确实更好”，不让 AI 研发阻塞核心交易上线。

任务：
1. 按 `3.5` 建立结构化长期偏好。
2. 建立本次拍摄需求和订单快照。
3. 建立参考图授权和拍后反馈。
4. 用规则模板生成可编辑偏好卡。

验收：
- 没有 AI 也能完成偏好闭环。
- 摄影师能在当前订单内看到最小必要偏好。
- 用户可以修改、撤回授权和删除。

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
5. 用文字模型整理偏好问卷、生成拍摄说明卡和档案更新草稿，不做批量照片理解。

验收：
- 摄影师可采用 AI 草稿。
- 用户自然语言能转成筛选条件。
- 偏好卡和档案更新必须经过用户确认。
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
2. AI 地点、光线、路线、构图和静态姿势参考方案。
3. AI 创作者成长建议。
4. AI 运营日报。

验收：
- 搜索结果来自真实数据。
- 地点建议来自地图/地点库。
- 拍摄参考可被摄影师采用、调整或忽略，不进入交付验收、排名或自动判责。
- 运营日报可跳转到真实业务对象。

#### AI V4：拍后质检、选片与有限照片理解版

目标：在真实订单媒体链路和偏好档案稳定后，先用受控图片处理减少摄影师重复劳动，再验证少量照片理解是否提升用户审美沟通效率。

任务：
1. 对当前订单授权媒体做连拍分组、重复检测和模糊/闭眼/曝光等技术质检。
2. 生成候选选片及理由，摄影师可采用、调整或全部拒绝。
3. 分析用户主动选择的少量喜欢、不喜欢和参考图片，结合问卷、收藏、订单快照和拍后反馈生成可解释观察。
4. 通过追问区分“过去经常这样拍”和“用户真正喜欢这样拍”。
5. 用户确认后才更新长期档案。

验收：
- 不申请全相册批量读取作为默认路径。
- 不输出外貌缺陷、吸引力分数或敏感属性推断。
- 原片不覆盖，每条质检/选片建议和偏好观察都有来源、场景、置信度和确认记录。
- 能证明减少选片时间、沟通或提高满意度，否则不扩大图片处理范围。

#### AI V4A：摄影师后处理 Copilot 和个人摄影 Skill 版

目标：在 V4 证明图片处理可控后，用可回退的后处理草稿降低摄影师工作量，并用用户确认结果逐步形成个人摄影 Skill。

任务：
1. 在摄影师选定照片上生成批量白平衡、曝光、色彩和保守轻修草稿。
2. 将用户反馈转成逐张、可追踪的修改任务。
3. 由摄影师对比原片后批量采用、逐张调整或拒绝，确认后才进入交付候选。
4. 结合用户确认的偏好、采用的成片版本和拍后反馈，按日常、旅行、纪念日、情侣/家庭等场景保存偏好版本和置信度。

验收：
- 原片—草稿—摄影师确认版—用户交付版可追溯、可回退和按规则删除。
- AI 关闭或失败不影响人工修图与交付，高敏人像修改不进入第一版。
- 对比摄影师处理耗时、交付周期、修改轮次、草稿采用率、满意度和单订单成本；不能证明减负时不扩大。

#### AI V5：轻量 Agent 和工作流版

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

#### 远期候选：实时拍摄辅助（不进入当前版本承诺）

只有静态拍摄参考、拍后质检和后处理 Copilot 已有稳定使用与留存证据后，才单独评审实时取景框、人物站位、姿势和连拍时机提示。立项前必须验证端侧性能、耗电/发热、摄像头与人像权限、弱网降级、现场安全、摄影师控制权和真实增益；它始终是可关闭的辅助层，不把现场创作变成强制标准化执行。

### 9.15 最推荐的落地顺序

1. 先上线非 AI 偏好档案、订单需求快照和拍后反馈。
2. AI Gateway。
3. 文字版偏好卡、缺失信息追问和档案更新草稿。
4. AI 发布助手。
5. AI 预约意图识别。
6. 客服 RAG。
7. AI 审核和举报摘要。
8. AI 搜索、地点/光线/路线/静态姿势参考、创作者成长助手和运营日报；拍摄参考可调整或忽略。
9. 在真实订单媒体链路稳定后，先试点拍后技术质检、连拍分组和候选选片。
10. 再试点摄影师后处理 Copilot：批量基础调整草稿、用户意见任务化和版本回退。
11. 在偏好档案已有真实使用数据后，试点用户主动选择的少量照片分析。
12. 数据证明有效后形成分场景的个人摄影 Skill。
13. 再做轻量 agent 工作流。
14. 实时取景和连续姿势指导最后单独评审，不进入当前版本承诺。

这个顺序的核心判断：先把用户确认过的结构化偏好变成真实业务数据，再用 AI 降低表达和理解成本；拍摄前建议保持可选，拍摄后优先解决摄影师真实耗时，再用确认过的结果形成个人摄影 Skill。实时辅助必须最后单独证明价值。AI 不能成为偏好档案上线或订单交付的前置依赖。
