# Still 双平台发布 Roadmap

本文档是 Still 从当前共同基线推进到 TestFlight、App Store 和真实运营版本的唯一真实 Roadmap。

聊天记录、交接总结和临时清单只能引用本文档，不能代替本文档。Windows、Mac/iOS、Integration 和 User/External 的节点状态、依赖、提交和验证结果都必须回写到这里。

## 0. 当前基线与固定决策

- Roadmap version: 8
- Current integration baseline: `6588247c29b2082d310cc96fe110ab67866337f4`
- Integration branch: `codex/integration`
- Windows branch: `codex/vertical-db-api`
- Mac/iOS branch: `codex/mac-ios`
- Roadmap work branch: `codex/release-roadmap`
- Map provider: 通过 `MAP_PROVIDER` 运行时选择，服务端必须使用统一 Provider 适配层
- Current P0 map provider: 待 `EXT-MAP-1` 完成高德、腾讯、百度的功能、商用授权、配额和总成本比较后确定
- Map display fallback: 可评估 MapLibre 加合法授权地图源；不得直接把 OpenStreetMap 公共瓦片服务作为生产 CDN
- AI、增长实验和微信小程序：在 iOS TestFlight 主流程稳定前暂停
- 用户拍摄偏好档案属于 TestFlight 稳定后的 P2 增长基础：先上线非 AI 结构化档案、订单快照和拍后反馈，再进入 P3 AI 偏好助手；首版不批量读取系统相册
- 双边忠诚度属于偏好与真实交易闭环之后的 P2/P3 路线：先上线不依赖补贴的复约、认证/作品来源、摄影师成长和服务恢复，再以 90/180 天指标及单位经济决定是否试点会员、降佣或奖励

### 0.1 地图技术路线

- Windows 建立 Provider 无关的地图服务适配层，通过服务端统一代理 POI 搜索、输入提示、周边搜索、地理编码和逆地理编码；首版不自建地图数据、搜索索引或路线引擎。
- `MAP_PROVIDER` 在高德、腾讯或百度中选择生产实现；选择前必须比较大陆 POI 质量、Capacitor 兼容性、商用授权、调用配额、年度固定许可和按量费用，不能因开发 Key 可调用就推定可免费商用。
- Provider 的 WebService Key 只能存放在服务端密钥管理或环境变量中，禁止进入前端构建、iOS 工程、日志或 Git；服务端为不同 Provider 输出统一地点结构和稳定错误码。
- Mac/Capacitor 第一版地图显示可以使用选定 Provider 的 JS/原生 SDK，或 MapLibre 加合法授权的地图瓦片/矢量源；不得直接依赖 OpenStreetMap 公共瓦片服务承载生产流量。
- 客户端只接收业务需要的标准化地点结果，不直接调用 WebService；客户端公开 Key 或安全参数必须按域名、Bundle ID、调用来源和平台能力限制。
- 第一版只实现定位、手动搜索、选点、地点快照和距离等业务必要能力；路线导航调起用户已安装的高德、腾讯或 Apple 地图，未安装时提供系统地图或网页降级，不在 Still 内实现语音导航。
- 只有 Web/Capacitor 地图在真机性能、合规或能力上不能满足需求时，才新建节点接入原生地图 SDK；不得在 P0 内扩张为自建离线地图或导航系统。
- User/External 必须完成候选服务商账号、应用、服务端 Key、客户端安全配置、商用许可和预算核实；生产 Provider 未获书面可上线结论时，地图节点只能用于内部 staging 验证。

### 0.2 状态定义

节点状态只能使用以下值：

- `pending`: 尚未开始，或依赖尚未全部满足但没有需要人工介入的异常。
- `in_progress`: 当前端正在实施该节点。
- `blocked`: 已经尝试推进，但被对端、外部资源、审核或不可绕过的问题阻塞。
- `completed`: 验收标准全部满足，结果提交和验证信息已经填写。

### 0.3 节点选择规则

1. 每个工作对话开始时先读取 `AGENTS.md` 和本文档。
2. 先同步最新 `origin/codex/integration`，工作区不干净时禁止拉取或合并。
3. 每次只选择本路线中顺序最靠前、状态不是 `completed`、且全部依赖已 `completed` 的节点。
4. 一次只实施一个节点；完成、提交并更新 Roadmap 后才能选择下一个节点。
5. 节点因依赖无法继续时，将其更新为 `blocked`，输出跨端依赖通知，然后继续下一个依赖满足的独立节点。
6. 不得为了绕开阻塞而恢复生产 mock、localStorage fallback、模拟支付或客户端密钥。
7. P0 全部完成前不实施 P2/P3；P1 仅在不阻塞 P0 时并行。
8. 节点可在不移除原验收范围的前提下拆成独立子切片；子切片完成只满足父节点明确列出的内部依赖，不自动继承父节点的 `Unblock result`，也不得让仍依赖父节点的下游提前实施。

### 0.4 Roadmap 编辑权

- Windows 只更新 `WIN-*` 节点的状态、结果提交、验证和备注。
- Mac/iOS 只更新 `IOS-*` 节点的状态、结果提交、验证和备注。
- Mac 集成工作流更新 `INT-*` 节点。
- 项目主控更新 `EXT-*` 节点和全局决策。
- 路线区块分开维护；禁止一端为了更新自己的状态重排另一端区块。
- `codex/integration` 禁止直接开发，只接收已验证分支的合并。

### 0.5 共享文件占用

开始修改共享文件前，负责端必须输出：

```text
【共享文件占用通知】
节点：
负责端：
文件：
用途：
预计释放条件：
```

提交并推送后必须输出：

```text
【共享文件释放通知】
节点：
分支：
commit SHA：
验证结果：
已释放文件：
```

### 0.6 跨端依赖通知

```text
【跨端依赖通知】
本端节点：
当前状态：blocked
等待节点：
需要提供：
相关分支和 SHA：
涉及共享文件：
等待期间继续推进：
```

解除阻塞时输出：

```text
【跨端解除阻塞】
完成节点：
分支：
commit SHA：
验证结果：
API、数据或环境变化：
解除的节点：
对方下一步：
重点回归：
```

### 0.7 基础运维 P0 固定决策

Still 的对外 API、官网、Admin、TestFlight 或 App Store 版本一旦可访问，以下九项即为 P0 发布门槛：

1. 使用生产系统之外的外部监控持续检查可用性，并接入 iOS 崩溃上报。
2. 生产账号遵循最小权限；AI 不持有长期 root/SSH 权限、生产密钥或数据库管理员凭据。
3. PostgreSQL 和对象存储具备自动备份、故障域分离副本和实际恢复演练。
4. 域名、DNS、HTTPS 证书和政策 URL 有负责人、自动续费/续期及 30/14/7 天提醒。
5. 云资源、短信、地图、存储、监控等 Provider 有预算、配额和 50%/80%/100% 账单告警。
6. 禁止在线编辑生产源码；发布使用不可变版本，变更前知道回滚版本和验证方法。
7. Git 是代码、迁移、部署脚本和非敏感 Runbook 的唯一来源；每个发布版本记录完整 commit SHA。
8. AI 可以生成运维清单，但清单必须经人审阅，真实云状态必须用监控、控制台或恢复结果验证。
9. 明确主要/备用负责人、告警时限、事故分级、发布观察窗口，并完成测试告警、应用回滚和数据库恢复演练。

责任映射：

- Windows：`WIN-DELIVERY-1`、`WIN-OBS-1`、`WIN-BACKUP-1`。
- Mac/iOS：`IOS-CRASH-1`。
- User/External：`EXT-CLOUD-1`、`EXT-COST-1`、`EXT-DOMAIN-1`、`EXT-OBS-1`、`EXT-RUNBOOK-1`。
- Integration：`INT-OPS-1`。

推荐推进顺序：

1. User/External 先完成 `EXT-CLOUD-1`、`EXT-DOMAIN-1`，并并行推进 `EXT-COMPLIANCE-1`。
2. 云资源和合规条件满足后完成 `EXT-COST-1`、`EXT-OBS-1`。
3. Windows 完成 `WIN-DELIVERY-1`，再并行推进 `WIN-OBS-1`、`WIN-BACKUP-1`。
4. Mac/iOS 在 `WIN-DELIVERY-1` 与 `EXT-OBS-1` 完成后推进 `IOS-CRASH-1`。
5. User/External 汇总负责人、权限和清单，完成 `EXT-RUNBOOK-1`。
6. Integration 最后执行 `INT-OPS-1` 联合演练，通过后才能形成 `INT-RC-1`。

`INT-OPS-1` 未完成时，`INT-RC-1` 不得开始；不能用“仍在内测”“用户还少”或“systemd 会自动重启”跳过本节。

### 0.8 用户拍摄偏好档案与 AI 固定路线

这条路线跨 Windows、Mac/iOS、Integration 和 User/External 四端，但不进入当前 P0 Release Candidate，也不能阻塞 TestFlight 主流程。

固定顺序：

1. `EXT-PREF-1` 确认偏好字段、参考图、拍后反馈、隐私文案、保留和删除边界。
2. `WIN-PREF-1` 建立结构化偏好、参考图授权、订单需求快照、拍后反馈和变更日志。
3. `IOS-PREF-1` 上线轻量问卷、喜欢/不喜欢样片、少量参考图、订单确认和拍后反馈；不依赖 AI。
4. `INT-PREF-1` 验证没有 AI 也能完成档案、订单快照、摄影师查看和反馈闭环。
5. `EXT-AI-1` 再准备 AI Provider、隐私、成本和保留策略。
6. `WIN-AI-1`、`IOS-AI-1` 先接文字整理、缺失信息追问和档案更新草稿，再生成绑定当前订单地点/时间、参考图标签、本次要求、用户喜欢/收藏和已确认长期偏好的机位/光线/路线/静态姿势参考卡。
7. `IOS-AI-1` 在订单进行中提供“方案清单/导演模式”：文字步骤始终显示；未连接耳机时语音默认关闭，连接耳机且用户进入导演模式时默认开启；用户手动静音后保持静音，耳机断开立即停止语音且不得切到外放。
8. `INT-AI-1` 先验证快速标签、订单绑定方案和文字/耳机语音是否减少前期沟通，再试点用户主动选择的少量照片分析和分场景个人摄影 Skill。
9. `WIN-AI-POST-1`、`IOS-AI-POST-1` 在真实订单媒体链路稳定后，依次试点拍后质检、选片建议、批量色彩/修图草稿和修改意见任务化；`INT-AI-POST-1` 验证是否缩短交付时间并减少返修。
10. 现场试拍图分析、实时取景、连续姿势纠正和自动连拍时机只保留为候选研究，不建立当前 P3 开发节点或验收承诺；只有真实需求证明用户/摄影师自行对照方案不足以解决问题，且设备传图成本可控时才重新立项。

固定边界：

- 长期偏好与本次拍摄需求分开保存；订单使用不可被后来修改反向覆盖的快照。
- 结构化字段是事实源，AI 摘要不是唯一存储。
- AI 观察不能直接写入长期档案，必须由用户确认。
- “过去经常这样拍”不等于“用户喜欢这样拍”；必须追问或确认。
- 首版不申请整个系统相册的批量读取，不把原图默认用于模型训练。
- 不做吸引力评分、外貌缺陷判定、身体诊断或敏感属性推断。
- 摄影师只看到当前订单已授权的最小必要偏好，不看到无关历史照片或原始 AI 推理。
- 机位、光线、路线、构图和姿势只作为创作参考，不是服务验收标准；摄影师可以采用、调整或忽略，平台不得据此自动判责、排名或处罚。
- 参考图上传后只提供“动作”“构图/机位”“光线/色调”“氛围感”“都喜欢”等一键多选标签；标签可跳过、点击即保存，不弹强制二级问卷。
- 参考图默认仅用于当前订单；不得在每次上传时要求用户决定长期用途，只有方案确认或订单完成后才能通过独立的一键确认写入长期偏好。
- 方案必须先满足当前订单地点/时间/场景、安全限制和摄影师设备/服务能力等可执行约束；在可执行范围内，偏好优先级为“当前订单参考图/标签和明确要求 > 用户主动喜欢/收藏 > 已确认长期偏好 > 通用模板”，当前订单必须覆盖历史推断。
- 订单地点、时间、参考图或本次要求变化后，旧方案必须标记为过期并由双方主动重新生成，不能静默改写已确认方案快照。
- 导演模式以短文字步骤为事实源，语音只是可关闭的辅助输出；没有耳机时不得默认外放，耳机断开时不得把正在播放的内容转到扬声器。
- 拍后 AI 只能处理当前订单明确授权的媒体；原片不可覆盖，建议选片、调色和修图草稿必须保留来源与版本，并由摄影师确认后才进入交付候选。

### 0.9 用户与摄影师双边忠诚度固定路线

忠诚度建设属于 TestFlight 稳定后的 P2/P3 增长工作，不得插队阻塞 P0 Release Candidate。Still 不以签到、复杂积分、强制独家或禁止摄影师发布站外作品制造表面留存；先用可信交易、复约便利、可迁移的用户偏好、稳定收益和透明成长规则形成真实留存，再评估经济激励。

固定顺序：

1. 先完成真实咨询、需求快照、支付托管、交付、结算、客服、通知和埋点基础；这些能力未生产化时不得启动忠诚度权益。
2. `EXT-LOYALTY-1` 定义用户复约、摄影师认证、作品来源标识、等级、服务恢复、通知和反跳单规则，并完成双端轻量研究。
3. `WIN-LOYALTY-1` 建立用户—摄影师关系、复约上下文、认证/作品证据、摄影师成长指标和服务恢复的服务端事实源。
4. `IOS-LOYALTY-1` 上线用户“常约摄影师/再次预约”和摄影师“回头客/成长与收益”轻量入口，不新增一套平行交易流程。
5. `INT-LOYALTY-1` 验证复约、跨摄影师偏好复用、认证作品、摄影师成长和服务恢复闭环；使用 90/180 天低频业务指标判断价值。
6. 只有 `INT-LOYALTY-1` 证明便利、信任和供给工具有效，且 `EXT-LOYALTY-2` 批准单位经济后，才能启动 `WIN-LOYALTY-2`、`IOS-LOYALTY-2` 的会员、成长值、复约优惠、降佣或推荐奖励试点。
7. `INT-LOYALTY-2` 只做可关闭、可限城市/人群、可审计的经济激励实验；不能证明增量复购或摄影师留存时停止扩大。
8. AI 只能在上述结构化关系和偏好闭环之后降低表达、复约和运营成本，不能用不透明模型分数决定摄影师生计或用户权益。

固定边界：

- 用户忠诚度目标是“继续通过 Still 解决拍摄需求”，既包括复约同一摄影师，也包括带着偏好档案安全更换摄影师；不能把用户绑定单一供给者当作唯一成功。
- 摄影师忠诚度来自高质量线索、复约客户、可信作品证明、结算/取消保障、工作台效率和透明成长权益；惩罚和消息风控只能作为明确规则下的补充。
- “平台认证摄影师”和“平台订单验证作品”必须分开：摄影师完成身份/能力/履约审核后可获得认证和透明曝光资格；站外作品仍可上传，但必须标记为人工审核或创作者自述来源，不能冒充平台成交作品。
- 不采用“认证摄影师只能上传平台订单作品”的封闭规则；平台订单成片获得更强真实性标识，站外作品保留冷启动和展示价值。
- 第一阶段不做签到、每日任务、复杂积分商城、无限补贴、排行榜内卷或默认营销 Push；每个新增入口都必须能被跳过，不延长首单主流程。
- 复约不能复制已过期档期和旧价格；只能复用摄影师、场景、需求和偏好草稿，用户必须重新确认时间、地点、价格、授权和订单快照。
- 摄影师只能看到当前咨询/订单必要的历史关系摘要，例如“已完成 2 次平台订单”，不得获得用户电话、其他摄影师订单或未授权偏好。
- 等级、曝光和降佣规则必须可解释、可申诉、可人工复核；投诉或取消不能未经裁定自动永久降权。
- 所有优惠、成长值、服务恢复额度和佣金变更由服务端账本与版本化规则计算，客户端不得自行决定。

### 0.10 内容驱动的城市与旅行视觉体验升级固定路线

Still 的长期产品定位从单一“摄影陪伴撮合”扩展为“内容驱动的城市与旅行视觉体验平台”：帮助用户从看见心动场景，走到个性化计划、现实体验、可选服务和记忆留存。摄影仍是核心专业能力和首个交易切口，但不再被定义为唯一内容对象或唯一长期服务。

这条产品升级路线属于当前内容和交易主流程上线后的 P2/P3 工作，**不进入当前 P0 Release Candidate，不得改变现有 App Store 上线范围，也不得以长期定位为理由重做当前首页、底部导航或内容 Feed**。

固定顺序：

1. 先按本 Roadmap 完成真实账号、Feed、摄影师资料、咨询、订单、支付、退款、结算、媒体、审核、合规、监控、备份、TestFlight 和 App Store 主流程。
2. 当前版本内容上线后，先验证“内容 → 咨询/支付 → 安全履约 → 成片/反馈”的最小闭环，不新增泛内容社区。
3. 真实交易和内容来源可追踪后，再验证“内容 → 收藏/想去 → 个性化计划”的需求激发链路；外部抖音、小红书、微博等负责早期拉新，Still 站内内容负责承接、计划和转化。
4. 上述链路成立后，才从旅行陪拍扩展到咖啡厅、艺术社区、展览、街区、Citywalk、约会和城市周边等日常视觉体验，并依次试点自助计划、陪伴拍摄和专业摄影服务。
5. 只有内容质量、用户信任、真实到访、复购和单位经济被验证后，才评审商家/场馆/票务接入、更多创作者 UGC 和多城市体验市场。
6. 最后才把 Still 作为关系型个人生活 Agent 的现实体验与记忆模块，结合天气、位置、时间、同行人、偏好和 Vibe 主动准备生活体验。

进入后续产品阶段前必须同时满足：

- `INT-STORE-1` 已完成，或项目主控书面批准等价的稳定公开测试基线；
- 当前 Feed、交易、支付、履约和售后没有生产阻塞；
- 内容来源、收藏/想去、咨询、订单和完成结果具备可追踪数据；
- 已完成第一批真实订单和用户访谈，能够说明下一阶段解决的具体问题；
- 项目主控重新建立明确节点、负责人、成本上限、停止条件和验收指标。

完整产品定义、信任边界、服务梯度和分阶段数据闸门记录在 `STILL_CODE_MODULE_ROADMAP.md` 第 10 节。该节当前不包含最终页面结构决策；页面和导航必须在内容上线后的真实行为数据基础上另行评审。

### 0.11 妆造商家冷启动与模块化组合交易固定路线

本路线是摄影交易内的窄范围 P1 试点，不是提前建设泛商家、本地生活或第三个搜索市场。当前 P0 Release Candidate、TestFlight 和 App Store 主链路不把商家功能作为反向依赖；商家功能以默认关闭的功能开关分阶段交付，`INT-COMBO-1` 完成前禁止真实组合支付。产品、合作和运营规则的事实源为 [Still 妆造商家冷启动合作与组合订单实施方案](./STILL_MERCHANT_COLD_START_PARTNERSHIP_PLAN.md)。

固定顺序：

1. 用户端继续只保留“找作品、找摄影师”两个主要入口；搜索商家名称时仍返回与该商家存在双方确认合作关系的摄影师，不新增“找商家”或“找方案”。
2. 用户先选摄影师和拍摄时间，再在摄影师页选择仅摄影、摄影＋妆造或摄影＋妆造＋服装。冷启动阶段一名摄影师最多展示零个或一个主要合作商家；一个商家可关联多名摄影师。
3. 摄影价格由摄影师预设的时长和需求模块叠加；商家服务采用 1—3 个固定价套餐。服务端汇总总价并保存不可变价格、内容、时间和套餐版本快照，服务方接单时不得改价。
4. 用户看到一份服务清单、一个总价、一次预付款、一个订单状态和一个售后入口；后台必须以服务项分别保存提供方、时间、接单、履约、退款、佣金和结算状态，妆造不得伪装成普通摄影加购项。
5. 用户提交明确的期望妆造时间，摄影师与商家并行接受或拒绝。摄影师普通订单为 4 个有效接单小时，商家为 2 个有效营业小时；不足 24 小时的紧急订单只向主动开启者展示，确认时限 30 分钟。
6. 摄影师拒绝或超时，整单取消并全额退款；商家拒绝或超时，用户可保留摄影或取消整单。普通订单选择时限为 2 个有效小时，紧急订单为 30 分钟，超时默认整单取消并全额退款。
7. 商家接受即代表承诺订单中的明确时间。MVP 不建设门店排期 SaaS、不同步美团/抖音、不要求预留 Still 库存，也不承诺实时商家库存。
8. 组合订单正式确认前不向用户返回商家电话；确认后只显示商家公开营业电话，用于路线、准备和临近时间核对。用户不打电话不影响预约效力，电话中改期仍须回到订单确认。
9. 当前地图 URI 无法返回路线耗时。MVP 以套餐时长和 15/30/60/90 分钟可调交通缓冲推荐妆造时间，只拦截明显不可能的组合，不承诺准确路程或据此自动取消。
10. 服务时间经过后默认正常推进，只有一方发起异常/取消后才归责。确认前或超过 24 小时用户取消全退；不足 24 小时且确认用户责任时，受影响服务项退 80%、20%作为全额归服务方的非计佣档期补偿；服务方责任全退。
11. 改期只重新确认受影响服务项。同日拍摄向后延迟且不影响妆造、服装归还、地点或商家现场安排时，只需用户与摄影师确认。
12. 试点为首笔真实组合订单起 30 个自然日或 10 笔已完成组合订单，先到为准；不收入驻费、软件费或年费。摄影和商家服务项分别按各自计佣基数收取 8%：计价金额＝锁定原价－服务方承担优惠，计佣基数＝计价金额－按服务价值计算的退款－非计佣档期补偿，服务方应结＝计佣基数×92%＋非计佣档期补偿。MVP 支付通道费和平台主动优惠由 Still 承担，平台优惠不降低服务方计价金额；费率变化必须另行书面确认。
13. 用户侧一个订单不等于后台整单结算。服务方标记完成后，用户主动确认即可让该服务项进入可结算；用户未操作时，服务计划结束 72 小时且无异常才自动进入可结算。原则上只冻结争议服务项，只有责任无法拆分、支付异常或整单欺诈风险时才冻结整单。平台先行退款后的扣回必须可通知、可申诉、可审计。平台优惠按服务项保存不可变分摊快照，退款时按退款比例退回或等值补发，现金退款不得超过对应服务项的用户实付金额。
14. 服装押金不进入订单；押金、归还、超时和损坏规则在下单前公开，争议由订单客服处理。
15. 普通用户只可公开 Still 真实订单作品；摄影师站外作品标注为作品集；关注保留，但评论、社交私信、转发链和排行榜不随本路线自动开放。
16. Agent 不进入本 P1。未来只作为菜单后的需求拆解和字段填写器，与手动菜单读写同一结构化需求和服务项草稿；没有真实库存时不能承诺预约，也不得自动付款、改价或取消。

发布闸门：

- `WIN-MERCHANT-0` 只建立兼容的领域骨架，默认关闭，不改变当前纯摄影订单行为；
- `INT-MERCHANT-1` 完成后才允许展示真实商家供给和合作关系；
- `INT-COMBO-1`、`INT-PAY-1` 和 `INT-COMPLIANCE-1` 全部完成后才允许真实组合支付；
- 每家商家必须先通过资料审核和模拟订单，`EXT-MERCHANT-PILOT-1` 完成后才进入受控真实试点。

---

## A. Windows Roadmap

Windows 负责服务端、数据库、地图 WebService 代理、对象存储、支付与结算、后台服务、可靠任务、安全和部署。Windows 禁止修改 `pp-app/ios/**`。

### WIN-BASE-0 对齐首个 Integration 基线

- Priority: P0
- Status: completed
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-BASE-0`
- Scope: 将 Windows 分支以 fast-forward 方式对齐 `origin/codex/integration@6588247c29b2082d310cc96fe110ab67866337f4`。
- Acceptance criteria: Windows HEAD 与远端分支一致并包含 Integration；server MVP、移动端构建、Admin 构建和 production guards 通过。
- Shared files: 无业务修改；只同步既有文件。
- Unblock result: 已解除 `WIN-AUTH-1`、`WIN-MAP-1`、`WIN-DATA-1`、`WIN-MEDIA-1`、`WIN-ADMIN-1`、`WIN-SEC-1` 对 `WIN-BASE-0` 的依赖；各节点仍须满足其余 Roadmap 依赖。
- Result commit: `3cfe65b1dc0f9af2763c8f66d3a0a143f77f64ae`
- Verification: `server: npm.cmd run check:mvp`、`pp-app: npm.cmd run build`、`pp-app: npm.cmd run build:admin`、`pp-app: npm.cmd run check:production-guards`、`git diff --check` 全部通过。
- Notes: 因 Windows 分支与 Integration 已分叉，经用户授权为本节点使用一次普通 merge commit；已合入 `origin/codex/integration@2342d4cefa5375930a58f48e5ccd121ca2627be4`，未执行 reset、rebase 或 force push。保留未提交的 `server/data/store.json`、bundle、tmp 和 zip，未手工修改 `pp-app/ios/**`。

### WIN-AUTH-1 真实短信与生产会话

- Priority: P0
- Status: blocked
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-SMS-1`
- Scope: 投产手机号验证码、腾讯短信发送、验证码过期与限流、会话持久化、角色边界和生产部署。
- Acceptance criteria: 真实手机号可发送和消费验证码；错误、过期、重复消费和频率限制有稳定错误码；consumer/companion session 可跨设备恢复；生产强制配置 `PHONE_OTP_PEPPER`。
- Shared files: `pp-app/src/services/authService.ts`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 暂未解除 `IOS-AUTH-1`；生产 API、离线测试、非敏感配置和稳定成功/失败契约已就绪，仍需 `EXT-SMS-1` 完成运营商报备并验证真实发送。
- Result commit: `6376a8fc4d599219746b11afb2e0581f82ffae2c`（离线可完成部分）
- Verification: `server: npm.cmd run check:mvp`、`pp-app: npm.cmd run build`、`pp-app: npm.cmd run build:admin`、`pp-app: npm.cmd run check:production-guards`、`git diff --check` 全部通过；未执行真实短信发送。
- Notes: 已完成腾讯短信 Provider 与 +86/模板参数环境校验、验证码生成/过期/冷却/手机号与 IP 小时限流/最大尝试次数、失败投递计数、稳定错误码与日志脱敏、持久会话/固定过期/重新登录/撤销、consumer/companion/admin 角色边界及 Mock/失败/生产 guard 测试。节点仅因 `EXT-SMS-1` 运营商报备阻塞，报备完成并验证真实发送前不得标记 completed；未提交任何敏感凭据，未修改 `pp-app/ios/**`。

### WIN-MAP-1 地图 WebService Provider 适配层

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-MAP-1`
- Scope: 建立由 `MAP_PROVIDER` 选择实现的 Provider 适配层及服务端地图代理；覆盖输入提示、POI 文本搜索、周边搜索、地理编码和逆地理编码，并为业务返回统一地点结构。
- Acceptance criteria: 客户端通过统一业务 API 获取标准化 POI；WebService Key 不下发；超时、配额、Provider 错误有稳定错误码；输入和返回经过校验；关键查询有合理限流与缓存。
- Shared files: `server/.env.example`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供代理端点、请求/响应契约、错误码、测试用例和 commit SHA，解除 `IOS-MAP-1`。
- Result commit: pending
- Verification: pending
- Notes: P0 只实现 `EXT-MAP-1` 最终选定的一家 Provider，但接口和错误模型不得绑定其专有返回结构；其他候选只保留适配扩展点，不要求同时接入。

### WIN-MAP-2 地点域模型与附近匹配

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MAP-1`
- Scope: 建立 `places`、地点别名、父子区域、半径或 GeoJSON、服务范围、热门地点和附近匹配；订单保存地点快照。
- Acceptance criteria: 地点可保存 `providerPoiId`、名称、地址、经纬度、区域 ID 和 Provider；支持商圈、艺术园区、道路、滨江区域；附近摄影师按真实距离和服务范围匹配；订单历史不受地点后续修改影响。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供迁移、地点/区域 API、距离规则、订单字段和测试数据，解除 `IOS-MAP-2`。
- Result commit: pending
- Verification: pending
- Notes: 数据库迁移必须同时更新 SQL、Prisma 和 schema parity。

### WIN-DATA-1 Feed、摄影师资料、作品和收藏生产化

- Priority: P0
- Status: completed
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`
- Scope: 将 Feed、摄影师公开资料、作品、收藏/关注的读取与写入切换到 PostgreSQL。
- Acceptance criteria: 生产接口支持分页、刷新和跨设备恢复；API 失败返回明确错误；生产模式不静默返回 mock、localStorage 或空数组；权限和资源归属有效。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 已提供 Feed、公开摄影师资料/作品、本人资料/投稿、收藏/点赞/关注端点，统一游标分页契约、收藏目标索引迁移、生产 guard 和实现 commit SHA；解除 `IOS-DATA-1`，并解除 `WIN-DATA-2A` 的数据前置依赖。
- Result commit: `b415a9086cf08cb2e6e229acfbcc3ec66a118984`
- Verification: `server: npm.cmd run check:mvp`、`pp-app: npm.cmd run build`、`pp-app: npm.cmd run build:admin`、`pp-app: npm.cmd run check:production-guards`、`git diff --check` 全部通过。
- Notes: 生产读写已切换到 PostgreSQL content gateway，分页、权限/资源归属、稳定错误和跨设备收藏状态均有回归覆盖；development mock 仅在非生产 guard 下保留。作品写入要求持久化 HTTPS 媒体 URL，完整 COS 上传与 `media_assets` 生命周期由 `WIN-MEDIA-1` 继续完成；未手工修改 `pp-app/ios/**`。

### WIN-DATA-2A 订单 PostgreSQL 权威读取与恢复

- Priority: P0
- Status: in_progress
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-1`
- Scope: 将用户与摄影师订单列表、订单详情、状态日志、加购和既有文本/坐标地点字段切换为请求级 PostgreSQL 权威读取；实现按资源归属过滤的稳定 keyset 分页、明确刷新语义和公开白名单 DTO，移除订单读取对全局最新 100 条启动快照及生产 JSON 主数据的依赖。
- Acceptance criteria: 用户只能读取自己的订单，摄影师只能读取 `companion_id` 与本人匹配的订单；`role`、`status`、`limit` 和 opaque cursor 均严格校验；列表返回稳定的 `items`、`nextCursor` 和 `hasMore`，超过 100 条交错订单仍无重复、遗漏或串单；详情从 PostgreSQL 恢复状态日志、加购和既有 `place_name/place_address/place_lat/place_lng` 快照；不存在与无权限采用统一且不泄露资源存在性的策略；公开 DTO 不返回平台佣金、服务方收入、结算状态或原始价格快照；两个独立 session 可恢复同一服务端状态；数据库失败返回明确错误，不伪装为空数组；生产订单读取不使用 JSON、mock 或全局 read model；现有纯摄影订单写入和状态流无回归。
- Shared files: `server/server.mjs`, `server/security/requestSecurity.mjs`, `server/store/**`, `server/scripts/**`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 仅满足 `WIN-DATA-2` 的订单权威读取内部前置；不解除 `IOS-DATA-2`、`WIN-MSG-1`、`WIN-PAY-1`、`WIN-MERCHANT-1`、`INT-DATA-1` 或任何组合交易节点。
- Result commit: pending
- Verification: pending
- Notes: 本节点不实现咨询、报价转订单、成片工作区、客户端页面接入、消息、支付或媒体；只透传既有 legacy 地点名称、地址和坐标，不创建或推断 `placeId`、Provider POI、区域、别名、服务范围或附近匹配。对 feature-gated `serviceItems` 只保持现有行为无回归，不把它作为本节点验收或解锁条件，完整服务项仍由 `WIN-MERCHANT-0`、`WIN-MERCHANT-1` 负责。子切片完成后父 `WIN-DATA-2` 仍保持 pending，所有原下游继续依赖父节点。

### WIN-DATA-2 咨询、订单工作区、结构化地点和跨设备恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2A`, `WIN-MAP-2`
- Scope: 在 `WIN-DATA-2A` 基础上，将咨询、版本化报价、报价接受/关闭/转订单关联、成片订单工作区以及 `WIN-MAP-2` 提供的结构化地点标识和不可变地点快照接入 PostgreSQL，并对完整数据链路做聚合验收。
- Acceptance criteria: 用户和摄影师只访问自己的咨询、订单和工作区资源；咨询创建、报价、接受、关闭和转订单关联由服务端校验并具备事务与幂等语义；工作区不能由客户端修改支付、退款、结算或资金状态；订单与咨询保存当时的 Provider、Provider POI ID、地点名称、地址、经纬度、区域和快照版本，地点资料或别名后续变化不改写历史；订单分页、详情和状态刷新继续真实可用；卸载重装或换设备后可恢复；读取失败不伪装成功；`WIN-DATA-2A` 的权限、分页、公开 DTO 和跨会话恢复全部回归通过。
- Shared files: `database/schema.sql`, `database/prisma/schema.prisma`, `database/migrations/**`, `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`, `server/**`
- Unblock result: 提供订单/咨询契约、权限矩阵、真实库验证和 commit SHA，解除 `IOS-DATA-2`、`WIN-MSG-1`。
- Result commit: pending
- Verification: pending
- Notes: 禁止用 JSON store 作为生产主数据。`WIN-DATA-2A` 完成只作为本节点的局部实现证据，不改变本节点状态，也不提前解除任何下游依赖；咨询参考图和工作区媒体只能引用经 `WIN-MEDIA-1` 验证的持久化资产，不能保存 data URL 或任意临时外链。

### WIN-MERCHANT-0 商家与组合订单服务项领域骨架

- Priority: P1
- Status: blocked
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-1`
- Scope: 在不改变当前纯摄影交易行为的前提下，建立商家、固定价套餐、摄影师—商家双方确认合作关系和订单服务项的 PostgreSQL/Prisma/API 领域骨架；历史纯摄影订单可兼容表示为一个摄影服务项；功能开关默认关闭。
- Acceptance criteria: SQL、Prisma、迁移和 API 类型一致；商家营业电话具备非公开字段语义；服务项可分别保存提供方、服务类型、价格/内容/时间快照、接单、履约、退款和结算状态；摄影套餐必须属于订单摄影师，已有服务项的订单不能删除最后一个服务项；功能开关开启时纯摄影服务项随支付、确认、完成、取消、退款和争议状态原子同步；一名摄影师最多一个已确认主要商家；迁移可重复执行且不改变历史订单金额/状态；生产主流程不读取 mock/JSON 商家数据；当前纯摄影回归通过。
- Shared files: `database/schema.sql`, `database/prisma/schema.prisma`, `database/migrations/**`, `database/API_CONTRACT.md`, `server/store/postgresStore.mjs`, `server/store/postgresMappers.mjs`, `pp-app/src/types/api.ts`, `server/scripts/**`
- Unblock result: 提供迁移、schema parity、领域约束、mapper/read-model 和纯摄影兼容验证及 commit SHA，解除 `WIN-MERCHANT-1` 的领域依赖。
- Result commit: pending
- Verification: 本地 schema parity、组合订单领域约束、mapper/read-model、纯摄影订单写入及支付/确认/完成/取消/退款/争议生命周期同步检查通过；`server npm.cmd run check:mvp`、移动端 build、Admin build、production guards 和 `git diff --check` 通过。2026-08-23 已新增安全隔离的 PostgreSQL 16 迁移验收脚本与 CI 步骤：CI 将从固定的商家骨架前置 commit 加载 schema/seed，并将在专用本地数据库连续执行迁移两次，验证历史订单不变、回填幂等、复合外键、最后服务项保护和延迟金额守恒；本地静态检查及误连远程主机、错误库名、缺少显式授权的拒绝测试通过。当前机器仍无 `psql`、Docker/Podman，专用 PostgreSQL 16 实例尚未实际运行，因此真实迁移验收仍未完成；真实库中的订单生命周期同步也不能由本地 mock 事务测试替代。
- Notes: 本节点是隔离的数据骨架，功能开关默认关闭，组合支付继续硬关闭；不实现商家登录、用户 UI、组合支付、部分退款或多方结算。`server/.env` 虽存在远程数据库配置，但只读普通/TLS 连接均被远端终止，且该目标未被确认是一次性测试库，因此未对其执行任何写入；迁移演练脚本刻意忽略应用 `DATABASE_URL`，只接受 localhost、固定测试库名和显式危险测试开关。等待该 CI 在推送后运行并取得完整 SHA；若 CI 未通过，再在明确的一次性 PostgreSQL 16 环境复现处理。

### WIN-MERCHANT-1 商家、固定套餐与摄影师合作搜索服务端

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MERCHANT-0`, `WIN-DATA-2`, `EXT-MERCHANT-1`
- Scope: 建立运营辅助入驻、商家成员权限、固定套餐版本、合作关系双方确认，以及“搜索商家名称仍召回真实合作摄影师”的服务端查询；正式确认前不向用户返回商家营业电话。
- Acceptance criteria: 商家和套餐来自 PostgreSQL；套餐变更不覆盖订单快照；合作关系不可由一方伪造；解除关系后搜索不再命中；一名摄影师最多一个主要商家；普通摄影师搜索无回归；电话字段按订单确认状态服务端脱敏；功能开关关闭时不影响现有页面和 API。
- Shared files: `database/**`, `server/**`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, Admin 商家录入页面
- Unblock result: 提供迁移/API、权限矩阵、搜索和电话脱敏测试及 commit SHA，解除 `IOS-MERCHANT-1`、`INT-MERCHANT-1`。
- Result commit: pending
- Verification: pending
- Notes: 冷启动由运营辅助录入；生产商家自主短信登录仍依赖 `WIN-AUTH-1`，本节点不得以测试账号冒充该验收。

### WIN-COMBO-1 组合报价、并行接单、分项退款与结算服务端

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MERCHANT-1`, `WIN-PAY-2`, `WIN-SETTLE-1`, `WIN-NOTIFY-1`, `EXT-MERCHANT-1`
- Scope: 实现摄影模块叠加价、商家固定套餐价、服务端锁价、一次预付款、平台优惠服务项分摊、摄影师/商家并行接单、有效营业小时截止任务、拒绝分支、受影响服务项改期/退款、每服务项 8%佣金、非计佣档期补偿、分项结算、争议冻结和平台先行退款扣回。
- Acceptance criteria: 订单父支付金额等于各服务项用户应付金额之和；每项满足“用户应付＋平台优惠＝计价金额”，整单金额守恒；正常 100 元应结 92 元、10 元平台券后仍应结 92 元、用户责任取消退 80 元时 20 元补偿全额归服务方且佣金为 0；优惠券退款按服务项分摊比例退回或等值补发；接单和截止任务幂等；摄影师拒绝整单全退；商家拒绝后用户可保留摄影或取消整单，选择超时按规则全退；电话只在双方接受后返回；默认不因迟到自动取消；20%/80%只作用于归责后的受影响服务项；同日只延后拍摄且商家不受影响时不要求其重接；服务方标记完成且用户确认后可立即进入可结算，用户未操作时结束 72 小时无异常才自动进入；每服务项结算、退款冲正、冻结和先赔后扣可审计且不重复；现有纯摄影流程无回归。
- Shared files: `database/**`, `server/**`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, Admin 财务/争议页面
- Unblock result: 提供状态机、并发/幂等、金额守恒、部分退款、分项结算、电话脱敏和纯摄影回归结果及 commit SHA，解除 `IOS-COMBO-1`、`INT-COMBO-1`。
- Result commit: pending
- Verification: pending
- Notes: `INT-PAY-1` 和支付/合规确认完成前只可在测试环境验证，不得开放真实组合支付；不在客户端计算佣金或最终退款。

### WIN-MSG-1 真实聊天同步、分页和发送可靠性

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`
- Scope: 完成会话列表、消息分页、发送幂等、失败重试、风险状态和跨设备同步。
- Acceptance criteria: 消息顺序稳定；分页游标可持续读取；重复请求不产生重复消息；失败可安全重试；会话权限和风险审计有效；生产不读取本地会话兜底。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供聊天契约、重试语义、错误码、分页测试和 commit SHA，解除 `IOS-MSG-1`、`WIN-NOTIFY-1`。
- Result commit: pending
- Verification: pending
- Notes: 实时传输方案可先轮询或受控刷新，不能牺牲数据一致性。

### WIN-MEDIA-1 COS、media_assets 和上传安全

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-CLOUD-1`
- Scope: 投产 COS 临时授权；建立 `media_assets` 元数据、用途、尺寸、类型、归属和审核状态。
- Acceptance criteria: MIME、后缀、大小和用途同时校验；上传凭据最小权限且短时有效；媒体记录写入 PostgreSQL；生产拒绝 data URL/mock 存储；删除和失效可追踪。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供上传策略契约、允许类型/大小、媒体状态、真实 COS 检查和 commit SHA，解除 `IOS-MEDIA-1`、`WIN-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: Secret Key 禁止进入客户端。

### WIN-PAY-1 iOS 支付服务端契约

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`, `EXT-PAY-1`
- Scope: 根据确认的 iOS 支付渠道建立服务端下单、签名、状态查询和订单恢复契约。
- Acceptance criteria: iOS 不依赖 `wx.requestPayment`；支付请求绑定用户、订单和金额；重复下单幂等；客户端只接收必要参数；支付渠道符合产品类型和审核要求。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供支付渠道、客户端调用契约、测试商户说明、错误码和 commit SHA，解除 `IOS-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 未完成 `EXT-PAY-1` 前不得把 mock success 作为生产验收。

### WIN-PAY-2 支付回调、退款、重试和对账

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-PAY-1`
- Scope: 完成支付/退款回调验签、幂等、失败重试、退款终态、日常对账和异常记录。
- Acceptance criteria: 回调可重放且不产生重复副作用；退款状态推进正确；失败进入可靠重试；订单、支付、退款和 Provider 账单可核对。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供回调/退款测试、重试结果、对账说明和 commit SHA，解除 `IOS-REFUND-1`、`WIN-SETTLE-1`。
- Result commit: pending
- Verification: pending
- Notes: Provider 原始事件保留时必须脱敏并限制访问。

### WIN-SETTLE-1 佣金、摄影师结算和异常冻结

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-PAY-2`
- Scope: 明确平台佣金、摄影师应结算金额、结算周期、退款冲正、异常冻结和人工处理。
- Acceptance criteria: 每笔完成订单可追溯到结算与账本；退款可冲正；异常可冻结；Admin 可查看并审计人工操作；金额使用整数分并保持幂等；平台费率只有一个服务端版本化事实源，清理当前 8%/10%/15% 的前后端不一致；基础模型可以由 `WIN-COMBO-1` 扩展为每服务项一笔结算，不能把摄影师写死为永久唯一收款方。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供结算状态机、账本测试、Admin 操作要求和 commit SHA，解除 `IOS-OPS-1`、`WIN-ADMIN-2` 的财务部分。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端计算最终佣金或结算金额。P0 仍只验收单摄影师结算；商家分项结算、72 小时窗口和争议项冻结由 `WIN-COMBO-1` 完成。

### WIN-COMPLIANCE-1 用户合规数据闭环

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-AUTH-1`, `EXT-COMPLIANCE-1`
- Scope: 服务端实现隐私/协议版本记录、定位授权记录、账号删除、数据导出、举报和客服申请。
- Acceptance criteria: 用户可提交并查询删除申请；删除流程覆盖业务数据和法定保留例外；可导出用户数据；授权版本和时间可审计；客服/举报不依赖 localStorage。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供合规 API、数据范围、审计结果、政策 URL 和 commit SHA，解除 `IOS-COMPLIANCE-1`。
- Result commit: pending
- Verification: pending
- Notes: 法定保留范围由 `EXT-FILING-1` 和正式合规意见确认。

### WIN-ADMIN-1 Admin 独立部署和权限边界

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`, `EXT-DOMAIN-1`
- Scope: 将 Admin 独立构建部署到受保护域名，使用独立登录、token、权限和审计。
- Acceptance criteria: 移动端包不包含 Admin 入口；Admin 独立域名和 HTTPS 可用；普通 token 不能访问 Admin API；Admin token 不能冒充普通用户；敏感操作有审计。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`, `pp-app/vite.admin.config.ts`
- Unblock result: 提供 Admin URL、权限矩阵、构建/部署验证和 commit SHA，解除 `WIN-ADMIN-2`。
- Result commit: pending
- Verification: pending
- Notes: Admin 密钥和账号禁止写入仓库。

### WIN-SEC-1 统一鉴权、校验和可追踪错误

- Priority: P0
- Status: completed
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-BASE-0`
- Scope: 统一鉴权中间层、输入校验、全局/敏感接口限流、request ID、稳定错误码和日志脱敏。
- Acceptance criteria: 关键路由不重复手写不一致的权限判断；非法输入在入口拒绝；每个请求可追踪；手机号、token、密钥和支付字段不出现在明文日志；密钥支持轮换。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 已提供集中路由鉴权策略、JSON/大小/对象安全入口校验、全局与敏感接口限流、request ID、稳定安全错误码、日志脱敏样例和双密钥轮换测试；解除 `WIN-DELIVERY-1` 的安全前置依赖（仍等待 `EXT-CLOUD-1`、`EXT-DOMAIN-1`）。
- Result commit: `123e903caa63fdc593a71c98e590567f7af21ac0`
- Verification: `server: npm.cmd run check:mvp`、`pp-app: npm.cmd run build`、`pp-app: npm.cmd run build:admin`、`pp-app: npm.cmd run check:production-guards`、`git diff --check` 全部通过。
- Notes: 业务函数保留角色与资源归属二次保护；生产未知异常只返回 request ID，不回传内部错误。当前进程内限流覆盖单实例和敏感端点，多实例统一配额与边缘限流由 `WIN-DELIVERY-1` 在部署层补齐；支付回调支持当前/上一把 API v3 密钥和平台公钥的短期轮换窗口。未手工修改 `pp-app/ios/**`。

### WIN-DELIVERY-1 环境、不可变发布和回滚

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-SEC-1`, `EXT-CLOUD-1`, `EXT-DOMAIN-1`
- Scope: 建立 dev/staging/production 分层、CI 质量门、按 Git commit 构建的不可变发布、版本切换、健康验证和应用回滚；禁止在线编辑生产源码。
- Acceptance criteria: staging 与 production 密钥/数据库隔离；发布物记录完整 commit SHA、构建时间和迁移版本；生产使用独立低权限运行账号；新旧版本目录可切换；`/api/health` 和 `/api/ops/launch-check` 可用；失败可回滚上一版本；发布步骤不依赖服务器内手工改源码；CI 覆盖 server、PostgreSQL、mobile 和 Admin。
- Shared files: `.github/workflows/**`, `deploy/**`, `server/.env.example`, `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供 staging/production 非敏感地址、部署 SHA、发布记录、回滚结果和健康检查，解除 `WIN-OBS-1`、`WIN-BACKUP-1`、`IOS-CRASH-1` 的部署依赖。
- Result commit: pending
- Verification: pending
- Notes: `.env` 和真实凭据禁止提交；应用回滚不等于数据库回滚，不可逆迁移必须单独确认。

### WIN-OBS-1 后端可观测性和告警信号

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DELIVERY-1`, `EXT-OBS-1`
- Scope: 提供外部探测需要的健康信号、结构化日志、版本标识和关键故障告警，不把 systemd 自动重启当作监控。
- Acceptance criteria: 健康检查覆盖 API、store driver 和必要依赖但不泄露敏感信息；日志包含 request ID、环境、版本和稳定错误码；连续 5xx、数据库不可用、维护任务失败、支付/退款回调失败、磁盘或容量阈值可触发告警；测试事件能到达主要和备用负责人；日志与告警不含 token、手机号、密钥、支付或聊天明文。
- Shared files: `server/**`, `deploy/**`, `server/.env.example`, `database/API_CONTRACT.md`
- Unblock result: 提供测试告警、脱敏事件样例、版本映射和 commit SHA，解除 `INT-OPS-1` 的后端观测依赖。
- Result commit: pending
- Verification: pending
- Notes: 监控 Provider 账号、通知联系人和数据区域由 `EXT-OBS-1` 确认。

### WIN-BACKUP-1 备份、迁移保护和恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DELIVERY-1`, `EXT-CLOUD-1`
- Scope: 固化 PostgreSQL 和对象存储备份要求、迁移前恢复点、隔离恢复步骤、数据校验与恢复记录。
- Acceptance criteria: 明确首发 RPO/RTO 和保留周期；至少一份备份与生产实例故障域分离；高风险 migration 前创建恢复点并记录版本；从备份恢复到隔离环境后，用户、订单、支付、消息和审计关键数据校验通过；COS/OSS 误删或覆盖有恢复方法；恢复过程不写入或破坏生产。
- Shared files: `database/**`, `server/**`, `.github/workflows/**`, 非敏感恢复 Runbook
- Unblock result: 提供脱敏备份策略、隔离恢复结果、数据校验和 commit SHA，解除 `INT-OPS-1` 的数据恢复依赖。
- Result commit: pending
- Verification: pending
- Notes: 数据库备份、导出文件、连接串和真实内部地址禁止进入 Git。

### WIN-NOTIFY-1 站内通知与可靠任务

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MSG-1`, `WIN-PAY-2`
- Scope: 建立站内通知、订单/支付/退款/审核事件通知，以及必要短信/Push 的可靠任务。
- Acceptance criteria: 通知有持久化、已读状态、分页和幂等；任务可重试并有失败记录；订单、支付、退款和审核事件均有模板；Provider 短暂失败不丢事件。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供通知契约、事件矩阵、任务重试测试和 commit SHA，解除 `IOS-NOTIFY-1`。
- Result commit: pending
- Verification: pending
- Notes: Push Provider 由 iOS 能力和外部资源共同确认。

### WIN-ADMIN-2 运营处理闭环

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-ADMIN-1`, `WIN-COMPLIANCE-1`, `WIN-SETTLE-1`
- Scope: 完成举报、审核、内容下架、封禁、客服、退款、争议、财务、热门地点、风险地点和安全提示运营。
- Acceptance criteria: 每种 case 有状态机、负责人和审计；内容/用户/订单副作用可追踪；地点运营可维护热门与风险提示；财务人工处理必须双重确认或明确权限。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供运营矩阵、权限、审计样例和 commit SHA，解除 `IOS-OPS-1`、`WIN-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: P0 只要求上线必需的最小运营能力，扩展报表留到 P2。

### WIN-MEDIA-2 媒体审核和违规处置

- Priority: P1
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MEDIA-1`, `WIN-ADMIN-2`
- Scope: 图片/视频审核、审核状态、违规下架、申诉和关联内容处置。
- Acceptance criteria: 媒体上传后可进入审核流程；违规媒体不可继续公开访问；操作有审计；原内容和派生内容关系可追踪。
- Shared files: `pp-app/src/types/api.ts`, `database/API_CONTRACT.md`
- Unblock result: 提供状态机、审核 API、下架验证和 commit SHA，解除 `IOS-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: 自动审核 Provider 可后续替换，首版必须支持人工闭环。

### WIN-SEARCH-1 地点搜索和别名优化

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-MAP-2`, `INT-RC-1`
- Scope: 优化地点别名、热度、用户输入纠错、搜索排序和 Provider 配额使用。
- Acceptance criteria: 常见道路、商圈、园区和滨江表达可稳定命中；排序指标可解释；缓存不会返回过期风险地点。
- Shared files: `pp-app/src/types/api.ts`
- Unblock result: 提供搜索质量样例、指标和 commit SHA，解除 `IOS-SEARCH-1`。
- Result commit: pending
- Verification: pending
- Notes: 不阻塞首轮 TestFlight。

### WIN-ANALYTICS-1 埋点和运营报表

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-RC-1`, `EXT-ANALYTICS-1`
- Scope: 建立关键漏斗、订单转化、搜索、支付失败和留存事件。
- Acceptance criteria: 事件字典稳定；敏感字段不进入分析平台；环境可区分；Admin 可查看最小运营报表。
- Shared files: `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供事件字典、数据验证和 commit SHA，解除 `IOS-ANALYTICS-1`。
- Result commit: pending
- Verification: pending
- Notes: 必须先完成隐私披露。

### WIN-PREF-1 拍摄偏好档案、订单快照和拍后反馈

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`, `WIN-MEDIA-1`, `INT-TESTFLIGHT-1`, `EXT-PREF-1`
- Scope: 建立用户长期拍摄偏好、参考图授权及快速标签、本次拍摄需求、订单偏好快照、拍后反馈和偏好变更日志；参考图默认仅用于当前订单，后续写入长期偏好必须独立确认；第一版使用结构化字段和规则模板，不依赖 AI。
- Acceptance criteria: 长期偏好与单次需求分离；快速标签可多选、可跳过、点击即保存且不弹强制二级问卷；订单快照不受后续修改影响；用户可查看、修改、撤回授权、导出和删除；摄影师只能读取当前订单已授权字段；参考图访问、用途、保留和删除可审计；未经独立确认不能把单次参考图标签写入长期偏好；生产不回退 localStorage。
- Shared files: `database/schema.sql`, `database/prisma/schema.prisma`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供迁移、API、权限矩阵、删除/撤权验证和 commit SHA，解除 `IOS-PREF-1`。
- Result commit: pending
- Verification: pending
- Notes: 第一版不接视觉模型，不申请批量相册权限；AI 摘要不能替代结构化事实源。

### WIN-LOYALTY-1 双边关系、复约与摄影师可信成长基础

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-2`, `WIN-SETTLE-1`, `WIN-NOTIFY-1`, `WIN-ANALYTICS-1`, `WIN-PREF-1`, `EXT-LOYALTY-1`
- Scope: 复用真实订单、收藏/关注、偏好和通知数据，建立用户—摄影师关系摘要、再次预约草稿、常约摄影师、档期订阅、服务恢复记录、摄影师认证状态、作品来源证据和可解释成长指标；第一版不建立积分钱包。
- Acceptance criteria: 完成订单后才能累计平台复约和履约指标；复约只复用草稿且重新校验档期/价格/授权；用户可关闭档期通知；摄影师只能读取当前交易必要的关系摘要；平台订单作品、人工审核站外作品和自述站外作品来源可区分；认证/等级/曝光依据可查询、可申诉、可人工纠正；服务恢复额度防重复领取；生产不使用 localStorage 作为事实源。
- Shared files: `database/schema.sql`, `database/prisma/schema.prisma`, `database/API_CONTRACT.md`, `server/**`, `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供迁移、API、权限矩阵、来源证据/复约/通知/申诉验证和 commit SHA，解除 `IOS-LOYALTY-1`。
- Result commit: pending
- Verification: pending
- Notes: 优先复用现有收藏、订单、偏好、通知和结算模型；不得把复杂 CRM、手机号导出或自动营销纳入第一版。

### WIN-RECO-1 推荐与附近排序

- Priority: P2
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-DATA-1`, `WIN-MAP-2`, `WIN-ANALYTICS-1`
- Scope: 基于真实地点、服务范围、档期、质量和用户行为优化推荐。
- Acceptance criteria: 推荐输入可追踪；没有数据时有确定性降级；不得泄露敏感位置；可离线评估基本指标。
- Shared files: `pp-app/src/types/api.ts`
- Unblock result: 提供排序规则、评估结果和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: P0/P1 完成前不得启动。

### WIN-AI-1 AI 偏好服务与受控照片理解

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-PREF-1`, `EXT-AI-1`
- Scope: 在非 AI 偏好闭环验证有效后，建立统一 AI Gateway，先提供偏好文字整理、缺失信息追问和档案更新草稿；先按订单地点/时间/场景、安全限制和摄影师能力过滤不可执行方案，再按“本次参考图/标签与明确要求 > 喜欢/收藏 > 已确认长期偏好 > 通用模板”生成可选的机位、光线、路线、构图和静态姿势参考卡，并保存输入版本和方案快照；后续仅处理用户主动选择的少量照片，生成有来源、场景和置信度的可确认观察。
- Acceptance criteria: 前端不持有 Provider key；每次调用记录功能、模型、prompt 版本、输入版本、成本和采纳反馈；AI 输出通过 schema 校验；当前订单覆盖历史推断；拍摄参考必须标明地点/时间/参考图等依据、有效范围和安全限制，摄影师可采用/调整/忽略；订单关键输入改变后旧方案标记过期且不静默覆盖；未经用户确认不能更新长期偏好；原图、视觉观察和已确认偏好分层存储并可分别删除；AI 失败不影响档案、预约或订单。
- Shared files: `server/routes/ai.mjs`, `server/services/ai/**`, `database/**`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供文字偏好、可选拍摄参考、有限照片分析接口及日志/限流/删除验证和 commit SHA，解除 `IOS-AI-1`。
- Result commit: pending
- Verification: pending
- Notes: 当前暂停至 `INT-PREF-1` 和 `EXT-AI-1` 完成；不允许吸引力评分、外貌缺陷判定、身体诊断或敏感属性推断。

### WIN-AI-POST-1 拍后质检、选片与后处理 Copilot 服务端

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `WIN-AI-1`, `INT-MEDIA-1`, `EXT-AI-1`
- Scope: 仅处理当前订单明确授权的媒体，建立重复/连拍分组、模糊/闭眼/曝光等技术质检、候选选片、批量白平衡/色彩/轻修草稿、用户修改意见任务化和原片—派生版本记录；定位为摄影师 Copilot，不自动交付成片。
- Acceptance criteria: 原片不可覆盖且可随时回退；每个建议和派生版本可追溯到订单、原片、模型、参数、成本和操作者；摄影师可批量采用、单张调整或全部拒绝；人脸/身体重塑等高敏修改需要单独授权；AI 失败不阻塞人工选片、修图和交付；权限、删除、限流和成本开关通过验证。
- Shared files: `server/routes/ai.mjs`, `server/services/ai/**`, `database/**`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供媒体质检、选片建议、后处理草稿、版本回退、授权/删除和成本验证及 commit SHA，解除 `IOS-AI-POST-1`。
- Result commit: pending
- Verification: pending
- Notes: 第一版只做可解释的技术质检和保守草稿，不做自动瘦身、换脸、批量风格覆盖或未经摄影师确认的自动交付。

### WIN-LOYALTY-2 会员、成长权益和复约经济实验服务端

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-LOYALTY-1`, `EXT-LOYALTY-2`
- Scope: 在单位经济获批后，为可选会员、用户复约权益、服务恢复额度、摄影师成长权益、阶段性降佣和推荐奖励建立版本化规则、账本、预算上限、反作弊、灰度和 Kill Switch；不得默认同时上线全部方案。
- Acceptance criteria: 每笔权益可追溯到规则版本、订单和活动；退款/取消/争议可正确冲正；预算与单用户/摄影师上限生效；客户端不能篡改；规则可按城市/人群关闭；财务可对账；实验停止后不产生新负债；等级权益不依赖不透明 AI 分数。
- Shared files: `database/**`, `server/**`, `database/API_CONTRACT.md`, `pp-app/src/types/api.ts`, `docs/**`
- Unblock result: 提供账本、冲正、反作弊、灰度、Kill Switch、财务对账和 commit SHA，解除 `IOS-LOYALTY-2`。
- Result commit: pending
- Verification: pending
- Notes: 具体启用项由 `EXT-LOYALTY-2` 逐项批准；没有增量证据时保持关闭。

### WIN-MINI-1 微信小程序服务端

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-MINI-1`
- Scope: 微信登录、支付、位置和小程序审核所需服务端能力。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: 解除 `IOS-MINI-1`。
- Result commit: pending
- Verification: pending
- Notes: 当前暂停。

### WIN-PLATFORM-1 平台工程升级

- Priority: P3
- Status: pending
- Owner branch: `codex/vertical-db-api`
- Depends on: `INT-STORE-1`
- Scope: 根据生产数据决定是否拆分服务、独立队列或升级平台架构。
- Acceptance criteria: 以真实瓶颈和故障数据为依据。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 禁止在 P0 阶段提前重构。

---

## B. Mac/iOS Roadmap

Mac/iOS 负责 Capacitor、Xcode、iOS 真机、移动端交互、客户端支付调用、合规页面、崩溃上报和 App Store 发布。Mac 禁止修改 `server/**` 和 `database/**`。

### IOS-BASE-0 首个共同基线与真机工程

- Priority: P0
- Status: completed
- Owner branch: `codex/mac-ios`
- Depends on: `INT-BASE-0`
- Scope: 生成 iOS 工程、合并 Windows 登录基线并完成基础真机验证。
- Acceptance criteria: iOS 工程可同步和真机运行；Mac 分支同时包含 Win 与 Mac 基线；构建、production guards、Capacitor sync 和真机滚动通过。
- Shared files: `pp-app/src/features/auth/AuthPages.tsx`
- Unblock result: 已解除全部后续 iOS 基线依赖。
- Result commit: `6588247c29b2082d310cc96fe110ab67866337f4`
- Verification: server `check:mvp`、pp-app build、production guards、`cap sync ios`、`git diff --check` 通过；iPhone 15 Pro Max 三轮滚动无闪烁。
- Notes: 已包含 Win SHA `ad07003533b869321570676b0fa185f5a3ac3943` 和原 Mac SHA `b67a71b7d8f57020c85234de307703df561f10be`。

### IOS-QA-1 基础真机回归和失败状态

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `IOS-BASE-0`
- Scope: 发现页频道、底部导航、详情返回、小屏、安全区、键盘、弱网、断网、空状态、接口失败、首页和 Live Photo 回归。
- Acceptance criteria: 核心页面无阻断、遮挡和闪烁；失败状态可理解且可重试；生产 API 不可用时不显示 mock 成功。
- Shared files: `pp-app/src/**`, `docs/IOS_REAL_DEVICE_TEST_LOG.md`
- Unblock result: 提供设备/系统、用例结果、失败截图或日志和 commit SHA；解除 `INT-RC-1` 的基础 QA 条件。
- Result commit: pending
- Verification: pending
- Notes: 真实短信不可用时输出依赖通知，但继续其他独立用例。

### IOS-AUTH-1 真实短信登录和会话恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-AUTH-1`, `EXT-SMS-1`
- Scope: 真机发送验证码、登录、角色切换、重新登录、会话恢复和 `companionId` 刷新。
- Acceptance criteria: 成功、错误、过期、重复点击和频率限制均有正确 UI；consumer/companion 边界正确；换设备或重启后可恢复；生产不使用本地验证码。
- Shared files: `pp-app/src/features/auth/AuthPages.tsx`, `pp-app/src/services/authService.ts`, `pp-app/src/types/api.ts`
- Unblock result: 提供真机用例、API 错误映射、设备信息和 commit SHA，解除 `INT-AUTH-1`。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端存放 Pepper 或短信 Secret。

### IOS-MAP-1 Provider 可替换的地图展示和选点

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MAP-1`, `EXT-MAP-2`
- Scope: 在 Capacitor 中使用获批 Provider 的 JS/原生 SDK，或 MapLibre 加合法授权地图源展示地图和标记选点；搜索、输入提示和编码通过后端代理；支持拒绝定位后的手动搜索。
- Acceptance criteria: 真机可加载地图、搜索和选择 POI；客户端不包含 WebService Key；定位拒绝仍可完成下单；客户端公开 Key、域名或 Bundle ID 限制有效；地图源商用条件已获确认；错误和加载状态完整。
- Shared files: `pp-app/src/services/locationService.ts`, `pp-app/src/types/api.ts`, 地图 UI 组件、`pp-app/package*.json`
- Unblock result: 提供真机录像/截图、选点结果、拒绝定位结果、构建验证和 commit SHA，解除 `IOS-MAP-2`、`INT-MAP-1` 客户端条件。
- Result commit: pending
- Verification: pending
- Notes: 首版优先使用 Capacitor 可复用方案；只有真机性能、合规或能力不满足时才另建原生 SDK 节点。

### IOS-MAP-2 场景匹配和外部地图导航

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MAP-2`, `IOS-MAP-1`
- Scope: 验证外滩、商圈、艺术园区、道路、滨江区域、附近摄影师和服务范围，并按设备能力调起高德、腾讯或 Apple 地图等外部导航。
- Acceptance criteria: 地点别名和区域显示正确；附近匹配与服务范围符合后端结果；订单保存地点快照；首选地图未安装时可降级到系统地图、其他已安装地图或网页路线。
- Shared files: `pp-app/src/features/user/**`, `pp-app/src/types/api.ts`, iOS URL scheme/Info.plist 配置
- Unblock result: 提供场景矩阵、订单地点结果、导航验证和 commit SHA，解除 `INT-MAP-1`。
- Result commit: pending
- Verification: pending
- Notes: Still 首版不自建路线规划、实时导航或语音播报；外部地图 URL Scheme 和用户选择需有安全、隐私和失败处理。

### IOS-DATA-1 真实 Feed、资料、作品和收藏

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DATA-1`
- Scope: 移除生产 mock/localStorage fallback，接入真实 Feed、摄影师资料、作品、收藏和分页刷新。
- Acceptance criteria: 刷新和分页真实可用；跨设备数据一致；API 失败显示错误和重试；空数组只代表真实空状态。
- Shared files: `pp-app/src/services/feedService.ts`, profile/collection service、`pp-app/src/types/api.ts`, 对应页面
- Unblock result: 提供真机数据用例、跨设备结果和 commit SHA，解除 `INT-DATA-1` 第一阶段。
- Result commit: pending
- Verification: pending
- Notes: development mock 可保留，但生产 guard 必须覆盖。

### IOS-DATA-2 真实咨询和订单工作区

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DATA-2`, `IOS-DATA-1`
- Scope: 接入真实咨询、订单列表、详情、状态刷新、地点快照和跨设备恢复。
- Acceptance criteria: 用户和摄影师看到正确订单；分页、刷新和状态变化可见；重启/换设备可恢复；失败不写入虚拟账本。
- Shared files: consultation/order services、订单页面、`pp-app/src/types/api.ts`, `pp-app/src/app/AppDataProvider.tsx`
- Unblock result: 提供双方角色真机用例、跨设备结果和 commit SHA，解除 `IOS-MSG-1`、`IOS-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 生产禁止 `virtualOrderLedger` 兜底。

### IOS-MERCHANT-1 摄影师页妆造加购与商家轻量工作台

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MERCHANT-1`, `IOS-DATA-2`, `EXT-MERCHANT-1`
- Scope: 保持“找作品、找摄影师”两个入口，实现商家名称筛选合作摄影师、摄影师页合作关系/固定套餐展示、期望妆造时间选择，以及同一代码库中的轻量移动 Web 商家待接单、已确认订单、套餐和门店设置工作台。
- Acceptance criteria: 不出现独立商家搜索入口；“店内摄影师/可搭配该店”关系清楚；用户可选仅摄影、摄影＋妆造或摄影＋妆造＋服装；商家只查看和处理自己的服务项；接受/拒绝操作幂等；组合订单正式确认前页面和网络响应均无商家电话；功能关闭时原摄影师页和搜索无回归；弱网、空状态、键盘和 VoiceOver 可用。
- Shared files: 搜索/摄影师页面、商家工作台、订单时间选择、API 类型、Capacitor 路由
- Unblock result: 提供用户/摄影师/商家三角色真机、搜索、套餐、接单和电话隐私结果及 commit SHA，解除 `INT-MERCHANT-1`。
- Result commit: pending
- Verification: pending
- Notes: 不开发独立商家 App、本地 SaaS、员工/工位库存或美团/抖音同步；商家生产登录能力受真实认证节点约束。

### IOS-COMBO-1 组合订单支付、拒绝分支、退改与异常体验

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-COMBO-1`, `IOS-MERCHANT-1`, `IOS-PAY-1`, `IOS-REFUND-1`
- Scope: 用户一次预付并查看分项清单；摄影师和商家分别处理自己的服务项；实现双方接受、拒绝/超时、保留摄影、全单取消、成交后电话、受影响服务项改期、主动异常和分项售后状态。
- Acceptance criteria: 服务端价格和状态为事实源；重复支付/接受/拒绝/取消不重复产生副作用；商家拒绝后用户选择和默认超时分支正确；未发起异常时不自动判定迟到；只要求受影响方确认改期；电话显示、20%/80%说明、部分退款和分项冻结状态准确；刷新、重启和跨设备可恢复；纯摄影订单无回归。
- Shared files: Checkout、订单详情、摄影师/商家工作台、退款/异常页面、API 类型
- Unblock result: 提供三角色真机、弱网、重复操作、拒绝/超时、电话、退改和状态恢复测试及 commit SHA，解除 `INT-COMBO-1`。
- Result commit: pending
- Verification: pending
- Notes: 客户端不得自行推断最终退款、佣金或结算金额。

### IOS-MSG-1 真实聊天分页、同步和重试

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MSG-1`, `IOS-DATA-2`
- Scope: 会话列表、消息分页、发送状态、失败重试、跨设备同步和风险提示。
- Acceptance criteria: 消息不重复不乱序；发送中/失败/重试状态明确；切换前后台可恢复；生产不读取 localStorage 会话。
- Shared files: `pp-app/src/services/messageService.ts`, 消息页面、`pp-app/src/types/api.ts`
- Unblock result: 提供双角色、跨设备、弱网和重试用例及 commit SHA，解除 `INT-MSG-1`。
- Result commit: pending
- Verification: pending
- Notes: 图片消息依赖 `IOS-MEDIA-1`。

### IOS-MEDIA-1 真实媒体上传和展示

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MEDIA-1`, `EXT-CLOUD-1`
- Scope: 真机上传图片、视频和 Live Photo，展示上传进度、失败重试和媒体审核状态。
- Acceptance criteria: 文件限制与服务端一致；真实 COS URL 可跨设备访问；失败可重试；生产不生成 data URL；Live Photo 无闪烁并正确降级。
- Shared files: `pp-app/src/services/mediaService.ts`, `LivePhotoMedia.tsx`, 发布/消息页面、`pp-app/src/types/api.ts`
- Unblock result: 提供真实上传结果、媒体记录、弱网测试和 commit SHA，解除 `INT-MEDIA-1`、`IOS-MEDIA-2`。
- Result commit: pending
- Verification: pending
- Notes: 客户端不得获得永久 COS Secret。

### IOS-PAY-1 iOS 真机支付和订单恢复

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-PAY-1`, `IOS-DATA-2`, `EXT-PAY-1`
- Scope: 接入确认后的 iOS 支付客户端方案，处理调起、返回、取消、失败、状态轮询和订单恢复。
- Acceptance criteria: 不依赖 `wx.requestPayment`；完成一笔小额真机支付；重复点击不重复扣款；支付返回 App 后订单状态可恢复；失败和取消状态明确。
- Shared files: `pp-app/src/services/paymentService.ts`, Checkout/Orders 页面、`pp-app/src/types/api.ts`, 必要 iOS 配置
- Unblock result: 提供真机支付流水号脱敏记录、订单状态、失败用例和 commit SHA，解除 `INT-PAY-1`。
- Result commit: pending
- Verification: pending
- Notes: 支付方案必须先完成外部与审核要求确认。

### IOS-REFUND-1 退款和异常支付状态

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-PAY-2`, `IOS-PAY-1`
- Scope: 展示退款申请、处理中、成功、失败、拒绝和人工处理状态。
- Acceptance criteria: 状态与服务端一致；前后台切换后可恢复；失败有客服入口；重复操作受控。
- Shared files: 订单/支付页面、`pp-app/src/types/api.ts`
- Unblock result: 提供退款状态矩阵、真机结果和 commit SHA，解除 `INT-PAY-1` 退款条件。
- Result commit: pending
- Verification: pending
- Notes: 客户端不自行推断最终退款状态。

### IOS-COMPLIANCE-1 合规入口和审核材料

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-COMPLIANCE-1`, `EXT-COMPLIANCE-1`, `EXT-DOMAIN-1`
- Scope: 隐私政策、用户协议、支付说明、退款规则、客服、举报、删除账号、数据导出、定位授权和权限文案。
- Acceptance criteria: 所有 URL 可访问；删除和导出调用真实 API；定位拒绝有替代路径；权限用途与实际功能一致；App Privacy、审核账号和审核说明可提交。
- Shared files: 设置/合规页面、权限文案、Info.plist、`docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供页面路径、政策版本、审核材料清单、真机结果和 commit SHA，解除 `INT-COMPLIANCE-1`。
- Result commit: pending
- Verification: pending
- Notes: 法律文本由 User/External 定稿，代码不得自行编造。

### IOS-CRASH-1 崩溃上报和生产诊断

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-DELIVERY-1`, `EXT-OBS-1`
- Scope: 接入 iOS 崩溃、启动失败和基础网络错误上报，建立环境、App version、build number、后端 request ID 与 Git commit 的诊断关联。
- Acceptance criteria: staging 可验证测试崩溃和 API 失败事件；事件包含环境、App version、build number、commit 和必要 request ID，但不含 token、手机号、支付字段、聊天明文或本地图片；采样、离线缓存和发送失败行为明确；发布版本可追踪到唯一 commit；测试事件到达主要和备用负责人。
- Shared files: iOS 配置、客户端启动入口、环境配置
- Unblock result: 提供测试事件、版本映射、隐私检查和 commit SHA，解除 `IOS-DELIVERY-1`、`INT-OPS-1`。
- Result commit: pending
- Verification: pending
- Notes: SDK 和数据区域由外部资源节点确认。

### IOS-DELIVERY-1 签名、Archive 和 TestFlight

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `IOS-QA-1`, `IOS-COMPLIANCE-1`, `IOS-CRASH-1`, `EXT-APPLE-1`
- Scope: 正式 Bundle ID、Team、签名、Archive、图标、截图、App Privacy、审核账号和 TestFlight 构建。
- Acceptance criteria: Release Archive 成功；TestFlight 可安装；权限、图标和截图完整；审核账号可用；无测试角色和 mock 配置。
- Shared files: `pp-app/ios/**`, `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供 build number、TestFlight 状态、安装结果和 commit SHA，解除 `INT-TESTFLIGHT-1`。
- Result commit: pending
- Verification: pending
- Notes: 证书和描述文件禁止提交。

### IOS-STORE-1 App Store 提交

- Priority: P0
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `INT-TESTFLIGHT-1`, `EXT-FILING-1`
- Scope: 完成最终回归、审核提交和反馈处理。
- Acceptance criteria: 所有 P0 节点完成；真实交易主流程通过；审核材料和资质核验完成；提交版本与 Integration RC 一致。
- Shared files: `docs/APP_STORE_LAUNCH.md`
- Unblock result: 提供提交版本、审核状态和最终 release SHA，解除 `INT-STORE-1`。
- Result commit: pending
- Verification: pending
- Notes: 审核反馈形成新节点，不在本节点隐式扩张。

### IOS-NOTIFY-1 通知中心和前后台切换

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-NOTIFY-1`, `EXT-PUSH-1`
- Scope: 站内通知列表、已读、订单/支付/退款/审核通知、Push 和前后台恢复。
- Acceptance criteria: 通知不重复；点击进入正确页面；权限拒绝有降级；前后台切换可同步；失败状态可见。
- Shared files: 通知页面、路由、`pp-app/src/types/api.ts`, iOS Push 配置
- Unblock result: 提供通知矩阵、真机 Push 和 commit SHA，解除 `INT-MSG-1` 通知条件。
- Result commit: pending
- Verification: pending
- Notes: Push 不得成为关键订单状态的唯一来源。

### IOS-OPS-1 运营处理结果呈现

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-ADMIN-2`, `WIN-SETTLE-1`
- Scope: 用户端呈现举报、客服、退款、争议、封禁和结算相关状态。
- Acceptance criteria: 状态和操作权限正确；有客服和申诉入口；敏感后台信息不泄露。
- Shared files: 设置、订单、客服和状态页面、`pp-app/src/types/api.ts`
- Unblock result: 提供状态矩阵、真机结果和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: Admin 操作本身不在 iOS 实现。

### IOS-MEDIA-2 媒体审核状态

- Priority: P1
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-MEDIA-2`, `IOS-MEDIA-1`
- Scope: 展示审核中、通过、拒绝、下架和申诉状态。
- Acceptance criteria: 违规媒体不继续公开展示；作者获得可理解状态；申诉入口真实可用。
- Shared files: 媒体组件、发布/作品页面、`pp-app/src/types/api.ts`
- Unblock result: 提供状态矩阵、真机结果和 commit SHA，解除 `INT-MEDIA-1` 完整审核条件。
- Result commit: pending
- Verification: pending
- Notes: 不在客户端自行改变审核终态。

### IOS-SEARCH-1 地点搜索体验优化

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-SEARCH-1`, `INT-TESTFLIGHT-1`
- Scope: 优化输入提示、历史地点、热门地点、无结果和配额失败体验。
- Acceptance criteria: 常见地点输入稳定；键盘和地图交互流畅；错误不阻塞手动输入。
- Shared files: 地图/搜索组件
- Unblock result: 提供可用性测试和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: 不阻塞首轮 TestFlight。

### IOS-ANALYTICS-1 埋点和性能观测

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-ANALYTICS-1`, `EXT-ANALYTICS-1`
- Scope: 接入经隐私评审的客户端事件和性能指标。
- Acceptance criteria: 事件与字典一致；无敏感数据；可区分环境和版本；核心页面性能可观察。
- Shared files: 客户端入口、关键页面、隐私文档
- Unblock result: 提供事件验证、隐私检查和 commit SHA。
- Result commit: pending
- Verification: pending
- Notes: 必须允许按政策关闭非必要分析。

### IOS-PREF-1 拍摄偏好档案和订单需求卡

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-PREF-1`, `INT-TESTFLIGHT-1`, `EXT-PREF-1`
- Scope: 上线“我的拍摄偏好”轻量问卷、平台样片喜欢/不喜欢原因、少量参考图及一键快速标签、可编辑偏好卡、本次订单覆盖确认、摄影师订单内查看和拍后反馈；方案确认或订单完成后再提供“保存为长期偏好”的独立入口。
- Acceptance criteria: 用户不建立档案仍可正常搜索和下单；长期偏好与本次需求清楚区分；上传参考图和标签完全可选且不申请整个相册读取；“动作/构图与机位/光线与色调/氛围感/都喜欢”支持一键多选、点击即保存、无需确认页或二级问卷；默认仅用于本次订单；每次授权和撤回有清晰界面；摄影师端只展示当前订单必要信息；VoiceOver、键盘、加载、失败和删除状态可用。
- Shared files: 用户设置/预约/订单/摄影师工作区页面、偏好 service、API 类型、隐私文案
- Unblock result: 提供真机流程、授权/撤权/删除测试和 commit SHA，解除 `INT-PREF-1`。
- Result commit: pending
- Verification: pending
- Notes: 第一版偏好卡使用规则模板；不得使用“缺陷分析”“颜值评分”等文案。

### IOS-LOYALTY-1 常约摄影师、再次预约和摄影师成长体验

- Priority: P2
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-LOYALTY-1`, `IOS-PREF-1`, `IOS-NOTIFY-1`, `EXT-LOYALTY-1`
- Scope: 用户端在订单完成页和“我的”提供“再次预约”“常约摄影师”“沿用上次需求/偏好草稿”和可选档期提醒；摄影师端在咨询/订单工作台展示回头客关系摘要、需求/报价模板、认证与作品来源标识、成长进度、收益和结算保障；所有入口复用现有咨询—报价—定金—尾款托管—交付流程。
- Acceptance criteria: 再次预约不跳过重新选档期、价格确认、偏好授权和订单快照；首单用户不被要求建立关系或档案；通知默认关闭营销频率并可退订；摄影师看不到用户联系方式和无关历史；站外作品可继续上传且来源展示清楚；等级进度可解释并提供申诉入口；页面在 VoiceOver、键盘、弱网、空状态和失败状态下可用。
- Shared files: 用户订单/我的/摄影师主页、咨询需求卡、摄影师工作台、通知设置、认证/作品卡片、API 类型和文案
- Unblock result: 提供用户/摄影师双角色真机流程、跳过/退订/申诉测试和 commit SHA，解除 `INT-LOYALTY-1`。
- Result commit: pending
- Verification: pending
- Notes: 第一版只显示必要摘要和一个主行动按钮；不新增签到、每日任务、复杂积分或独立 CRM 页面。

### IOS-AI-1 AI 偏好助手和用户确认交互

- Priority: P3
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-AI-1`, `INT-PREF-1`, `EXT-AI-1`
- Scope: 接入偏好摘要、缺失信息追问、档案更新草稿、订单绑定的可选拍摄参考卡和有限照片分析；订单进行中提供双方共享的方案清单和导演模式，机位、光线、路线、构图和静态姿势建议均可编辑、跳过或关闭；导演模式始终显示文字，语音仅按耳机和用户设置辅助播放。
- Acceptance criteria: AI 不自动覆盖用户输入；每条方案显示订单地点/时间、参考图标签、喜欢/收藏或长期偏好等来源及确认状态；摄影师可标记采用、调整或忽略，用户不能把建议当作强制交付清单；未连接耳机时语音默认关闭，连接耳机并进入导演模式时默认开启，手动静音持续生效，耳机断开立即停止且不转扬声器；文字步骤始终可见并可重复/下一步/跳过；不实现现场试拍图上传分析、持续摄像头识别或自动连拍；AI 失败时完整回退非 AI 偏好流程；不向摄影师展示原始 AI 推理或未授权照片。
- Shared files: `pp-app/src/services/aiService.ts`, AI 建议组件、偏好/预约/订单页面、隐私文案
- Unblock result: 提供真机确认、拒绝、删除、弱网和 AI 关闭测试及 commit SHA，解除 `INT-AI-1`。
- Result commit: pending
- Verification: pending
- Notes: 当前暂停；不得默认读取全相册，不得用模型结论定义用户外貌或身体问题。

### IOS-AI-POST-1 拍后协作与摄影师后处理 Copilot 体验

- Priority: P3
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-AI-POST-1`, `IOS-MEDIA-1`, `INT-AI-1`
- Scope: 在订单交付工作区展示连拍分组、技术质检、候选选片和批量后处理草稿；摄影师可以对比原片、批量采用、逐张微调或拒绝，用户修改意见转换为明确任务并关联对应版本。
- Acceptance criteria: 默认先展示原片与建议差异；任何草稿都不能自动覆盖或交付；摄影师拥有最终选片和修图确认权；用户能看懂修改状态但不能越权读取工作底稿；弱网、重复提交、后台恢复、删除和 AI 关闭流程通过真机验证；敏感人像修改有单独确认。
- Shared files: 订单交付/选片/修图协作页面、媒体对比组件、摄影师工作台、`aiService.ts`、API 类型和正式文案
- Unblock result: 提供双角色真机选片、草稿对比、采用/拒绝、意见任务化、版本回退和 AI 关闭测试及 commit SHA，解除 `INT-AI-POST-1`。
- Result commit: pending
- Verification: pending
- Notes: 先优化摄影师交付效率和用户审美匹配，不在本节点加入实时取景或连续姿势指导。

### IOS-LOYALTY-2 受控会员与双边权益界面

- Priority: P3
- Status: pending
- Owner branch: `codex/mac-ios`
- Depends on: `WIN-LOYALTY-2`, `INT-LOYALTY-1`, `EXT-LOYALTY-2`
- Scope: 仅呈现服务端已开启的单项权益实验，例如复约优惠、服务恢复额度、摄影师阶段性降佣或成长权益；清楚展示适用订单、有效期、退款/取消影响和关闭方式。
- Acceptance criteria: 未开启实验时界面不留空壳；金额和资格完全以后端为准；用户支付前看到最终价格；摄影师看到预计收入和佣金依据；退款/取消后的权益状态可恢复；无暗黑模式、强制连续订阅或误导性倒计时；弱网与重复点击不产生重复领取。
- Shared files: 订单确认、我的权益、摄影师收益/成长、实验配置客户端和正式文案
- Unblock result: 提供真机资格、支付、退款冲正、关闭实验和 commit SHA，解除 `INT-LOYALTY-2`。
- Result commit: pending
- Verification: pending
- Notes: 不要求一次实现全部权益；每次只上线通过单位经济评审的最小实验。

### IOS-MINI-1 微信小程序客户端

- Priority: P3
- Status: pending
- Owner branch: future dedicated branch
- Depends on: `INT-TESTFLIGHT-1`, `WIN-MINI-1`, `EXT-MINI-1`
- Scope: 确认打包技术方案后另建工作流。
- Acceptance criteria: 另行评审。
- Shared files: pending
- Unblock result: pending
- Result commit: pending
- Verification: pending
- Notes: 不在 `codex/mac-ios` 中提前实施。

---

## C. Integration Roadmap

Integration 只合并已经在负责分支验证过的节点。Mac 负责最终 Integration 合并、Capacitor/Xcode 和真机验证；项目主控可处理一次性的 Roadmap 分支初始化。

### INT-BASE-0 建立首个共同基线

- Priority: P0
- Status: completed
- Owner branch: `codex/integration`
- Depends on: none
- Scope: 建立同时包含 Windows 与 Mac 历史的共同基线。
- Acceptance criteria: 远端 Integration 精确指向合并提交，并包含两个祖先提交。
- Shared files: 全仓库基线
- Unblock result: 已解除 `WIN-BASE-0`、`IOS-BASE-0`。
- Result commit: `6588247c29b2082d310cc96fe110ab67866337f4`
- Verification: 包含 Win SHA `ad07003533b869321570676b0fa185f5a3ac3943` 和 Mac SHA `b67a71b7d8f57020c85234de307703df561f10be`。
- Notes: completed

### INT-ROADMAP-1 建立双平台唯一 Roadmap

- Priority: P0
- Status: completed
- Owner branch: `codex/release-roadmap` -> `codex/integration`
- Depends on: `INT-BASE-0`
- Scope: 创建本文档，写入四条路线、状态、依赖、验收、分支、共享文件和解除阻塞结果。
- Acceptance criteria: 文档进入 Integration；节点 ID 唯一；状态枚举有效；高德是 P0 主 Provider；Win/Mac 均能读取。
- Shared files: `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`
- Unblock result: 提供 Roadmap commit 和 Integration SHA，解除两端按 Roadmap 自动选择节点的条件。
- Result commit: `7ee432b`
- Verification: `git diff --check` 通过；74 个节点 ID 唯一；所有节点字段完整；状态枚举和依赖引用有效；P0 地图 Provider 为高德。
- Notes: Roadmap 内容及完成状态已通过普通 fast-forward 同步到 `codex/integration`；首次同步 SHA 为 `ed332ce`。

### INT-AUTH-1 集成真实登录

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-AUTH-1`, `IOS-AUTH-1`
- Scope: 合并服务端和 iOS 登录节点。
- Acceptance criteria: server MVP、前端构建、production guards、Capacitor sync 和真实短信真机用例通过。
- Shared files: Auth 页面、auth service、API 类型
- Unblock result: 提供 Integration SHA 和真实登录回归结果。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-MAP-1 集成地图主流程

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MAP-2`, `IOS-MAP-2`
- Scope: 合并 Provider 适配层、地点域模型、地图选点、附近匹配和外部导航。
- Acceptance criteria: WebService Key 不在客户端；地图真机用例通过；订单地点快照正确；拒绝定位可手动完成。
- Shared files: 地图服务、API 类型、地图 UI、Info.plist
- Unblock result: 提供 Integration SHA、冲突说明和地点场景矩阵。
- Result commit: pending
- Verification: pending
- Notes: 只验收获批的生产 Provider；适配层必须允许以后更换服务商，但 P0 不要求同时维护多家实现。

### INT-DATA-1 集成生产数据闭环

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-DATA-2`, `IOS-DATA-2`
- Scope: 合并 Feed、资料、作品、收藏、咨询和订单真实数据链路。
- Acceptance criteria: production guards、真实 PostgreSQL、分页、刷新和跨设备用例通过；无静默 fallback。
- Shared files: 数据 services、AppDataProvider、API 类型
- Unblock result: 提供 Integration SHA 和生产数据矩阵。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-MERCHANT-1 集成商家供给、合作搜索和妆造加购

- Priority: P1
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MERCHANT-1`, `IOS-MERCHANT-1`, `INT-TESTFLIGHT-1`
- Scope: 合并商家、固定套餐、双方确认合作关系、商家名称筛选摄影师、摄影师页妆造加购和商家轻量工作台；保持功能开关默认关闭并验证纯摄影主流程不受影响。
- Acceptance criteria: PostgreSQL 为事实源；用户、摄影师、商家和 Admin 权限隔离；合作关系不可单方伪造；搜索没有第三入口；电话在组合订单正式确认前无法通过 UI 或 API 获取；跨设备恢复、弱网和生产 guard 通过；关闭功能后当前 Release Candidate 行为不变。
- Shared files: 商家/搜索/摄影师页/工作台集成代码、迁移、API 类型、测试矩阵、Release 文档
- Unblock result: 提供 Integration SHA、四角色权限、搜索/套餐/电话隐私、跨设备和关闭开关测试，解除 `INT-COMBO-1` 的供给依赖。
- Result commit: pending
- Verification: pending
- Notes: 本节点只允许展示和测试供给，不开放真实组合支付。

### INT-MSG-1 集成聊天和通知

- Priority: P1
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MSG-1`, `IOS-MSG-1`, `WIN-NOTIFY-1`, `IOS-NOTIFY-1`
- Scope: 合并聊天同步、分页、重试和通知。
- Acceptance criteria: 双角色、跨设备、弱网、前后台和 Push 用例通过。
- Shared files: message/notification services、页面、API 类型
- Unblock result: 提供 Integration SHA 和消息通知矩阵。
- Result commit: pending
- Verification: pending
- Notes: 聊天 P0 可先随 `INT-RC-1` 验收，Push 完整能力为 P1。

### INT-MEDIA-1 集成媒体和审核

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-MEDIA-1`, `IOS-MEDIA-1`
- Scope: 合并真实媒体上传、展示和最小安全校验；P1 再补完整审核闭环。
- Acceptance criteria: COS、PostgreSQL 媒体记录、真机图片/视频/Live Photo、失败重试通过。
- Shared files: media service、媒体组件、API 类型
- Unblock result: 提供 Integration SHA 和真实上传记录。
- Result commit: pending
- Verification: pending
- Notes: `WIN-MEDIA-2`/`IOS-MEDIA-2` 完成后更新完整审核结果。

### INT-PAY-1 集成支付、退款和结算

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-SETTLE-1`, `IOS-PAY-1`, `IOS-REFUND-1`
- Scope: 合并真实支付、回调、退款、对账和结算状态。
- Acceptance criteria: 一笔小额真机支付、取消、失败、退款和订单恢复通过；服务端幂等和对账验证通过。
- Shared files: payment service、订单页面、API 类型、必要 iOS 配置
- Unblock result: 提供 Integration SHA、脱敏交易结果和状态矩阵。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-COMBO-1 组合交易、部分退款与多方结算联合验收

- Priority: P1
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `INT-MERCHANT-1`, `WIN-COMBO-1`, `IOS-COMBO-1`, `INT-PAY-1`, `INT-COMPLIANCE-1`
- Scope: 在功能开关和受控账号下，联合验收组合报价、一次预付、并行接单、拒绝/超时分支、电话隐私、受影响服务项改期、主动异常、部分退款、分项结算和先赔后扣。
- Acceptance criteria: 覆盖仅摄影、摄影＋妆造、双方接受、各方拒绝/超时、保留摄影、确认前取消、24 小时两档取消、服务方取消、同日延后、商家不受影响改期、分项争议和整单支付异常；真实 PostgreSQL、支付幂等、金额守恒、四角色权限、跨设备、电话脱敏和纯摄影回归通过；每服务项 8%佣金与客户端无权威金额计算通过检查；外部合规/财务已确认资金、开票和先赔后扣表述。
- Shared files: 组合订单/支付/退款/结算集成代码、迁移、真机矩阵、财务对账和 Release 文档
- Unblock result: 提供 Integration SHA、脱敏真实支付/部分退款记录、金额守恒、分项结算、三服务角色真机和扩大/停止结论，解除 `EXT-MERCHANT-PILOT-1`。
- Result commit: pending
- Verification: pending
- Notes: 本节点完成前禁止真实组合支付；若支付机构不支持合法的多服务方结算，必须修改资金方案和对外措辞，不能用内部账本模拟生产验收。

### INT-COMPLIANCE-1 集成合规与上线运营能力

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-COMPLIANCE-1`, `WIN-ADMIN-1`, `IOS-COMPLIANCE-1`
- Scope: 合并合规 API、用户入口、Admin 独立部署和审核材料。
- Acceptance criteria: 删除、导出、举报、客服、权限拒绝、政策 URL、Admin 隔离和审计通过。
- Shared files: 设置/合规页面、Admin 构建、文档、API 类型
- Unblock result: 提供 Integration SHA 和审核材料检查结果。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-OPS-1 基础运维联合验收

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-DELIVERY-1`, `WIN-OBS-1`, `WIN-BACKUP-1`, `IOS-CRASH-1`, `EXT-CLOUD-1`, `EXT-COST-1`, `EXT-DOMAIN-1`, `EXT-OBS-1`, `EXT-RUNBOOK-1`
- Scope: 对外部监控、崩溃诊断、版本追溯、生产权限、账单/配额、域名/证书、应用回滚、数据库恢复和事故响应执行联合验收。
- Acceptance criteria: 从生产系统之外触发一次 API/HTTPS 告警并由主要或备用负责人确认；iOS 测试崩溃可追溯到 build 和 commit；生产版本可追溯到 Integration SHA 且未在线改源码；上一应用版本回滚后健康检查通过；备份在隔离环境恢复并完成关键数据校验；域名/证书 30/14/7 天提醒和 Provider 50%/80%/100% 账单告警有脱敏配置证据；AI 无长期生产凭据；日/周/月清单、事故分级、联系人和发布观察窗口已由人审阅。
- Shared files: Release/运维文档、全仓库候选版本、非敏感验证记录
- Unblock result: 提供 Integration SHA、测试告警、应用回滚、数据库恢复、版本映射和负责人确认，解除 `INT-RC-1`。
- Result commit: pending
- Verification: pending
- Notes: 不在仓库保存监控联系人、云账号、备份文件、密钥或真实内部地址；演练不得破坏生产数据。

### INT-RC-1 P0 Release Candidate

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `INT-AUTH-1`, `INT-MAP-1`, `INT-DATA-1`, `INT-MEDIA-1`, `INT-PAY-1`, `INT-COMPLIANCE-1`, `INT-OPS-1`, `IOS-QA-1`
- Scope: 形成首个完整 P0 Release Candidate。
- Acceptance criteria: server MVP、真实 PostgreSQL、mobile/admin build、production guards、Capacitor sync、Xcode Release、核心真机流程和上线检查全部通过；运维联合验收结果仍有效。
- Shared files: 全仓库候选版本
- Unblock result: 提供 RC SHA、验证清单、已知非阻断问题，解除 `INT-TESTFLIGHT-1`。
- Result commit: pending
- Verification: pending
- Notes: P2/P3 不得进入 RC。

### INT-TESTFLIGHT-1 TestFlight 验收

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `INT-RC-1`, `IOS-DELIVERY-1`
- Scope: 对 TestFlight 构建执行完整真机和真实交易回归。
- Acceptance criteria: 安装、升级、登录、地图、数据、媒体、聊天、订单、支付、退款、客服和删除账号通过；测试期间崩溃、5xx、支付、短信、数据库和延迟信号可观察，异常能关联 build、commit 和 request ID。
- Shared files: Release 文档
- Unblock result: 提供 TestFlight build、回归结果和 release SHA，解除 `IOS-STORE-1`、P2/P3 评审条件。
- Result commit: pending
- Verification: pending
- Notes: AI、增长实验和小程序在本节点前保持暂停。

### INT-STORE-1 App Store 发布基线

- Priority: P0
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `IOS-STORE-1`
- Scope: 锁定 App Store 提交版本和审核修复。
- Acceptance criteria: 提交版本可追溯；审核反馈有独立节点；生产部署和回滚准备完成。
- Shared files: Release 文档
- Unblock result: 提供最终 release SHA 和审核状态。
- Result commit: pending
- Verification: pending
- Notes: pending

### INT-PREF-1 集成非 AI 拍摄偏好闭环

- Priority: P2
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-PREF-1`, `IOS-PREF-1`
- Scope: 合并结构化长期偏好、参考图授权、订单需求快照、摄影师查看和拍后反馈，验证该能力在没有 AI 时独立成立。
- Acceptance criteria: PostgreSQL 真写入、跨设备恢复、订单快照不可变、角色权限、撤权、导出和删除通过；用户跳过档案不影响主流程；有/无偏好卡的埋点可对比；摄影师只能访问当前订单最小必要信息。
- Shared files: 偏好 service、订单页面、摄影师工作区、API 类型、数据库迁移、Release 文档
- Unblock result: 提供 Integration SHA、跨角色/跨设备/隐私测试矩阵和首轮指标基线，解除 `WIN-AI-1`、`IOS-AI-1`、`EXT-AI-1`。
- Result commit: pending
- Verification: pending
- Notes: 本节点只验证非 AI 闭环；若摄影师查看率、沟通减少或满意度没有改善，不得直接扩大照片分析范围。

### INT-LOYALTY-1 集成非补贴双边忠诚度闭环

- Priority: P2
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-LOYALTY-1`, `IOS-LOYALTY-1`, `INT-PREF-1`
- Scope: 合并用户常约摄影师、再次预约、跨摄影师偏好复用、档期提醒、摄影师回头客摘要、认证/作品来源、成长进度和服务恢复；验证便利、信任和供给工具在不依赖补贴时能否改善留存。
- Acceptance criteria: 用户复约同一摄影师和更换摄影师两条路径均通过；重新确认档期/价格/授权/快照；跨设备、双角色、权限、退订、申诉和服务恢复通过；认证作品来源不可伪造；首单步骤不增加；建立 90/180 天用户复约率、偏好复用率、摄影师 30/90 天供给留存、报价响应、履约、争议、平台内复约和单位服务成本基线。
- Shared files: 订单/咨询/偏好/通知/摄影师成长/认证集成代码、迁移、测试矩阵、分析和 Release 文档
- Unblock result: 提供 Integration SHA、跨角色真机矩阵、指标基线和继续/停止结论，解除 `EXT-LOYALTY-2`、`WIN-LOYALTY-2`、`IOS-LOYALTY-2`。
- Result commit: pending
- Verification: pending
- Notes: 低频摄影业务不以 D1/D7 打开次数作为核心成功指标；若复约便利和摄影师工具无效，不得用补贴掩盖问题。

### INT-AI-1 集成 AI 偏好助手、拍摄参考和个人摄影 Skill 试点

- Priority: P3
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-AI-1`, `IOS-AI-1`
- Scope: 先集成文字偏好卡和档案更新草稿，再试点由订单地点/时间、快速标签、本次要求、喜欢/收藏、已确认长期偏好和摄影师能力共同生成的方案清单与导演模式；证明减少沟通后，才处理用户主动选择的少量照片并形成分场景个人摄影 Skill。
- Acceptance criteria: AI Gateway、限流、成本、prompt/输入版本、采纳反馈和关闭开关有效；当前订单覆盖历史推断，关键输入变化触发过期提示而非静默覆盖；快速标签可跳过且不增加必填步骤；文字步骤全程可用，耳机语音默认与断开行为通过真机验证；摄影师对参考卡可采用/调整/忽略且不影响验收、排名或争议；不接入现场试拍图分析或持续摄像头；AI 关闭/失败不影响业务；对比前期沟通轮次、标签完成率、参考采纳率和订单满意度；不能证明增益时停止扩大。
- Shared files: AI 服务、偏好页面、订单需求卡、分析/隐私文档、Release 文档
- Unblock result: 提供 Integration SHA、成本/质量/隐私验证、用户确认数据和是否扩大试点的结论。
- Result commit: pending
- Verification: pending
- Notes: 不以批量相册导入作为默认路径，不把用户照片默认用于模型训练，不做外貌或敏感属性推断；实时取景和连续姿势纠正不在本节点范围。

### INT-AI-POST-1 集成拍后质检与后处理 Copilot 闭环

- Priority: P3
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-AI-POST-1`, `IOS-AI-POST-1`, `INT-AI-1`
- Scope: 以少量真实订单灰度集成拍后技术质检、连拍分组、候选选片、批量色彩/轻修草稿、用户意见任务化、摄影师最终确认和版本化交付；验证既能贴合用户已确认审美，也能减少摄影师重复劳动。
- Acceptance criteria: 原片—草稿—摄影师确认版—用户交付版链路可追溯并可回退；双角色权限、授权、删除、AI 关闭、失败回退和成本上限通过；同时对比摄影师选片/修图耗时、交付周期、修改轮次、草稿采用率、满意度和单订单 AI 成本；不能减少耗时或返修时不扩大灰度。
- Shared files: AI/媒体/订单交付集成代码、迁移、真机测试矩阵、分析/隐私/Release 文档
- Unblock result: 提供 Integration SHA、真实订单灰度结果和扩大/调整/停止结论；本节点通过不自动解锁现场试拍图分析或连续实时视觉，二者仍需独立需求和设备链路评审。
- Result commit: pending
- Verification: pending
- Notes: 不以“作品是否完全按 AI 方案执行”作为成功指标；核心是交付效率、用户审美匹配、可控成本和双方满意度。

### INT-LOYALTY-2 集成双边权益和单位经济试点

- Priority: P3
- Status: pending
- Owner branch: `codex/integration`
- Depends on: `WIN-LOYALTY-2`, `IOS-LOYALTY-2`, `EXT-LOYALTY-2`
- Scope: 按批准清单一次只集成一个最小经济实验，使用城市/人群灰度、对照组、预算上限和 Kill Switch 验证用户增量复约、摄影师留存及平台毛利，而不是只看领取量。
- Acceptance criteria: 灰度、对照、账本、退款冲正、财务对账、反作弊和关闭流程通过；同时观察 90/180 天增量复约、摄影师供给留存、贡献毛利、补贴回收期、投诉和跳单风险；任何实验超预算、无增量或损害公平性时可立即停止且不影响基础交易。
- Shared files: 权益/账本/实验集成代码、分析、财务对账、测试矩阵和 Release 文档
- Unblock result: 提供 Integration SHA、实验报告和扩大/修改/停止结论。
- Result commit: pending
- Verification: pending
- Notes: 不允许同时叠加多个无法归因的优惠；阶段完成不代表权益默认长期保留。

---

## D. User/External Roadmap

这些节点由用户、账号管理员、云服务商、支付机构或合规顾问完成。代码对话不得把它们误报为代码已完成。

### EXT-APPLE-1 Apple Developer 公司账号

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 完成公司账号、组织信息、Team、正式 Bundle ID 和协议。
- Acceptance criteria: Mac 可选择正式 Team 并签名；App Store Connect 可创建应用；合同和税务状态满足提交需要。
- Shared files: 无；只向代码侧提供非敏感 Team/Bundle 信息
- Unblock result: 提供 Team ID/Bundle ID 的非敏感确认和账号状态，解除 `IOS-DELIVERY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 证书和账号密码禁止进入 Git。

### EXT-SMS-1 腾讯短信签名和模板

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 完成短信签名、验证码模板、生产额度和发送地区确认。
- Acceptance criteria: 签名/模板审核通过；生产账号可发送目标手机号；配额和费用可用。
- Shared files: 无
- Unblock result: 只提供签名/模板 ID 等非 Secret 配置名和值的安全交接，解除 `WIN-AUTH-1`、`IOS-AUTH-1`。
- Result commit: not applicable
- Verification: pending
- Notes: Secret ID/Key 通过密钥管理配置。

### EXT-MAP-1 地图服务商比较、账号和服务端接入

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 比较高德、腾讯和百度的大陆 POI、地址解析、配额、Capacitor 适配、商用授权、年度固定许可、按量费用和创业扶持；选择一家 P0 Provider，创建企业账号和应用并申请服务端 Key。
- Acceptance criteria: 有三家候选的官方功能/授权/费用对比和选择结论；选定 Provider 的 Key 可由 staging 后端调用所需 WebService；配额、地区、坐标系、数据展示限制和测试条款满足当前业务。
- Shared files: 无
- Unblock result: 通过密钥管理配置 `MAP_PROVIDER` 及选定 Provider 对应的服务端 Secret 环境变量，只向 Windows 提供变量名、已配置确认、配额和非敏感限制摘要，解除 `WIN-MAP-1`。
- Result commit: not applicable
- Verification: pending
- Notes: WebService Key 禁止发给客户端；高德 5 万元/年基础技术服务许可未获预算批准前，不得把高德视为不可替换的生产默认项。

### EXT-MAP-2 客户端地图显示方案和安全配置

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-MAP-1`
- Scope: 在选定 Provider 的客户端 SDK 与 MapLibre 加合法授权地图源之间确定 P0 显示方案；申请必要的客户端公开 Key，配置安全密钥、允许域名、Bundle ID 和 Capacitor 使用方式。
- Acceptance criteria: staging 和 iOS Capacitor 真机可加载获批地图源并完成选点；安全配置不暴露 WebService Key；正式域名和应用标识已加入允许范围；地图数据来源、署名和商用条件明确。
- Shared files: 只提供可公开客户端配置和安全接入说明
- Unblock result: 提供客户端公开 Key 或地图源的安全配置方式、允许域名/应用标识及已配置确认，解除 `IOS-MAP-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 客户端公开 Key 仍需按选定 Provider 要求限制范围；使用 MapLibre 不等于地图数据免费，必须另行确认地图源、配额、署名和生产 SLA。

### EXT-MAP-3 地图商业许可、调用量和预算核实

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-MAP-1`, `EXT-MAP-2`
- Scope: 根据正式业务、地图显示方式、调用量和商业模式，核实选定 Provider 及地图数据源的授权、配额、固定许可、按量费用、超额处置和续费要求。
- Acceptance criteria: 保存官方、工单或合同的可上线确认；地图显示、POI、地址解析和外部导航边界均已覆盖；上线调用量和费用有预算、50%/80%/100% 告警及超额限流方案。
- Shared files: 合规记录，不提交敏感合同
- Unblock result: 提供可上线结论、配额和限制摘要，解除 `INT-RC-1` 地图外部门槛。
- Result commit: not applicable
- Verification: pending
- Notes: 高德基础许可价格超出当前早期项目预算时，优先申请创业计划并完成腾讯/百度比价；没有书面商用结论不得将 staging 测试能力视为生产许可。

### EXT-CLOUD-1 COS、PostgreSQL 和备份资源

- Priority: P0
- Status: in_progress
- Owner branch: User/External
- Depends on: none
- Scope: 准备正式 PostgreSQL、COS/CDN、自动备份、故障域分离副本、网络和最小权限账号。
- Acceptance criteria: staging/production 资源、密钥和数据库隔离；数据库连接与 COS 上传可验证；PostgreSQL 自动备份保留周期明确；至少一份备份与生产实例故障域分离；COS/OSS 版本控制、生命周期或等价误删保护已配置；提供隔离恢复窗口；业务服务不用数据库 root/admin 账号。
- Shared files: 无
- Unblock result: 提供资源已配置确认、非敏感地址、备份策略和隔离恢复窗口，解除 `WIN-MEDIA-1`、`WIN-DELIVERY-1`、`WIN-BACKUP-1`。
- Result commit: not applicable
- Verification: 仓库 PostgreSQL 接入、隔离迁移演练和 CI 配置的静态检查通过（`staticConfigurationReady: true`）；这不代表云数据库已经可试点（`cloudDatabaseTrialReady: false`）。当前已配置远程目标的只读普通/TLS 连接均被远端终止，尚未取得 PostgreSQL 16 迁移、云连通性和备份恢复证据。
- Notes: Secret 通过云密钥管理；同一服务器上的数据库文件副本不视为异地备份。

### EXT-COST-1 预算、配额和账单预警

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-CLOUD-1`
- Scope: 为云服务器、PostgreSQL、COS/CDN、短信、地图、监控和其他已启用 Provider 建立预算、配额、通知联系人和月度复核。
- Acceptance criteria: 已登记各 Provider 的计费方式、免费额度、预算和负责人；配置 50%/80%/100% 预算告警并通知主要和备用负责人；适用服务配置安全硬配额、限流或异常调用保护；明确超预算后的处置顺序；数据库和支付回调不因粗暴自动停机而损坏状态；完成一次测试通知或控制台告警验证。
- Shared files: 仅保存非敏感预算规则和 Provider 清单，不保存账号、账单或联系人隐私
- Unblock result: 提供脱敏预算/配额矩阵和告警验证，解除 `EXT-RUNBOOK-1`、`INT-OPS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 新增 Provider 时必须回到本节点补预算和告警，不得默认无限额度。

### EXT-PAY-1 支付商户、证书和 iOS 方案

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 根据产品交易类型确认 iOS 支付渠道，准备商户、证书、API 权限、回调域名和测试能力；同时核实未来一次总价预付、多个服务项、部分退款、分别结算和平台先行退款扣回的合法可用方案。
- Acceptance criteria: 支付方案经过审核要求核实；商户和证书可用；可完成一笔小额测试和退款；明确支付机构是否支持组合订单的部分退款、多服务方结算、开票和资金停留方式，并确认对外能否使用“预付款”“待结算”或“托管”等表述。
- Shared files: 无
- Unblock result: 提供支付渠道决定、非敏感商户标识、证书配置方式和测试窗口，解除 `WIN-PAY-1`、`IOS-PAY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 证书和私钥禁止进入 Git 或聊天明文。

### EXT-DOMAIN-1 正式域名、HTTPS 和政策 URL

- Priority: P0
- Status: in_progress
- Owner branch: User/External
- Depends on: none
- Scope: 准备并持续管理 API、Admin、官网、隐私政策、用户协议、支付说明和退款规则的正式域名、DNS 与 HTTPS 生命周期。
- Acceptance criteria: URL 可从公网和真机访问；证书有效且自动续期任务已验证；域名使用公司主体管理并开启自动续费；域名和证书配置 30/14/7 天到期提醒并通知主要/备用负责人；Admin 与 API 域名隔离；政策 URL 长期稳定；DNS/证书变更先在 staging 或安全窗口验证。
- Shared files: 只向代码侧提供正式 URL
- Unblock result: 提供 URL、证书检查、续期任务和到期告警结果，解除 `WIN-ADMIN-1`、`WIN-DELIVERY-1`、`IOS-COMPLIANCE-1`、`EXT-RUNBOOK-1`。
- Result commit: not applicable
- Verification: API `https://api.weareinframe.com` 已存在；Admin 和政策 URL 仍待确认。
- Notes: pending

### EXT-COMPLIANCE-1 隐私、协议、支付和退款文本

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 定稿隐私政策、用户协议、支付说明、退款规则、客服和数据权利说明；补充组合订单、商家营业电话、多服务方责任、部分退款、分别结算、平台先赔后扣和服装押金边界。
- Acceptance criteria: 文本覆盖定位、媒体、账号、订单、支付、分析和第三方 Provider；组合订单各服务方身份、服务责任、取消/改期、20%档期补偿、申诉和开票边界可理解；版本和生效日期明确。
- Shared files: 正式文本或 URL
- Unblock result: 提供最终版本和 URL，解除 `WIN-COMPLIANCE-1`、`IOS-COMPLIANCE-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 代码对话不得自行生成最终法律结论。

### EXT-FILING-1 ICP、APP 备案和业务资质

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-DOMAIN-1`
- Scope: 根据项目文档、运营主体、服务器和业务模式核实 ICP、APP 备案及其他所需资质。
- Acceptance criteria: 从官方渠道或专业顾问获得可执行结论；所需申请已完成或有明确时间表。
- Shared files: 合规状态摘要
- Unblock result: 提供可提交/可上线结论和限制，解除 `IOS-STORE-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 该节点不是代码任务。

### EXT-OPS-1 客服、退款、审核和财务负责人

- Priority: P1
- Status: pending
- Owner branch: User/External
- Depends on: none
- Scope: 确定客服渠道、服务时间、退款/争议/审核/财务负责人和操作权限；覆盖商家审核、组合订单归责、部分退款、分项冻结、先赔后扣和多方结算。
- Acceptance criteria: 每类 case 有负责人、SLA 和升级路径；审核账号和客服入口可用；商家、摄影师和用户争议能按服务项留证、通知、申诉和执行，不能用电话口头结果直接改账。
- Shared files: 运营说明
- Unblock result: 提供角色和流程摘要，解除 `WIN-ADMIN-2`、`IOS-OPS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 不在仓库保存个人敏感信息。

### EXT-MERCHANT-1 商家冷启动规则、合作材料与试点批准

- Priority: P1
- Status: blocked
- Owner branch: User/External
- Depends on: none
- Scope: 固定商家准入、1—3 个套餐模板、接单时限、电话边界、退改矩阵、试点佣金/周期、结算原则、30 天试点指标和停止条件；完成一致的 Word 合作沟通文件、PPT 讲解稿、FAQ 和模拟订单检查表。
- Acceptance criteria: 明确 30 个自然日或 10 笔已完成组合订单试点、两类服务项分别按计佣基数收取 8%、20%档期补偿不计佣、无入驻/软件/年费、通道费和平台优惠由平台承担；材料用 100 元正常履约、平台券和用户责任取消样例解释金额；不承诺订单量、实时库存、准确路程或永久免费；明确正式确认前无电话、接单后承诺明确时间、20%/80%只在归责后生效；支付/合规/财务待确认的表述不伪装为已上线能力；DOCX/PPTX 均完成渲染和逐页检查。
- Shared files: `docs/STILL_MERCHANT_COLD_START_PARTNERSHIP_PLAN.md`, 商家 Word/PPT、运营说明
- Unblock result: 提供最终材料、规则版本、渲染验证和审批结论，解除 `WIN-MERCHANT-1`、`WIN-COMBO-1` 的商务规则依赖。
- Result commit: pending
- Verification: 事实源、FAQ、模拟订单检查表、100 元/平台券/80%—20%案例已统一；最终 DOCX（14 页）和 PPTX（10 页、10 组讲者备注）完成结构、敏感信息、溢出和逐页视觉验收。DOCX SHA256 `1FA1E7EE027F40B4D09FA95618B5610B7D88AD45C08E91D2835DBC1AFC04624D`；PPTX SHA256 `4D754F19F5489EA5D62F37E06F3C2712AB2AED0E8818D58A3AB3532675A7CBB2`。
- Notes: 本节点的本地材料已经完成，当前仅等待 User/External 对规则、Word 和 PPT 作最终批准；批准前只能用于内部审阅和模拟流程，不作为真实组合交易放行依据。本节点固定合作方案，不代表支付机构或法律顾问已经批准资金/开票结构；相关结论仍由 `EXT-PAY-1`、`EXT-COMPLIANCE-1` 提供。

### EXT-MERCHANT-PILOT-1 首批商家入驻与受控真实试点

- Priority: P1
- Status: pending
- Owner branch: User/External
- Depends on: `INT-COMBO-1`, `INT-STORE-1`, `EXT-OPS-1`, `EXT-COMPLIANCE-1`, `EXT-PAY-1`
- Scope: 按准入标准招募首批 1—3 家商家，每家上架 1—3 个套餐，完成资料/电话/主体/收款与开票核验、负责人培训、模拟订单和首笔受控真实订单。
- Acceptance criteria: 每家合作关系真实且双方确认；不要求独家、预留库存或安装本地 SaaS；每家完成一笔模拟订单并通过接单、电话、履约、异常、退款和结算检查；至少一笔真实组合订单完成且复盘无重大资金/权限/电话泄露问题后才扩大；指标和停止条件按实施方案记录。
- Shared files: 脱敏试点清单、套餐模板、培训/模拟订单记录、周复盘
- Unblock result: 提供首批商家数量、模拟/真实订单脱敏结果、继续/调整/停止结论和下一阶段容量上限。
- Result commit: not applicable
- Verification: pending
- Notes: 不在仓库保存身份证、营业执照原件、个人电话、收款账号或订单敏感信息。

### EXT-OBS-1 崩溃和监控服务

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`
- Scope: 选择独立于生产服务器的外部可用性监控、后端告警和 iOS 崩溃上报服务，确认数据区域、保留期、通知渠道和隐私条款。
- Acceptance criteria: staging/production 项目隔离；从生产系统之外每 1-5 分钟检查官网、API `/api/health`、HTTPS 和必要政策 URL；关键后端告警与 iOS 崩溃事件可验证；主要和备用负责人均能收到测试事件；密钥管理完成；隐私披露覆盖；告警平台故障时有备用查看渠道。
- Shared files: 非敏感项目标识和配置说明
- Unblock result: 提供服务选择、外部检查、测试告警和通知确认，解除 `WIN-OBS-1`、`IOS-CRASH-1`、`EXT-RUNBOOK-1`。
- Result commit: not applicable
- Verification: pending
- Notes: pending

### EXT-RUNBOOK-1 生产权限、AI 边界和事故响应

- Priority: P0
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-CLOUD-1`, `EXT-COST-1`, `EXT-DOMAIN-1`, `EXT-OBS-1`
- Scope: 明确生产主要/备用负责人、最小权限、AI 操作边界、日/周/月巡检、告警确认、事故分级、发布观察窗口和复盘流程。
- Acceptance criteria: 主要和备用负责人、告警确认时限及升级路径明确；生产运行账号、发布账号和 root/admin 分离；AI 不持有长期 root/SSH 权限、生产密钥、数据库管理员密码或支付私钥；AI 生成命令必须由人审阅目标、影响、回滚和验证后执行；禁止在线编辑生产源码；日/周/月清单覆盖可用性、崩溃、备份、证书、账单、容量、支付和安全事件；事故 Runbook 覆盖止损、回滚、恢复、用户通知、证据保留和复盘；完成一次桌面演练。
- Shared files: 只保存非敏感 Runbook 模板和角色名称，不保存个人电话、账号、密钥或真实内部地址
- Unblock result: 提供脱敏责任矩阵、清单审阅和桌面演练结果，解除 `INT-OPS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: AI 可辅助检查和分析，但生产变更授权始终由人承担。

### EXT-PUSH-1 Apple Push 能力

- Priority: P1
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-APPLE-1`
- Scope: 准备 APNs 能力、Key/证书和 Provider 配置。
- Acceptance criteria: staging 真机可收到测试 Push；密钥安全存储；权限文案完成。
- Shared files: 无
- Unblock result: 提供能力已配置确认，解除 `IOS-NOTIFY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: Key 禁止提交。

### EXT-ANALYTICS-1 分析服务与隐私配置

- Priority: P2
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`, `INT-TESTFLIGHT-1`
- Scope: 选择分析服务、数据区域、保留期和用户选择机制。
- Acceptance criteria: 隐私披露完成；staging/production 隔离；敏感字段规则明确。
- Shared files: 非敏感项目标识
- Unblock result: 解除 `WIN-ANALYTICS-1`、`IOS-ANALYTICS-1`。
- Result commit: not applicable
- Verification: pending
- Notes: TestFlight 主流程稳定前不推进。

### EXT-PREF-1 偏好档案隐私、文案和用户研究

- Priority: P2
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`, `INT-TESTFLIGHT-1`
- Scope: 确认长期偏好、本次需求、参考图、拍后反馈和摄影师查看的产品边界；定稿主动授权、撤回、保留、导出、删除和儿童/敏感场景处理说明；准备轻量用户研究验证档案是否真的有帮助。
- Acceptance criteria: 字段和文案不使用“外貌缺陷”“身材问题”或颜值评价；用户可不建立档案；少量参考图为主动选择，快速标签可多选/跳过且不弹强制二级问卷；参考图默认仅用于当前订单，写入长期偏好必须在方案确认或订单完成后独立同意；摄影师查看范围明确；原图和偏好数据保留/删除规则明确；研究指标覆盖上传后标签完成率、完成耗时、摄影师查看率、沟通减少和满意度变化。
- Shared files: 正式隐私/同意文案、研究提纲和非敏感字段清单
- Unblock result: 提供批准后的字段、授权/撤权/删除边界和研究指标，解除 `WIN-PREF-1`、`IOS-PREF-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 该节点不批准全相册批量读取；涉及最终法律文本时由正式合规意见确认。

### EXT-LOYALTY-1 双边忠诚度规则、认证边界和用户研究

- Priority: P2
- Status: pending
- Owner branch: User/External
- Depends on: `EXT-COMPLIANCE-1`, `EXT-ANALYTICS-1`, `EXT-PREF-1`, `INT-TESTFLIGHT-1`
- Scope: 用用户和摄影师访谈确认复约、常约摄影师、档期提醒、回头客摘要、需求/报价复用、服务恢复、摄影师认证、作品来源、等级曝光和反跳单规则；形成首批不含补贴的最小方案、正式文案、人工复核和申诉流程。
- Acceptance criteria: 明确平台认证与作品来源验证的差异；站外作品允许发布但不冒充平台订单作品；认证/等级/曝光规则可解释且有申诉；通知频率和退订明确；摄影师不可获得用户联系方式或无关历史；反跳单处置有证据、分级和复核；研究同时覆盖用户操作成本、摄影师接单效率、信任、复约意愿和平台内交易理由。
- Shared files: 认证/作品来源/等级/通知/服务恢复/反跳单正式规则、访谈提纲和批准后的字段清单
- Unblock result: 提供批准后的 MVP 范围、权限/申诉矩阵、文案和研究结论，解除 `WIN-LOYALTY-1`、`IOS-LOYALTY-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 不批准认证摄影师“只能上传平台订单作品”、强制独家、默认营销 Push、签到或复杂积分。

### EXT-LOYALTY-2 双边权益单位经济和试点批准

- Priority: P3
- Status: pending
- Owner branch: User/External
- Depends on: `INT-LOYALTY-1`, `EXT-COST-1`, `EXT-PAY-1`, `EXT-ANALYTICS-1`
- Scope: 根据非补贴闭环数据，逐项评估可选会员、复约优惠、服务恢复额度、摄影师阶段性降佣、成长权益和推荐奖励的预算、税务/财务处理、消费者文案、反作弊、退出和长期负债；每次只批准一个可归因实验。
- Acceptance criteria: 每个候选方案有目标人群、成本上限、贡献毛利、回收期、对照组、停止条件、退款/取消/争议处理和负责人；未证明增量复约或供给留存的方案不获批准；连续订阅、优惠价格和自动续费满足正式合规要求；财务确认账本与对账方式。
- Shared files: 批准后的权益规则、预算、实验设计、财务/税务/合规文案和停止条件
- Unblock result: 逐项提供批准或拒绝结论，解除对应的 `WIN-LOYALTY-2`、`IOS-LOYALTY-2`、`INT-LOYALTY-2` 子范围。
- Result commit: not applicable
- Verification: pending
- Notes: 没有批准的权益保持关闭；不得用无限补贴替代产品价值验证。

### EXT-MINI-1 微信小程序资源

- Priority: P3
- Status: pending
- Owner branch: User/External
- Depends on: `INT-TESTFLIGHT-1`
- Scope: 小程序 AppID、Secret、类目、隐私和支付资源。
- Acceptance criteria: 另行评审。
- Shared files: none
- Unblock result: 解除 `WIN-MINI-1`、`IOS-MINI-1`。
- Result commit: not applicable
- Verification: pending
- Notes: 当前暂停。

### EXT-AI-1 AI 服务与受控媒体处理资源

- Priority: P3
- Status: pending
- Owner branch: User/External
- Depends on: `INT-PREF-1`, `EXT-PREF-1`
- Scope: 为文字偏好助手、可选拍摄参考、有限照片理解和后续订单媒体质检/后处理选择 AI Provider、账号、数据区域、保留策略、训练使用政策、图片派生权边界、预算、配额、密钥管理和人工停用流程。
- Acceptance criteria: staging/production 隔离；服务端密钥管理；Provider 的图片/文本保留和训练政策经过确认；默认不把用户原图或订单媒体用于模型训练；订单媒体处理有双方授权、用途限制和删除流程；配置每日成本/配额告警；可分别关闭照片理解、拍摄参考和后处理而保留非 AI 主流程；隐私披露覆盖 AI 用途、范围、派生版本、删除和第三方处理。
- Shared files: 非敏感 Provider/模型/数据处理/预算决策和正式政策文案
- Unblock result: 提供 Provider 与模型选择、数据处理边界、图片派生权、预算/限额和已配置确认，解除 `WIN-AI-1`、`IOS-AI-1`，并满足 `WIN-AI-POST-1`、`IOS-AI-POST-1` 的外部资源前置条件。
- Result commit: not applicable
- Verification: pending
- Notes: 当前暂停至 `INT-PREF-1`；未经重新评审不得默认批量导入相册、进行外貌评分或推断敏感属性。

---

## E. 完成节点时的更新要求

节点从 `in_progress` 或 `blocked` 更新为 `completed` 时，负责端必须同时填写：

1. `Result commit`: 推送后的完整 commit SHA。
2. `Verification`: 实际执行命令、真机设备或外部审核结果。
3. `Unblock result`: 明确解除哪些节点，以及对方下一步。
4. `Notes`: 仍存在但不阻断该节点的风险。
5. 如节点修改共享文件，附共享文件释放通知。

任何一项为空时不得标记为 `completed`。

## F. Integration 合并检查

每次更新 `codex/integration` 前至少执行：

- `server`: `npm run check:mvp`
- `pp-app`: `npm run build`
- `pp-app`: `npm run build:admin`
- `pp-app`: `npm run check:production-guards`
- Mac/iOS 受影响时：`npx cap sync ios` 和对应 Xcode/真机验证
- 仓库：`git diff --check`

文档-only 合并可使用最小检查：

- `git diff --check`
- 节点 ID 唯一检查
- 状态枚举检查
- 依赖节点存在性检查
- 地图 P0 Provider、商用许可和可替换适配层决策检查
