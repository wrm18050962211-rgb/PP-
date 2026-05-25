# PP陪拍平台 MVP 查询与事务手册

这份文档补充数据库层的“怎么用”：核心页面查询、关键事务、状态流转和后台操作 SQL。它和 `schema.sql`、`seed_mvp.sql` 配套使用。

## 1. 首页图片流查询

目标：展示已审核、可进入首页、陪拍者可接单的作品。

```sql
select
  p.id,
  p.city,
  p.location_name,
  p.time_label,
  p.caption,
  p.activity_name,
  p.is_featured,
  p.quality_score,
  p.published_at,
  c.id as companion_id,
  c.display_name,
  c.real_photo_url,
  u.avatar_url
from posts p
join companions c on c.id = p.companion_id
join users u on u.id = c.user_id
where p.status = 'approved'
  and p.is_feed_visible = true
  and c.status = 'approved'
  and c.service_enabled = true
  and p.city = $1
order by p.is_featured desc, p.quality_score desc, p.published_at desc
limit $2;
```

图片和标签建议分两次查，避免主查询行数膨胀：

```sql
select post_id, id, file_url, width, height, sort_order
from post_images
where post_id = any($1::uuid[])
  and audit_status = 'approved'
order by post_id, sort_order;
```

```sql
select post_id, tag_name
from post_tags
where post_id = any($1::uuid[]);
```

## 2. 地点、活动、预算筛选

MVP 第一版用普通字段和 join 即可。

```sql
select distinct p.*
from posts p
join companions c on c.id = p.companion_id
join service_areas sa on sa.companion_id = c.id
join activity_pricings ap on ap.companion_id = c.id
where p.status = 'approved'
  and p.is_feed_visible = true
  and c.status = 'approved'
  and c.service_enabled = true
  and sa.enabled = true
  and sa.city = $1
  and (
    sa.area_name ilike '%' || $2 || '%'
    or p.location_name ilike '%' || $2 || '%'
  )
  and ($3::varchar is null or ap.activity_name = $3)
  and ($4::int is null or ap.price_cents >= $4)
  and ($5::int is null or ap.price_cents <= $5)
order by p.is_featured desc, p.quality_score desc, p.published_at desc;
```

后续如果上 PostGIS，可把 `service_areas.lat/lng/radius_meters` 升级为 geography 字段，使用 `ST_DWithin`。

## 3. 帖子详情查询

主信息：

```sql
select
  p.*,
  c.id as companion_id,
  c.display_name,
  c.bio as companion_bio,
  c.real_photo_url,
  c.intro_video_url,
  c.rating_avg,
  c.rating_count,
  u.avatar_url
from posts p
join companions c on c.id = p.companion_id
join users u on u.id = c.user_id
where p.id = $1
  and p.status = 'approved'
  and c.status = 'approved';
```

预约面板所需信息：

```sql
select area_name
from service_areas
where companion_id = $1
  and enabled = true
order by created_at;
```

```sql
select id, start_at, end_at, status
from availability_slots
where companion_id = $1
  and status = 'available'
  and start_at >= now()
order by start_at
limit 20;
```

```sql
select id, activity_name, duration_minutes, price_cents
from activity_pricings
where companion_id = $1
  and enabled = true
order by sort_order, price_cents;
```

```sql
select id, name, unit, price_cents, description
from companion_extras
where companion_id = $1
  and enabled = true
order by created_at;
```

## 4. 创建订单事务

目标：防止同一个可预约时间被重复下单。

必须在事务里执行，并对 `availability_slots` 使用行级锁。

```sql
begin;

select *
from availability_slots
where id = $1
for update;

-- 应用层校验：
-- 1. slot.status = 'available'
-- 2. slot.start_at >= now()
-- 3. slot.companion_id = companion_id

insert into orders (
  order_no,
  user_id,
  companion_id,
  post_id,
  activity_pricing_id,
  availability_slot_id,
  city,
  place_name,
  place_address,
  activity_name,
  duration_minutes,
  start_at,
  end_at,
  base_amount_cents,
  extra_amount_cents,
  total_amount_cents,
  platform_fee_cents,
  companion_income_cents,
  status,
  user_note
) values (
  $order_no,
  $user_id,
  $companion_id,
  $post_id,
  $activity_pricing_id,
  $slot_id,
  $city,
  $place_name,
  $place_address,
  $activity_name,
  $duration_minutes,
  $start_at,
  $end_at,
  $base_amount_cents,
  $extra_amount_cents,
  $total_amount_cents,
  $platform_fee_cents,
  $companion_income_cents,
  'pending_payment',
  $user_note
)
returning id;

update availability_slots
set status = 'locked',
    locked_order_id = $order_id,
    locked_until = now() + interval '15 minutes',
    updated_at = now()
where id = $slot_id;

insert into payments (
  order_id,
  payment_no,
  channel,
  amount_cents,
  status
) values (
  $order_id,
  $payment_no,
  $channel,
  $total_amount_cents,
  'pending'
);

insert into order_status_logs (
  order_id,
  from_status,
  to_status,
  operator_type,
  operator_id,
  reason
) values (
  $order_id,
  null,
  'pending_payment',
  'user',
  $user_id,
  '创建待支付订单'
);

commit;
```

## 5. 支付成功回调事务

目标：支付成功后订单生效，slot 转为 booked，并创建订单会话。

```sql
begin;

select *
from payments
where id = $payment_id
for update;

select *
from orders
where id = $order_id
for update;

-- 应用层校验：
-- 1. payments.status = 'pending'
-- 2. orders.status = 'pending_payment'
-- 3. payments.amount_cents = orders.total_amount_cents

update payments
set status = 'paid',
    third_party_trade_no = $third_party_trade_no,
    raw_callback = $raw_callback,
    paid_at = now(),
    updated_at = now()
where id = $payment_id;

update orders
set status = 'paid_pending_confirm',
    paid_at = now(),
    updated_at = now()
where id = $order_id;

update availability_slots
set status = 'booked',
    locked_until = null,
    updated_at = now()
where id = $slot_id;

insert into conversations (
  order_id,
  user_id,
  companion_id,
  status
) values (
  $order_id,
  $user_id,
  $companion_id,
  'active'
)
on conflict (order_id) do nothing;

insert into order_status_logs (
  order_id,
  from_status,
  to_status,
  operator_type,
  reason
) values (
  $order_id,
  'pending_payment',
  'paid_pending_confirm',
  'system',
  '支付成功，等待陪拍者确认'
);

commit;
```

## 6. 释放超时未支付订单

建议用定时任务每分钟扫描。

```sql
begin;

update orders
set status = 'cancelled',
    cancel_reason = '支付超时自动取消',
    cancelled_at = now(),
    updated_at = now()
where status = 'pending_payment'
  and id in (
    select locked_order_id
    from availability_slots
    where status = 'locked'
      and locked_until < now()
      and locked_order_id is not null
  );

update availability_slots
set status = 'available',
    locked_order_id = null,
    locked_until = null,
    updated_at = now()
where status = 'locked'
  and locked_until < now();

commit;
```

## 7. 陪拍者确认订单

```sql
begin;

select *
from orders
where id = $order_id
for update;

-- 应用层校验：
-- 1. status = 'paid_pending_confirm'
-- 2. 当前用户是该 companion 对应 user_id

update orders
set status = 'confirmed',
    confirmed_at = now(),
    updated_at = now()
where id = $order_id;

insert into order_status_logs (
  order_id,
  from_status,
  to_status,
  operator_type,
  operator_id,
  reason
) values (
  $order_id,
  'paid_pending_confirm',
  'confirmed',
  'companion',
  $operator_user_id,
  '陪拍者确认接单'
);

commit;
```

## 8. 订单完成与生成结算

```sql
begin;

select *
from orders
where id = $order_id
for update;

-- 应用层校验：
-- 1. status in ('confirmed', 'in_service')
-- 2. 没有 pending/investigating 的高风险 report

update orders
set status = 'completed',
    completed_at = now(),
    updated_at = now()
where id = $order_id;

insert into settlements (
  order_id,
  companion_id,
  gross_amount_cents,
  platform_fee_cents,
  net_amount_cents,
  status,
  settle_after
) values (
  $order_id,
  $companion_id,
  $total_amount_cents,
  $platform_fee_cents,
  $companion_income_cents,
  'pending',
  now() + ($settlement_delay_days || ' days')::interval
)
returning id;

update companion_wallets
set pending_cents = pending_cents + $companion_income_cents,
    updated_at = now()
where companion_id = $companion_id;

insert into ledger_entries (
  companion_id,
  order_id,
  settlement_id,
  entry_type,
  direction,
  amount_cents,
  balance_type,
  balance_after_cents,
  description
) values (
  $companion_id,
  $order_id,
  $settlement_id,
  'order_income',
  'credit',
  $companion_income_cents,
  'pending',
  $pending_balance_after,
  '订单完成，收入进入待结算'
);

commit;
```

## 9. 结算释放到可提现

定时任务扫描到期结算单。

```sql
begin;

select *
from settlements
where id = $settlement_id
  and status = 'pending'
  and settle_after <= now()
for update;

update settlements
set status = 'settled',
    settled_at = now(),
    updated_at = now()
where id = $settlement_id;

update companion_wallets
set pending_cents = pending_cents - $net_amount_cents,
    available_cents = available_cents + $net_amount_cents,
    updated_at = now()
where companion_id = $companion_id;

insert into ledger_entries (
  companion_id,
  order_id,
  settlement_id,
  entry_type,
  direction,
  amount_cents,
  balance_type,
  balance_after_cents,
  description
) values (
  $companion_id,
  $order_id,
  $settlement_id,
  'settlement_release',
  'credit',
  $net_amount_cents,
  'available',
  $available_balance_after,
  '结算期结束，收入转为可提现'
);

commit;
```

## 10. 消息发送与风控

先查启用的关键词：

```sql
select keyword, normalized_keyword, risk_type, risk_level, action
from risk_keywords
where enabled = true;
```

应用层做归一化和命中判断。

普通消息：

```sql
insert into messages (
  conversation_id,
  sender_id,
  sender_role,
  message_type,
  content,
  original_content,
  risk_status
) values (
  $conversation_id,
  $sender_id,
  $sender_role,
  'text',
  $content,
  $content,
  'clean'
);

update conversations
set last_message_at = now(),
    updated_at = now()
where id = $conversation_id;
```

被拦截消息：

```sql
insert into message_risk_events (
  conversation_id,
  order_id,
  user_id,
  matched_keywords,
  risk_type,
  risk_level,
  action_taken,
  raw_payload
) values (
  $conversation_id,
  $order_id,
  $sender_id,
  $matched_keywords,
  $risk_type,
  $risk_level,
  'blocked',
  $raw_payload
);
```

## 11. 陪拍者入驻提交审核

```sql
begin;

update companions
set status = 'pending_review',
    updated_at = now()
where id = $companion_id;

insert into audit_cases (
  target_type,
  target_id,
  status,
  risk_level,
  submitted_by,
  snapshot
) values (
  'companion',
  $companion_id,
  'pending',
  'low',
  $user_id,
  $snapshot
)
returning id;

insert into audit_logs (
  audit_case_id,
  action,
  operator_id,
  operator_type,
  comment
) values (
  $audit_case_id,
  'submit',
  $user_id,
  'companion',
  '提交陪拍者入驻审核'
);

commit;
```

## 12. 作品提交审核

```sql
begin;

update posts
set status = 'pending_review',
    is_feed_visible = false,
    updated_at = now()
where id = $post_id;

update post_images
set audit_status = 'pending'
where post_id = $post_id;

insert into audit_cases (
  target_type,
  target_id,
  status,
  submitted_by,
  snapshot
) values (
  'post',
  $post_id,
  'pending',
  $user_id,
  $snapshot
);

commit;
```

## 13. 后台审核通过

陪拍者审核通过：

```sql
begin;

update audit_cases
set status = 'approved',
    reviewed_by = $admin_id,
    reviewed_at = now(),
    updated_at = now()
where id = $audit_case_id
  and status = 'pending';

update companions
set status = 'approved',
    service_enabled = true,
    updated_at = now()
where id = $companion_id;

update users
set is_companion = true,
    updated_at = now()
where id = (
  select user_id
  from companions
  where id = $companion_id
);

insert into companion_wallets (companion_id)
values ($companion_id)
on conflict (companion_id) do nothing;

insert into audit_logs (
  audit_case_id,
  action,
  operator_id,
  operator_type,
  comment
) values (
  $audit_case_id,
  'approve',
  $admin_id,
  'admin',
  '陪拍者审核通过'
);

commit;
```

作品审核通过：

```sql
begin;

update audit_cases
set status = 'approved',
    reviewed_by = $admin_id,
    reviewed_at = now(),
    updated_at = now()
where id = $audit_case_id
  and status = 'pending';

update posts
set status = 'approved',
    is_feed_visible = true,
    published_at = coalesce(published_at, now()),
    updated_at = now()
where id = $post_id;

update post_images
set audit_status = 'approved'
where post_id = $post_id;

insert into audit_logs (
  audit_case_id,
  action,
  operator_id,
  operator_type,
  comment
) values (
  $audit_case_id,
  'approve',
  $admin_id,
  'admin',
  '作品审核通过'
);

commit;
```

## 14. 举报创建与冻结结算

```sql
begin;

insert into reports (
  reporter_id,
  reported_user_id,
  order_id,
  conversation_id,
  target_type,
  target_id,
  category,
  description,
  evidence_files,
  status
) values (
  $reporter_id,
  $reported_user_id,
  $order_id,
  $conversation_id,
  $target_type,
  $target_id,
  $category,
  $description,
  $evidence_files,
  'pending'
)
returning id;

insert into audit_cases (
  target_type,
  target_id,
  status,
  risk_level,
  submitted_by,
  snapshot
) values (
  'report',
  $report_id,
  'pending',
  $risk_level,
  $reporter_id,
  $snapshot
);

update orders
set status = 'disputed',
    updated_at = now()
where id = $order_id
  and status in ('confirmed', 'in_service', 'completed');

update settlements
set status = 'frozen',
    frozen_reason = '订单存在举报，等待客服处理',
    updated_at = now()
where order_id = $order_id
  and status = 'pending';

commit;
```

## 15. 退款处理

后台发起退款：

```sql
begin;

select *
from orders
where id = $order_id
for update;

update orders
set status = 'refunding',
    updated_at = now()
where id = $order_id;

insert into refunds (
  order_id,
  payment_id,
  refund_no,
  amount_cents,
  reason,
  status,
  processed_by
) values (
  $order_id,
  $payment_id,
  $refund_no,
  $amount_cents,
  $reason,
  'processing',
  $admin_id
);

update settlements
set status = 'cancelled',
    updated_at = now()
where order_id = $order_id
  and status in ('pending', 'frozen');

insert into admin_action_logs (
  admin_id,
  action,
  target_type,
  target_id,
  after_data
) values (
  $admin_id,
  'refund_order',
  'order',
  $order_id,
  $payload
);

commit;
```

退款渠道成功回调后：

```sql
begin;

update refunds
set status = 'succeeded',
    third_party_refund_no = $third_party_refund_no,
    raw_callback = $raw_callback,
    refunded_at = now(),
    updated_at = now()
where id = $refund_id;

update orders
set status = 'refunded',
    updated_at = now()
where id = $order_id;

commit;
```

## 16. 后台 Dashboard 指标

```sql
select count(*)
from audit_cases
where target_type = 'companion'
  and status = 'pending';
```

```sql
select count(*)
from audit_cases
where target_type = 'post'
  and status = 'pending';
```

```sql
select count(*), coalesce(sum(total_amount_cents), 0)
from orders
where created_at >= current_date;
```

```sql
select count(*)
from message_risk_events
where created_at >= current_date;
```

```sql
select count(*)
from reports
where status in ('pending', 'investigating');
```

## 17. 建议补充的数据库约束

MVP 可以先不强制，但生产前建议补：

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
```

## 18. 最小验收 SQL

初始化后可用这些查询确认核心数据是否齐全：

```sql
select count(*) from users;
select count(*) from companions where status = 'approved';
select count(*) from posts where status = 'approved' and is_feed_visible = true;
select count(*) from activity_pricings where enabled = true;
select count(*) from availability_slots;
select count(*) from orders;
select count(*) from conversations;
select count(*) from messages;
```
