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

如果后端选择 Prisma，建议以 `prisma/schema.prisma` 作为开发入口；如果需要更精细的数据库约束、初始化数据或原生 SQL 能力，以 `schema.sql` 为准。

Prisma 后端初始化参考：

```bash
npm install prisma @prisma/client
npx prisma generate --schema database/prisma/schema.prisma
npx prisma migrate dev --schema database/prisma/schema.prisma --name init
```

原生 SQL 初始化参考：

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed_mvp.sql
```

## 表分组

### 账号与身份

- `users`：所有自然人账号
- `user_profiles`：用户偏好、简介、安全偏好
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

### 拍摄前妆造预留

产品后续会在摄影预约前加入“化妆”和“穿衣”两个前置能力，但不建议在 MVP 阶段直接混入摄影师订单模型：

- 化妆师应作为独立服务身份，例如后续扩展 `makeup_artists`、`makeup_artist_kyc`、`makeup_artist_tags`、`makeup_service_areas`、`makeup_packages`、`makeup_availability_slots`。
- 化妆师必须通过管理员后台审核后才能展示和接单，审核仍进入 `audit_cases`，但 `target_type` 应与摄影师区分。
- 化妆预约和摄影预约可以在产品流程上串联，但订单、支付、结算、纠纷应分别建模，避免一个摄影订单同时承担化妆师和摄影师两套履约责任。
- 化妆师服务同样需要平台内聊天、风控、举报、退款和评价能力，后续可复用消息、风控、审核和结算的通用表。
- 穿衣能力等 LT 项目可用后接入。PP 侧只沉淀拍摄地点、风格标签、常见穿搭、作品参考和跳转参数；LT 侧负责背景试穿、服装推荐和购买链路。
- 与 LT 的连接数据建议先独立为 `location_outfit_insights`、`outfit_recommendation_links` 等扩展表，避免污染 `posts` 和摄影订单主表。

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
