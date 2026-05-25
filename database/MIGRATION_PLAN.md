# PP陪拍平台数据库演进计划

这份文档说明数据库从 MVP 到生产版的演进路径。当前 MVP 目标是验证图片流、地点匹配、预约支付、订单聊天、审核和结算闭环；生产版再逐步增强安全、性能、合规和运营能力。

## 阶段 0：MVP 基线

已完成：

- PostgreSQL 原生 schema：`schema.sql`
- Prisma schema：`prisma/schema.prisma`
- MVP seed 数据：`seed_mvp.sql`
- API 契约：`API_CONTRACT.md`
- 查询与事务手册：`QUERY_AND_TRANSACTION_GUIDE.md`

MVP 数据能力：

- 用户与陪拍者身份
- 陪拍者入驻审核
- 服务区域、时间、活动价格、加购项
- 作品图片流
- 订单、支付、退款
- 订单绑定聊天和基础屏蔽词
- 举报、评价、收藏
- 结算、钱包、提现
- 运营后台账号、日志、配置

## 阶段 1：上线前加固

### 1.1 补充强约束

建议在生产迁移前补充金额、时长和状态约束。

```sql
alter table activity_pricings
add constraint chk_activity_duration_positive
check (duration_minutes > 0);

alter table orders
add constraint chk_order_amounts_non_negative
check (
  base_amount_cents >= 0
  and extra_amount_cents >= 0
  and total_amount_cents >= 0
  and platform_fee_cents >= 0
  and companion_income_cents >= 0
);

alter table settlements
add constraint chk_settlement_amounts_non_negative
check (
  gross_amount_cents >= 0
  and platform_fee_cents >= 0
  and net_amount_cents >= 0
);

alter table ledger_entries
add constraint chk_ledger_direction
check (direction in ('credit', 'debit'));
```

### 1.2 关键唯一约束

防止支付、结算和评价重复。

当前已有：

- `payments.payment_no`
- `refunds.refund_no`
- `settlements.order_id`
- `ratings.order_id`
- `favorites(user_id, target_type, target_id)`

建议补充：

```sql
create unique index uniq_active_conversation_order
on conversations(order_id)
where status in ('active', 'restricted');
```

### 1.3 更新时间触发器

现在 `updated_at` 依赖应用层更新。生产版建议加数据库触发器兜底。

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

再给常用表挂触发器：

```sql
create trigger trg_users_updated_at
before update on users
for each row execute function set_updated_at();

create trigger trg_orders_updated_at
before update on orders
for each row execute function set_updated_at();
```

可覆盖：

- `users`
- `user_profiles`
- `companions`
- `companion_kyc`
- `service_areas`
- `activity_pricings`
- `availability_slots`
- `posts`
- `orders`
- `payments`
- `refunds`
- `conversations`
- `reports`
- `settlements`
- `withdrawals`
- `system_configs`

## 阶段 2：地理搜索升级

MVP 使用：

- `city`
- `area_name`
- `lat`
- `lng`
- `radius_meters`

生产版建议启用 PostGIS。

### 2.1 启用扩展

```sql
create extension if not exists postgis;
```

### 2.2 增加 geography 字段

```sql
alter table posts
add column geo geography(point, 4326);

alter table service_areas
add column center_geo geography(point, 4326);

alter table orders
add column place_geo geography(point, 4326);
```

### 2.3 回填地理字段

```sql
update posts
set geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
where lat is not null
  and lng is not null;

update service_areas
set center_geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
where lat is not null
  and lng is not null;

update orders
set place_geo = ST_SetSRID(ST_MakePoint(place_lng, place_lat), 4326)::geography
where place_lat is not null
  and place_lng is not null;
```

### 2.4 增加地理索引

```sql
create index idx_posts_geo on posts using gist (geo);
create index idx_service_areas_center_geo on service_areas using gist (center_geo);
create index idx_orders_place_geo on orders using gist (place_geo);
```

### 2.5 服务范围匹配

```sql
select c.*
from companions c
join service_areas sa on sa.companion_id = c.id
where c.status = 'approved'
  and c.service_enabled = true
  and sa.enabled = true
  and ST_DWithin(
    sa.center_geo,
    ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography,
    coalesce(sa.radius_meters, 3000)
  );
```

## 阶段 3：隐私与敏感数据保护

平台面向游客和女生，隐私保护需要尽早设计。

### 3.1 敏感字段分级

高敏：

- `companion_kyc.real_name`
- `companion_kyc.id_doc_number_hash`
- `companion_kyc.id_doc_front_file`
- `companion_kyc.id_doc_back_file`
- `companion_kyc.emergency_contact_name`
- `companion_kyc.emergency_contact_phone`
- `messages.original_content`
- `withdrawals.account_snapshot`

中敏：

- `users.phone`
- `users.email`
- `orders.place_address`
- `reports.evidence_files`

### 3.2 加密策略

建议：

- 手机号：保留明文用于登录，但增加 `phone_hash` 用于检索和去重。
- 证件号：只存 hash，不存明文。
- 证件照、视频：对象存储私有桶，数据库只存 file key。
- 聊天原文：普通消息可不存 `original_content`，只有风控命中时加密保存。
- 提现账户快照：JSON 加密后存储，后台按权限解密。

可增加字段：

```sql
alter table users add column phone_hash varchar(255);
alter table users add column email_hash varchar(255);
alter table companion_kyc add column encrypted_payload bytea;
alter table withdrawals add column encrypted_account_payload bytea;
```

### 3.3 权限隔离

后台应按角色限制访问：

- 审核员：可看审核材料，但不看提现账户。
- 客服：可看订单和聊天，但证件信息脱敏。
- 财务：可看提现账户，但不看聊天原文。
- 风控：可看风险消息原文，但不可导出批量用户信息。

数据库层可进一步使用 view：

```sql
create view admin_user_safe_view as
select
  id,
  left(phone, 3) || '****' || right(phone, 4) as masked_phone,
  nickname,
  avatar_url,
  gender,
  city,
  status,
  created_at
from users;
```

## 阶段 4：索引和性能优化

### 4.1 首页 feed 索引

当前已有：

```sql
create index idx_posts_feed_city
on posts(status, is_feed_visible, city, published_at desc);
```

生产建议增加部分索引：

```sql
create index idx_posts_public_feed
on posts(city, is_featured desc, quality_score desc, published_at desc)
where status = 'approved'
  and is_feed_visible = true;
```

### 4.2 订单列表索引

当前已有：

```sql
idx_orders_user_status
idx_orders_companion_status
```

生产可补：

```sql
create index idx_orders_paid_pending_confirm
on orders(companion_id, created_at)
where status = 'paid_pending_confirm';

create index idx_orders_today_schedule
on orders(companion_id, start_at)
where status in ('confirmed', 'in_service');
```

### 4.3 审核队列索引

```sql
create index idx_audit_cases_pending_queue
on audit_cases(target_type, submitted_at)
where status = 'pending';
```

### 4.4 风控事件索引

```sql
create index idx_message_risk_pending
on message_risk_events(risk_level, created_at desc)
where review_status = 'pending';
```

### 4.5 结算任务索引

当前已有：

```sql
idx_settlements_due
```

可补部分索引：

```sql
create index idx_settlements_pending_due
on settlements(settle_after)
where status = 'pending';
```

## 阶段 5：财务对账增强

MVP 已有：

- `payments`
- `refunds`
- `settlements`
- `ledger_entries`
- `withdrawals`

生产建议增加每日对账表。

### 5.1 支付渠道对账

```sql
create table payment_reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  channel varchar(40) not null,
  trade_date date not null,
  status varchar(40) not null default 'pending',
  total_count integer not null default 0,
  total_amount_cents integer not null default 0,
  mismatch_count integer not null default 0,
  file_url text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(channel, trade_date)
);
```

```sql
create table payment_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references payment_reconciliation_batches(id) on delete cascade,
  payment_id uuid references payments(id),
  third_party_trade_no varchar(128),
  local_amount_cents integer,
  channel_amount_cents integer,
  local_status varchar(40),
  channel_status varchar(40),
  result varchar(40) not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
```

### 5.2 钱包余额校验

定时校验：

```sql
select
  companion_id,
  sum(case when balance_type = 'pending' and direction = 'credit' then amount_cents else 0 end) as pending_credit
from ledger_entries
group by companion_id;
```

生产建议建立钱包快照表：

```sql
create table wallet_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id),
  snapshot_date date not null,
  pending_cents integer not null,
  available_cents integer not null,
  frozen_cents integer not null,
  withdrawn_cents integer not null,
  created_at timestamptz not null default now(),
  unique(companion_id, snapshot_date)
);
```

## 阶段 6：审计和后台安全

当前已有：

- `admin_action_logs`
- `audit_logs`

生产建议：

### 6.1 关键操作必须记录 before/after

需要记录：

- 审核通过/拒绝
- 退款
- 冻结/解冻结算
- 封禁用户
- 暂停陪拍者接单
- 修改系统配置
- 修改风控词

### 6.2 增加后台登录日志

```sql
create table admin_login_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admin_users(id),
  ip varchar(64),
  user_agent text,
  success boolean not null,
  fail_reason text,
  created_at timestamptz not null default now()
);
```

### 6.3 系统配置版本化

```sql
create table system_config_versions (
  id uuid primary key default gen_random_uuid(),
  key varchar(120) not null,
  old_value jsonb,
  new_value jsonb not null,
  updated_by uuid references admin_users(id),
  created_at timestamptz not null default now()
);
```

## 阶段 7：消息风控升级

MVP 是关键词匹配。

生产可升级：

- 归一化：空格、符号、谐音、拆字
- 手机号、微信号、银行卡号正则
- 多次违规计数
- 订单冻结联动
- 陪拍者接单权限处罚
- 人工复核队列

### 7.1 用户风控累计表

```sql
create table user_risk_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  risk_score integer not null default 0,
  contact_violation_count integer not null default 0,
  payment_violation_count integer not null default 0,
  harassment_report_count integer not null default 0,
  last_violation_at timestamptz,
  restricted_until timestamptz,
  updated_at timestamptz not null default now()
);
```

### 7.2 风控动作表

```sql
create table risk_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  companion_id uuid references companions(id),
  order_id uuid references orders(id),
  action varchar(60) not null,
  reason text,
  source varchar(40) not null,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
```

## 阶段 8：内容运营和推荐

MVP 用 `is_featured` 和 `quality_score`。

生产可增加：

```sql
create table feed_collections (
  id uuid primary key default gen_random_uuid(),
  city varchar(80),
  title varchar(120) not null,
  description text,
  status varchar(40) not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

```sql
create table feed_collection_posts (
  collection_id uuid not null references feed_collections(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (collection_id, post_id)
);
```

用于：

- 城市精选
- 热门地点
- 新人陪拍者
- 夜景专题
- 探店专题

## 阶段 9：数据归档

订单、消息、风控、后台日志会增长很快。

### 9.1 归档策略

建议：

- `messages`：超过 180 天且订单无纠纷，可归档到冷表。
- `message_risk_events`：至少保留 1 年。
- `admin_action_logs`：至少保留 2 年。
- `payments/refunds/ledger_entries`：财务数据长期保留，不轻易删除。
- `post_images`：被移除内容可保留 file key 和审核记录，实际图片按合规策略删除。

### 9.2 消息冷表

```sql
create table messages_archive (
  like messages including all
);
```

归档流程：

```sql
insert into messages_archive
select m.*
from messages m
join conversations c on c.id = m.conversation_id
join orders o on o.id = c.order_id
where o.status in ('completed', 'cancelled', 'refunded')
  and m.sent_at < now() - interval '180 days'
  and not exists (
    select 1
    from reports r
    where r.order_id = o.id
      and r.status in ('pending', 'investigating')
  );
```

确认归档成功后再删除热表数据。

## 阶段 10：多城市和运营扩展

当前城市是字符串字段。生产版可规范化：

```sql
create table cities (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null unique,
  province varchar(80),
  country varchar(80) not null default '中国',
  timezone varchar(80) not null default 'Asia/Shanghai',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
```

逐步将：

- `users.city`
- `companions.base_city`
- `posts.city`
- `service_areas.city`
- `orders.city`

迁移为 `city_id`。

MVP 阶段不建议过早做城市表，字符串更快；当城市超过 5 个、有独立运营配置时再迁移。

## 推荐演进顺序

```text
上线前：
阶段 1 强约束 + updated_at 触发器

有真实地点搜索需求：
阶段 2 PostGIS

开始处理真实实名材料：
阶段 3 隐私加密与权限隔离

订单量增加：
阶段 4 索引优化

接入真实支付：
阶段 5 财务对账

后台多人协作：
阶段 6 审计增强

跳单和骚扰问题增多：
阶段 7 风控升级

内容运营开始精细化：
阶段 8 内容集合与推荐

数据量增长：
阶段 9 归档

多城市运营：
阶段 10 城市规范化
```
