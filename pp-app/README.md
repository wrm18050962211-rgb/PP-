# PP陪拍平台 MVP

移动端优先的 Web App 初始化版本。

## 技术栈

- React + TypeScript
- Vite
- React Router
- Tailwind CSS
- lucide-react 图标

## 目录说明

- `src/features/user`：用户端页面：首页图片流、帖子详情、订单、消息、我的
- `src/features/companion`：陪拍者端工作台
- `src/features/admin`：运营后台 MVP
- `src/components`：跨页面复用组件
- `src/data`：MVP 阶段模拟数据
- `src/layouts`：应用外壳与底部导航

## 本地运行

```bash
npm install
npm run dev
```

## iOS 封装

项目已接入 Capacitor iOS 壳工程，Xcode 工程位置：

```bash
ios/App/App.xcodeproj
```

前端修改后同步到 iOS：

```bash
npm run ios:sync
```

打开 Xcode：

```bash
npm run ios:open
```

上架前需要在 Xcode 里绑定自己的 Apple Developer Team，并确认 Bundle Identifier 已在 Apple Developer 后台创建。
