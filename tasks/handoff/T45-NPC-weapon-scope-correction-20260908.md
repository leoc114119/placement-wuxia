# T45 NPC 武器路线纠正 · 2026-09-08

## Leo 最新口径

> 其实 NPC 角色不用合武器帧，以后生成的时候直接生成武器就可以了，我们要合的是主角色的武器才对。

本条覆盖此前 T45 排产中“山贼空手终态、带刀重生成取消”的安排。后续生产与接线按以下边界执行：

- **NPC/敌人**：角色帧直接生成带武器版本；不做 NPC 武器合帧、不生产独立 NPC 武器叠层、不建立 NPC 武器锚点或拳头遮挡 manifest。
- **主角色**：身体帧继续空手；武器由独立贴图按逐帧锚点在运行时合成叠加。D 路线的锚点、`layerOrder`、遮挡数据只服务主角色。
- **旧候选处置**：`assets/_trial_20260908/t45_podao_d_seq160_frame02_walk_rightdown_1/revisions/arm-perpendicular-v4/` 及此前 T45 NPC 武器合成候选均为历史留档，停止研发消费；正式 runtime 未因这些候选改写。
- **T45 后续排产**：NPC/敌人 36 张六向带武器角色帧已由美术线 seq=186 排产令接收，等待生成与双门验收；主角色武器合成试产继续独立推进。

## 已同步真源

- `docs/PROJECT-MEMORY.md`
- `docs/design/01-基础功能/T45战斗帧45度-需求文档-v2.0.md`
- `docs/design/01-基础功能/角色帧规范.md`
- `docs/design/01-基础功能/美术素材生成流程规范.md`
- `docs/design/03-战斗系统/战斗人物六向帧接线方案.md`
- `docs/design/03-战斗系统/素材落地账.md`

状态：范围纠正已记录，seq=186 已达排产；本文件是交研发线的口径通知，不代表 NPC 带武器新帧已生成或通过 Leo/PM 门。

交付证据：文档与交接 commit `7155990e2f4cd8f5f1d92be8360eea0cc1c9aa96` 已推送分支 `codex/t45-shanzei-2b-pilot`；projbus delivery `seq=189` / messageId `cfaa0c2d2b1b4e9c89ba163c5d61c062` 已发送至 rd。随后以 commit `99f9dc17b6e188360af5f9d19a9e18701aa44aef` 补齐 LOG/线程/交接证据，delivery `seq=190` / messageId `38a2f93b73d04c9083e929779208055d` supersedes seq=189 的证据指针。runtime 未改，NPC 36 张带武器角色帧仍待生成与双门验收。
