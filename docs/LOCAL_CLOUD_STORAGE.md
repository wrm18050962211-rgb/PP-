# 本地与云端数据库分层说明

当前 MVP 不接真实数据库，先用浏览器 `localStorage` 模拟两层数据库：

- 本地数据库：`pp-local-db:<手机号>:<身份>:<身份ID>:<数据域>`
- 云端数据库：`pp-cloud-db:<手机号>:<身份>:<身份ID>:<数据域>`

目前已经按账号身份隔离的本地数据：

- 订单、摄影师入驻资料、档期价格、作品草稿：`app-data-v1`
- 订单成片协作记录：`order-workspaces-v1`
- 订单聊天本地消息：`order-conversations-v1`
- 订单评价状态：`reviewed-orders-v1`
- 聊天列表置顶、未读、隐藏、删除偏好：`message-thread-prefs-v1`

账号身份规则：

- 同一个手机号可以分别注册创作者身份和摄影师身份。
- 创作者身份和摄影师身份使用不同身份 ID，因此主页、订单视角和本地数据互相隔离。
- 后续上线时，可把 `scopedStorage.ts` 的 `cloud` 层替换为腾讯云数据库/COS/API，保留当前数据域命名。
