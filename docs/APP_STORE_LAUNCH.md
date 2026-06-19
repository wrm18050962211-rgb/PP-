# PP App Store 上架路线

这份清单服务于当前最快路线：把 `pp-app` 现有 React/Vite Web App 先封装为 iOS App，进入 TestFlight，再冲 App Store 审核。

## 当前状态

- `pp-app` 已加入 Capacitor 配置，iOS 原生工程需要在 Mac 上生成。
- Web 构建产物目录是 `pp-app/dist`。
- App ID 暂定为 `com.ppplatform.app`，提交前可以改成公司/个人开发者账号下的正式 Bundle ID。
- 第一版目标是 App Store 最小可审版本，不追求完整平台自动化。

## Mac 上第一步

在 Mac 上复制仓库后进入 `pp-app`：

```bash
npm install
npm run ios:add
npm run ios:open
```

如果已经生成过 `ios/` 工程，后续改前端后运行：

```bash
npm run ios:sync
npm run ios:open
```

## 第一版建议范围

保留：

- 首页作品流
- 摄影师/陪拍详情
- 咨询或预约意向提交
- 基础登录/注册入口
- 我的页面
- 客服/举报/隐私入口

暂缓：

- 真实在线支付
- 复杂结算和提现
- 自动化纠纷仲裁
- 完整双边平台冷启动机制
- 大规模推荐算法

## App Store Connect 必备材料

- Apple Developer Program 账号
- App 名称、Bundle ID、SKU
- App 图标
- iPhone 截图
- App 分类、年龄分级
- 隐私政策 URL
- 用户协议 URL
- App Privacy 数据收集说明
- 审核账号和审核说明
- 联系方式

## 技术上线前必须补齐

- 生产 API 地址，不能使用 `127.0.0.1`
- 真实账号体系，不能依赖本地验证码和 localStorage 登录
- 真实图片/视频上传，不能只保存 data URL
- 基础错误页、空状态和网络失败提示
- 隐私政策与权限弹窗文案
- iPhone 真机测试和 TestFlight 测试

## 最短时间表

- 1 天：Mac 上生成 iOS 工程，跑通模拟器。
- 3-7 天：整理最小可审功能，上传 TestFlight。
- 2-4 周：补生产登录、存储、隐私和审核材料，提交 App Store 审核。
