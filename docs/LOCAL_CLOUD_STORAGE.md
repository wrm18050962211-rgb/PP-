# 本地分库与云端数据标注

当前 MVP 不接真实数据库，先用浏览器 `localStorage` 模拟两类数据库。所有业务数据都必须带账号身份作用域，避免创作者、摄影师、不同手机号之间互相串数据。

## 存储 key 规则

- 本地设备数据库：`pp-local-db:<手机号>:<身份>:<身份ID>:<数据域>`
- 云端权威数据库：`pp-cloud-db:<手机号>:<身份>:<身份ID>:<数据域>`
- 共享云端数据：`pp-cloud-db:shared:<数据域>`

其中 `pp-cloud-db` 现在仍然存在本机浏览器里，只是提前标注为后续要迁到腾讯云数据库、对象存储或支付对账系统的数据。

## 数据域策略

策略表维护在 `pp-app/src/services/scopedStorage.ts` 的 `dataDomainPolicies` 中。业务代码优先使用 `readDomainJson` / `writeDomainJson`，不要直接写死 `localStorage` key。

| 数据域 | 当前层 | 敏感级别 | 未来迁移目标 | 说明 |
| --- | --- | --- | --- | --- |
| `app-data-v1` | cloud | sensitive | TencentDB orders / companion_profiles / booking_settings / work_drafts | 订单、摄影师入驻资料、档期价格、作品草稿都需要服务端权威记录 |
| `orders-ledger-v1` | cloud shared | sensitive | TencentDB orders / order_participants | 创作者下单、摄影师接单、完成和取消都写同一笔订单 |
| `order-workspaces-v1` | cloud shared | sensitive | TencentDB order_workspaces + COS media | 完成订单后的共同成片编辑，需要双方确认和发布审核 |
| `order-conversations-v1` | cloud shared | sensitive | TencentDB conversations / messages / risk_cases | 订单聊天可能触发风控和管理员审核 |
| `user-collections-v1` | cloud | user | TencentDB user_likes / user_favorites / user_follows | 点赞、收藏、关注属于账号行为数据，跨设备登录后应可同步 |
| `reviewed-orders-v1` | local | device | Device cache only | 设备上的订单评价展示状态，不作为云端权威数据 |
| `message-thread-prefs-v1` | local | device | Device cache only | 聊天置顶、未读、隐藏、删除等本机列表偏好 |
| `wallet-balance-v1` | cloud | regulated | TencentDB wallet_ledger / payment reconciliation | 余额、收入、提现、结算必须由后台和支付对账确认 |
| `admin-audit-cases-v1` | cloud | sensitive | TencentDB admin_audit_cases / moderation_cases | 入驻审核、作品审核、风控、举报、纠纷、账号状态管理 |

## 账号身份隔离规则

- 同一个手机号可以分别注册创作者身份和摄影师身份。
- 创作者身份和摄影师身份使用不同身份 ID，因此主页、订单视角、作品草稿、聊天和偏好数据互相隔离。
- 如果手机号未注册某个身份，用户端只能看到“注册成为创作者/摄影师”，不能直接切进不存在的身份数据库。
- 管理员不进入普通用户的角色切换，后台使用独立入口和独立管理数据域。

## 后续迁云原则

1. `local` 层只保留设备偏好和可丢弃缓存。
2. `cloud` 层迁到腾讯云时保持数据域命名不变，先替换 `scopedStorage.ts` 的读写实现。
3. `regulated` 数据不能以前端本地数值为准，余额、支付、退款、提现和收入必须以后端账本和支付回调为准。
4. 聊天、举报、风控、审核、订单状态等会影响交易安全的数据，都应进入后台可审计的数据表。
