# InFrame / Still帧遇官网

这是 InFrame 公司与 Still帧遇产品的首发官网静态版本。当前目标是先完成可评审的大框架，再根据真实产品、品牌素材与正式合规文本继续迭代。

## 文件结构

- `index.html`：官网首页
- `styles.css`：首页与法律页共用样式
- `privacy.html`：隐私政策上线前草案
- `terms.html`：用户协议上线前草案
- `refund.html`：退款说明上线前草案
- `account-deletion.html`：账号删除上线前草案
- `app/index.html`：应用审核与 Universal Link 的稳定公开入口
- `.well-known/apple-app-site-association`：iOS Universal Links 站点关联文件
- `_headers`：静态托管响应头规则，确保 AASA 以 JSON 返回
- `scripts/check-review-readiness.mjs`：品牌、业务口径、草案标记与 AASA 本地检查
- `scripts/serve-static.mjs`：按生产静态文件语义预览页面和 AASA
- `assets/hero-still.jpg`：首页主视觉临时素材
- `assets/still-home.png`：Still 当前开发版本页面截图

## 本地预览

普通页面可直接用浏览器打开 `index.html`。需要同时检查 `/app/` 路径与 AASA 响应时，运行零依赖静态服务器：

```powershell
node website/scripts/serve-static.mjs
```

不要使用会转换无扩展名文件的前端开发服务器验收 AASA；返回内容必须与源 JSON 完全一致。

运行审核准备检查：

```powershell
node website/scripts/check-review-readiness.mjs
```

## 部署与公网验收

- 部署时必须包含点号目录 `.well-known`，不得被上传工具忽略。
- `/.well-known/apple-app-site-association` 必须直接返回文件内容，不得重定向到首页或返回 HTML。
- AASA 响应的 `Content-Type` 必须为 `application/json`；`_headers` 适用于支持该规则的静态托管平台，其他平台需配置等价响应头。
- 公网验收需确认首页和 `/app/` 均返回 200，且可见应用名称为“Still帧遇”。
- AASA 中的应用标识固定为 `7YH7CGR8C7.com.frameyu.still`，路径覆盖 `/app/` 与 `/app/*`。
- 本仓库仅准备网站端关联文件；iOS Associated Domains 配置和真机唤起仍需在 iOS 工作流中独立完成。

## 上线前必须完成

- 确认并测试 `support@weareinframe.com` 可以正常收发邮件，再公开客服入口。
- 由运营与法律专业人士审核四份草案，确定处理时限、退款比例、责任边界、争议管辖与第三方服务商清单。
- 审核完成后移除法律页面的 `noindex` 和草案提示，并将生效日期改为正式日期。
- 按 App 实际接入情况补全微信登录、支付、云存储、推送、统计等 SDK 的数据处理说明；P0 地点距离能力不接入地图 Provider。
- 用公司或摄影师拥有明确商业使用权的品牌影像替换临时主视觉，或完成现有素材的授权确认与留档。
- 配置域名 DNS、HTTPS、正式部署环境、错误页、网站图标与真实社交分享图片。
- 若网站部署在中国大陆服务器，完成 ICP 备案及上线后的公安联网备案；仅在备案号获批后展示真实编号。
- 在 iOS 上线前核对官网、App Store 隐私标签、应用内隐私政策和实际产品行为一致。
- 验证应用内“账号注销”和“订单售后”入口真实可用，并与官网说明一致。
- 在桌面端与常见手机尺寸完成最终视觉、可访问性、链接和邮件入口验收。

## 素材说明

首页主视觉当前来自 Unsplash 临时素材：
`https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43`

`still-home.png` 是本地开发原型截图，不代表最终 App Store 发布版本。正式上线前应替换为最新审核版本，并确认截图中不包含测试账号、隐私信息或无权公开的作品。
