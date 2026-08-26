# PP陪拍平台 MVP 数据库设计

这套数据库模型服务于 MVP 的核心闭环：

图片流发现 -> 陪拍者可信审核 -> 服务范围和时间价格匹配 -> 下单支付托管 -> 订单绑定聊天 -> 完成评价 -> 结算提现，同时覆盖运营后台的审核、举报、风控、退款和结算处理。

## 技术选型

- 数据库：PostgreSQL 16+
- 地理能力：MVP 先用城市、地点名、经纬度字段；后续可升级 PostGIS
- 后端建议：Node.js / TypeScript + Prisma 或 Drizzle
- 金额单位：全部使用“分”，字段统一命名为 `*_cents`
- 图片和视频：进入对象存储，数据库只保存 URL、file key 和审核信息
- 半结构化数据：使用 `jsonb` 保存审核快照、支付回调、证据材料、风控 payload

## 文件说明

- `schema.sql`：PostgreSQL 原生建表基线，包含枚举、约束、索引、初始系统配置和初始风控词。
- `seed_mvp.sql`：MVP 初始数据，包含 3 个陪拍者、3 组作品、可预约时间、样例订单和订单聊天。
- `prisma/schema.prisma`：Prisma ORM 版本的数据模型，适合 TypeScript 后端生成 Prisma Client。
- `API_CONTRACT.md`：前端 MVP 页面对应的接口契约草案，包括请求响应和字段映射。
- `BACKEND_IMPLEMENTATION_PLAN.md`：后端开发 Sprint 拆分、接口优先级和验收标准。
- `QUERY_AND_TRANSACTION_GUIDE.md`：核心 SQL 查询、下单/支付/结算/审核等事务手册。
- `MIGRATION_PLAN.md`：MVP 到生产版的数据库演进计划，包括 PostGIS、隐私加密、索引、审计、风控和归档。
- `POSTGRES_CLOUD_RUNBOOK.md`：腾讯云/阿里云 PostgreSQL 接入、建表、seed、检查和上线前注意事项。
- `CLOUD_CONFIGURATION_RECORD.md`：可公开提交的云资源变量结构、技术决定和安全恢复边界。
- `migrations/`：从既有生产基线向后演进的增量迁移；不能用当前 `schema.sql` 代替真实升级路径验收。

如果后端选择 Prisma，建议以 `prisma/schema.prisma` 作为开发入口；如果需要更精细的数据库约束、初始化数据或原生 SQL 能力，以 `schema.sql` 为准。

Prisma 后端初始化参考：

```bash
npm install prisma @prisma/client
npx prisma generate --schema database/prisma/schema.prisma
npx prisma migrate dev --schema database/prisma/schema.prisma --name init
```

原生 SQL 初始化参考：

```bash
psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/schema.sql
psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/seed_mvp.sql
```

云数据库接入前，先在 `server` 目录运行静态准备检查：

```bash
npm run check:postgres-launch-readiness
```

租好腾讯云或阿里云 PostgreSQL 后，再配置 `DATABASE_URL` 并运行真实库检查：

```bash
npm run check:postgres-live
```

组合订单迁移必须在一次性 PostgreSQL 16 测试库中演练，不能使用应用 `DATABASE_URL`。仓库 CI 会创建固定名称的隔离数据库、加载商家领域落地前的 schema/seed，并连续执行迁移两次。手工复现时也必须同时满足：目标位于 localhost、数据库名为 `pp_platform_migration_ci`，并显式开启危险测试开关：

```bash
export MIGRATION_TEST_DATABASE_URL="postgres://USER:PASSWORD@127.0.0.1:5432/pp_platform_migration_ci"
export ALLOW_DESTRUCTIVE_MIGRATION_TEST=1
npm run check:composite-order-migration-live
```

该命令会修改并验证上述专用测试库；它刻意忽略 `DATABASE_URL`，也会拒绝远程主机、其他库名和带查询参数的连接串。

## 表分组

### 账号与身份

- `users`：所有自然人账号
- `user_profiles`：用户偏好、简介、安全偏好
- `user_auth_identities`：微信、手机号等第三方/登录身份绑定
- `user_sessions`：Client / Photographer / Admin 的登录 token 会话
- `companions`：陪拍者身份资料
- `companion_kyc`：实名、证件、人脸、紧急联系人
- `companion_tags`：性格、风格、互动、安全标签

设计原则：用户和陪拍者不是两套账号。陪拍者是 `users` 的扩展身份。

### 服务配置

- `service_areas`：服务城市和商圈/地点
- `companion_service_scenes`：接受或拒绝的服务场景
- `activity_pricings`：活动、时长、价格
- `companion_extras`：精修、加急、短视频等附加服务
- `availability_slots`：可预约时间

MVP 先支持城市 + 商圈/地点多选。后续需要地图圈选时，可用 `lat`、`lng`、`radius_meters` 或 PostGIS 字段升级。

### 妆造商家与组合订单

冷启动方案把妆造、服装作为摄影订单中的可选服务，不新增独立“找商家”市场。用户仍看到一个订单、一份服务清单、一个总价、一次支付和一个售后入口；数据库内部按服务项拆分提供方、履约、退款与结算责任：

- `merchants`：妆造/服装商家主体及非公开营业电话；正式确认前 API 不得返回电话号码。
- `merchant_offerings`：商家固定价套餐的版本化记录；套餐更新不能覆盖历史订单快照。
- `photographer_merchant_links`：摄影师与商家的双方确认合作关系；冷启动阶段一名摄影师最多一个已确认主要商家。
- `order_items`：订单内部服务项。摄影和商家服务分别保存提供方、价格、内容、时间、接单、履约、退款与结算状态。

商家服务不能塞入 `order_extras`：加购项没有独立提供方、接单、履约、退款和结算语义。父订单金额必须等于各服务项用户应付金额之和，当前纯摄影订单兼容为一个摄影服务项。

这部分领域骨架由 `ENABLE_COMPOSITE_ORDER_DOMAIN` 默认关闭保护，组合支付继续硬关闭。完成真实 PostgreSQL 迁移、商家权限、部分退款、多方结算、支付与合规联合验收前，只能做结构和模拟流程验证，不能开放真实组合交易。

### 作品图片流

- `posts`：作品帖子
- `post_images`：帖子图片
- `post_tags`：自然光、松弛感、小红书、夜景等风格标签

首页图片流主要查询：

```sql
select *
from posts
where status = 'approved'
  and is_feed_visible = true
  and city = $1
order by is_featured desc, quality_score desc, published_at desc;
```

### 订单交易

- `orders`：订单主表
- `order_extras`：订单加购项快照
- `order_status_logs`：订单状态变更日志
- `payments`：支付单
- `refunds`：退款单

订单金额必须快照化。用户下单后，即使陪拍者之后改价，历史订单也不能受影响。

### 消息与风控

- `conversations`：订单绑定会话
- `messages`：聊天消息
- `risk_keywords`：屏蔽词和风险规则
- `message_risk_events`：消息风控事件
- `security_events`：权限拒绝、异常访问、登录异常等安全审计事件

消息必须绑定订单，不做开放私信。这对防跳单、客服介入、举报取证都很关键。

### 审核与举报

- `audit_cases`：统一审核任务
- `audit_logs`：审核动作日志
- `reports`：举报和纠纷

陪拍者审核、作品审核、图片审核、消息风控复核、举报处理都可以进入 `audit_cases`。

### 评价与收藏

- `ratings`：订单评价
- `favorites`：收藏帖子或陪拍者

### 结算与财务

- `companion_wallets`：陪拍者钱包聚合余额
- `settlements`：订单结算单
- `ledger_entries`：钱包账本流水
- `withdrawals`：提现单

`ledger_entries` 是财务对账核心表。钱包余额是聚合结果，真实资金变化要以流水为准。

### 后台和配置

- `admin_users`：后台账号
- `admin_action_logs`：后台操作日志
- `system_configs`：平台抽成、结算周期、自动完成时间、消息违规阈值等配置

## 核心状态流

### 陪拍者入驻

```text
users 创建账号
-> companions 创建草稿
-> companion_kyc 填实名材料
-> service_areas / activity_pricings / availability_slots 配置接单信息
-> audit_cases 创建 companion 审核
-> 审核通过
-> companions.status = approved
-> companions.service_enabled = true
-> users.is_companion = true
-> companion_wallets 初始化
```

### 发布作品

```text
posts.status = draft
-> 上传 post_images
-> 提交审核
-> posts.status = pending_review
-> audit_cases 创建 post 审核
-> 审核通过
-> posts.status = approved
-> posts.is_feed_visible = true
-> posts.published_at = now()
```

### 用户下单

```text
用户选择 post
-> 选择 area / slot / activity_pricing / extras
-> 创建 orders pending_payment
-> 锁定 availability_slots
-> 创建 payments pending
-> 支付成功
-> orders.status = paid_pending_confirm
-> availability_slots.status = booked
-> 创建 conversations
```

创建待支付订单时建议在事务内完成：

```text
1. select availability_slots for update
2. 校验 slot.status = available
3. 写入 orders
4. availability_slots.status = locked
5. availability_slots.locked_order_id = order.id
6. 写入 payments
```

### 陪拍者确认

```text
orders.status = confirmed
-> 写 order_status_logs
-> 订单聊天继续开放
```

### 服务完成和结算

```text
orders.status = completed
-> 创建 settlements pending
-> companion_wallets.pending_cents 增加
-> 写 ledger_entries
-> 到达结算周期
-> settlements.status = settled
-> pending 转 available
```

### 举报或纠纷

```text
创建 reports
-> orders.status = disputed
-> settlements.status = frozen
-> 钱包对应金额冻结
-> 后台处理
-> 退款 / 完成 / 处罚 / 解冻
```

## MVP 可暂缓

- 复杂推荐算法
- AI 审图
- AI 聊天风控
- 地图圈选
- 会员体系
- 优惠券
- 直播和短视频流
- 复杂仲裁系统

这些能力后续可以在当前表结构上扩展，不需要推翻 MVP 设计。
