# PP 平台本地测试账号清单

登录入口：http://127.0.0.1:5173/auth/login

使用方法：

1. 在登录页输入下方任意手机号。
2. 点击“获取验证码”。
3. 页面会显示“本地测试验证码”，填入后登录。
4. 同一手机号如果只注册了一个身份，就只能进入该身份；如果创作者和摄影师两个身份都注册过，就能在“我的”页自由切换。

身份规则：

- 创作者账号和摄影师账号是两套独立身份，主页、资料、订单视角都分开。
- 同一个手机号可以分别注册创作者身份和摄影师身份。
- `1391001xxxx`：仅注册创作者身份。
- `1392002xxxx`：仅注册摄影师身份。
- `1393003xxxx`：同一手机号同时注册了创作者身份和摄影师身份。

## 仅创作者手机号

这些手机号没有摄影师身份，创作者端“摄影师”卡片会显示“注册成为摄影师”。

| 序号 | 手机号 | 创作者账号 | 创作者主页 |
| --- | --- | --- | --- |
| 1 | 13910010001 | Creator 1 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000701` |
| 2 | 13910010002 | Creator 2 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000702` |
| 3 | 13910010003 | Creator 3 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000703` |
| 4 | 13910010004 | Creator 4 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000704` |
| 5 | 13910010005 | Creator 5 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000705` |
| 6 | 13910010006 | Creator 6 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000706` |

## 仅摄影师手机号

这些手机号没有创作者身份，摄影师端“创作者”卡片会显示“注册成为创作者”。

| 序号 | 手机号 | 摄影师账号 | 摄影师主页 |
| --- | --- | --- | --- |
| 1 | 13920020001 | Mori | `/consumer/photographer/companion-mori` |
| 2 | 13920020002 | Nana | `/consumer/photographer/companion-nana` |
| 3 | 13920020003 | Echo | `/consumer/photographer/companion-echo` |

## 同手机号双身份

下面每一行代表同一个手机号分别注册了创作者身份和摄影师身份。登录后默认进入创作者身份，可在“我的”页切换到摄影师身份。

| 序号 | 手机号 | 创作者账号 | 创作者主页 | 摄影师账号 | 摄影师主页 |
| --- | --- | --- | --- | --- | --- |
| 1 | 13930030001 | Luna Creator | `/consumer/creator/creator-virtual-post-1` | Luna | `/consumer/photographer/virtual-companion-1` |
| 2 | 13930030002 | Aki Creator | `/consumer/creator/creator-virtual-post-2` | Aki | `/consumer/photographer/virtual-companion-2` |
| 3 | 13930030003 | Rin Creator | `/consumer/creator/creator-virtual-post-3` | Rin | `/consumer/photographer/virtual-companion-3` |
| 4 | 13930030004 | Mika Creator | `/consumer/creator/creator-virtual-post-4` | Mika | `/consumer/photographer/virtual-companion-4` |
| 5 | 13930030005 | Yoyo Creator | `/consumer/creator/creator-virtual-post-5` | Yoyo | `/consumer/photographer/virtual-companion-5` |
| 6 | 13930030006 | Cici Creator | `/consumer/creator/creator-virtual-post-6` | Cici | `/consumer/photographer/virtual-companion-6` |
| 7 | 13930030007 | Niko Creator | `/consumer/creator/creator-virtual-post-7` | Niko | `/consumer/photographer/virtual-companion-7` |
| 8 | 13930030008 | Sora Creator | `/consumer/creator/creator-virtual-post-8` | Sora | `/consumer/photographer/virtual-companion-8` |
| 9 | 13930030009 | Peach Creator | `/consumer/creator/creator-virtual-post-9` | Peach | `/consumer/photographer/virtual-companion-9` |
| 10 | 13930030010 | Bean Creator | `/consumer/creator/creator-virtual-post-10` | Bean | `/consumer/photographer/virtual-companion-10` |
| 11 | 13930030011 | Noir Creator | `/consumer/creator/creator-virtual-post-11` | Noir | `/consumer/photographer/virtual-companion-11` |
| 12 | 13930030012 | Iris Creator | `/consumer/creator/creator-virtual-post-12` | Iris | `/consumer/photographer/virtual-companion-12` |
| 13 | 13930030013 | June Creator | `/consumer/creator/creator-virtual-post-13` | June | `/consumer/photographer/virtual-companion-13` |
| 14 | 13930030014 | Vera Creator | `/consumer/creator/creator-virtual-post-14` | Vera | `/consumer/photographer/virtual-companion-14` |
