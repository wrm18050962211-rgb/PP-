# PP陪拍平台 MVP API 契约草案

这份文档把前端 MVP 页面、接口、核心请求响应和数据库表串起来。它不是最终 OpenAPI 文件，而是后端开发前的接口蓝图。

## 通用约定

### 响应结构

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

错误响应：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ORDER_SLOT_UNAVAILABLE",
    "message": "该时间已不可预约"
  }
}
```

### 金额

接口金额统一返回“元”和“分”两个字段时，前端展示用 `amountText`，后端计算用 `amountCents`。

```json
{
  "amountCents": 39900,
  "amountText": "¥399"
}
```

### 时间

后端存储 `timestamptz`，接口返回 ISO 8601：

```json
"startAt": "2026-05-24T09:30:00.000Z"
```

前端展示“今天 17:30”“明天 10:00”由前端或 BFF 转换。

## 1. 用户端首页图片流

对应页面：

- `HomeFeed`
- `PostDetail`

涉及表：

- `posts`
- `post_images`
- `post_tags`
- `companions`
- `companion_tags`
- `service_areas`
- `activity_pricings`
- `availability_slots`

### GET `/api/feed/posts`

获取首页图片流。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| city | string | 城市，例如 上海 |
| area | string | 商圈或地点，例如 武康路 |
| date | string | 可选，约拍日期 |
| activity | string | 可选，活动类型 |
| budgetMin | number | 可选，最低预算，单位分 |
| budgetMax | number | 可选，最高预算，单位分 |
| styleTags | string[] | 可选，风格标签 |
| femaleOnly | boolean | 只看女陪拍者 |
| sameGenderPreferred | boolean | 同性优先 |
| cursor | string | 分页游标 |
| limit | number | 默认 20 |

返回：

```json
{
  "items": [
    {
      "id": "post_uuid",
      "location": "上海 · 武康路",
      "timeLabel": "傍晚 / 春季 / 2026年5月",
      "activity": "Citywalk 陪拍",
      "images": [
        {
          "url": "https://example.com/image.jpg",
          "width": 900,
          "height": 1200
        }
      ],
      "styleTags": ["自然光", "松弛感"],
      "companionPreview": {
        "id": "companion_uuid",
        "displayName": "Mori",
        "avatarUrl": "https://example.com/avatar.jpg"
      }
    }
  ],
  "nextCursor": "..."
}
```

查询逻辑：

```text
posts.status = approved
posts.is_feed_visible = true
companions.status = approved
companions.service_enabled = true
按 city / area / activity / tags / 预算 / 可预约时间过滤
按 is_featured、quality_score、published_at 排序
```

### GET `/api/posts/:postId`

获取帖子详情和预约面板需要的陪拍者信息。

返回：

```json
{
  "id": "post_uuid",
  "location": "上海 · 武康路",
  "timeLabel": "傍晚 / 春季 / 2026年5月",
  "caption": "黄昏的梧桐树影很温柔...",
  "activity": "Citywalk 陪拍",
  "styleTags": ["自然光", "松弛感"],
  "images": ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  "companion": {
    "id": "companion_uuid",
    "name": "Mori",
    "avatar": "https://example.com/avatar.jpg",
    "photo": "https://example.com/real-photo.jpg",
    "bio": "会聊天，也会帮你慢慢找角度...",
    "tags": ["会指导动作", "轻松聊天"],
    "safetyBadges": ["已实名认证", "视频已审核", "平台担保"],
    "areas": ["武康路", "安福路"],
    "slots": [
      {
        "id": "slot_uuid",
        "label": "今天 17:30",
        "startAt": "2026-05-24T09:30:00.000Z",
        "endAt": "2026-05-24T11:30:00.000Z"
      }
    ],
    "activities": [
      {
        "id": "pricing_uuid",
        "name": "Citywalk",
        "durationMinutes": 120,
        "durationLabel": "2小时",
        "priceCents": 39900,
        "priceText": "¥399"
      }
    ],
    "extras": [
      {
        "id": "extra_uuid",
        "name": "精修",
        "unit": "per_photo",
        "priceCents": 3000,
        "priceText": "¥30/张"
      }
    ]
  }
}
```

## 2. 下单与支付

对应页面：

- `CheckoutPage`
- `OrdersPage`

涉及表：

- `orders`
- `order_extras`
- `order_status_logs`
- `payments`
- `availability_slots`
- `conversations`

### POST `/api/orders/quote`

下单前试算价格。

请求：

```json
{
  "postId": "post_uuid",
  "companionId": "companion_uuid",
  "slotId": "slot_uuid",
  "activityPricingId": "pricing_uuid",
  "placeName": "武康路",
  "extras": [
    {
      "extraId": "extra_uuid",
      "quantity": 3
    }
  ]
}
```

返回：

```json
{
  "baseAmountCents": 39900,
  "extraAmountCents": 9000,
  "totalAmountCents": 48900,
  "platformFeeCents": 3912,
  "companionIncomeCents": 44988,
  "lines": [
    {
      "label": "Citywalk｜2小时",
      "amountText": "¥399"
    },
    {
      "label": "精修 x 3",
      "amountText": "¥90"
    }
  ]
}
```

### POST `/api/orders`

创建待支付订单并锁定时间。

请求：

```json
{
  "postId": "post_uuid",
  "companionId": "companion_uuid",
  "slotId": "slot_uuid",
  "activityPricingId": "pricing_uuid",
  "placeName": "武康路",
  "placeAddress": "上海市徐汇区武康路",
  "userNote": "想拍自然一点，不太会摆动作",
  "extras": []
}
```

返回：

```json
{
  "orderId": "order_uuid",
  "orderNo": "PP26052401",
  "payment": {
    "paymentId": "payment_uuid",
    "paymentNo": "PAY26052401",
    "channel": "wechat",
    "amountCents": 39900,
    "payPayload": {}
  }
}
```

事务要求：

```text
select availability_slots for update
校验 slot 可用
创建 orders pending_payment
锁定 availability_slots locked
创建 payments pending
```

### POST `/api/payments/:paymentId/callback`

支付渠道回调。真实环境由支付平台调用。

成功后：

```text
payments.status = paid
orders.status = paid_pending_confirm
availability_slots.status = booked
创建 conversations
写 order_status_logs
```

### GET `/api/orders`

获取用户或陪拍者订单列表。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| role | string | user / companion |
| status | string | 可选 |
| cursor | string | 分页 |

返回：

```json
{
  "items": [
    {
      "id": "order_uuid",
      "orderNo": "PP26052401",
      "status": "paid_pending_confirm",
      "statusText": "待确认",
      "title": "Citywalk 陪拍",
      "time": "今天 17:30",
      "place": "武康路",
      "amountCents": 39900,
      "amountText": "¥399",
      "companion": {
        "id": "companion_uuid",
        "name": "Mori",
        "avatarUrl": "https://example.com/avatar.jpg"
      },
      "currentStep": 1,
      "steps": ["已支付", "待陪拍者确认", "服务开始", "完成评价"]
    }
  ]
}
```

### POST `/api/orders/:orderId/confirm`

陪拍者确认订单。

权限：

```text
当前登录用户必须是该 order.companion_id 对应的 user_id
```

状态变化：

```text
paid_pending_confirm -> confirmed
```

### POST `/api/orders/:orderId/complete`

用户确认完成，或系统自动完成。

状态变化：

```text
confirmed / in_service -> completed
创建 settlements pending
增加 companion_wallets.pending_cents
写 ledger_entries
```

### POST `/api/orders/:orderId/cancel`

取消订单。

请求：

```json
{
  "reason": "临时行程变化"
}
```

处理规则：

```text
pending_payment：直接取消，释放 slot
paid_pending_confirm：免费取消，发起全额退款
confirmed：按系统配置计算退款比例
```

## 3. 订单聊天

对应页面：

- `MessagesPage`

涉及表：

- `conversations`
- `messages`
- `risk_keywords`
- `message_risk_events`
- `reports`

### GET `/api/orders/:orderId/conversation`

获取订单会话。

返回：

```json
{
  "conversationId": "conversation_uuid",
  "order": {
    "id": "order_uuid",
    "orderNo": "PP26052401",
    "status": "confirmed"
  },
  "messages": [
    {
      "id": "message_uuid",
      "from": "companion",
      "text": "我看了你收藏的风格...",
      "sentAt": "2026-05-24T09:00:00.000Z"
    }
  ],
  "safetyNotice": "请勿交换联系方式或私下付款。"
}
```

### POST `/api/conversations/:conversationId/messages`

发送消息。

请求：

```json
{
  "content": "好呀，我想要自然一点的照片"
}
```

如果命中屏蔽词：

```json
{
  "success": false,
  "data": {
    "riskStatus": "blocked",
    "matchedKeywords": ["微信"],
    "message": "为保障双方安全，请在平台内沟通和交易。"
  },
  "error": {
    "code": "MESSAGE_BLOCKED",
    "message": "消息包含联系方式或私下交易内容"
  }
}
```

写入规则：

```text
clean：写 messages，risk_status = clean
blocked：可只写 message_risk_events，也可写 messages 原文供风控后台看
flagged：写 messages，同时写 message_risk_events
```

## 4. 陪拍者端

对应页面：

- `CompanionStudio`
- `CompanionOnboarding`
- `PublishPost`

### GET `/api/companion/me`

获取当前陪拍者工作台。

返回：

```json
{
  "profile": {
    "id": "companion_uuid",
    "displayName": "Mori",
    "status": "draft",
    "statusText": "草稿",
    "serviceEnabled": false
  },
  "stats": {
    "pendingOrders": 3,
    "todaySchedules": 1,
    "completedOrders": 18,
    "cancelledOrders": 0
  },
  "wallet": {
    "weeklyEstimatedCents": 129600,
    "pendingCents": 79900,
    "availableCents": 0
  },
  "review": {
    "applicationStatus": "draft",
    "workStatus": "draft"
  }
}
```

### PUT `/api/companion/me/application`

保存入驻资料草稿。

涉及表：

- `companions`
- `companion_kyc`
- `companion_tags`
- `service_areas`
- `companion_service_scenes`
- `activity_pricings`
- `companion_extras`

请求：

```json
{
  "displayName": "Mori",
  "baseCity": "上海",
  "bio": "会聊天，也会帮你慢慢找角度",
  "areas": ["武康路", "安福路"],
  "services": ["Citywalk", "探店吃饭"],
  "tags": ["会指导动作", "轻松聊天"],
  "pricings": [
    {
      "activityName": "Citywalk",
      "durationMinutes": 120,
      "priceCents": 39900
    }
  ],
  "extras": [
    {
      "name": "精修",
      "unit": "per_photo",
      "priceCents": 3000
    }
  ]
}
```

### POST `/api/companion/me/submit-review`

提交入驻审核。

状态变化：

```text
companions.status = pending_review
创建 audit_cases target_type = companion
```

### POST `/api/companion/posts`

创建作品草稿。

请求：

```json
{
  "city": "上海",
  "locationName": "上海 · 武康路",
  "timeLabel": "傍晚 / 春季 / 2026年5月",
  "caption": "黄昏的梧桐树影很温柔...",
  "activityName": "Citywalk",
  "tags": ["自然光", "松弛感"],
  "images": [
    {
      "fileUrl": "https://example.com/1.jpg",
      "fileKey": "posts/1.jpg",
      "width": 900,
      "height": 1200
    }
  ]
}
```

### POST `/api/companion/posts/:postId/submit-review`

提交作品审核。

状态变化：

```text
posts.status = pending_review
post_images.audit_status = pending
创建 audit_cases target_type = post
```

## 5. 评价、收藏、举报

### POST `/api/orders/:orderId/rating`

请求：

```json
{
  "score": 5,
  "content": "很会引导动作，整个过程不尴尬",
  "tags": ["会指导动作", "轻松聊天"],
  "isAnonymous": false
}
```

写入：

```text
ratings
更新 companions.rating_avg / rating_count
```

### POST `/api/favorites`

请求：

```json
{
  "targetType": "post",
  "targetId": "post_uuid"
}
```

写入：

```text
favorites
posts.like_count + 1，若 targetType = post
```

### POST `/api/reports`

请求：

```json
{
  "targetType": "message",
  "targetId": "message_uuid",
  "orderId": "order_uuid",
  "category": "跳单",
  "description": "对方要求加微信私下付款",
  "evidenceFiles": [
    {
      "url": "https://example.com/evidence.jpg",
      "fileKey": "reports/evidence.jpg"
    }
  ]
}
```

写入：

```text
reports.status = pending
audit_cases target_type = report
若订单资金未结算，可冻结 settlements
```

## 6. 运营后台

对应页面：

- `AdminDashboard`

涉及表：

- `audit_cases`
- `audit_logs`
- `companions`
- `posts`
- `orders`
- `message_risk_events`
- `reports`
- `settlements`
- `admin_action_logs`

### GET `/api/admin/dashboard`

返回：

```json
{
  "metrics": {
    "pendingCompanions": 1,
    "pendingPosts": 1,
    "orderCount": 24,
    "riskBlockedCount": 12,
    "gmvCents": 1399000,
    "refundCents": 29900,
    "pendingReports": 3
  },
  "reviewQueues": {
    "companions": [],
    "posts": []
  },
  "recentOrders": []
}
```

### GET `/api/admin/audit-cases`

查询审核队列。

参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| targetType | string | companion / post / message / report |
| status | string | pending / approved / rejected / needs_change |

### POST `/api/admin/audit-cases/:caseId/approve`

审核通过。

处理：

```text
audit_cases.status = approved
写 audit_logs
根据 target_type 更新目标对象状态
companion：companions.status = approved, service_enabled = true, users.is_companion = true
post：posts.status = approved, is_feed_visible = true, published_at = now()
```

### POST `/api/admin/audit-cases/:caseId/reject`

审核拒绝。

请求：

```json
{
  "reason": "真人照片不清晰，请重新上传"
}
```

处理：

```text
audit_cases.status = rejected 或 needs_change
写 audit_logs
更新目标对象状态
写 admin_action_logs
```

### POST `/api/admin/orders/:orderId/refund`

后台发起退款。

请求：

```json
{
  "amountCents": 39900,
  "reason": "陪拍者未到场"
}
```

处理：

```text
orders.status = refunding
创建 refunds
冻结或取消 settlements
写 admin_action_logs
```

### POST `/api/admin/settlements/:settlementId/freeze`

冻结结算。

请求：

```json
{
  "reason": "订单存在举报，等待客服处理"
}
```

处理：

```text
settlements.status = frozen
wallet pending -> frozen
写 ledger_entries
```

## 7. 前端 MVP 字段映射

### `Post`

前端字段来自：

| 前端字段 | 数据库 |
|---|---|
| id | posts.id |
| location | posts.location_name |
| timeLabel | posts.time_label |
| caption | posts.caption |
| styleTags | post_tags.tag_name |
| activity | posts.activity_name |
| images | post_images.file_url |
| companion | companions + companion_tags |

### `Companion`

| 前端字段 | 数据库 |
|---|---|
| id | companions.id |
| name | companions.display_name |
| avatar | users.avatar_url |
| photo | companions.real_photo_url |
| bio | companions.bio |
| tags | companion_tags |
| safetyBadges | companion_kyc + audit_cases 推导 |
| areas | service_areas.area_name |
| slots | availability_slots |
| activities | activity_pricings |
| extras | companion_extras |

### `AppOrder`

| 前端字段 | 数据库 |
|---|---|
| id | orders.order_no 或 orders.id |
| status | orders.status 映射中文 |
| title | orders.activity_name |
| time | orders.start_at |
| place | orders.place_name |
| amount | orders.total_amount_cents |
| companion | companions.display_name |
| postId | orders.post_id |
| steps/currentStep | orders.status 派生 |

## 8. 状态中文映射建议

### 订单状态

| 数据库存储 | 前端展示 |
|---|---|
| pending_payment | 待支付 |
| paid_pending_confirm | 待确认 |
| confirmed | 已确认 |
| in_service | 服务中 |
| completed | 已完成 |
| cancelled | 已取消 |
| refunding | 退款中 |
| refunded | 已退款 |
| disputed | 争议处理中 |

### 审核状态

| 数据库存储 | 前端展示 |
|---|---|
| draft | 草稿 |
| pending_review / pending | 待审核 |
| approved | 已通过 |
| rejected | 已拒绝 |
| needs_change | 需修改 |
| removed | 已移除 |
