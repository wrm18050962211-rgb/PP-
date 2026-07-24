# Still 双平台发布 Roadmap

本文档是 Still 从当前共同基线推进到 TestFlight、App Store 和真实运营版本的唯一真实 Roadmap。

聊天记录、交接总结和临时清单只能引用本文档，不能代替本文档。Windows、Mac/iOS、Integration 和 User/External 的节点状态、依赖、提交和验证结果都必须回写到这里。

## 0. 当前基线与固定决策

- Roadmap version: 1
- Current integration baseline: `6588247c29b2082d310cc96fe110ab67866337f4`
- Integration branch: `codex/integration`
- Windows branch: `codex/vertical-db-api`
- Mac/iOS branch: `codex/mac-ios`
- Roadmap work branch: `codex/release-roadmap`
- Map provider: `MAP_PROVIDER=amap`
- Current P0 map provider: 高德地图
- Future fallback provider: 腾讯地图，仅作为未来扩展，不进入当前 P0
- AI、增长实验和微信小程序：在 iOS TestFlight 主流程稳定前暂停

### 0.1 地图技术路线

- Windows 接入高德 WebService API，并通过服务端统一代理地图搜索能力。
- 高德 WebService Key 只能存放在服务端环境变量中，禁止进入前端构建、iOS 工程、日志或 Git。
- Mac/Capacitor 第一版使用高德 JS API 2.0 完成地图展示和选点。
- POI 搜索、输入提示、周边搜索、多边形搜索、地理编码和逆地理编码统一调用 Windows 后端代理。
- 客户端只接收业务需要的标准化地点结果，不直接调用高德 WebService。
- 第一版支持拒绝定位后的手动搜索，以及调起高德地图 App 导航。
- 只有 JS API 2.0 在真机性能或能力上不能满足需求时，才新建节点接入高德 iOS SDK。
- User/External 必须完成高德账号、应用、WebService Key、JS API Key、安全配置和商业许可核实。

### 0.2 状态定义

节点状态只能使用以下值：

- `pending`: 尚未开始，或依赖尚未全部满足但没有需要人工介入的异常。
- `in_progress`: 当前端正在实施该节点。
- `blocked`: 已经尝试推进，但被对端、外部资源、审核或不可绕过的问题阻塞。
- `completed`: 验收标准全部满足，结果提交和验证信息已经填写。

### 0.3 节点选择规则

1. 每个工作对话开始时先读取 `AGENTS.md` 和本文档。
2. 先同步最新 `origin/codex/integration`，工作区不干净时禁止拉取或合并。
3. 每次只选择本路线中顺序最靠前、状态不是 `completed`、且全部依赖已 `completed` 的节点。
4. 一次只实施一个节点；完成、提交并更新 Roadmap 后才能选择下一个节点。
5. 节点因依赖无法继续时，将其更新为 `blocked`，输出跨端依赖通知，然后继续下一个依赖满足的独立节点。
6. 不得为了绕开阻塞而恢复生产 mock、localStorage fallback、模拟支付或客户端密钥。
7. P0 全部完成前不实施 P2/P3；P1 仅在不阻塞 P0 时并行。

### 0.4 Roadmap 编辑权

- Windows 只更新 `WIN-*` 节点的状态、结果提交、验证和备注。
- Mac/iOS 只更新 `IOS-*` 节点的状态、结果提交、验证和备注。
- Mac 集成工作流更新 `INT-*` 节点。
- 项目主控更新 `EXT-*` 节点和全局决策。
- 路线区块分开维护；禁止一端为了更新自己的状态重排另一端区块。
- `codex/integration` 禁止直接开发，只接收已验证分支的合并。

### 0.5 共享文件占用

开始修改共享文件前，负责端必须输出：

```text
【共享文件占用通知】
节点：
负责端：
文件：
用途：
预计释放条件：
```

提交并推送后必须输出：

```text
【共享文件释放通知】
节点：
分支：
commit SHA：
验证结果：
已释放文件：
```

### 0.6 跨端依赖通知

```text
【跨端依赖通知】
本端节点：
当前状态：blocked
等待节点：
需要提供：
相关分支和 SHA：
涉及共享文件：
等待期间继续推进：
```

解除阻塞时输出：

```text
【跨端解除阻塞】
完成节点：
分支：
commit SHA：
验证结果：
API、数据或环境变化：
解除的节点：
对方下一步：
重点回归：
```

---

## A. Windows Roadmap

Windows 负责服务端、数据库、地图 WebService 代理、对象存储、支付与结算、后台服务、可靠任务、安全和部署。Windows 禁止修改 `pp-app/ios/**`。

### WIN-BASE-0 对齐首个 Integration 基线

- Priority: P0
- Status: completed
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-BASE-0`
- Scope: 将 Windows 分支以 fast-forward 方式对齐 `origin/codex/integration@6588247c29b2082d310cc96fe110ab67866337f4`。
- Acceptance criteria: Windows HEAD 与远端分支一致并包含 Integration；server MVP、移动端构建、Admin 构建和 production guards 通过。
- Shared files: 无业务修改；只同步既有文件。
- Unblock result: 已解除 `WIN-AUTH-1`、`WIN-MAP-1`、`WIN-DATA-1`、`WIN-MEDIA-1`、`WIN-ADMIN-1`、`WIN-SEC-1` 对 `WIN-BASE-0` 的依赖；各节点仍须满足其余 Roadmap 依赖。
- Result commit: `3cfe65b1dc0f9af2763c8f66d3a0a143f77f64ae`
- Verification: `server: npm.cmd run check:mvp`、`pp-app: npm.cmd run build`、`pp-app: npm.cmd run build:admin`、`pp-app: npm.cmd run check:production-guards`、`git diff --check` 全部通过。
- Notes: 因 Windows 分支与 Integration 已分叉，经用户授权为本节点使用一次普通 merge commit；已合入 `origin/codex/integration@2342d4cefa5375930a58f48e5ccd121ca2627be4`，未执行 reset、rebase 或 force push。保留未提交的 `server/data/store.json`、bundle、tmp 和 zip，未手工修改 `pp-app/ios/**`。

### WIN-AUTH-1 真实短信与生产会话

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-SMS-1`
- Scope: 投产手机号验证码、腾讯短信发送、验证码过期与限流、会话持久化、角色边界和生产部署。
- Acceptance criteria: 真实手机号可发送和消费验证码；错误、过期、重复消费和频率限制有稳定错误码；consumer/companion session 可跨设备恢复；生产强制配置 `PHONE_OTP_PEPPER`。
- Shared files: `pp-app/src/services/authService.ts`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供生产 API、测试步骤、非敏感配置名、成功/失败样例和 commit SHA，解除 `IOS-AUTH-1`。
- Result commit: pending
- Verification: pending
- Notes: Secret、Pepper 和短信凭据禁止提交。

### WIN-MAP-1 高德 WebService 代理

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-AMAP-1`
- Scope: 建立 `MAP_PROVIDER=amap` Provider 层及服务端地图代理；覆盖输入提示、POI 文本搜索、周边搜索、多边形搜索、地理编码和逆地理编码。
- Acceptance criteria: 客户端通过统一业务 API 获取标准化 POI；WebService Key 不下发；超时、配额、Provider 错误有稳定错误码；输入和返回经过校验；关键查询有合理限流与缓存。
- Shared files: `server/.env.example`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供代理端点、请求/响应契约、错误码、测试用例和 commit SHA，解除 `IOS-MAP-1`。
- Result commit: pending
- Verification: pending
- Notes: 腾讯地图只能保留未来 Provider 接口，不得作为 P0 默认实现。

### WIN-MAP-2 地点域模型与附近匹配

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MAP-1`
- Scope: 建立 `places`、地点别名、父子区域、半径或 GeoJSON、服务范围、热门地点和附近匹配；订单保存地点快照。
- Acceptance criteria: 地点可保存 `providerPoiId`、名称、地址、经纬度、区域 ID 和 Provider；支持商圈、艺术园区、道路、滨江区域；附近摄影师按真实距离和服务范围匹配；订单历史不受地点后续修改影响。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供迁移、地点/区域 API、距离规则、订单字段和测试数据，解除 `IOS-MAP-2`。
- Result commit: pending
- Verification: pending
- Notes: 数据库迁移必须同时更新 SQL、Prisma 和 schema parity。

### WIN-DATA-1 Feed、摄影师资料、作品和收藏生产化

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`
- Scope: 将 Feed、摄影师公开资料、作品、收藏/关注的读取与写入切换到 PostgreSQL。
- Acceptance criteria: 生产接口支持分页、刷新和跨设备恢复；API 失败返回明确错误；生产模式不静默返回 mock、localStorage 或空数组；权限和资源归属有效。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供端点、分页契约、迁移、生产 guard 和 commit SHA，解除 `IOS-DATA-1`。
- Result commit: pending
- Verification: pending
- Notes: development mock 可保留，但必须受生产 guard 约束。

### WIN-DATA-2 咨询、订单工作区和跨设备恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-1`, `WIN-MAP-2`
- Scope: 将咨询、订单工作区、订单刷新、状态日志和地点快照全部接入 PostgreSQL。
- Acceptance criteria: 用户和摄影师只访问自己的资源；订单分页和状态刷新真实可用；卸载重装或换设备后可恢复；读取失败不伪装成功。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供订单/咨询契约、权限矩阵、真实库验证和 commit SHA，解除 `IOS-DATA-2`、`WIN-MSG-1`。
- Result commit: pending
- Verification: pending
- Notes: 禁止用 JSON store 作为生产主数据。

### WIN-MSG-1 真实聊天同步、分页和发送可靠性

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`
- Scope: 完成会话列表、消息分页、发送幂等、失败重试、风险状态和跨设备同步。
- Acceptance criteria: 消息顺序稳定；分页游标可持续读取；重复请求不产生重复消息；失败可安全重试；会话权限和风险审计有效；生产不读取本地会话兜底。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供聊天契约、重试语义、错误码、分页测试和 commit SHA，解除 `IOS-MSG-1`、`WIN-NOTIFY-1`。
- Result commit: pending
- Verification: pending
- Notes: 实时传输方案可先轮询或受控刷新，不能牺牲数据一致性。

### WIN-MEDIA-1 COS、media_assets 和上传安全

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-CLOUD-1`
- Scope: 投产 COS 临时授权；建立 `media_assets` 元数据、用途、尺寸、类型、归属和审核状态。
- Acceptance criteria: MIME、后缀、大小和用途同时校验；上传凭据最小权限且短时有效；媒体记录写入 PostgreSQL；生产拒绝 data URL/mock 存储；删除和失效可追踪。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供上传策略契约、允许类型/大小、媒体状态、真实 COS 检查和 commit SHA，解除 `IOS-MEDIA-1`、`WIN-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: Secret Key 禁止进入客户端。

### WIN-PAY-1 iOS 支付服务端契约

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`, `EXT-PAY-1`
- Scope: 根据确认的 iOS 支付渠道建立服务端下单、签名、状态查询和订单恢复契约。
- Acceptance criteria: iOS 不依赖 `wx.requestPayment`；支付请求绑定用户、订单和金额；重复下单幂等；客户端只接收必要参数；支付渠道符合产品类型和审核要求。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供支付渠道、客户端调用契约、测试商户说明、错误码和 commit SHA，解除 `IOS-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 未完成 `EXT-PAY-1` 前不得把 mock success 作为生产验收。

### WIN-PAY-2 支付回调、退款、重试和对账

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-PAY-1`
- Scope: 完成支付/退款回调验签、幂等、失败重试、退款终态、日常对账和异常记录。
- Acceptance criteria: 回调可重放且不产生重复副作用；退款状态推进正确；失败进入可靠重试；订单、支付、退款和 Provider 账单可核对。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供回调/退款测试、重试结果、对账说明和 commit SHA，解除 `IOS-REFUND-1`、`WIN-SETTLE-1`。
- Result commit: pending
- Verification: pending
- Notes: Provider 原始事件保留时必须脱敏并限制访问。

### WIN-SETTLE-1 佣金、摄影师结算和异常冻结

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-PAY-2`
- Scope: 明确平台佣金、摄影师应结算金额、结算周期、退款冲正、异常冻结和人工处理。
- Acceptance criteria: 每笔完成订单可追溯到结算与账本；退款可冲正；异常可冻结；Admin 可查看并审计人工操作；金额使用整数分并保持幂等。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供结算状态机、账本测试、Admin 操作要求和 commit SHA，解除 `IOS-OPS-1`、`WIN-ADMIN-2` 的财务部分。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端计算最终佣金或结算金额。

### WIN-COMPLIANCE-1 用户合规数据闭环

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-AUTH-1`, `EXT-COMPLIANCE-1`
- Scope: 服务端实现隐私/协议版本记录、定位授权记录、账号删除、数据导出、举报和客服申请。
- Acceptance criteria: 用户可提交并查询删除申请；删除流程覆盖业务数据和法定保留例外；可导出用户数据；授权版本和时间可审计；客服/举报不依赖 localStorage。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供合规 API、数据范围、审计结果、政策 URL 和 commit SHA，解除 `IOS-COMPLIANCE-1`。
- Result commit: pending
- Verification: pending
- Notes: 法定保留范围由 `EXT-FILING-1` 和正式合规意见确认。

### WIN-ADMIN-1 Admin 独立部署和权限边界

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-DOMAIN-1`
- Scope: 将 Admin 独立构建部署到受保护域名，使用独立登录、token、权限和审计。
- Acceptance criteria: 移动端包不包含 Admin 入口；Admin 独立域名和 HTTPS 可用；普通 token 不能访问 Admin API；Admin token 不能冒充普通用户；敏感操作有审计。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`, `pp-app/vite.admin.config.ts`
- Unblock result: 提供 Admin URL、权限矩阵、构建/部署验证和 commit SHA，解除 `WIN-ADMIN-2`。
- Result commit: pending
- Verification: pending
- Notes: Admin 密钥和账号禁止写入仓库。

### WIN-SEC-1 统一鉴权、校验和可追踪错误

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`
- Scope: 统一鉴权中间层、输入校验、全局/敏感接口限流、request ID、稳定错误码和日志脱敏。
- Acceptance criteria: 关键路由不重复手写不一致的权限判断；非法输入在入口拒绝；每个请求可追踪；手机号、token、密钥和支付字段不出现在明文日志；密钥支持轮换。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供中间层清单、错误码表、限流测试、脱敏样例和 commit SHA，解除 `WIN-DELIVERY-1`。
- Result commit: pending
- Verification: pending
- Notes: 业务函数可保留二次保护。

### WIN-DELIVERY-1 环境、CI/CD、监控和恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-SEC-1`, `EXT-CLOUD-1`, `EXT-DOMAIN-1`
- Scope: 建立 dev/staging/production 分层、自动部署、回滚、后端告警、数据库备份和恢复演练。
- Acceptance criteria: staging 与 production 密钥/数据库隔离；部署可回滚；健康检查和 launch-check 可用；关键错误有告警；备份可实际恢复；CI 覆盖 server、PostgreSQL、mobile 和 Admin。
- Shared files: `.github/workflows/**`, `server/.env.example`, `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供 staging/production 地址、部署 SHA、回滚和恢复结果、告警验证，解除 `IOS-CRASH-1`、`IOS-STORE-1` 的后端发布依赖。
- Result commit: pending
- Verification: pending
- Notes: `.env` 和真实凭据禁止提交。

### WIN-NOTIFY-1 站内通知与可靠任务

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MSG-1`, `WIN-PAY-2`
- Scope: 建立站内通知、订单/支付/退款/审核事件通知，以及必要短信/Push 的可靠任务。
- Acceptance criteria: 通知有持久化、已读状态、分页和幂等；任务可重试并有失败记录；订单、支付、退款和审核事件均有模板；Provider 短暂失败不丢事件。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供通知契约、事件矩阵、任务重试测试和 commit SHA，解除 `IOS-NOTIFY-1`。
- Result commit: pending
- Verification: pending
- Notes: Push Provider 由 iOS 能力和外部资源共同确认。

### WIN-ADMIN-2 运营处理闭环

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-ADMIN-1`, `WIN-COMPLIANCE-1`, `WIN-SETTLE-1`
- Scope: 完成举报、审核、内容下架、封禁、客服、退款、争议、财务、热门地点、风险地点和安全提示运营。
- Acceptance criteria: 每种 case 有状态机、负责人和审计；内容/用户/订单副作用可追踪；地点运营可维护热门与风险提示；财务人工处理必须双重确认或明确权限。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供运营矩阵、权限、审计样例和 commit SHA，解除 `IOS-OPS-1`、`WIN-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: P0 只要求上线必需的最小运营能力，扩展报表留到 P2。

### WIN-MEDIA-2 媒体审核和违规处置

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MEDIA-1`, `WIN-ADMIN-2`
- Scope: 图片/视频审核、审核状态、违规下架、申诉和关联内容处置。
- Acceptance criteria: 媒体上传后可进入审核流程；违规媒体不可继续公开访问；操作有审计；原内容和派生内容关系可追踪。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供状态机、审核 API、下架验证和 commit SHA，解除 `IOS-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: 自动审核 Provider 可后续替换，首版必须支持人工闭环。

### WIN-SEARCH-1 地点搜索和别名优化

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MAP-2`, `INT-RC-1`
- Scope: 优化地点别名、热度、用户输入纠错、搜索排序和 Provider 配额使用。
- Acceptance criteria: 常见道路、商圈、园区和滨江表达可稳定命中；排序指标可解释；缓存不会返回过期风险地点。
- Shared files: `pp-app/src/types/api.ts`
- Unblock result: 提供搜索质量样例、指标和 commit SHA，解除 `IOS-SEARCH-1`。
- Result commit: pending
- Verification: pending
- Notes: 不阻塞首轮 TestFlight。

### WIN-ANALYTICS-1 埋点和运营报表

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-RC-1`, `EXT-ANALYTICS-1`
- Scope: 建立关键漏斗、订单转化、搜索、支付失败和留存事件。
- Acceptance criteria: 事件字典稳定；敏感字段不进入分析平台；环境可区分；Admin 可查看最小运营报表。
- Shared files: `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供事件字典、数据验证和 commit SHA，解除 `IOS-ANALYTICS-1`。
- Result commit: pending
- Verification: pending
- Notes: 必须先完成隐私披露。

### WIN-RECO-1 推荐与附近排序

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-1`, `WIN-MAP-2`, `WIN-ANALYTICS-1`
- Scope: 基于真实地点、服务范围、档期、质量和用户行为优化推荐。
- Acceptance criteria: 推荐输入可追踪；没有数据时有确定性降级；不得泄露敏感位置；可离线评估基本指标。
- Shared files: `pp-app/src/types/api.ts`
- Unblock result: 提供排序规则、评估结果和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: P0/P1 完成前不得启动。

### WIN-AI-1 AI 扩展

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-AI-1`
- Scope: 待 TestFlight 稳定后重新定义。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 当前暂停。

### WIN-MINI-1 微信小程序服务端

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-MINI-1`
- Scope: 微信登录、支付、位置和小程序审核所需服务端能力。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: 解除 `IOS-MINI-1`。
- Result commit: pending
- Verification: pending
- Notes: 当前暂停。

### WIN-PLATFORM-1 平台工程升级

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-STORE-1`
- Scope: 根据生产数据决定是否拆分服务、独立队列或升级平台架构。
- Acceptance criteria: 以真实瓶颈和故障数据为依据。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 禁止在 P0 阶段提前重构。

---

## B. Mac/iOS Roadmap

Mac/iOS 负责 Capacitor、Xcode、iOS 真机、移动端交互、客户端支付调用、合规页面、崩溃上报和 App Store 发布。Mac 禁止修改 `server/**` 和 `database/**`。

### IOS-BASE-0 首个共同基线与真机工程

- Priority: P0
- Status: completed
- Owner branch: `codex/mac-ios`
- Depends on: `INT-BASE-0`
- Scope: 生成 iOS 工程、合并 Windows 登录基线并完成基础真机验证。
- Acceptance criteria: iOS 工程可同步和真机运行；Mac 分支同时包含 Win 与 Mac 基线；构建、production guards、Capacitor sync 和真机滚动通过。
- Shared files: `pp-app/src/features/auth/AuthPages.tsx`
- Unblock result: 已解除全部后续 iOS 基线依赖。
- Result commit: `6588247c29b2082d310cc96fe110ab67866337f4`
- Verification: server `check:mvp`、pp-app build、production guards、`cap sync ios`、`git diff --check` 通过；iPhone 15 Pro Max 三轮滚动无闪烁。
- Notes: 已包含 Win SHA `ad07003533b869321570676b0fa185f5a3ac3943` 和原 Mac SHA `b67a71b7d8f57020c85234de307703df561f10be`。

### IOS-QA-1 基础真机回归和失败状态

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `IOS-BASE-0`
- Scope: 发现页频道、底部导航、详情返回、小屏、安全区、键盘、弱网、断网、空状态、接口失败、首页和 Live Photo 回归。
- Acceptance criteria: 核心页面无阻断、遮挡和闪烁；失败状态可理解且可重试；生产 API 不可用时不显示 mock 成功。
- Shared files: `pp-app/src/**`, `docs/IOS_REAL_DEVICE_TEST_LOG.md`
- Unblock result: 提供设备/系统、用例结果、失败截图或日志和 commit SHA；解除 `INT-RC-1` 的基础 QA 条件。
- Result commit: pending
- Verification: pending
- Notes: 真实短信不可用时输出依赖通知，但继续其他独立用例。

### IOS-AUTH-1 真实短信登录和会话恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-AUTH-1`, `EXT-SMS-1`
- Scope: 真机发送验证码、登录、角色切换、重新登录、会话恢复和 `companionId` 刷新。
- Acceptance criteria: 成功、错误、过期、重复点击和频率限制均有正确 UI；consumer/companion 边界正确；换设备或重启后可恢复；生产不使用本地验证码。
- Shared files: `pp-app/src/features/auth/AuthPages.tsx`, `pp-app/src/services/authService.ts`, `pp-app/src/types/api.ts`
- Unblock result: 提供真机用例、API 错误映射、设备信息和 commit SHA，解除 `INT-AUTH-1`。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端存放 Pepper 或短信 Secret。

### IOS-MAP-1 高德 JS API 2.0 地图展示和选点

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MAP-1`, `EXT-AMAP-2`
- Scope: 在 Capacitor 中使用高德 JS API 2.0 展示地图、标记选点；搜索、输入提示和编码通过后端代理；支持拒绝定位后的手动搜索。
- Acceptance criteria: 真机可加载地图、搜索和选择 POI；客户端不包含 WebService Key；定位拒绝仍可完成下单；JS API 安全配置有效；错误和加载状态完整。
- Shared files: `pp-app/src/services/locationService.ts`, `pp-app/src/types/api.ts`, 地图 UI 组件、`pp-app/package*.json`
- Unblock result: 提供真机录像/截图、选点结果、拒绝定位结果、构建验证和 commit SHA，解除 `IOS-MAP-2`、`INT-MAP-1` 客户端条件。
- Result commit: pending
- Verification: pending
- Notes: 首版不接高德 iOS SDK。

### IOS-MAP-2 场景匹配和高德导航

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MAP-2`, `IOS-MAP-1`
- Scope: 验证外滩、商圈、艺术园区、道路、滨江区域、附近摄影师和服务范围，并支持调起高德地图 App 导航。
- Acceptance criteria: 地点别名和区域显示正确；附近匹配与服务范围符合后端结果；订单保存地点快照；未安装高德 App 时有可理解降级。
- Shared files: `pp-app/src/features/user/**`, `pp-app/src/types/api.ts`, iOS URL scheme/Info.plist 配置
- Unblock result: 提供场景矩阵、订单地点结果、导航验证和 commit SHA，解除 `INT-MAP-1`。
- Result commit: pending
- Verification: pending
- Notes: 如 JS API 性能不足，另建 iOS SDK 节点，不在本节点扩张范围。

### IOS-DATA-1 真实 Feed、资料、作品和收藏

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DATA-1`
- Scope: 移除生产 mock/localStorage fallback，接入真实 Feed、摄影师资料、作品、收藏和分页刷新。
- Acceptance criteria: 刷新和分页真实可用；跨设备数据一致；API 失败显示错误和重试；空数组只代表真实空状态。
- Shared files: `pp-app/src/services/feedService.ts`, profile/collection service、`pp-app/src/types/api.ts`, 对应页面
- Unblock result: 提供真机数据用例、跨设备结果和 commit SHA，解除 `INT-DATA-1` 第一阶段。
- Result commit: pending
- Verification: pending
- Notes: development mock 可保留，但生产 guard 必须覆盖。

### IOS-DATA-2 真实咨询和订单工作区

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DATA-2`, `IOS-DATA-1`
- Scope: 接入真实咨询、订单列表、详情、状态刷新、地点快照和跨设备恢复。
- Acceptance criteria: 用户和摄影师看到正确订单；分页、刷新和状态变化可见；重启/换设备可恢复；失败不写入虚拟账本。
- Shared files: consultation/order services、订单页面、`pp-app/src/types/api.ts`, `pp-app/src/app/AppDataProvider.tsx`
- Unblock result: 提供双方角色真机用例、跨设备结果和 commit SHA，解除 `IOS-MSG-1`、`IOS-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 生产禁止 `virtualOrderLedger` 兜底。

### IOS-MSG-1 真实聊天分页、同步和重试

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MSG-1`, `IOS-DATA-2`
- Scope: 会话列表、消息分页、发送状态、失败重试、跨设备同步和风险提示。
- Acceptance criteria: 消息不重复不乱序；发送中/失败/重试状态明确；切换前后台可恢复；生产不读取 localStorage 会话。
- Shared files: `pp-app/src/services/messageService.ts`, 消息页面、`pp-app/src/types/api.ts`
- Unblock result: 提供双角色、跨设备、弱网和重试用例及 commit SHA，解除 `INT-MSG-1`。
- Result commit: pending
- Verification: pending
- Notes: 图片消息依赖 `IOS-MEDIA-1`。

### IOS-MEDIA-1 真实媒体上传和展示

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MEDIA-1`, `EXT-CLOUD-1`
- Scope: 真机上传图片、视频和 Live Photo，展示上传进度、失败重试和媒体审核状态。
- Acceptance criteria: 文件限制与服务端一致；真实 COS URL 可跨设备访问；失败可重试；生产不生成 data URL；Live Photo 无闪烁并正确降级。
- Shared files: `pp-app/src/services/mediaService.ts`, `LivePhotoMedia.tsx`, 发布/消息页面、`pp-app/src/types/api.ts`
- Unblock result: 提供真实上传结果、媒体记录、弱网测试和 commit SHA，解除 `INT-MEDIA-1`、`IOS-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: 客户端不得获得永久 COS Secret。

### IOS-PAY-1 iOS 真机支付和订单恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-PAY-1`, `IOS-DATA-2`, `EXT-PAY-1`
- Scope: 接入确认后的 iOS 支付客户端方案，处理调起、返回、取消、失败、状态轮询和订单恢复。
- Acceptance criteria: 不依赖 `wx.requestPayment`；完成一笔小额真机支付；重复点击不重复扣款；支付返回 App 后订单状态可恢复；失败和取消状态明确。
- Shared files: `pp-app/src/services/paymentService.ts`, Checkout/Orders 页面、`pp-app/src/types/api.ts`, 必要 iOS 配置
- Unblock result: 提供真机支付流水号脱敏记录、订单状态、失败用例和 commit SHA，解除 `INT-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 支付方案必须先完成外部与审核要求确认。

### IOS-REFUND-1 退款和异常支付状态

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-PAY-2`, `IOS-PAY-1`
- Scope: 展示退款申请、处理中、成功、失败、拒绝和人工处理状态。
- Acceptance criteria: 状态与服务端一致；前后台切换后可恢复；失败有客服入口；重复操作受控。
- Shared files: 订单/支付页面、`pp-app/src/types/api.ts`
- Unblock result: 提供退款状态矩阵、真机结果和 commit SHA，解除 `INT-PAY-1` 退款条件。
- Result commit: pending
- Verification: pending
- Notes: 客户端不自行推断最终退款状态。

### IOS-COMPLIANCE-1 合规入口和审核材料

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-COMPLIANCE-1`, `EXT-COMPLIANCE-1`, `EXT-DOMAIN-1`
- Scope: 隐私政策、用户协议、支付说明、退款规则、客服、举报、删除账号、数据导出、定位授权和权限文案。
- Acceptance criteria: 所有 URL 可访问；删除和导出调用真实 API；定位拒绝有替代路径；权限用途与实际功能一致；App Privacy、审核账号和审核说明可提交。
- Shared files: 设置/合规页面、权限文案、Info.plist、`docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供页面路径、政策版本、审核材料清单、真机结果和 commit SHA，解除 `INT-COMPLIANCE-1`。
- Result commit: pending
- Verification: pending
- Notes: 法律文本由 User/External 定稿，代码不得自行编造。

### IOS-CRASH-1 崩溃上报和生产诊断

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DELIVERY-1`, `EXT-OBS-1`
- Scope: 接入 iOS 崩溃上报、版本标识、基础网络错误上下文和隐私脱敏。
- Acceptance criteria: staging 可验证测试崩溃；事件包含版本和环境但不含敏感数据；发布版本可追踪到 commit。
- Shared files: iOS 配置、客户端启动入口、环境配置
- Unblock result: 提供测试事件、版本映射、隐私检查和 commit SHA，解除 `IOS-DELIVERY-1`。
- Result commit: pending
- Verification: pending
- Notes: SDK 和数据区域由外部资源节点确认。

### IOS-DELIVERY-1 签名、Archive 和 TestFlight

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `IOS-QA-1`, `IOS-COMPLIANCE-1`, `IOS-CRASH-1`, `EXT-APPLE-1`
- Scope: 正式 Bundle ID、Team、签名、Archive、图标、截图、App Privacy、审核账号和 TestFlight 构建。
- Acceptance criteria: Release Archive 成功；TestFlight 可安装；权限、图标和截图完整；审核账号可用；无测试角色和 mock 配置。
- Shared files: `pp-app/ios/**`, `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供 build number、TestFlight 状态、安装结果和 commit SHA，解除 `INT-TESTFLIGHT-1`。
- Result commit: pending
- Verification: pending
- Notes: 证书和描述文件禁止提交。

### IOS-STORE-1 App Store 提交

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-FILING-1`
- Scope: 完成最终回归、审核提交和反馈处理。
- Acceptance criteria: 所有 P0 节点完成；真实交易主流程通过；审核材料和资质核验完成；提交版本与 Integration RC 一致。
- Shared files: `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供提交版本、审核状态和最终 release SHA，解除 `INT-STORE-1`。
- Result commit: pending
- Verification: pending
- Notes: 审核反馈形成新节点，不在本节点隐式扩张。

### IOS-NOTIFY-1 通知中心和前后台切换

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-NOTIFY-1`, `EXT-PUSH-1`
- Scope: 站内通知列表、已读、订单/支付/退款/审核通知、Push 和前后台恢复。
- Acceptance criteria: 通知不重复；点击进入正确页面；权限拒绝有降级；前后台切换可同步；失败状态可见。
- Shared files: 通知页面、路由、`pp-app/src/types/api.ts`, iOS Push 配置
- Unblock result: 提供通知矩阵、真机 Push 和 commit SHA，解除 `INT-MSG-1` 通知条件。
- Result commit: pending
- Verification: pending
- Notes: Push 不得成为关键订单状态的唯一来源。

### IOS-OPS-1 运营处理结果呈现

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-ADMIN-2`, `WIN-SETTLE-1`
- Scope: 用户端呈现举报、客服、退款、争议、封禁和结算相关状态。
- Acceptance criteria: 状态和操作权限正确；有客服和申诉入口；敏感后台信息不泄露。
- Shared files: 设置、订单、客服和状态页面、`pp-app/src/types/api.ts`
- Unblock result: 提供状态矩阵、真机结果和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: Admin 操作本身不在 iOS 实现。

### IOS-MEDIA-2 媒体审核状态

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MEDIA-2`, `IOS-MEDIA-1`
- Scope: 展示审核中、通过、拒绝、下架和申诉状态。
- Acceptance criteria: 违规媒体不继续公开展示；作者获得可理解状态；申诉入口真实可用。
- Shared files: 媒体组件、发布/作品页面、`pp-app/src/types/api.ts`
- Unblock result: 提供状态矩阵、真机结果和 commit SHA，解除 `INT-MEDIA-1` 完整审核条件。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端自行改变审核终态。

### IOS-SEARCH-1 地点搜索体验优化

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-SEARCH-1`, `INT-TESTFLIGHT-1`
- Scope: 优化输入提示、历史地点、热门地点、无结果和配额失败体验。
- Acceptance criteria: 常见地点输入稳定；键盘和地图交互流畅；错误不阻塞手动输入。
- Shared files: 地图/搜索组件
- Unblock result: 提供可用性测试和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: 不阻塞首轮 TestFlight。

### IOS-ANALYTICS-1 埋点和性能观测

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-ANALYTICS-1`, `EXT-ANALYTICS-1`
- Scope: 接入经隐私评审的客户端事件和性能指标。
- Acceptance criteria: 事件与字典一致；无敏感数据；可区分环境和版本；核心页面性能可观察。
- Shared files: 客户端入口、关键页面、隐私文档
- Unblock result: 提供事件验证、隐私检查和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: 必须允许按政策关闭非必要分析。

### IOS-AI-1 AI 客户端扩展

- Priority: P3
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-AI-1`
- Scope: 待 TestFlight 稳定后重新定义。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 当前暂停。

### IOS-MINI-1 微信小程序客户端

- Priority: P3
- Status: pending
- Owner branch: future dedicated branch
- Depends on: `INT-TESTFLIGHT-1`, `WIN-MINI-1`, `EXT-MINI-1`
- Scope: 确认打包技术方案后另建工作流。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 不在 `codex/mac-ios` 中提前实施。

---

## C. Integration Roadmap

Integration 只合并已经在负责分支验证过的节点。Mac 负责最终 Integration 合并、Capacitor/Xcode 和真机验证；项目主控可处理一次性的 Roadmap 分支初始化。

### INT-BASE-0 建立首个共同基线

- Priority: P0
- Status: completed
- Owner branch: `codex/integration`
- Depends on: none
- Scope: 建立同时包含 Windows 与 Mac 历史的共同基线。
- Acceptance criteria: 远端 Integration 精确指向合并提交，并包含两个祖先提交。
- Shared files: 全仓库基线
- Unblock result: 已解除 `WIN-BASE-0`、`IOS-BASE-0`。
- Result commit: `6588247c29b2082d310cc96fe110ab67866337f4`
- Verification: 包含 Win SHA `ad07003533b869321570676b0fa185f5a3ac3943` 和 Mac SHA `b67a71b7d8f57020c85234de307703df561f10be`。
- Notes: completed

### INT-ROADMAP-1 建立双平台唯一 Roadmap

- Priority: P0
- Status: completed
- Owner branch: `codex/release-roadmap` -> `codex/integration`
- Depends on: `INT-BASE-0`
- Scope: 创建本文档，写入四条路线、状态、依赖、验收、分支、共享文件和解除阻塞结果。
- Acceptance criteria: 文档进入 Integration；节点 ID 唯一；状态枚举有效；高德是 P0 主 Provider；Win/Mac 均能读取。
- Shared files: `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`
- Unblock result: 提供 Roadmap commit 和 Integration SHA，解除两端按 Roadmap 自动选择节点的条件。
- Result commit: `7ee432b`
- Verification: `git diff --check` 通过；74 个节点 ID 唯一；所有节点字段完整；状态枚举和依赖引用有效；P0 地图 Provider 为高德。
- Notes: Roadmap 内容及完成状态已通过普通 fast-forward 同步到 `codex/integration`；首次同步 SHA 为 `ed332ce`。

### INT-AUTH-1 集成真实登录

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-AUTH-1`, `IOS-AUTH-1`
- Scope: 合并服务端和 iOS 登录节点。
- Acceptance criteria: server MVP、前端构建、production guards、Capacitor sync 和真实短信真机用例通过。
- Shared files: Auth 页面、auth service、API 类型
- Unblock result: 提供 Integration SHA 和真实登录回归结果。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-MAP-1 集成高德地图主流程

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MAP-2`, `IOS-MAP-2`
- Scope: 合并高德代理、地点域模型、JS API 选点、附近匹配和导航。
- Acceptance criteria: WebService Key 不在客户端；地图真机用例通过；订单地点快照正确；拒绝定位可手动完成。
- Shared files: 地图服务、API 类型、地图 UI、Info.plist
- Unblock result: 提供 Integration SHA、冲突说明和地点场景矩阵。
- Result commit: pending
- Verification: pending
- Notes: 腾讯地图不进入本节点。

### INT-DATA-1 集成生产数据闭环

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-DATA-2`, `IOS-DATA-2`
- Scope: 合并 Feed、资料、作品、收藏、咨询和订单真实数据链路。
- Acceptance criteria: production guards、真实 PostgreSQL、分页、刷新和跨设备用例通过；无静默 fallback。
- Shared files: 数据 services、AppDataProvider、API 类型
- Unblock result: 提供 Integration SHA 和生产数据矩阵。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-MSG-1 集成聊天和通知

- Priority: P1
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MSG-1`, `IOS-MSG-1`, `WIN-NOTIFY-1`, `IOS-NOTIFY-1`
- Scope: 合并聊天同步、分页、重试和通知。
- Acceptance criteria: 双角色、跨设备、弱网、前后台和 Push 用例通过。
- Shared files: message/notification services、页面、API 类型
- Unblock result: 提供 Integration SHA 和消息通知矩阵。
- Result commit: pending
- Verification: pending
- Notes: 聊天 P0 可先随 `INT-RC-1` 验收，Push 完整能力为 P1。

### INT-MEDIA-1 集成媒体和审核

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MEDIA-1`, `IOS-MEDIA-1`
- Scope: 合并真实媒体上传、展示和最小安全校验；P1 再补完整审核闭环。
- Acceptance criteria: COS、PostgreSQL 媒体记录、真机图片/视频/Live Photo、失败重试通过。
- Shared files: media service、媒体组件、API 类型
- Unblock result: 提供 Integration SHA 和真实上传记录。
- Result commit: pending
- Verification: pending
- Notes: `WIN-MEDIA-2`/`IOS-MEDIA-2` 完成后更新完整审核结果。

### INT-PAY-1 集成支付、退款和结算

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-SETTLE-1`, `IOS-PAY-1`, `IOS-REFUND-1`
- Scope: 合并真实支付、回调、退款、对账和结算状态。
- Acceptance criteria: 一笔小额真机支付、取消、失败、退款和订单恢复通过；服务端幂等和对账验证通过。
- Shared files: payment service、订单页面、API 类型、必要 iOS 配置
- Unblock result: 提供 Integration SHA、脱敏交易结果和状态矩阵。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-COMPLIANCE-1 集成合规与上线运营能力

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-COMPLIANCE-1`, `WIN-ADMIN-1`, `IOS-COMPLIANCE-1`
- Scope: 合并合规 API、用户入口、Admin 独立部署和审核材料。
- Acceptance criteria: 删除、导出、举报、客服、权限拒绝、政策 URL、Admin 隔离和审计通过。
- Shared files: 设置/合规页面、Admin 构建、文档、API 类型
- Unblock result: 提供 Integration SHA 和审核材料检查结果。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-RC-1 P0 Release Candidate

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `INT-AUTH-1`, `INT-MAP-1`, `INT-DATA-1`, `INT-MEDIA-1`, `INT-PAY-1`, `INT-COMPLIANCE-1`, `IOS-QA-1`, `WIN-DELIVERY-1`
- Scope: 形成首个完整 P0 Release Candidate。
- Acceptance criteria: server MVP、真实 PostgreSQL、mobile/admin build、production guards、Capacitor sync、Xcode Release、核心真机流程和上线检查全部通过。
- Shared files: 全仓库候选版本
- Unblock result: 提供 RC SHA、验证清单、已知非阻断问题，解除 `INT-TESTFLIGHT-1`。
- Result commit: pending
- Verification: pending
- Notes: P2/P3 不得进入 RC。

### INT-TESTFLIGHT-1 TestFlight 验收

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `INT-RC-1`, `IOS-DELIVERY-1`
- Scope: 对 TestFlight 构建执行完整真机和真实交易回归。
- Acceptance criteria: 安装、升级、登录、地图、数据、媒体、聊天、订单、支付、退款、客服和删除账号通过。
- Shared files: Release 文档
- Unblock result: 提供 TestFlight build、回归结果和 release SHA，解除 `IOS-STORE-1`、P2/P3 评审条件。
- Result commit: pending
- Verification: pending
- Notes: AI、增长实验和小程序在本节点前保持暂停。

### INT-STORE-1 App Store 发布基线

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `IOS-STORE-1`
- Scope: 锁定 App Store 提交版本和审核修复。
- Acceptance criteria: 提交版本可追溯；审核反馈有独立节点；生产部署和回滚准备完成。
- Shared files: Release 文档
- Unblock result: 提供最终 release SHA 和审核状态。
- Result commit: pending
- Verification: pending
- Notes: pending

---

## D. User/External Roadmap

这些节点由用户、账号管理员、云服务商、支付机构或合规顾问完成。代码对话不得把它们误报为代码已完成。

### EXT-APPLE-1 Apple Developer 公司账号

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 完成公司账号、组织信息、Team、正式 Bundle ID 和协议。
- Acceptance criteria: Mac 可选择正式 Team 并签名；App Store Connect 可创建应用；合同和税务状态满足提交需要。
- Shared files: 无；只向代码侧提供非敏感 Team/Bundle 信息
- Unblock result: 提供 Team ID/Bundle ID 的非敏感确认和账号状态，解除 `IOS-DELIVERY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 证书和账号密码禁止进入 Git。

### EXT-SMS-1 腾讯短信签名和模板

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 完成短信签名、验证码模板、生产额度和发送地区确认。
- Acceptance criteria: 签名/模板审核通过；生产账号可发送目标手机号；配额和费用可用。
- Shared files: 无
- Unblock result: 只提供签名/模板 ID 等非 Secret 配置名和值的安全交接，解除 `WIN-AUTH-1`、`IOS-AUTH-1`。
- Result commit: not applicable
- Verification: pending
- Notes: Secret ID/Key 通过密钥管理配置。

### EXT-AMAP-1 高德账号、应用和 WebService Key

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 创建高德开发者账号和应用，申请 WebService Key，确认配额。
- Acceptance criteria: Key 可由 staging 后端调用所需 WebService；配额、地区和服务条款满足测试。
- Shared files: 无
- Unblock result: 通过密钥管理配置 `AMAP_WEBSERVICE_KEY`，只向 Windows 提供已配置确认，解除 `WIN-MAP-1`。
- Result commit: not applicable
- Verification: pending
- Notes: WebService Key 禁止发给客户端。

### EXT-AMAP-2 高德 JS API Key 和安全配置

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-AMAP-1`
- Scope: 申请 JS API Key，配置安全密钥、允许域名和 Capacitor 使用方式。
- Acceptance criteria: staging 和 iOS Capacitor 真机可加载 JS API 2.0；安全配置不暴露 WebService Key；正式域名已加入允许范围。
- Shared files: 只提供可公开客户端配置和安全接入说明
- Unblock result: 提供 JS Key 的安全配置方式和允许域名确认，解除 `IOS-MAP-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 客户端 Key 仍需按高德要求限制使用范围。

### EXT-AMAP-3 高德商业许可核实

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-AMAP-1`
- Scope: 根据正式业务、调用量和商业模式核实高德授权、配额和付费要求。
- Acceptance criteria: 保存官方或合同确认；上线调用量和费用有预算。
- Shared files: 合规记录，不提交敏感合同
- Unblock result: 提供可上线结论、配额和限制摘要，解除 `INT-RC-1` 地图外部门槛。
- Result commit: not applicable
- Verification: pending
- Notes: 腾讯地图仅作为未来备用评估。

### EXT-CLOUD-1 COS、PostgreSQL 和备份资源

- Priority: P0
- Status: in_progress
- Owner branch: User/External
- Depends on: none
- Scope: 准备正式 PostgreSQL、COS/CDN、备份、网络和最小权限账号。
- Acceptance criteria: staging/production 资源隔离；数据库连接、COS 上传、备份和恢复可验证；费用和告警配置完成。
- Shared files: 无
- Unblock result: 提供资源已配置确认、非敏感地址和验证窗口，解除 `WIN-MEDIA-1`、`WIN-DELIVERY-1`。
- Result commit: not applicable
- Verification: `cloudDatabaseTrialReady: true`；正式 COS、备份恢复和生产隔离仍待完成。
- Notes: Secret 通过云密钥管理。

### EXT-PAY-1 支付商户、证书和 iOS 方案

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 根据产品交易类型确认 iOS 支付渠道，准备商户、证书、API 权限、回调域名和测试能力。
- Acceptance criteria: 支付方案经过审核要求核实；商户和证书可用；可完成一笔小额测试和退款。
- Shared files: 无
- Unblock result: 提供支付渠道决定、非敏感商户标识、证书配置方式和测试窗口，解除 `WIN-PAY-1`、`IOS-PAY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 证书和私钥禁止进入 Git 或聊天明文。

### EXT-DOMAIN-1 正式域名、HTTPS 和政策 URL

- Priority: P0
- Status: in_progress
- Owner branch: User/External
- Depends on: none
- Scope: 准备 API、Admin、隐私政策、用户协议、支付说明和退款规则的正式 HTTPS URL。
- Acceptance criteria: URL 可从公网和真机访问；证书有效；Admin 与 API 域名隔离；政策 URL 长期稳定。
- Shared files: 只向代码侧提供正式 URL
- Unblock result: 提供 URL 和证书检查结果，解除 `WIN-ADMIN-1`、`WIN-DELIVERY-1`、`IOS-COMPLIANCE-1`。
- Result commit: not applicable
- Verification: API `https://api.weareinframe.com` 已存在；Admin 和政策 URL 仍待确认。
- Notes: pending

### EXT-COMPLIANCE-1 隐私、协议、支付和退款文本

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 定稿隐私政策、用户协议、支付说明、退款规则、客服和数据权利说明。
- Acceptance criteria: 文本覆盖定位、媒体、账号、订单、支付、分析和第三方 Provider；版本和生效日期明确。
- Shared files: 正式文本或 URL
- Unblock result: 提供最终版本和 URL，解除 `WIN-COMPLIANCE-1`、`IOS-COMPLIANCE-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 代码对话不得自行生成最终法律结论。

### EXT-FILING-1 ICP、APP 备案和业务资质

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-DOMAIN-1`
- Scope: 根据项目文档、运营主体、服务器和业务模式核实 ICP、APP 备案及其他所需资质。
- Acceptance criteria: 从官方渠道或专业顾问获得可执行结论；所需申请已完成或有明确时间表。
- Shared files: 合规状态摘要
- Unblock result: 提供可提交/可上线结论和限制，解除 `IOS-STORE-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 该节点不是代码任务。

### EXT-OPS-1 客服、退款、审核和财务负责人

- Priority: P1
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 确定客服渠道、服务时间、退款/争议/审核/财务负责人和操作权限。
- Acceptance criteria: 每类 case 有负责人、SLA 和升级路径；审核账号和客服入口可用。
- Shared files: 运营说明
- Unblock result: 提供角色和流程摘要，解除 `WIN-ADMIN-2`、`IOS-OPS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 不在仓库保存个人敏感信息。

### EXT-OBS-1 崩溃和监控服务

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`
- Scope: 选择后端监控和 iOS 崩溃上报服务，确认数据区域、保留期和隐私条款。
- Acceptance criteria: staging/production 项目隔离；密钥管理完成；隐私披露覆盖；测试事件可验证。
- Shared files: 非敏感项目标识和配置说明
- Unblock result: 提供服务选择和配置完成确认，解除 `IOS-CRASH-1`。
- Result commit: not applicable
- Verification: pending
- Notes: pending

### EXT-PUSH-1 Apple Push 能力

- Priority: P1
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-APPLE-1`
- Scope: 准备 APNs 能力、Key/证书和 Provider 配置。
- Acceptance criteria: staging 真机可收到测试 Push；密钥安全存储；权限文案完成。
- Shared files: 无
- Unblock result: 提供能力已配置确认，解除 `IOS-NOTIFY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: Key 禁止提交。

### EXT-ANALYTICS-1 分析服务与隐私配置

- Priority: P2
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`, `INT-TESTFLIGHT-1`
- Scope: 选择分析服务、数据区域、保留期和用户选择机制。
- Acceptance criteria: 隐私披露完成；staging/production 隔离；敏感字段规则明确。
- Shared files: 非敏感项目标识
- Unblock result: 解除 `WIN-ANALYTICS-1`、`IOS-ANALYTICS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: TestFlight 主流程稳定前不推进。

### EXT-MINI-1 微信小程序资源

- Priority: P3
- Status: pending
- Owner branch: User/External
- Depends on: `INT-TESTFLIGHT-1`
- Scope: 小程序 AppID、Secret、类目、隐私和支付资源。
- Acceptance criteria: 另行评审。
- Shared files: none
- Unblock result: 解除 `WIN-MINI-1`、`IOS-MINI-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 当前暂停。

### EXT-AI-1 AI 服务资源

- Priority: P3
- Status: pending
- Owner branch: User/External
- Depends on: `INT-TESTFLIGHT-1`
- Scope: 待 AI 节点重新定义后评审。
- Acceptance criteria: 另行评审。
- Shared files: none
- Unblock result: 解除 `WIN-AI-1`、`IOS-AI-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 当前暂停。

---

## E. 完成节点时的更新要求

节点从 `in_progress` 或 `blocked` 更新为 `completed` 时，负责端必须同时填写：

1. `Result commit`: 推送后的完整 commit SHA。
2. `Verification`: 实际执行命令、真机设备或外部审核结果。
3. `Unblock result`: 明确解除哪些节点，以及对方下一步。
4. `Notes`: 仍存在但不阻断该节点的风险。
5. 如节点修改共享文件，附共享文件释放通知。

任何一项为空时不得标记为 `completed`。

## F. Integration 合并检查

每次更新 `codex/integration` 前至少执行：

- `server`: `npm run check:mvp`
- `pp-app`: `npm run build`
- `pp-app`: `npm run build:admin`
- `pp-app`: `npm run check:production-guards`
- Mac/iOS 受影响时：`npx cap sync ios` 和对应 Xcode/真机验证
- 仓库：`git diff --check`

文档-only 合并可使用最小检查：

- `git diff --check`
- 节点 ID 唯一检查
- 状态枚举检查
- 依赖节点存在性检查
- 高德 P0 Provider 决策检查
