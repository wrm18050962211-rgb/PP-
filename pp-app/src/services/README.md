# Frontend Data Layer

前端 MVP 现在按“类型 -> mockApi -> service -> 页面”的方向组织数据。

## 目录职责

- `src/types/api.ts`：前后端共享口径的 TypeScript 类型，状态统一使用英文枚举。
- `src/types/domain.ts`：兼容旧页面 import 的轻量 re-export。
- `src/data/mockApi.ts`：贴近真实 API 返回结构的 mock 数据。
- `src/data/mock.ts`：兼容旧 mock 结构的适配层，后续页面不应继续直接引用。
- `src/services/*Service.ts`：页面读取数据的唯一入口。
- `src/utils/money.ts`：金额格式化，统一使用分作为计算单位。
- `src/utils/status.ts`：订单、审核状态映射。
- `src/utils/time.ts`：时间标签和数组工具。

## 迁移原则

页面组件不要直接 import `src/data/mockApi.ts` 或 `src/data/mock.ts`。

推荐：

```ts
import { listFeedPosts } from '../../services/feedService';
```

不推荐：

```ts
import { feedPosts } from '../../data/mockApi';
```

这样后续接真实后端时，只需要把 service 的实现从 mock 切到 `apiClient`。

## 后端接入方式

当后端准备好后，可以在 service 内部按环境变量切换：

```ts
import { apiGet, isApiEnabled } from './apiClient';
import { feedPosts } from '../data/mockApi';

export async function listFeedPosts() {
  if (isApiEnabled()) {
    const response = await apiGet('/api/feed/posts');
    return response.success ? response.data.items : [];
  }

  return feedPosts;
}
```

当前 service 已经采用 API 优先、mock fallback：

- 未配置 `VITE_API_BASE_URL`：直接使用 `mockApi`
- 已配置 `VITE_API_BASE_URL`：优先请求真实接口，失败时回退到 `mockApi`

`feedService`、`orderService`、`messageService`、`companionService`、`adminService` 都保留同步 mock 函数，用于页面初始化和本地开发不闪空；异步函数用于真实 API 同步。
