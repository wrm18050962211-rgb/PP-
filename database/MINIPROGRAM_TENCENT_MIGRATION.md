# PP 平台小程序 MVP 迁移约定

这份文档约定本地 MVP 到微信小程序 / 腾讯云上线时的替换边界。目标是本地开发继续快，真实上线时按模块替换，不重写业务页面。

## 迁移总原则

| 本地 MVP | 上线替换 | 代码边界 |
|---|---|---|
| `server/data/store.json` | 腾讯云 PostgreSQL / TencentDB for PostgreSQL | 保持 API 契约不变，只替换 store/DAO |
| `database/schema.sql` | 迁移到云数据库执行 | 先按 SQL 建表，再导入 seed 数据 |
| `POST /api/auth/wechat/mock-login` | 微信 `wx.login` + 后端 `code2session` | 前端继续调用 `authService` |
| `payment.mode=mock` | 微信支付 JSAPI / 小程序支付 | 前端继续调用 `requestMiniProgramPayment` |
| 图片外链 / 本地占位 | 腾讯云 COS | API 返回 URL 字段不变 |
| 本地 Node server | 腾讯云托管 / 云服务器 / CloudBase 云函数 | API 路径保持 `/api/...` |

## 数据库迁移

本地阶段：

- `server/data/store.json` 用来演示闭环。
- `server/store/jsonStore.mjs` 是本地 JSON store 适配器，后续 PostgreSQL DAO 应按同样的 `load/save` 边界替换。
- `STORE_DRIVER=json` 是默认本地模式；`STORE_DRIVER=postgres` 是上线切换入口，需要同时配置 `DATABASE_URL`。
- `server/store/postgresStore.mjs` 已具备展示层只读模型骨架，先覆盖图片流、帖子详情和陪拍者匹配所需数据。
- `server/store/postgresWritePlan.mjs` 记录订单、支付、聊天、举报和后台 moderation 的 PostgreSQL 事务写入清单。
- `server/store/postgresOrderWrites.mjs` 已落地 `createOrder`、`markPaymentPaid` 和 `transitionOrder` 的 PostgreSQL 事务写入 DAO，可锁定档期、创建订单/加购/支付，并处理确认、完成、取消、结算、退款和状态日志。
- `server/store/postgresMessageWrites.mjs` 已落地 `sendMessage` 的 PostgreSQL 事务写入 DAO，可写入聊天消息、风险事件，并覆盖 clean/flagged/blocked 三类状态。
- `server/store/postgresModerationWrites.mjs` 已落地 `createReport` 和 `applyModerationAction` 的 PostgreSQL 事务写入 DAO，可创建举报/audit case，并执行限制聊天、冻结订单等后台动作。
- `server/.env.example` 和 `pp-app/.env.example` 是本地、小程序和腾讯云迁移配置模板，不放真实密钥。
- `database/schema.sql` 和 `database/prisma/schema.prisma` 是真实数据库结构蓝图。
- `server/scripts/smoke.mjs` 是迁移前后的最小回归检查。
- `database/scripts/export-store-to-seed.mjs` 可把当前本地 store 导出为 PostgreSQL seed SQL。

上线阶段：

1. 在腾讯云创建 PostgreSQL 实例。
2. 执行 `database/schema.sql` 建表。
3. 按 `database/seed_mvp.sql` 导入最小种子数据。
4. 如果要迁移当前本地虚拟陪拍者和帖子，先导出本地 store：

   ```powershell
   cd server
   npm.cmd run db:export-seed
   ```

   默认输出到 `database/generated/store_seed.sql`。这是生成物，不提交 Git。

5. 将 seed 导入腾讯云 PostgreSQL：

   ```powershell
   psql "$env:DATABASE_URL" -f database/schema.sql
   psql "$env:DATABASE_URL" -f database/seed_mvp.sql
   psql "$env:DATABASE_URL" -f database/generated/store_seed.sql
   ```

6. 完成 `server/store/postgresStore.mjs` 的订单、支付、聊天、风控写入 DAO，再用 `STORE_DRIVER=postgres` + `DATABASE_URL` 切换到云数据库。
7. 保持 `/api/feed/posts`、`/api/orders`、`/api/payments/...` 等接口响应结构不变。
8. 跑 `npm.cmd run smoke`，确认图片流、下单、支付、订单、聊天、风控、后台仍可用。

当前导出脚本覆盖的演示内容：

- `users`
- `companions`
- `companion_tags`
- `service_areas`
- `activity_pricings`
- `companion_extras`
- `availability_slots`
- `posts`
- `post_images`
- `post_tags`

当前导出脚本刻意不迁移本地测试产生的订单、支付、聊天和风控案件，避免把测试交易数据带到生产库。

## 微信登录

本地阶段：

- `GET /api/auth/session` 返回当前本地会话。
- `POST /api/auth/wechat/mock-login` 模拟消费者、陪拍者、管理员身份。
- 前端只通过 `pp-app/src/services/authService.ts` 获取和切换身份。

上线阶段：

1. 小程序端调用 `wx.login()` 获取 `code`。
2. 后端新增正式登录接口，例如 `POST /api/auth/wechat/login`。
3. 后端用 `code2session` 换取 `openid/session_key`。
4. 后端创建或更新 `users`，返回与当前 `AuthSession` 同形状的数据。
5. 保留 mock-login 仅用于测试环境。

## 微信支付

本地阶段：

- 创建订单后返回 `payment.miniProgramPayParams`。
- Web 演示环境通过 `requestMiniProgramPayment()` 自动调用 `/api/payments/:paymentId/mock-success`。
- 接口形状已经贴近小程序 `wx.requestPayment` 参数。

上线阶段：

1. 后端创建订单时调用微信支付 JSAPI 下单。
2. 把微信返回的 `prepay_id` 组装为：
   - `timeStamp`
   - `nonceStr`
   - `package`
   - `signType`
   - `paySign`
3. 前端 `requestMiniProgramPayment()` 在小程序环境调用 `wx.requestPayment(params)`。
4. 支付结果以微信支付回调为准，不以前端成功回调为准。
5. 回调落库后把订单从 `pending_payment` 改为 `paid_pending_confirm`。

## 文件和图片

本地阶段：

- 作品图、头像、视频可继续使用 URL 占位。
- 前端统一通过 `pp-app/src/services/mediaService.ts` 处理媒体文件。
- 后端 `POST /api/media/upload-policy` 返回腾讯云 COS 形状的上传策略，本地为 `mock`。

上线阶段：

1. 后端 `POST /api/media/upload-policy` 改为签发腾讯云 STS 临时密钥或预签名上传策略。
2. 小程序端通过 COS 小程序 SDK 或 `wx.uploadFile` 上传到 COS。
3. 后端保存 COS `objectKey`、访问 URL、宽高、文件类型、审核状态。
4. 前端继续读取 `images[].url`、`avatar`、`photo`，不直接关心存储提供商。
5. 不把 SecretId / SecretKey 放到小程序端，正式环境只使用临时凭证。

当前约定的媒体字段：

```json
{
  "id": "draft-image-...",
  "url": "https://bucket.cos.ap-shanghai.myqcloud.com/pp/post-image/...",
  "provider": "tencent_cos",
  "objectKey": "pp/post-image/user-id/file.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 102400,
  "sortOrder": 1
}
```

## 必跑检查

每次替换一个云服务，都先保持 API 契约不变，然后运行：

```powershell
cd server
npm.cmd run check:mvp

# Or run checks separately when debugging:
npm.cmd run smoke
npm.cmd run check:store-driver
npm.cmd run check:postgres-mappers
npm.cmd run check:postgres-write-plan
npm.cmd run check:postgres-order-writes
npm.cmd run check:postgres-message-writes
npm.cmd run check:postgres-moderation-writes

cd ..\pp-app
npm.cmd run build
```

通过后再创建本地检查点。
