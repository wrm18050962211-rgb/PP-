# PP 平台本地测试账号清单

登录入口：http://127.0.0.1:5173/auth/login

使用方法：
1. 在登录页输入下方任意手机号。
2. 点击“获取验证码”。
3. 页面会显示“本地测试验证码”，填入后登录。
4. 当前测试数据按“一个手机号就是一个真实用户”处理。虚拟用户不会再用同一个手机号同时生成创作者和摄影师两套身份。

身份规则：
- `1391001xxxx`：仅注册创作者身份。
- `1392002xxxx`：仅注册基础摄影师身份。
- `1393003xxxx`：仅注册虚拟摄影师身份，用于发现页和寻找摄影师页的真人化测试。
- 摄影师刚注册时上传的作品属于摄影师自己的作品，不显示创作者栏。
- 订单完成后共同编辑并发布的成片会记录预约创作者，作品详情才显示创作者栏。

## 仅创作者手机号

这些账号可以作为创作者下单、聊天、完成订单、确认共同成片。

| 序号 | 手机号 | 创作者账号 | 创作者主页 |
| --- | --- | --- | --- |
| 1 | 13910010001 | Creator 1 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000701` |
| 2 | 13910010002 | Creator 2 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000702` |
| 3 | 13910010003 | Creator 3 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000703` |
| 4 | 13910010004 | Creator 4 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000704` |
| 5 | 13910010005 | Creator 5 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000705` |
| 6 | 13910010006 | Creator 6 | `/consumer/creator/creator-00000000-0000-0000-0000-000000000706` |

## 基础摄影师手机号

这些账号可以作为摄影师接单、查看订单、发布作品。

| 序号 | 手机号 | 摄影师账号 | 摄影师主页 |
| --- | --- | --- | --- |
| 1 | 13920020001 | Mori | `/consumer/photographer/companion-mori` |
| 2 | 13920020002 | Nana | `/consumer/photographer/companion-nana` |
| 3 | 13920020003 | Echo | `/consumer/photographer/companion-echo` |

## 虚拟摄影师手机号

这些账号对应发现页、作品详情和寻找摄影师页里的虚拟摄影师。它们只有摄影师身份，不会再生成同手机号的创作者主页。

| 序号 | 手机号 | 摄影师账号 | 摄影师主页 |
| --- | --- | --- | --- |
| 1 | 13930030001 | Luna | `/consumer/photographer/virtual-companion-1` |
| 2 | 13930030002 | Aki | `/consumer/photographer/virtual-companion-2` |
| 3 | 13930030003 | Rin | `/consumer/photographer/virtual-companion-3` |
| 4 | 13930030004 | Mika | `/consumer/photographer/virtual-companion-4` |
| 5 | 13930030005 | Yoyo | `/consumer/photographer/virtual-companion-5` |
| 6 | 13930030006 | Cici | `/consumer/photographer/virtual-companion-6` |
| 7 | 13930030007 | Niko | `/consumer/photographer/virtual-companion-7` |
| 8 | 13930030008 | Sora | `/consumer/photographer/virtual-companion-8` |
| 9 | 13930030009 | Peach | `/consumer/photographer/virtual-companion-9` |
| 10 | 13930030010 | Bean | `/consumer/photographer/virtual-companion-10` |
| 11 | 13930030011 | Noir | `/consumer/photographer/virtual-companion-11` |
| 12 | 13930030012 | Iris | `/consumer/photographer/virtual-companion-12` |
| 13 | 13930030013 | June | `/consumer/photographer/virtual-companion-13` |
| 14 | 13930030014 | Vera | `/consumer/photographer/virtual-companion-14` |
