# PP 平台 iPhone App Store 封装上线计划

本文档把现有产品说明、数据库设计、API 契约和 iOS 封装工程串成一条可执行路线。目标不是简单把网页套进 App，而是把 PP 陪拍平台做成能通过 App Store 审核、适配 iPhone、可真实交易和可运营的第一版。

## 当前状态

- 前端：`pp-app` 是 React + TypeScript + Vite 的移动端优先 Web App。
- iOS 壳：已接入 Capacitor，Xcode 工程在 `pp-app/ios/App/App.xcodeproj`。
- 本地前端端口：`http://127.0.0.1:5173`
- 本地后端端口：`http://127.0.0.1:8787`
- 当前 Bundle ID：`com.wrm18050962211.ppplatform`
- 当前 App 显示名：`PP陪拍平台`
- 当前产品核心：图片流发现、陪拍者审核、地点/时间/价格匹配、订单交易、订单聊天、举报风控、结算提现。

## 上线原则

1. 第一版按 iPhone 优先上线，竖屏体验优先，兼顾 iPhone SE 到 Pro Max 的安全区域。
2. App Store 描述用“本地陪拍/旅拍/Citywalk 拍照服务预约平台”，不要写成随机社交、陪伴约会或成人导向服务。
3. 平台有用户生成内容，所以必须具备内容过滤、举报、拉黑、客服联系方式和及时处理机制。
4. 平台涉及线下见面，所以必须把实名审核、安全提醒、订单绑定聊天、举报取证和客服介入做成第一版核心。
5. 用户下单购买的是线下一对一服务，可走常规支付；数字会员、曝光推广等纯数字权益以后再单独评估是否需要 IAP。
6. 只申请真实需要的 iOS 权限，并在权限文案中说清用途。
7. 提审前必须有可用后端、演示账号、隐私政策、用户协议、账号注销和审核备注。

## 固定推进流程

每推进一步都按下面顺序执行：

1. 明确本步范围和验收页面。
2. 修改代码、配置或文档。
3. 运行本地验证。
4. 打开端口查看效果。
5. 记录未完成风险。
6. 做 Git checkpoint。

## 第 1 步：项目下载与本地运行

目标：让项目在本机稳定启动，作为后续每一步验收基线。

要做：
- 确认仓库在 `/Users/tianzhihua/Documents/pp平台`。
- 安装前端依赖。
- 启动前端和后端。
- 确认 Xcode 工程存在。

验收：
- 用户端：`http://127.0.0.1:5173/consumer`
- 陪拍者端：`http://127.0.0.1:5173/companion`
- 运营后台：`http://127.0.0.1:5173/admin`
- 后端健康检查：`http://127.0.0.1:8787/api/health`
- Xcode 工程：`pp-app/ios/App/App.xcodeproj`

当前状态：已完成本地下载和 iOS 壳工程生成。GitHub 推送还需要配置本机 GitHub 凭据。

## 第 2 步：iPhone 适配基线

目标：让现有 Web App 在 iPhone 竖屏壳内可用，不出现遮挡、横向溢出和底部按钮被 Home Indicator 压住。

要改：
- 检查 `pp-app/src/styles/index.css` 的安全区变量和页面高度。
- 检查用户端、陪拍者端、后台三套 Shell 的底部导航、顶部栏和滚动区域。
- 对下单弹窗、聊天页、订单页做小屏适配。
- 确认 `vite.config.ts` 使用 `base: './'`，避免 iOS 壳内资源路径白屏。

验收：
- iPhone SE 宽度下文字不溢出。
- iPhone 15/16 Pro 宽度下主按钮不被遮挡。
- 访问 `/consumer`、`/consumer/post/:postId`、`/consumer/orders`、`/consumer/messages`、`/companion`、`/admin` 均可正常使用。

## 第 3 步：iOS 原生工程上架配置

目标：让 Xcode 工程具备归档和上传 TestFlight 的基础条件。

要改：
- 在 Xcode 里设置 Apple Developer Team。
- 在 Apple Developer 后台创建正式 Bundle ID。
- 确认 `PRODUCT_BUNDLE_IDENTIFIER` 与后台一致。
- 更新 App Icon、启动图、版本号 `MARKETING_VERSION`、构建号 `CURRENT_PROJECT_VERSION`。
- 如第一版只做 iPhone，将 Targeted Device Family 调整为 iPhone。
- 补齐权限说明：定位、相册、相机、推送，只保留第一版实际使用的权限。

验收：
- Xcode 能选择真机或通用 iOS Device。
- Archive 能成功生成。
- `npm run ios:sync` 后 iOS 工程能拿到最新 Web 产物。

## 第 4 步：产品审核口径与 App Store 元数据

目标：降低审核误解风险，让 App Store 页面准确表达 PP 平台。

要做：
- App 名称：`PP陪拍平台` 或更明确的 `PP陪拍`。
- Subtitle：本地陪拍与旅拍预约。
- 分类建议：生活、摄影与录像，二选一主类。
- 关键词围绕：陪拍、旅拍、拍照、Citywalk、探店、摄影、旅行。
- 截图必须展示真实 App 页面，不只放欢迎页。
- 审核备注说明：平台是本地拍照服务预约，陪拍者需审核，交易和聊天在平台内完成。

验收：
- App Store 文案不出现容易被误解为约会、成人陪伴、随机见面的表达。
- 截图覆盖图片流、帖子详情、预约面板、订单、聊天、安全举报。

## 第 5 步：后端真实 MVP 闭环

目标：替换前端 mock 数据，让 App Review 看到完整可用产品。

按 `database/BACKEND_IMPLEMENTATION_PLAN.md` 推进：
- Sprint 0：后端工程、数据库连接、健康检查。
- Sprint 1：首页图片流和帖子详情改读数据库。
- Sprint 2：订单创建、时间锁定、支付成功。
- Sprint 3：订单聊天和基础风控。
- Sprint 4：陪拍者入驻和作品提交审核。
- Sprint 5：运营后台审核通过后影响前台展示。
- Sprint 6：订单确认、完成、结算。
- Sprint 7：评价、收藏、举报。
- Sprint 8：取消、退款、纠纷。

验收：
- 首页只展示 `approved` 且 `is_feed_visible = true` 的作品。
- 陪拍者必须 `approved` 且 `service_enabled = true` 才能接单。
- 支付后生成订单绑定会话。
- 举报能进入后台队列。

## 第 6 步：安全、审核与防跳单

目标：满足用户生成内容和线下服务安全要求。

要做：
- 作品发布先进入待审核，审核后进入首页。
- 陪拍者实名、人脸、自我介绍视频、紧急联系人进入审核流。
- 评论、私信、订单聊天加举报入口。
- 消息风控先拦截：微信、VX、手机号、支付宝、银行卡、私下付、二维码、外部链接。
- 命中风控时提供替代动作：发起预约、修改订单、申请加购、联系客服。
- 支持拉黑或限制违规用户。
- App 内提供客服联系方式。

验收：
- 输入“微信”“VX”“私下付”会被拦截并产生后台记录。
- 用户能从帖子、消息、订单发起举报。
- 后台能处理举报、冻结订单、暂停陪拍者接单。

## 第 7 步：支付、退款和结算

目标：让平台内交易成为安全闭环。

要做：
- 接入正式支付渠道或 Apple Pay 支付服务费订单。
- 下单时全款支付，平台托管。
- 陪拍者确认后订单生效。
- 完成后进入结算期。
- 取消、退款、纠纷、冻结结算走后台流程。
- 所有金额用分保存，订单金额快照化。

验收：
- 同一时间段不能重复下单。
- 已支付订单取消会生成退款记录。
- 有举报的订单可以冻结结算。

## 第 8 步：隐私、协议和账号删除

目标：完成 App Store Connect 必填合规项。

要做：
- 隐私政策 URL。
- 用户协议 URL。
- 社区规则 URL。
- 退款规则 URL。
- App 内账号注销入口。
- 数据导出/删除客服流程。
- 隐私标签梳理：手机号、邮箱、头像、照片、视频、定位、聊天内容、订单记录、支付状态、举报资料、诊断数据。

验收：
- App 内能找到隐私政策、用户协议、联系客服、注销账号。
- App Store Connect 隐私标签与实际采集数据一致。

## 第 9 步：TestFlight 内测

目标：正式提审前发现真机问题。

要做：
- 上传 TestFlight build。
- 添加内部测试账号。
- 准备一组审核演示账号：普通用户、陪拍者、运营后台。
- 测试 iPhone SE、标准屏、Pro Max。
- 测试弱网、重新打开 App、支付失败、取消订单、举报、账号删除。

验收：
- TestFlight 安装启动无崩溃。
- 核心路径 10 分钟内可完整走通。
- 审核账号无需额外人工介入即可看到完整功能。

## 第 10 步：正式提交 App Store Review

目标：提交可审核、可解释、可复现的完整版本。

要做：
- 选择 TestFlight 稳定 build。
- 填写元数据、隐私、年龄分级、支持 URL。
- 上传截图和预览。
- 在审核备注写清安全机制、审核机制、支付方式和演示账号。
- 后端保持线上可用，不要在审核期间关停服务。

验收：
- App 状态进入 Waiting for Review 或 In Review。
- 如果被拒，按问题归因到本计划中的对应步骤修复。

## 当前下一步建议

建议从第 2 步开始：做 iPhone 小屏体验巡检与修复。原因是现在前端已经能启动，iOS 壳也存在，最容易马上看到效果。

下一轮可以按这个顺序推进：

1. 巡检 `/consumer` 图片流和底部导航。
2. 巡检帖子详情和预约面板。
3. 巡检订单页和消息页。
4. 修复 iPhone SE 宽度下的遮挡、溢出和按钮位置。
5. 生成截图，作为 App Store 截图素材基础。

## 官方参考

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple TestFlight Overview: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
