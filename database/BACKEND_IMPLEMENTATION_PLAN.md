# PP陪拍平台 MVP 后端实现计划

目标：用最短路径支撑前端 MVP 的真实数据闭环，不急着做复杂推荐、复杂仲裁和地图圈选。

推荐后端栈：

- Node.js + TypeScript
- NestJS 或 Fastify
- Prisma + PostgreSQL
- Redis 用于验证码、订单超时锁、消息限流
- 对象存储用于图片、证件、视频和举报证据

## 总体优先级

第一阶段先跑通主闭环：

```text
用户浏览图片流
-> 查看帖子详情和预约面板
-> 创建订单
-> 模拟支付成功
-> 进入订单聊天
-> 陪拍者确认
-> 完成订单
-> 生成结算
```

第二阶段补运营闭环：

```text
陪拍者入驻
-> 作品发布
-> 后台审核
-> 消息风控
-> 举报处理
-> 退款和冻结结算
```

## Sprint 0：项目初始化

### 目标

搭好后端工程和数据库连接。

### 任务

- 初始化后端项目
- 安装 Prisma
- 配置 `DATABASE_URL`
- 接入 `database/prisma/schema.prisma`
- 生成 Prisma Client
- 创建健康检查接口
- 设计统一响应结构和错误码

### 接口

```text
GET /api/health
```

返回：

```json
{
  "success": true,
  "data": {
    "status": "ok"
  },
  "error": null
}
```

### 验收标准

- 后端能启动
- 能连接 PostgreSQL
- Prisma Client 可正常生成
- `/api/health` 返回正常

## Sprint 1：种子数据和首页图片流

### 目标

替换前端 mock 数据，让首页、帖子详情、预约面板从数据库读取。

### 任务

- 写 seed 脚本
- 创建测试用户
- 创建 3 个陪拍者
- 创建服务区域、价格、可预约时间
- 创建 3 组作品和图片
- 实现首页 feed 查询
- 实现帖子详情查询

### 接口

```text
GET /api/feed/posts
GET /api/posts/:postId
```

### 涉及表

- `users`
- `companions`
- `companion_kyc`
- `companion_tags`
- `service_areas`
- `activity_pricings`
- `companion_extras`
- `availability_slots`
- `posts`
- `post_images`
- `post_tags`

### 关键实现

首页查询条件：

```text
posts.status = approved
posts.is_feed_visible = true
companions.status = approved
companions.service_enabled = true
```

排序：

```text
is_featured desc
quality_score desc
published_at desc
```

### 验收标准

- 首页能展示数据库里的作品流
- 帖子详情能展示图片、地点、时间、文案
- 预约面板能展示陪拍者真人照、标签、服务区域、时间、价格和加购项

## Sprint 2：订单创建和模拟支付

### 目标

跑通从预约面板到订单创建、支付成功、订单列表展示。

### 任务

- 实现订单报价接口
- 实现创建订单接口
- 用事务锁定 `availability_slots`
- 创建 `payments`
- 实现 mock 支付成功接口
- 支付成功后创建 `conversations`
- 实现用户订单列表

### 接口

```text
POST /api/orders/quote
POST /api/orders
POST /api/payments/:paymentId/mock-success
GET /api/orders?role=user
```

### 涉及表

- `orders`
- `order_extras`
- `order_status_logs`
- `payments`
- `availability_slots`
- `conversations`

### 关键事务

创建订单：

```text
1. 查询 activity_pricings
2. 查询 availability_slots for update
3. 校验 slot.status = available
4. 创建 orders pending_payment
5. 更新 slot.status = locked
6. 写 slot.locked_order_id
7. 创建 payments pending
```

mock 支付成功：

```text
1. payments.status = paid
2. orders.status = paid_pending_confirm
3. orders.paid_at = now()
4. availability_slots.status = booked
5. 创建 conversations
6. 写 order_status_logs
```

### 验收标准

- 用户可以从帖子详情创建订单
- 支付成功后订单状态变为“待确认”
- 对应时间 slot 不再可被重复预约
- 用户订单页可以看到新订单

## Sprint 3：订单聊天和基础风控

### 目标

跑通订单绑定聊天，并拦截联系方式和私下交易内容。

### 任务

- 实现获取订单会话
- 实现发送消息
- 初始化 `risk_keywords`
- 命中关键词时阻止发送
- 写入 `message_risk_events`
- 实现简单消息列表

### 接口

```text
GET /api/orders/:orderId/conversation
POST /api/conversations/:conversationId/messages
```

### 涉及表

- `conversations`
- `messages`
- `risk_keywords`
- `message_risk_events`

### 风控规则

MVP 先做关键词命中：

```text
微信 / VX / V信 / 加我 / 私下付 / 线下付 / 转账 / 银行卡 / 支付宝
```

处理：

```text
action = block：不发送消息，写风控事件
action = flag：消息发送，但写风控事件
```

### 验收标准

- 订单聊天可以收发普通消息
- 输入“微信”“VX”“私下付”会被拦截
- 后台能看到风控事件数据

## Sprint 4：陪拍者端入驻和作品发布

### 目标

让陪拍者端从 mock 草稿切到数据库。

### 任务

- 实现当前陪拍者工作台
- 实现保存入驻资料
- 实现提交入驻审核
- 实现作品草稿创建
- 实现作品提交审核
- 文件上传先用 URL 占位，后续接对象存储

### 接口

```text
GET /api/companion/me
PUT /api/companion/me/application
POST /api/companion/me/submit-review
POST /api/companion/posts
POST /api/companion/posts/:postId/submit-review
```

### 涉及表

- `companions`
- `companion_kyc`
- `companion_tags`
- `service_areas`
- `companion_service_scenes`
- `activity_pricings`
- `companion_extras`
- `posts`
- `post_images`
- `post_tags`
- `audit_cases`
- `audit_logs`

### 验收标准

- 陪拍者可以保存资料草稿
- 提交后进入 `pending_review`
- 作品提交后进入 `pending_review`
- 后台审核队列能看到对应任务

## Sprint 5：运营后台审核

### 目标

让后台可以审核陪拍者和作品，并影响前台展示。

### 任务

- 实现后台 Dashboard 指标
- 实现审核队列
- 实现审核通过
- 实现拒绝或要求修改
- 写后台操作日志

### 接口

```text
GET /api/admin/dashboard
GET /api/admin/audit-cases
POST /api/admin/audit-cases/:caseId/approve
POST /api/admin/audit-cases/:caseId/reject
```

### 涉及表

- `admin_users`
- `admin_action_logs`
- `audit_cases`
- `audit_logs`
- `companions`
- `posts`
- `post_images`

### 审核通过规则

陪拍者：

```text
companions.status = approved
companions.service_enabled = true
users.is_companion = true
如果没有 companion_wallets，则创建
```

作品：

```text
posts.status = approved
posts.is_feed_visible = true
posts.published_at = now()
post_images.audit_status = approved
```

### 验收标准

- 后台能看到待审核陪拍者和作品
- 审核通过后，陪拍者可接单
- 作品审核通过后，首页 feed 能刷到
- 拒绝或需修改后，陪拍者端能看到状态

## Sprint 6：订单确认、完成和结算

### 目标

补齐交易闭环和钱包结算。

### 任务

- 陪拍者确认订单
- 用户确认完成订单
- 自动创建结算单
- 更新钱包 pending 金额
- 写账本流水
- 实现结算到可提现的任务

### 接口

```text
POST /api/orders/:orderId/confirm
POST /api/orders/:orderId/complete
GET /api/companion/me
```

### 涉及表

- `orders`
- `order_status_logs`
- `settlements`
- `companion_wallets`
- `ledger_entries`

### 完成订单处理

```text
orders.status = completed
settlements.status = pending
companion_wallets.pending_cents += net_amount_cents
ledger_entries entry_type = order_income
```

### 结算任务

周期任务扫描：

```text
settlements.status = pending
settlements.settle_after <= now()
```

然后：

```text
settlements.status = settled
wallet.pending_cents -= net_amount_cents
wallet.available_cents += net_amount_cents
ledger_entries entry_type = settlement_release
```

### 验收标准

- 陪拍者可确认订单
- 用户可完成订单
- 完成后陪拍者工作台待结算金额增加
- 到结算周期后可提现金额增加

## Sprint 7：评价、收藏和举报

### 目标

补充平台信任机制和内容互动。

### 任务

- 实现订单评价
- 更新陪拍者评分
- 实现收藏帖子/陪拍者
- 实现举报
- 举报后创建审核任务
- 若订单未结算，支持冻结结算

### 接口

```text
POST /api/orders/:orderId/rating
POST /api/favorites
DELETE /api/favorites
POST /api/reports
```

### 涉及表

- `ratings`
- `favorites`
- `reports`
- `audit_cases`
- `settlements`
- `ledger_entries`

### 验收标准

- 完成订单后可以评价
- 陪拍者评分能更新
- 用户可以收藏/取消收藏帖子
- 举报会进入后台队列

## Sprint 8：退款、取消和纠纷

### 目标

覆盖 MVP 必要售后，不做复杂仲裁。

### 任务

- 实现用户取消订单
- 实现陪拍者取消订单
- 实现后台退款
- 实现冻结/解冻结算
- 写订单状态日志
- 写后台操作日志

### 接口

```text
POST /api/orders/:orderId/cancel
POST /api/admin/orders/:orderId/refund
POST /api/admin/settlements/:settlementId/freeze
POST /api/admin/settlements/:settlementId/unfreeze
```

### 取消规则 MVP

```text
pending_payment：取消订单，释放 slot，无退款
paid_pending_confirm：全额退款，释放或标记 slot 可用
confirmed：后台介入，按配置退款
```

### 验收标准

- 用户能取消未确认订单
- 已支付订单取消后创建退款单
- 后台能发起退款
- 有举报的订单能冻结结算

## 推荐目录结构

如果新建后端工程，可以这样放：

```text
server/
  src/
    main.ts
    app.ts
    modules/
      auth/
      feed/
      posts/
      orders/
      payments/
      conversations/
      companion/
      admin/
      reports/
      settlements/
    common/
      errors.ts
      response.ts
      money.ts
      pagination.ts
    prisma/
      prisma.service.ts
  prisma/
    schema.prisma
    seed.ts
  package.json
```

当前仓库里已有：

```text
database/
  schema.sql
  prisma/schema.prisma
  README.md
  API_CONTRACT.md
  BACKEND_IMPLEMENTATION_PLAN.md
```

后端真正创建时，可以把 `database/prisma/schema.prisma` 复制或移动到 `server/prisma/schema.prisma`。

## 错误码建议

| 错误码 | 场景 |
|---|---|
| UNAUTHORIZED | 未登录 |
| FORBIDDEN | 无权限 |
| NOT_FOUND | 资源不存在 |
| VALIDATION_ERROR | 参数错误 |
| ORDER_SLOT_UNAVAILABLE | 时间不可预约 |
| ORDER_STATUS_INVALID | 订单状态不允许该操作 |
| PAYMENT_ALREADY_PAID | 支付单已支付 |
| MESSAGE_BLOCKED | 消息被风控拦截 |
| AUDIT_CASE_NOT_PENDING | 审核任务不是待处理状态 |
| SETTLEMENT_ALREADY_SETTLED | 结算单已结算 |

## 实现顺序建议

最短可演示路径：

```text
Sprint 0
-> Sprint 1
-> Sprint 2
-> Sprint 3
-> Sprint 5
-> Sprint 6
```

陪拍者自助入驻可以稍后接入：

```text
Sprint 4
-> Sprint 5
```

售后和安全闭环：

```text
Sprint 7
-> Sprint 8
```
