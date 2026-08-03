# Still 品牌发布资产

## 已锁定名称

- 默认及英文名称：`Still`
- 简体中文名称：`Still帧遇`
- 简体中文副标题：`发现摄影师，留住旅行与日常`
- 英文副标题：`Keep your presence in frame`
- Bundle ID：`com.frameyu.still`

名称按语言本地化，不按设备物理位置切换。对外必须使用完整中文名称 `Still帧遇`，不能简称为“帧遇”。

## App 图标

- 源文件：`brand/still-app-icon-1024.png`
- 尺寸：1024 x 1024
- 色彩：sRGB
- 透明通道：无
- SHA-256：`921777E064A6210E1C03BA5CCE0F57DC74C8A7D696710D3596A7FCAF3D537426`

图标源文件保持方形且不预制圆角。Mac/iOS 节点负责将它写入 Asset Catalog，并在真机检查系统蒙版、小尺寸辨识度、深色桌面和聚焦框可见性。

## iOS 交接

Windows 不修改 `pp-app/ios/**`。Mac/iOS 节点应保留默认 `CFBundleDisplayName = Still`，并在简体中文 `InfoPlist.strings` 中设置：

```text
"CFBundleDisplayName" = "Still帧遇";
```

App Store Connect 使用同一个 App 记录：英文名称 `Still`，简体中文名称 `Still帧遇`。中国大陆 APP 备案名称必须与简体中文元数据逐字一致。
