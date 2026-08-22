# Still PostgreSQL 云数据库接入 Runbook

这份文档回答一个很具体的问题：什么时候可以开始租云数据库，以及租完以后怎么把 Still 的后端接上去测试。

结论：当前代码已经可以进入“云 PostgreSQL 联调阶段”，但这不等于已经可以直接开放真实用户。数据库可以先租，图片和视频要走对象存储，支付、后台独立部署、监控和备份也要继续补。

## 1. 应该租什么

优先租托管 PostgreSQL，不要自己在云服务器上手动装数据库。

可选：

- 腾讯云：TencentDB for PostgreSQL。
- 阿里云：阿里云 RDS PostgreSQL。

建议规格：

- PostgreSQL 16 或兼容 16 的版本。
- 与后端服务同地域，例如华东、华南或新加坡，减少延迟。
- 开启自动备份。
- 开启慢查询或性能洞察。
- 先用测试实例，不要一开始把真实生产数据放进去。

数据库只放结构化数据，例如用户、摄影师、订单、支付、聊天、审核、审计日志。照片、视频、头像、成片文件不要直接塞进 PostgreSQL，应该放腾讯云 COS、阿里云 OSS 或其他对象存储，数据库只保存 URL、object key 和审核状态。

## 2. 云数据库接入前本地先跑

```powershell
cd server
npm.cmd run check:postgres-launch-readiness
npm.cmd run check:mvp
```

第一个检查确认“接云数据库需要的脚本、文档、schema、seed、CI 和运行入口”没有缺失。第二个检查确认当前后端 MVP 保护没有被改坏。

## 3. 创建云数据库后先做这些

1. 创建 PostgreSQL 实例。
2. 创建一个测试库，例如 `still_staging`。
3. 创建独立业务账号，不要用云数据库 root/admin 账号跑业务服务。
4. 配置白名单或 VPC，让后端服务能连上数据库。
5. 复制连接串到本地临时环境变量，不要提交到 Git。

Windows PowerShell 示例：

```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/still_staging"
```

连接串必须只放在本机环境变量、云服务环境变量或密钥管理服务里，不要写入 `.env` 后提交。

## 4. 初始化数据库结构

在项目根目录执行：

```powershell
psql "$env:DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/schema.sql
psql "$env:DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/seed_mvp.sql
```

如果你要把当前本地演示的摄影师、作品、时间段导成测试数据：

```powershell
cd server
npm.cmd run db:export-seed
cd ..
psql "$env:DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/generated/store_seed.sql
```

`database/generated/store_seed.sql` 是生成物，不提交 Git。第一次接云库时建议先只导入 `schema.sql` 和 `seed_mvp.sql`，等确认结构没问题后再考虑导入本地演示数据。

## 5. 验证云数据库是否可用

```powershell
cd server
npm.cmd run check:postgres-live
```

这个检查会连接真实 PostgreSQL，确认关键表、session/audit/security 表、回调队列表和 `for update skip locked` 锁语法都可用。

通过以后，再用 Postgres 模式启动后端做联调：

```powershell
$env:STORE_DRIVER="postgres"
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/still_staging"
npm.cmd run dev
```

然后打开：

```text
http://localhost:8787/api/health
http://localhost:5173/consumer
```

`/api/health` 里应该能看到 `storeDriver` 变成 `postgres`。

## 6. 现在可以用云数据库测试什么

可以测试：

- 首页图片流和摄影师展示读取。
- 订单、支付状态、订单动作的 PostgreSQL 写入路径。
- 消息、举报、审核、风控动作的 PostgreSQL 写入路径。
- session、admin action log、audit log、security event 的落库路径。
- 微信支付/退款回调事件记录和重试任务入口。
- `job:maintenance` 定时维护入口。

还不能因为数据库接上了就直接开放真实用户。原因是还有几块生产能力要继续补：

- 媒体文件对象存储和审核。
- 真实支付 provider 的完整闭环和证书轮换。
- 运营后台独立部署和访问控制。
- 监控、告警、备份恢复演练。
- 数据迁移版本管理和回滚流程。

## 7. 腾讯云和阿里云怎么选

如果后端、小程序、COS、微信支付更偏腾讯生态，腾讯云会更顺。它的数据库、对象存储和微信生态链路更容易放在同一套账号和网络里。

如果后端未来更偏通用 Web、国际化或已有阿里云资源，阿里云 RDS PostgreSQL 也可以。代码侧只依赖标准 PostgreSQL 连接串，不应该绑定某一家云厂商。

当前更重要的不是选哪家，而是坚持三件事：

- 数据库用托管 PostgreSQL。
- 文件用对象存储。
- 线上密钥和连接串不进 Git。

## 8. 最小上线前数据库清单

上线前至少要确认：

- `DATABASE_URL` 使用生产库，不是测试库。
- 生产库开启自动备份。
- 已经做过一次备份恢复演练。
- `check:postgres-live` 通过。
- 后端 `STORE_DRIVER=postgres`。
- 对象存储已经接入，媒体不写入数据库大字段。
- 支付回调、退款回调、维护任务有日志和告警。
