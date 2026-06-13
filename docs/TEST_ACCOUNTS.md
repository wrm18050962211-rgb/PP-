# PP 平台本地测试账号清单

登录入口：http://127.0.0.1:5173/auth/login

使用方法：

1. 在登录页输入下方任意手机号。
2. 点击“获取验证码”。
3. 页面会显示“本地测试验证码”，填入后登录。
4. 仅创作者账号进入创作者端；仅摄影师账号进入摄影师端；双身份账号默认进入创作者端，可以在“我的”页切换摄影师。

规则：

- 仅创作者手机号：`1391001xxxx`
- 仅摄影师手机号：`1392002xxxx`
- 创作者 + 摄影师双身份手机号：`1393003xxxx`
- 验证码不是固定值，每次点击获取都会生成新的本地验证码。

## 仅创作者账号

这些账号没有摄影师身份，创作者端“摄影师”卡片会显示“注册成为摄影师”。

| 序号 | 手机号 | 账号名 | 对应主页 |
| --- | --- | --- | --- |
| 1 | 13910010001 | Creator 1 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000701` |
| 2 | 13910010002 | Creator 2 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000702` |
| 3 | 13910010003 | Creator 3 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000703` |
| 4 | 13910010004 | Creator 4 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000704` |
| 5 | 13910010005 | Creator 5 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000705` |
| 6 | 13910010006 | Creator 6 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000706` |

## 仅摄影师账号

这些账号没有创作者身份，摄影师端“创作者”卡片会显示“注册成为创作者”。

| 序号 | 手机号 | 账号名 | 对应主页 |
| --- | --- | --- | --- |
| 1 | 13920020001 | Mori | `/consumer/photographer/companion-mori` |
| 2 | 13920020002 | Nana | `/consumer/photographer/companion-nana` |
| 3 | 13920020003 | Echo | `/consumer/photographer/companion-echo` |

## 创作者 + 摄影师双身份账号

这些账号可以直接在“我的”页切换创作者/摄影师身份。

| 序号 | 手机号 | 账号名 | 创作者主页 | 摄影师主页 |
| --- | --- | --- | --- | --- |
| 1 | 13930030001 | Luna | `/consumer/creator/creator-virtual-post-1` | `/consumer/photographer/virtual-companion-1` |
| 2 | 13930030002 | Aki | `/consumer/creator/creator-virtual-post-2` | `/consumer/photographer/virtual-companion-2` |
| 3 | 13930030003 | Rin | `/consumer/creator/creator-virtual-post-3` | `/consumer/photographer/virtual-companion-3` |
| 4 | 13930030004 | Mika | `/consumer/creator/creator-virtual-post-4` | `/consumer/photographer/virtual-companion-4` |
| 5 | 13930030005 | Yoyo | `/consumer/creator/creator-virtual-post-5` | `/consumer/photographer/virtual-companion-5` |
| 6 | 13930030006 | Cici | `/consumer/creator/creator-virtual-post-6` | `/consumer/photographer/virtual-companion-6` |
| 7 | 13930030007 | Niko | `/consumer/creator/creator-virtual-post-7` | `/consumer/photographer/virtual-companion-7` |
| 8 | 13930030008 | Sora | `/consumer/creator/creator-virtual-post-8` | `/consumer/photographer/virtual-companion-8` |
| 9 | 13930030009 | Peach | `/consumer/creator/creator-virtual-post-9` | `/consumer/photographer/virtual-companion-9` |
| 10 | 13930030010 | Bean | `/consumer/creator/creator-virtual-post-10` | `/consumer/photographer/virtual-companion-10` |
| 11 | 13930030011 | Noir | `/consumer/creator/creator-virtual-post-11` | `/consumer/photographer/virtual-companion-11` |
| 12 | 13930030012 | Iris | `/consumer/creator/creator-virtual-post-12` | `/consumer/photographer/virtual-companion-12` |
| 13 | 13930030013 | June | `/consumer/creator/creator-virtual-post-13` | `/consumer/photographer/virtual-companion-13` |
| 14 | 13930030014 | Vera | `/consumer/creator/creator-virtual-post-14` | `/consumer/photographer/virtual-companion-14` |
