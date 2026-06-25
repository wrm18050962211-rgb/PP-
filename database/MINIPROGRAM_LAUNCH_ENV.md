# 微信小程序 MVP 上线配置清单

目标：代码保持本地可演示，真实上线时只替换环境变量、数据库和云资源。

## 后端环境变量

在腾讯云部署后端时，把 `server/.env.example` 复制为线上环境变量：

```bash
PORT=
STORE_DRIVER=postgres
DATABASE_URL=

COS_BUCKET=
COS_REGION=
COS_PUBLIC_BASE_URL=

WECHAT_MINI_PROGRAM_APP_ID=
WECHAT_MINI_PROGRAM_APP_SECRET=

WECHAT_PAY_MODE=live
WECHAT_PAY_MCH_ID=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_PRIVATE_KEY_PATH=
WECHAT_PAY_NOTIFY_URL=
WECHAT_PAY_API_V3_KEY=
```

说明：

- `STORE_DRIVER=json` 用于本地演示；线上切到 `postgres`。
- `DATABASE_URL` 填腾讯云 PostgreSQL 连接串。
- `WECHAT_MINI_PROGRAM_APP_ID` 和 `WECHAT_MINI_PROGRAM_APP_SECRET` 用于 `wx.login` 后端换取 `openid`。
- `WECHAT_PAY_MODE=mock` 保持本地模拟支付；线上改成 `live`。
- `WECHAT_PAY_PRIVATE_KEY` 可以直接填 PEM 内容，换行写成 `\n`；也可以填 `WECHAT_PAY_PRIVATE_KEY_PATH` 指向私钥文件。
- `WECHAT_PAY_NOTIFY_URL` 填线上公网回调地址，例如 `https://你的域名/api/payments/wechat/notify`。
- `WECHAT_PAY_API_V3_KEY` 用于解密微信支付回调通知。

## 前端环境变量

Web/Vite 本地演示：

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787
```

微信小程序迁移时：

- 把 `VITE_API_BASE_URL` 换成线上后端 API 域名。
- 小程序运行时会通过 `pp-app/src/services/miniProgramBridge.ts` 走 `wx.request`、`wx.login`、`wx.getLocation`、`wx.uploadFile`、`wx.requestPayment`。
- Web 浏览器仍然使用 `fetch` 和本地 mock 支付，不影响演示。

## 已落地的线上接口形状

- `POST /api/auth/wechat/login`
  - 本地：`mock-*` code 生成 mock openid。
  - 线上：配置 AppID/Secret 后调用微信 `code2session`，创建或更新 `users`。

- `POST /api/orders`
  - 本地：返回 `payment.mode=mock` 和 mock `miniProgramPayParams`。
  - 线上：`WECHAT_PAY_MODE=live` 后调用微信支付 JSAPI 预下单，返回真实 `wx.requestPayment` 参数。

- `POST /api/payments/wechat/notify`
  - 线上：解密微信支付回调，按 `out_trade_no` 标记支付成功，订单进入 `paid_pending_confirm`。

- `GET /api/ops/launch-check`
  - 返回缺失环境变量清单。
  - `ready=true` 才代表配置层面具备上线条件。

## 上线前最小检查

```powershell
cd server
npm.cmd run check:mvp

cd ..\pp-app
npm.cmd run build
```

部署到腾讯云后再检查：

```text
https://你的域名/api/health
https://你的域名/api/ops/launch-check
```

`/api/ops/launch-check` 的 `missing` 为空后，再用真机小程序走：登录 -> 浏览 -> 下单 -> 微信支付 -> 回调入库 -> 订单列表 -> 聊天/风控 -> 后台审核。
