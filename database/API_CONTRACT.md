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
    "message": "该时间已不可预约",
    "requestId": "f5da48bf-9c40-4622-81ea-df1ad3d08a4f"
  }
}
```

### 安全入口约定

- 所有响应包含 `X-Request-Id`；合法的客户端 request ID 会透传，缺失或非法时由服务端生成。错误响应同时在 `error.requestId` 返回该值，供客服和日志关联。
- `POST`、`PUT`、`PATCH` 的非空请求体必须使用 `application/json`，默认不超过 `REQUEST_BODY_MAX_BYTES=1048576`。非法 JSON、数组根节点、过深对象、危险原型字段和超大请求在进入业务函数前拒绝。
- Admin、陪拍者和普通用户 API 由统一路由策略先执行鉴权；业务函数保留资源归属和角色二次保护。支付 Provider 回调保持匿名入口，但必须通过 Provider 验签。
- 全局和登录/验证码/上传授权等敏感接口分别限流。窗口和上限由 `RATE_LIMIT_GLOBAL_*`、`RATE_LIMIT_SENSITIVE_*` 配置；限流返回 `429`、`Retry-After` 和稳定错误码。
- 只有在可信反向代理覆盖 `X-Forwarded-For` 时才启用 `TRUST_PROXY=true`，否则限流和审计使用 TCP 对端地址。
- 请求日志只记录 request ID、方法、路径、状态和耗时。手机号、Bearer token、Cookie、验证码、密码、Pepper、签名和密钥必须脱敏，未知生产异常不得把内部错误消息返回客户端。
- 微信支付回调允许在短暂轮换窗口内同时配置当前与上一把 `WECHAT_PAY_API_V3_KEY`、平台公钥；上一把密钥只用于验证/解密历史回调，窗口结束后必须移除。

稳定安全错误码：

| HTTP | code | 说明 |
|---|---|---|
| 400 | `INVALID_JSON` / `REQUEST_BODY_INVALID` / `VALIDATION_ERROR` / `ORDER_QUERY_INVALID` / `ORDER_CURSOR_INVALID` | JSON、入口字段、订单查询参数或分页游标无效 |
| 401 | `AUTH_REQUIRED` | 缺少或失效会话 |
| 403 | `FORBIDDEN` / `ORDER_ROLE_FORBIDDEN` | 角色或资源权限不足 |
| 404 | `NOT_FOUND` / `ORDER_NOT_FOUND` | 资源不存在，或公开订单详情接口为避免枚举而隐藏无权限资源 |
| 413 | `REQUEST_BODY_TOO_LARGE` | 请求体超过配置上限 |
| 415 | `CONTENT_TYPE_UNSUPPORTED` | 非空请求体不是 JSON |
| 429 | `RATE_LIMITED` / `SENSITIVE_RATE_LIMITED` | 全局或敏感接口限流 |
| 500 | `SERVER_ERROR` / `ORDER_READ_ERROR` | 未知服务端或订单读取错误；通过 request ID 追踪 |
| 503 | `ORDER_POSTGRES_REQUIRED` / `ORDER_READ_FAILED` | 生产订单读取缺少 PostgreSQL 权威能力，或权威数据库读取暂时不可用 |

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

## 0. 手机验证码与会话

### POST `/api/auth/phone/request-code`

- 仅接受中国大陆 `+86` 手机号；服务端统一转换为 E.164 格式。
- 腾讯短信模板参数顺序固定为“验证码、有效期分钟数”，配置不匹配时服务拒绝启动或发送。
- 默认有效期 300 秒、冷却 60 秒、单手机号每小时 5 次、单 IP 每小时 20 次、最多校验 5 次；失败投递同样计入小时频率。
- 非生产环境可使用 mock sender；生产环境必须使用 Tencent provider。运营商报备完成前不得执行真实发送。
- 稳定错误码：`PHONE_CODE_COOLDOWN`、`PHONE_CODE_RATE_LIMIT`、`SMS_NOT_CONFIGURED`、`SMS_DELIVERY_RATE_LIMITED`、`SMS_DELIVERY_UNAVAILABLE`、`SMS_DELIVERY_FAILED`。

### POST `/api/auth/phone/verify`

- 验证码只存储带 Pepper 的 HMAC，不存储明文；成功后立即消费，过期、已使用和超过尝试次数均不可再次登录。
- 新手机号默认只获得 `consumer` 角色。只有数据库中状态为 `approved` 的 companion 账号可以建立 companion session，否则返回 `403 PHONE_ROLE_NOT_AVAILABLE`。
- 稳定错误码：`PHONE_INVALID`、`PHONE_CODE_INVALID`、`PHONE_CODE_EXPIRED`、`PHONE_CODE_ALREADY_USED`、`PHONE_CODE_ATTEMPTS_EXCEEDED`、`PHONE_ROLE_NOT_AVAILABLE`。

### GET `/api/auth/session` 与 POST `/api/auth/logout`

- 生产数据库持久化保存 Bearer token hash、主体、角色、登录时间、最后访问时间和固定过期时间；普通访问不会滑动延长过期时间。
- 同一账号重新登录创建独立 session。登出只撤销当前 token；过期、已撤销、主体停用或角色资格失效的 session 返回 `401 AUTH_REQUIRED`。
- Admin session 与公开用户角色隔离；旧 session 中的角色元数据不能绕过用户状态或 companion 审批状态。

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

### GET `/api/companions/:companionId`

获取已审核并启用服务的摄影师公开资料。返回 `Companion`，包含公开头像、简介、标签、服务区域、活动、档期、评分、作品数和关注数。未审核、停用或不存在的摄影师统一返回 `404 NOT_FOUND`。

### GET `/api/companions/:companionId/posts`

获取摄影师已审核且允许进入 Feed 的公开作品。查询参数与 Feed 的 `cursor`、`limit` 相同，返回：

```json
{
  "items": [],
  "nextCursor": "20",
  "hasMore": true
}
```

`cursor` 是服务端游标，客户端必须原样回传；客户端不得用本地 mock 或空数组覆盖生产请求错误。

## 1.5. 定位匹配

对应页面：

- `HomeFeed`
- 后续地图/附近陪拍者入口

涉及表：

- `users.last_lat / users.last_lng`
- `companions`
- `service_areas.lat / service_areas.lng / service_areas.radius_meters`
- `availability_slots`
- `activity_pricings`

### GET `/api/matching/companions`

根据用户位置和筛选条件返回附近可接单陪拍者。MVP 阶段使用普通经纬度 + Haversine 距离计算，不依赖 PostGIS。

查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| lat | number | 用户纬度，必填 |
| lng | number | 用户经度，必填 |
| city | string | 可选，城市过滤 |
| activity | string | 可选，服务类型过滤 |
| gender | string | 可选，`female` / `male` / `any` |
| maxDistanceMeters | number | 可选，默认 8000，最大 50000 |
| limit | number | 可选，默认 20 |

返回：

```json
{
  "items": [
    {
      "companion": {
        "id": "companion_uuid",
        "name": "Mori",
        "baseCity": "上海",
        "location": {
          "lat": 31.2109,
          "lng": 121.4457
        }
      },
      "nearestServiceArea": {
        "id": "area_uuid",
        "city": "上海",
        "areaName": "武康路",
        "lat": 31.2109,
        "lng": 121.4457,
        "radiusMeters": 4000
      },
      "distanceMeters": 230,
      "distanceText": "230m",
      "matchScore": 98
    }
  ]
}
```

排序逻辑：

```text
过滤 approved + service_enabled 的陪拍者
过滤城市、性别、服务类型
计算用户坐标到每个 service_area 的 Haversine 距离
只保留距离 <= min(maxDistanceMeters, service_area.radius_meters) 的候选
按 matchScore、distanceMeters、ratingAvg 排序
```

## 1.8. 商家与组合订单领域骨架（默认关闭）

本节只固定后续组合订单使用的数据契约，不增加用户入口、不开放商家 API，也不启用真实组合支付。运行时开关 `ENABLE_COMPOSITE_ORDER_DOMAIN` 默认是 `false`；即使打开，该首个切片的 `compositePaymentsEnabled` 仍固定为 `false`。

涉及表：

- `merchants`
- `merchant_offerings`
- `photographer_merchant_links`
- `order_items`

领域约定：

- 商家套餐按 `merchant_id + offering_code + version` 保存固定价格和标准时长；订单项同时保存版本、价格和时间快照，套餐后续改价不得影响历史订单。
- `discount_amount_cents` 只表示服务方承担的服务优惠；`total_amount_cents` 是服务项计价金额；`platform_subsidy_cents` 是平台承担的补贴；用户实付满足 `user_payable_cents = total_amount_cents - platform_subsidy_cents`。
- 商家订单项必须引用同一商家、同一版本和同一服务类型的套餐；摄影订单项的摄影师必须与聚合订单摄影师一致，其 `activity_pricing_id` 也必须属于该摄影师。只要订单已有服务项，所有服务项 `user_payable_cents` 合计必须等于聚合订单总额；已有服务项的订单不能删除最后一个服务项。
- 摄影师和商家合作关系必须分别留下确认时间；只有双方确认的关系才能标记为主要合作关系，同一摄影师最多一个已确认主要商家。
- 用户侧继续保留一个聚合订单；内部的摄影、妆造、服装等服务分别保存提供方、接单、履约、退款与结算状态。
- 当前 `orders` 仍是生产订单、支付和状态流的唯一权威来源。迁移为已有纯摄影订单回填一个 `photography` 服务项；功能开关关闭时现有写入事务保持不变，打开时在同一事务同步写入纯摄影服务项，并把支付后待接单、确认、完成、取消、退款、争议和结算准备状态同步到摄影服务项，但仍不开放组合支付。
- 从关闭切换为打开前必须执行 `select backfill_missing_photography_order_items();`；该函数可重复执行，只补缺失服务项，并使用订单内下一个可用 `item_no` 避免与实验数据冲突。读模型会拒绝在最近订单仍缺服务项时激活，避免静默产生新旧订单结构倒挂。

公开商家摘要不包含电话原文：

```json
{
  "id": "merchant_uuid",
  "name": "示例妆造店",
  "city": "上海",
  "hasContactPhone": true,
  "contactPhoneVisibility": "confirmed_order_only"
}
```

电话只能由未来的“已确认订单联系人”授权接口单独返回。该接口必须同时校验当前用户属于订单、组合订单已经正式确认、商家是订单服务项提供方；不得复用公开商家摘要或搜索接口返回号码。

订单服务项只读结构：

```json
{
  "id": "order_item_uuid",
  "orderId": "order_uuid",
  "itemNo": 2,
  "serviceType": "makeup",
  "provider": {
    "type": "merchant",
    "id": "merchant_uuid",
    "name": "示例妆造店"
  },
  "merchantOfferingId": "offering_uuid",
  "offeringVersion": 1,
  "serviceName": "基础妆发",
  "durationMinutes": 90,
  "startAt": "2026-08-20T04:30:00.000Z",
  "endAt": "2026-08-20T06:00:00.000Z",
  "pricing": {
    "baseAmountCents": 29900,
    "extraAmountCents": 0,
    "discountAmountCents": 0,
    "totalAmountCents": 29900,
    "platformSubsidyCents": 0,
    "userPayableCents": 29900,
    "currency": "CNY"
  },
  "acceptance": {
    "status": "pending",
    "deadlineAt": "2026-08-19T10:00:00.000Z"
  },
  "fulfillment": {
    "status": "not_started"
  },
  "refund": {
    "status": "not_requested",
    "refundedAmountCents": 0
  }
}
```

公开订单服务项不得包含平台佣金、服务方应结收入、内部计价快照或结算状态；这些字段只存在于服务端内部订单项和 Admin 账本中。

## 1.9. Store Lite 预约申请（无支付）

本节定义 Store Lite 首发版的独立预约申请域。预约申请用于让消费者提交时间、地点和拍摄需求，再由平台运营确认或拒绝；它不是订单，不锁定资金，也不代表已付款。该域不读写 `orders`、`payments`、`messages`、媒体或商家组合订单数据。

生产边界：

- 仅在 `ENABLE_STORE_LITE_BOOKINGS=true` 时注册这组能力；请求通过统一鉴权入口后，开关关闭的端点返回 `404 NOT_FOUND`，不暴露功能存在。
- Store Lite 生产部署必须同时设置 `RELEASE_PROFILE=store_lite`。该发行配置在服务端关闭订单、支付/回调、聊天、摄影师工作台、上传和旧订单 Admin 路由，返回 `404 STORE_LITE_ROUTE_DISABLED`；不能只依靠 iOS 导航隐藏这些商业能力。
- 开关打开后必须使用 PostgreSQL，并且数据层明确声明 `bookingRequests` capability；缺少任一条件时返回 `503 BOOKING_POSTGRES_REQUIRED`。生产环境不得回退 JSON、localStorage、模拟数据或空数组成功。
- 用户端 4 个端点只允许真实 `consumer` session；不能从 body 或 query 接受角色、用户 ID。陪拍者角色暂不开放预约处理能力。
- Admin 读接口要求 `booking_requests:read` scope；确认、拒绝、取消要求 `booking_requests:write` scope。管理员 ID、IP、User-Agent 和日志 ID 均由服务端会话及请求上下文取得，不接受客户端传入。
- 用户只能读取和取消自己的预约。不存在、无归属或不可见的详情及变更目标统一返回 `404 BOOKING_REQUEST_NOT_FOUND`，不得用错误差异帮助枚举 UUID。
- 创建幂等性固定在 `booking_requests` 表内：唯一键是 `(user_id, client_request_id)`。同一用户以相同 `clientRequestId` 重放完全相同的规范化请求时返回原详情；相同键配不同请求内容时返回 `409 BOOKING_IDEMPOTENCY_CONFLICT`。不得复用全局幂等网关。
- 消费者响应永不包含消费者或摄影师电话、`internalNote`、`requestFingerprint`、`adminId`、操作人 ID、IP 或 User-Agent。Admin 列表只返回双方脱敏电话，Admin 详情才返回双方完整电话；完整电话不得进入公开接口或列表日志。
- `confirmation.supportChannel` 是平台管理的支持渠道键，不是电话、微信号或任意外链。客户端只能把该键映射到平台批准的渠道展示；不得把它作为原始 URI 直接拉起。
- `requirements`、`arrivalInstructions` 和 Admin `publicMessage` 都属于消费者可见公开文本。服务端必须拒绝其中的手机号、URL、微信/支付宝标识，以及付款、转账等联系方式或支付引导，返回 `400 BOOKING_PUBLIC_TEXT_UNSAFE`；不能只依靠客户端提示或运营规范过滤。

状态只允许：

```text
submitted -> confirmed | declined | cancelled
confirmed -> cancelled
```

- 平台运营可执行 `submitted -> confirmed/declined/cancelled` 以及 `confirmed -> cancelled`；每次变更在同一事务写公开状态日志和 `admin_action_logs`。
- 用户可执行 `submitted/confirmed -> cancelled`。重复执行已经完成的同一目标状态按幂等成功返回当前详情；其他越权迁移返回 `409 BOOKING_STATUS_CONFLICT`。
- `confirmation` 在运营确认前为 `null`。已经确认后再取消时仍保留原确认快照，供双方理解被取消的是哪一次安排。

公共只读结构：

```json
{
  "id": "booking_request_uuid",
  "status": "submitted",
  "photographer": {
    "id": "companion_uuid",
    "name": "摄影师昵称",
    "avatarUrl": null
  },
  "requestedSchedule": {
    "startAt": "2026-09-01T06:00:00.000Z",
    "endAt": "2026-09-01T08:00:00.000Z",
    "timezone": "Asia/Shanghai",
    "city": "上海",
    "addressText": "武康路附近"
  },
  "confirmation": null,
  "createdAt": "2026-08-23T10:00:00.000Z",
  "updatedAt": "2026-08-23T10:00:00.000Z"
}
```

确认快照结构：

```json
{
  "startAt": "2026-09-01T06:30:00.000Z",
  "endAt": "2026-09-01T08:30:00.000Z",
  "city": "上海",
  "addressText": "武康路 100 号门口",
  "arrivalInstructions": "请提前 10 分钟到达，出示预约编号",
  "supportChannel": "store_lite.support",
  "confirmedAt": "2026-08-23T11:00:00.000Z"
}
```

公开状态日志只包含 `id`、`fromStatus`、`toStatus`、面向用户的 `message` 和 `createdAt`。Admin 状态日志额外包含 `actorType=user|admin` 与 `reasonCode`，但仍不返回 `adminId`、`userId` 或内部备注。

列表接口共同接受以下 query；不允许其他参数或重复参数：

| 参数 | 类型 | 约束 |
|---|---|---|
| status | `BookingRequestStatus` | 可选，精确筛选四种状态 |
| limit | integer | 可选，默认 20，范围 1—50 |
| cursor | string | 可选，不超过 512 字符的 opaque base64url token；与主体和筛选条件绑定 |

分页统一返回：

```json
{
  "items": [],
  "nextCursor": null,
  "hasMore": false
}
```

### POST `/api/booking-requests`

consumer-only。创建一条 `submitted` 预约申请，成功返回消费者详情，HTTP `201`。

请求：

```json
{
  "companionId": "companion_uuid",
  "clientRequestId": "device-generated-request-id",
  "requestedStartAt": "2026-09-01T06:00:00.000Z",
  "requestedEndAt": "2026-09-01T08:00:00.000Z",
  "timezone": "Asia/Shanghai",
  "city": "上海",
  "addressText": "武康路附近",
  "requirements": "希望拍一组自然街拍，具体集合点可由运营确认"
}
```

约束：`companionId` 必须是已审批且已启用服务的摄影师；`clientRequestId` 为 8—120 字符；开始与结束时间必须是含时区的 ISO 8601，且结束晚于开始；`timezone` 省略时默认为 `Asia/Shanghai`；城市、地址、需求最大长度分别为 80、500、2000。

### GET `/api/booking-requests`

consumer-only。只返回当前消费者自己的摘要列表；每项不包含 `requirements`、状态日志或任何电话。

### GET `/api/booking-requests/:bookingRequestId`

consumer-only。返回当前消费者自己的详情：公共摘要加 `requirements` 和公开状态日志。无归属目标按不存在处理。

### POST `/api/booking-requests/:bookingRequestId/cancel`

consumer-only。允许从 `submitted` 或 `confirmed` 取消，成功返回更新后的消费者详情。

请求：

```json
{
  "reasonCode": "user_schedule_changed",
  "reason": "行程有变，无法按计划到达"
}
```

两个字段均可省略；`reasonCode` 最长 80，`reason` 最长 1000。预约 ID 和用户身份不得出现在 body。

### GET `/api/admin/booking-requests`

要求 `booking_requests:read`。返回 Admin 摘要分页，每项在公共摘要之外只增加：

```json
{
  "consumer": {
    "id": "user_uuid",
    "name": "用户昵称",
    "phoneMasked": "138****5678"
  },
  "companionPhoneMasked": "139****4321",
  "requirementsPreview": "希望拍一组自然街拍"
}
```

列表不得返回任一方完整电话、完整需求、内部备注或请求指纹。

### GET `/api/admin/booking-requests/:bookingRequestId`

要求 `booking_requests:read`。返回 Admin 详情：完整 `requirements` 和带 `actorType`/`reasonCode` 的状态日志。只有会话同时具备 `booking_requests:write` 时才返回 `consumer.phone`、`companionPhone`；只读运营账号对应字段固定为 `null`，且查询不得选择电话列。完整电话仅用于运营执行本次预约，不得透传消费者端或写入普通请求日志。响应仍不包含 `internalNote`、请求指纹或操作人 ID。

### POST `/api/admin/booking-requests/:bookingRequestId/confirm`

要求 `booking_requests:write`。确认最终时间、地点、到场指引和平台支持渠道，成功返回 Admin 详情。

请求：

```json
{
  "confirmedStartAt": "2026-09-01T06:30:00.000Z",
  "confirmedEndAt": "2026-09-01T08:30:00.000Z",
  "confirmedCity": "上海",
  "confirmedAddressText": "武康路 100 号门口",
  "arrivalInstructions": "请提前 10 分钟到达，出示预约编号",
  "supportChannelKey": "store_lite.support",
  "publicMessage": "摄影师已确认，请按确认时间到达",
  "internalNote": "已由运营电话核对供给侧档期"
}
```

开始与结束时间必须包含时区且结束晚于开始；`supportChannelKey` 只能使用平台预先配置的 1—80 位键，首位为小写字母或数字，其余位可再使用点、下划线或连字符。`publicMessage` 会进入用户可见状态轨迹；`internalNote` 只写 Admin 审计日志。

### POST `/api/admin/booking-requests/:bookingRequestId/decline`

要求 `booking_requests:write`。仅允许拒绝 `submitted` 申请，成功返回 Admin 详情。

```json
{
  "reasonCode": "photographer_unavailable",
  "publicMessage": "摄影师无法承接该时段，请重新选择时间或摄影师",
  "internalNote": "供给侧确认档期冲突"
}
```

`reasonCode` 与 `publicMessage` 必填，最长分别为 80、1000；`internalNote` 可选，最长 1000。

### POST `/api/admin/booking-requests/:bookingRequestId/cancel`

要求 `booking_requests:write`。平台运营可代表供给侧取消 `submitted` 或 `confirmed` 申请；输入字段和长度与拒绝接口相同。成功返回 Admin 详情，并在同一事务留下状态日志和 Admin 审计日志。

本节共 9 个端点：用户端 4 个、Admin 端 5 个。

稳定错误码：

| HTTP | code | 说明 |
|---|---|---|
| 400 | `REQUEST_BODY_INVALID` / `VALIDATION_ERROR` / `BOOKING_REQUEST_INVALID` / `BOOKING_PUBLIC_TEXT_UNSAFE` | 额外字段、必填/长度、UUID、时间范围无效，或公开文本包含联系方式/支付引导 |
| 400 | `BOOKING_QUERY_INVALID` / `BOOKING_CURSOR_INVALID` | 列表参数或 opaque cursor 无效 |
| 401 / 403 | `AUTH_REQUIRED` / `FORBIDDEN` / `ADMIN_SCOPE_REQUIRED` | 缺少会话、角色不符或缺少 Admin scope |
| 404 | `NOT_FOUND` / `BOOKING_TARGET_UNAVAILABLE` / `BOOKING_REQUEST_NOT_FOUND` | 功能关闭、摄影师不可预约，或目标不存在/无权访问 |
| 409 | `BOOKING_IDEMPOTENCY_CONFLICT` / `BOOKING_STATUS_CONFLICT` | 幂等键复用冲突或状态迁移冲突 |
| 503 | `BOOKING_POSTGRES_REQUIRED` / `BOOKING_STORE_UNAVAILABLE` | 缺少 PostgreSQL 权威能力或数据库读取/事务不可用 |
| 503 | `STORE_LITE_SUPPORT_NOT_CONFIGURED` | 运营确认前尚未配置平台客服渠道，禁止写入无法展示的确认记录 |

## 1.10. Store Lite 合规请求、内容举报与摄影师屏蔽

本节是 Store Lite 首发所需的独立合规域，包括用户客服/数据权利请求、作品或摄影师举报，以及消费者屏蔽摄影师。它不复用商业订单的 `/api/reports`、聊天证据、订单售后或媒体上传，也不创建订单、支付、退款或结算记录。

### 生产、权限与隐私边界

- 总开关为 `ENABLE_STORE_LITE_COMPLIANCE=false`。只有显式设为 `true` 时才注册本节路由；关闭时统一返回 `404 NOT_FOUND`，不得暴露功能是否部署。
- 开关打开后必须使用 PostgreSQL，并由数据层声明 Store Lite compliance capability。缺少 PostgreSQL 或 capability 时返回 `503 COMPLIANCE_POSTGRES_REQUIRED`；数据库读取或事务暂时失败返回 `503 COMPLIANCE_STORE_UNAVAILABLE`。生产环境禁止回退 JSON、localStorage、内存模拟或空数组成功。
- 所有消费者端点只允许真实 `consumer` session。用户 ID、角色、举报人、被举报用户和操作人都从 session、目标资源及请求上下文解析，body/query 不得接受这些身份字段。
- 用户请求 Admin 列表/详情需要 `user_requests:read`，开始、完成和拒绝需要 `user_requests:write`。内容举报 Admin 列表/详情需要 `content_reports:read`，调查、解决和驳回需要 `content_reports:moderate`。
- 用户只能读取或取消自己的请求，只能读取自己的举报与屏蔽列表。不存在、非本人所有或不可见的详情/变更目标统一返回领域 `*_NOT_FOUND`，不得用 `403`/`404` 差异帮助枚举 UUID。
- 消费者 DTO 永不返回手机号、`internalNote`、请求指纹、Admin ID、IP、User-Agent、`reportedUserId` 或证据附件。User Request Admin DTO 也不返回用户电话；`internalNote` 只进入受保护的 `admin_action_logs`。内容举报只有 Admin DTO 可以返回 `handledByAdminId`。

### 共同分页和创建幂等性

- 所有列表按 `createdAt DESC, id DESC` 做 keyset 分页，返回 `{ items, nextCursor, hasMore }`。`limit` 默认 20，范围 1—50；`cursor` 是不超过 512 字符的 opaque base64url token。
- 游标必须绑定当前 actor、列表种类和全部筛选条件。格式非法、跨账号/跨 Admin 使用或改变筛选后复用时分别返回对应的 `USER_REQUEST_CURSOR_INVALID`、`CONTENT_REPORT_CURSOR_INVALID` 或 `COMPANION_BLOCK_CURSOR_INVALID`，不得静默退回第一页。
- User Request 与 Content Report 各自在自己的表内以 `(user_id, client_request_id)` 唯一。`clientRequestId` 为 8—160 字符；同一用户以相同 ID 重放完全相同的规范化请求时返回原记录，不新增状态日志。相同 ID 携带不同规范化内容时返回 `409 USER_REQUEST_IDEMPOTENCY_CONFLICT` 或 `409 CONTENT_REPORT_IDEMPOTENCY_CONFLICT`。
- 请求指纹只用于服务端幂等比较，不进入任何消费者或普通 Admin 响应。

### A. User Requests

`requestType` 只允许：

```text
support | data_access | data_copy | account_deletion
```

状态只允许：

```text
submitted -> processing | declined | cancelled
processing -> completed | declined | cancelled
```

- 用户可将自己的 `submitted` 或 `processing` 请求取消；重复取消按幂等成功返回当前详情。终态之间或其他非法迁移返回 `409 USER_REQUEST_STATUS_CONFLICT`。
- Admin `start` 只执行 `submitted -> processing`；`complete` 只执行 `processing -> completed`；`decline` 可执行 `submitted/processing -> declined`。每次 Admin 迁移与公开状态日志、`admin_action_logs` 在同一事务提交。
- `account_deletion` 不能由 Admin `complete`。Admin 只能开始处理或拒绝；实际删除、关联数据处置与 session 撤销由后续受控 system executor 完成，只有该执行器可写 `processing -> completed` 和 `actorType=system` 日志。

消费者摘要严格为：

```json
{
  "id": "user_request_uuid",
  "requestType": "support",
  "supportCategory": "booking",
  "bookingRequestId": "booking_request_uuid",
  "description": "想确认预约状态",
  "status": "submitted",
  "createdAt": "2026-08-23T10:00:00.000Z",
  "updatedAt": "2026-08-23T10:00:00.000Z"
}
```

`supportCategory`、`bookingRequestId` 和 `description` 不存在时可以省略或为 `null`。消费者详情只在摘要之外增加：

```json
{
  "statusLogs": [
    {
      "id": "status_log_uuid",
      "fromStatus": null,
      "toStatus": "submitted",
      "actorType": "user",
      "reasonCode": null,
      "publicMessage": "请求已提交",
      "createdAt": "2026-08-23T10:00:00.000Z"
    }
  ]
}
```

`actorType` 可为 `user|admin|system`，但状态日志永不返回任何 actor ID。Admin 摘要/详情只在对应消费者 DTO 上增加 `user: { id, nickname }`；不增加手机号、请求指纹或内部备注。

#### POST `/api/user-requests`

consumer-only。创建 `submitted` 请求，成功返回消费者详情，HTTP `201`。

```json
{
  "requestType": "support",
  "supportCategory": "booking",
  "bookingRequestId": "booking_request_uuid",
  "description": "想确认预约状态",
  "clientRequestId": "device-generated-request-id"
}
```

- `supportCategory` 只允许 `booking|safety|account|privacy|other`，仅可在 `requestType=support` 时提供；支持请求也可省略该字段，其他类型必须省略。
- `bookingRequestId` 可选，但只允许用于 `support`；服务端必须验证预约属于当前用户，不存在或无归属统一返回 `404 USER_REQUEST_BOOKING_NOT_FOUND`。
- `description` 可选，最长 2000 字符；请求不接受附件、电话、用户 ID、状态或处理字段。

#### GET `/api/user-requests`

consumer-only。只返回当前用户摘要。允许且只允许 `requestType`、`status`、`limit`、`cursor`；前两项按枚举精确筛选。

#### GET `/api/user-requests/:userRequestId`

consumer-only。返回当前用户详情；不存在或非本人所有统一返回 `404 USER_REQUEST_NOT_FOUND`。

#### POST `/api/user-requests/:userRequestId/cancel`

consumer-only。body 只允许可选 `reasonCode`（最长 80）和 `reason`（最长 1000）；成功返回更新后的消费者详情。

#### GET `/api/admin/user-requests`

要求 `user_requests:read`。筛选与消费者列表相同，返回 Admin 摘要分页。

#### GET `/api/admin/user-requests/:userRequestId`

要求 `user_requests:read`。返回 Admin 详情；不存在统一返回 `404 USER_REQUEST_NOT_FOUND`。

#### POST `/api/admin/user-requests/:userRequestId/start`

要求 `user_requests:write`。body 只允许可选 `publicMessage`、`internalNote`，最长均为 1000；成功返回 Admin 详情。

#### POST `/api/admin/user-requests/:userRequestId/complete`

要求 `user_requests:write`。body 必须包含 `publicMessage`，可选 `internalNote`，最长均为 1000。`account_deletion` 调用此端点返回 `409 USER_REQUEST_STATUS_CONFLICT`，不能由运营人员标记为已经删除。

#### POST `/api/admin/user-requests/:userRequestId/decline`

要求 `user_requests:write`。body 必须包含最长 80 的 `reasonCode` 和最长 1000 的 `publicMessage`，可选最长 1000 的 `internalNote`；成功返回 Admin 详情。

### B. Content Reports

内容举报使用现有数据库 `report_status` 枚举，状态精确为：

```text
pending -> investigating | resolved | rejected
investigating -> resolved | rejected
```

- `targetType` 只允许 `post|companion`；`category` 只允许 `content_violation|safety|fraud|privacy_or_rights|other`。
- 本域不接受 `orderId`、`conversationId`、`reportedUserId`、`evidenceFiles` 或任何上传字段。服务端根据目标解析被举报用户：作品目标解析其摄影师账号，摄影师目标解析其所有者账号；该内部 ID 永不进入消费者 DTO。
- 调查、解决和驳回都必须与举报状态日志及 `admin_action_logs` 在同一事务提交。终态不可再次改变；重复执行已完成的相同目标动作可幂等返回当前记录，冲突返回 `409 CONTENT_REPORT_STATUS_CONFLICT`。

消费者 DTO 严格为：

```json
{
  "id": "content_report_uuid",
  "targetType": "post",
  "targetId": "post_uuid",
  "category": "content_violation",
  "description": "作品包含不适宜内容",
  "status": "pending",
  "result": null,
  "createdAt": "2026-08-23T10:00:00.000Z",
  "updatedAt": "2026-08-23T10:00:00.000Z"
}
```

`result` 只在 `resolved/rejected` 后公开，严格为 `{ resolutionAction, publicMessage }`。驳回使用 `resolutionAction=no_action`。消费者永不看到证据、内部备注、举报人/被举报人内部 ID 或处理人。

Admin DTO 只在消费者 DTO 上增加：

```json
{
  "reporter": { "id": "user_uuid", "nickname": "用户昵称" },
  "target": {
    "targetType": "post",
    "id": "post_uuid",
    "displayName": "武康路街拍",
    "imageUrl": "https://cdn.example.com/post-cover.jpg"
  },
  "handledAt": null,
  "handledByAdminId": null
}
```

`target` 只能使用目标当前公开摘要，不包含目标所有者电话、身份证明或非公开审核字段。

#### POST `/api/content-reports`

consumer-only。创建 `pending` 举报，成功返回消费者 DTO，HTTP `201`。

```json
{
  "targetType": "post",
  "targetId": "post_uuid",
  "category": "content_violation",
  "description": "作品包含不适宜内容",
  "clientRequestId": "device-generated-report-id"
}
```

`description` 可选，最长 2000；`targetId` 必须是对应类型的可举报公开目标。不存在、类型不匹配或不可见统一返回 `404 CONTENT_REPORT_TARGET_NOT_FOUND`。

#### GET `/api/me/content-reports`

consumer-only。返回当前用户自己的举报分页。允许且只允许 `status`、`targetType`、`limit`、`cursor`。

#### GET `/api/me/content-reports/:contentReportId`

consumer-only。返回当前用户自己的单条举报；不存在或无归属统一返回 `404 CONTENT_REPORT_NOT_FOUND`。

#### GET `/api/admin/content-reports`

要求 `content_reports:read`。允许 `status`、`targetType`、`category`、`limit`、`cursor`，返回 Admin DTO 分页。

#### GET `/api/admin/content-reports/:contentReportId`

要求 `content_reports:read`。返回 Admin DTO；不存在统一返回 `404 CONTENT_REPORT_NOT_FOUND`。

#### POST `/api/admin/content-reports/:contentReportId/investigate`

要求 `content_reports:moderate`。body 只允许可选 `internalNote`（最长 1000），执行 `pending -> investigating`；成功返回 Admin DTO。

#### POST `/api/admin/content-reports/:contentReportId/resolve`

要求 `content_reports:moderate`。body：

```json
{
  "resolutionAction": "remove_post",
  "publicMessage": "举报已处理，相关作品已下架",
  "internalNote": "审核确认违反内容规范"
}
```

`resolutionAction` 只允许 `no_action|remove_post|suspend_companion`。`remove_post` 只匹配 `targetType=post`，`suspend_companion` 只匹配 `targetType=companion`，不匹配返回 `400 CONTENT_REPORT_RESOLUTION_INVALID`；`no_action` 可用于任一目标。解决状态、目标处置副作用、公开结果和 Admin 审计必须原子提交。`publicMessage` 必填，最长 1000；`internalNote` 可选，最长 1000。

#### POST `/api/admin/content-reports/:contentReportId/reject`

要求 `content_reports:moderate`。body 必须包含最长 1000 的 `publicMessage`，可选最长 1000 的 `internalNote`。成功写入 `rejected` 与公开 `{ resolutionAction: "no_action", publicMessage }`，返回 Admin DTO。

### C. Blocked Companions

- 屏蔽是当前消费者与摄影师之间的私有关系，不通知摄影师，也不向摄影师或其他用户返回屏蔽者身份。
- 对已登录消费者，服务端作品流、摄影师搜索/列表和公开详情读取必须应用其屏蔽集合：被屏蔽摄影师及其作品不再返回；直接访问被屏蔽目标统一按不可见处理。匿名浏览不携带个人屏蔽状态。
- PUT/DELETE 都是资源级幂等操作，不使用 `clientRequestId`。并发 PUT 最多保留一条关系；重复 DELETE 返回未屏蔽结果，不报 404。

Blocked DTO 严格为：

```json
{
  "companionId": "companion_uuid",
  "displayName": "摄影师昵称",
  "avatarUrl": null,
  "baseCity": "上海",
  "blockedAt": "2026-08-23T10:00:00.000Z"
}
```

#### GET `/api/me/blocked-companions`

consumer-only。只接受 `limit`、`cursor`，返回当前用户的 Blocked DTO 分页。

#### PUT `/api/me/blocked-companions/:companionId`

consumer-only。幂等屏蔽已审批且存在的摄影师，成功返回 Blocked DTO。目标不存在或不可屏蔽返回 `404 COMPANION_BLOCK_TARGET_NOT_FOUND`；body 必须为空。

#### DELETE `/api/me/blocked-companions/:companionId`

consumer-only。幂等解除屏蔽，返回 `{ companionId, blocked: false, blockedAt: null }`；body 必须为空。

### 稳定错误码

| HTTP | code | 说明 |
|---|---|---|
| 400 | `USER_REQUEST_INVALID` / `USER_REQUEST_QUERY_INVALID` / `USER_REQUEST_CURSOR_INVALID` | 用户请求 body、筛选或 actor-bound cursor 无效 |
| 400 | `CONTENT_REPORT_INVALID` / `CONTENT_REPORT_QUERY_INVALID` / `CONTENT_REPORT_CURSOR_INVALID` / `CONTENT_REPORT_RESOLUTION_INVALID` | 内容举报 body、筛选、游标或目标与处置动作不匹配 |
| 400 | `COMPANION_BLOCK_QUERY_INVALID` / `COMPANION_BLOCK_CURSOR_INVALID` | 屏蔽列表参数或游标无效 |
| 401 / 403 | `AUTH_REQUIRED` / `FORBIDDEN` / `ADMIN_SCOPE_REQUIRED` | 缺少消费者会话、角色不符或缺少对应 Admin scope |
| 404 | `NOT_FOUND` | `ENABLE_STORE_LITE_COMPLIANCE` 关闭，不暴露能力存在 |
| 404 | `USER_REQUEST_NOT_FOUND` / `USER_REQUEST_BOOKING_NOT_FOUND` | 用户请求或其关联预约不存在、不可见或不属于当前用户 |
| 404 | `CONTENT_REPORT_NOT_FOUND` / `CONTENT_REPORT_TARGET_NOT_FOUND` | 举报或目标不存在、不可见或无归属 |
| 404 | `COMPANION_BLOCK_TARGET_NOT_FOUND` | 摄影师不存在或不可屏蔽 |
| 409 | `USER_REQUEST_IDEMPOTENCY_CONFLICT` / `USER_REQUEST_STATUS_CONFLICT` | 用户请求幂等键复用或状态迁移冲突 |
| 409 | `CONTENT_REPORT_IDEMPOTENCY_CONFLICT` / `CONTENT_REPORT_STATUS_CONFLICT` | 内容举报幂等键复用或状态迁移冲突 |
| 503 | `COMPLIANCE_POSTGRES_REQUIRED` / `COMPLIANCE_STORE_UNAVAILABLE` | 缺少 PostgreSQL 权威能力或数据库读取/事务暂不可用 |

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
  "placeLat": 31.2109000,
  "placeLng": 121.4457000,
  "userNote": "想拍自然一点，不太会摆动作",
  "extras": []
}
```

`placeLat`、`placeLng` 是可选的 legacy 地点快照字段，只能同时提交或同时省略。提交时必须是 JSON number，纬度范围 `[-90, 90]`、经度范围 `[-180, 180]`；单边缺失、字符串、非有限数值或越界值返回 `400 VALIDATION_ERROR`。它们只写入已有 `orders.place_lat/place_lng`，不得在本切片引入 `placeId`、Provider、区域 ID 或其他尚未落库的结构化地点字段。

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

获取当前用户或摄影师自己的订单列表。该接口返回公开 `OrderSummary`，使用稳定游标分页；身份和资源范围始终由服务端会话决定，客户端传入的 `role` 不能扩大权限。

查询参数：

| 参数 | 类型 | 严格规则 |
|---|---|---|
| role | string | 可选；省略时由会话推导。提供时只接受精确值 `user` / `companion`。consumer 会话只能使用 `user`，companion 会话只能使用 `companion`；不接受 `consumer`、大小写变体或多值参数。 |
| status | string | 可选，只接受一个 `OrderStatus` 精确值：`pending_payment`、`paid_pending_confirm`、`confirmed`、`in_service`、`completed`、`cancelled`、`refunding`、`refunded`、`disputed`。 |
| limit | integer | 可选，默认 20，范围 1—50；小数、零、负数、超上限和多值参数均返回 `400 ORDER_QUERY_INVALID`。 |
| cursor | string | 可选。只能原样传回服务端上一页签发的不透明游标，最大 512 字符；客户端不得解析或自行构造。 |

分页与校验规则：

- 固定按 `createdAt DESC, id DESC` 做 keyset pagination；游标保留 PostgreSQL `created_at` 的完整微秒精度，相同创建时间再由 `id` 保证稳定顺序，不能因 JavaScript 毫秒时间截断而跳单。
- 游标包含当前主体、`role`、`status` 和上一页位置的上下文校验信息。格式非法或用于不同主体、角色、状态筛选时返回 `400 ORDER_CURSOR_INVALID`，不得静默退回第一页；本阶段不把游标描述为加密凭证或授权边界，资源权限仍由每次 SQL 的会话归属条件保证。
- 未知查询参数、同名多值参数和显式空白 `role` 均返回 `400 ORDER_QUERY_INVALID`。
- 已登录但 `role` 与当前会话不匹配时返回 `403 ORDER_ROLE_FORBIDDEN`，不得返回另一角色的订单或用空列表掩盖越权请求。
- `hasMore` 必须等于 `nextCursor !== null`；最后一页固定返回 `nextCursor: null`、`hasMore: false`。
- 生产环境缺少 PostgreSQL 权威订单读取能力时返回 `503 ORDER_POSTGRES_REQUIRED`；数据库查询或映射异常返回 `503 ORDER_READ_FAILED`。两者都不得降级为 JSON store、mock、localStorage 或 `200` 空数组。
- 只有查询成功且当前主体确实没有匹配订单时，才返回 `200`、`items: []`、`nextCursor: null`、`hasMore: false`。

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
      "time": "2026-05-24 17:30-19:30",
      "place": "武康路",
      "locationSnapshot": {
        "name": "武康路",
        "address": "上海市徐汇区武康路",
        "lat": 31.2109000,
        "lng": 121.4457000
      },
      "amountCents": 39900,
      "amountText": "¥399",
      "companion": "Mori",
      "companionId": "companion_uuid",
      "postId": "post_uuid",
      "activityId": "pricing_uuid",
      "activityName": "Citywalk",
      "slotId": "slot_uuid",
      "startAt": "2026-05-24T09:30:00.000Z",
      "endAt": "2026-05-24T11:30:00.000Z",
      "dateLabel": "2026-05-24",
      "timeLabel": "17:30-19:30",
      "durationMinutes": 120,
      "durationLabel": "2小时",
      "createdAt": "2026-05-20T08:00:00.000Z",
      "updatedAt": "2026-05-20T08:05:00.000Z",
      "currentStep": 1,
      "steps": ["已创建", "已支付", "已确认", "已完成"]
    }
  ],
  "nextCursor": "opaque_server_cursor",
  "hasMore": true
}
```

兼容约定：

- `place` 继续保留，固定等于 `locationSnapshot.name`，现有客户端可以继续显示 `place`。
- `locationSnapshot` 是 WIN-DATA-2A 的 legacy 地点快照，只包含 `name/address/lat/lng`。它复制订单创建时的 `orders.place_*`，后续地点改名不得覆盖历史订单。
- 未保存地址时 `address` 返回 `null`；只有经纬度同时有效时才返回数值，否则 `lat`、`lng` 必须同时为 `null`。不得填充 `0,0`，也不得根据名称在读取时临时反查坐标。
- `locationSnapshot` 不代表 WIN-MAP-2 的结构化地点域；当前不得加入或伪造 `placeId`、`providerPoiId`、Provider、区域 ID、服务范围或距离结果。
- `startAt`、`endAt` 保持 UTC ISO 时间；当前中国区 legacy 订单的 `time`、`dateLabel`、`timeLabel` 统一按 `Asia/Shanghai` 生成，不得直接截取 UTC 字符串。跨本地日期时，`timeLabel` 必须带出结束日期，避免把跨日预约显示为同一天。
- companion 视图可以返回经过公开资料过滤的 `creatorId`、`creatorName`；任何列表视图都不得返回用户或摄影师手机号。

### GET `/api/orders/:orderId`

获取单个公开 `OrderDetail`。当前 consumer 只能读取 `orders.user_id` 属于自己的订单；当前 companion 只能读取 `orders.companion_id` 属于自己的订单。Admin 使用独立的 `/api/admin/**` 接口，不复用本接口。

路径与权限规则：

- `orderId` 必须是规范 UUID；格式非法、订单不存在、已不可见或当前主体无权读取时，一律返回完全相同的 `404 ORDER_NOT_FOUND`，不得通过状态码、消息、耗时或响应字段泄露订单是否存在。
- 缺少或失效会话仍返回 `401 AUTH_REQUIRED`。
- 响应中的 `statusLogs` 按 `createdAt ASC, id ASC` 排列；没有日志时返回空数组，不能省略字段。
- `OrderStatusLogPublic.message` 只能是面向用户的安全文案。不得透传数据库原始 `reason`、操作人 ID、内部操作人类型或内部 metadata。

返回：

```json
{
  "id": "order_uuid",
  "orderNo": "PP26052401",
  "status": "paid_pending_confirm",
  "statusText": "待确认",
  "title": "Citywalk 陪拍",
  "time": "2026-05-24 17:30-19:30",
  "place": "武康路",
  "locationSnapshot": {
    "name": "武康路",
    "address": "上海市徐汇区武康路",
    "lat": 31.2109000,
    "lng": 121.4457000
  },
  "amountCents": 39900,
  "amountText": "¥399",
  "companion": "Mori",
  "companionId": "companion_uuid",
  "postId": "post_uuid",
  "activityId": "pricing_uuid",
  "activityName": "Citywalk",
  "slotId": "slot_uuid",
  "startAt": "2026-05-24T09:30:00.000Z",
  "endAt": "2026-05-24T11:30:00.000Z",
  "dateLabel": "2026-05-24",
  "timeLabel": "17:30-19:30",
  "durationMinutes": 120,
  "durationLabel": "2小时",
  "pricing": {
    "baseAmountCents": 39900,
    "extraAmountCents": 0,
    "totalAmountCents": 39900,
    "totalAmountText": "¥399",
    "currency": "CNY"
  },
  "addOns": [],
  "createdAt": "2026-05-20T08:00:00.000Z",
  "updatedAt": "2026-05-20T08:05:00.000Z",
  "currentStep": 1,
  "steps": ["已创建", "已支付", "已确认", "已完成"],
  "statusLogs": [
    {
      "id": "status_log_uuid",
      "fromStatus": "pending_payment",
      "toStatus": "paid_pending_confirm",
      "statusText": "待确认",
      "message": "支付成功，等待摄影师确认",
      "createdAt": "2026-05-20T08:05:00.000Z"
    }
  ]
}
```

`serviceItems` 是 feature-gated 兼容字段：组合订单领域开关关闭时省略；只有 `WIN-MERCHANT-0` 的领域开关安全启用后才按公开 `OrderServiceItem` 白名单返回。它不是 `WIN-DATA-2A` 的验收或解锁条件。

`OrderServiceItem.serviceDescription` 是可选的公开套餐说明。服务项拒绝原因在建立独立的用户可见原因枚举或审核文案字段前不通过该公开 DTO 返回；数据库原始 `decline_reason` 始终属于内部履约记录。

详情中的 `userNote` 可供订单双方查看；`companionNote` 只在摄影师本人视图返回；`cancellationReason` 可供订单双方查看。三者均不得包含平台内部风控、财务、结算或操作人 metadata。

不存在与无权限的统一响应：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order not found",
    "requestId": "f5da48bf-9c40-4622-81ea-df1ad3d08a4f"
  }
}
```

`OrderSummary`、`OrderDetail`、`OrderStatusLogPublic` 和嵌套的公开 `OrderServiceItem` 均不得包含：

- `platformFeeCents` 或其他平台佣金；
- `companionIncomeCents`、`providerIncomeCents`、服务方应结收入或对手方补偿；
- `settlementStatus`、服务项结算状态或内部账本状态；
- `pricingSnapshot`、`rawPricingSnapshot` 或任何原始内部计价快照；
- 操作人 ID、内部风控 metadata、数据库原始状态原因；
- 用户、摄影师或商家电话。

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

### GET `/api/companion/me/profile`

读取当前 companion session 对应的摄影师资料和可编辑字段。服务端根据 session 的 `user_id` 与 `companion_id` 校验归属，不接受客户端指定其他账号。

### PUT `/api/companion/me/profile`

更新当前摄影师公开名称、简介、性格、风格、互动和设备标签。仅更新当前 session 所属摄影师；越权返回 `403 COMPANION_PROFILE_FORBIDDEN`。

```json
{
  "displayName": "Mori",
  "bio": "会聊天，也会帮你慢慢找角度",
  "personalityTags": ["温柔耐心"],
  "styleTags": ["自然光"],
  "interactionTags": ["会指导动作"],
  "equipment": ["Sony A7M4"]
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

要求 companion session；服务端从 session 取得 `user_id` 和 `companion_id` 并校验归属。生产图片必须是持久化 HTTPS URL，拒绝 data URL。

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

只有作品所属摄影师可提交；仅 `draft` 或 `rejected` 状态可进入审核。

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

### GET `/api/me/collections`

恢复当前登录用户跨设备同步的点赞、收藏和关注 ID：

```json
{
  "likedPostIds": ["post_uuid"],
  "favoritePostIds": ["post_uuid"],
  "followingIds": ["companion_uuid"]
}
```

传入 `kind=like|favorite|follow`、`cursor` 和 `limit` 时，返回对应公开作品或摄影师的分页结果：

```json
{
  "items": [],
  "nextCursor": null,
  "hasMore": false
}
```

### PUT `/api/me/collections/:kind/:targetId`

幂等添加点赞、收藏或关注。`kind` 可为 `like`、`favorite`、`follow`；服务端校验目标公开可见，并从 session 取得 `user_id`。

### DELETE `/api/me/collections/:kind/:targetId`

幂等取消点赞、收藏或关注。点赞变化在同一事务中更新 `posts.like_count`，返回持久化后的 `active` 和 `count`。

生产模式下集合接口失败必须显示错误并允许重试，不得写入 localStorage 或返回模拟成功。

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
- `user_sessions`
- `admin_action_logs`
- `security_events`

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
