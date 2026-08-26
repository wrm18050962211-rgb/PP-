# PP 平台云资源配置说明（公开脱敏版）

Updated: 2026-08-26

本文只记录代码需要的配置结构、验收边界和恢复步骤。真实密码、Token、Secret、主机、端口、数据库账号、桶名、内部地址、证书和控制台标识不进入 Git。

## 配置结构

服务端从 `server/.env` 读取运行配置。Mac 迁移时通过本地加密材料恢复，不要从本文件填写真实值。

```dotenv
APP_ENV=development
STORE_DRIVER=postgres
DATABASE_URL=postgres://<APP_USER>:<PASSWORD>@<POSTGRES_HOST>:<POSTGRES_PORT>/<DATABASE_NAME>

PUBLIC_API_ORIGIN=<PUBLIC_API_ORIGIN>
CORS_ALLOWED_ORIGINS=<COMMA_SEPARATED_ALLOWED_ORIGINS>

TENCENTCLOUD_SECRET_ID=<SECRET_ID>
TENCENTCLOUD_SECRET_KEY=<SECRET_KEY>
COS_BUCKET=<PRIVATE_BUCKET>
COS_REGION=<REGION>
COS_PUBLIC_BASE_URL=<APPROVED_PUBLIC_MEDIA_ORIGIN>
```

短信、支付、地图、Apple signing 和其他 Provider 变量以对应 `.env.example`、运行检查和 Roadmap 节点为准。任何客户端可见变量都必须重新确认是否允许进入构建产物；服务端 Secret 禁止以 `VITE_` 前缀暴露。

## 固定技术决定

- 数据库继续使用 PostgreSQL 16+；当前 SQL、Prisma schema、事务和检查脚本均按 PostgreSQL 设计。
- Store Lite 生产环境必须使用 PostgreSQL，禁止回退 JSON、localStorage 或 mock success。
- 当前阶段不为了节省少量月费改用 MySQL，也不在没有真实负载证据时提前增加 Redis。
- 媒体进入私有对象存储，经批准的 HTTPS 地址访问；数据库只保存 URL、对象 key、归属和审核信息。
- staging 与 production 使用独立资源、最小权限账号和独立密钥。
- 应用账号不能使用数据库 root/admin 权限；长期云密钥优先放云密钥管理或部署平台 Secret。

## Mac 恢复与检查

1. 从加密迁移目录恢复 `server/.env`，不要打印文件内容。
2. 先运行静态检查，再做只读连接和专用测试库验证。
3. 禁止对未确认用途的远程数据库执行迁移、seed、清表或写入测试。
4. 只有本机专用、名称固定并显式授权的测试库可以运行破坏性迁移验收。

```bash
cd server
npm ci
npm run check:postgres-launch-readiness
npm run check:postgres-live
```

正式发布前还需确认：PostgreSQL 大版本、数据库白名单/VPC、TLS、连接池、自动备份、保留周期、隔离恢复、对象误删保护、预算告警、证书续期和回滚窗口。完成状态只记录在 `docs/DUAL_PLATFORM_RELEASE_ROADMAP.md`。

## 私密事实源

Windows 本地 `PRIVATE_SYNC_TO_MAC` 目录包含迁移所需的私密副本，并被 `.gitignore` 排除。该目录只能经过加密后移动到 Mac；解密后应限制文件权限，并在完成恢复后从普通下载/同步目录删除。
