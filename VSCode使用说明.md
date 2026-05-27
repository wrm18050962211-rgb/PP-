# PP 平台 VS Code 使用说明

## 打开项目

推荐直接用 VS Code 打开根目录：

```text
C:\Users\86152\Documents\PP平台
```

也可以双击打开：

```text
PP平台.code-workspace
```

## 常用启动

在 VS Code 顶部菜单选择：

```text
终端 -> 运行任务
```

然后选择：

- `PP 前端开发服务器`
- `PP 后端 API 服务器`

前端地址：

- 用户端：http://127.0.0.1:5173/consumer
- 陪拍者端：http://127.0.0.1:5173/companion
- 运营后台：http://127.0.0.1:5173/admin

后端健康检查：

- http://127.0.0.1:8787/api/health

## 常用命令

前端：

```powershell
cd pp-app
npm.cmd run dev -- --port 5173
npm.cmd run build
npm.cmd run lint
```

后端：

```powershell
cd server
npm.cmd run dev
```

## 主要目录

- `pp-app/src/features/user`：用户端页面
- `pp-app/src/features/companion`：陪拍者端页面
- `pp-app/src/features/admin`：运营后台页面
- `pp-app/src/services`：前端 API 服务层
- `server/server.mjs`：第二版本地后端 API
- `database`：数据库 schema、API 契约和后端计划
