# Q2-T31-FEB · 三处跨卡口径：参考屏高像素基准 / renderer 首调 resize 早退 / 分支内方案文档版本

- 提出：ZCode（frontend / T31-FE-B）
- 日期：2026-09-14
- 状态：**停等 PM/arch 答复**（三处均已在 T31-FE-B 内用宿主侧桥接或记录方式落地，不阻塞本卡自验）
- 依据：`2.5D角色运行时接入技术方案.md`（真源 commit `9e824cb5`）§4.1 / §7 / §9.2；
  `config/character-3d.ts`、`ui/character3d/pass.ts`、`ui/character3d/renderer.ts`（均卡 A 冻结件）

## Q2-1 · `screenHeightPxAtReference` 是逻辑像素还是物理像素？

- 事实：`config/character-3d.ts` 注释写「参考屏高（画布物理像素）」= `TILE_H × PIECE.heightPerTile` = 123.2；
  但 `PIECE.heightPerTile` 在 2D 层是**逻辑像素**口径（2D 上下文带 dpr transform）。pass 在 **GL 正交像素空间
  （= 背衬物理像素）**里直接消费该值做 `scale = screenHeightPxAtReference / modelHeight`。
  ⇒ dpr=2 的屏上，3D 人高 = 123.2 物理像素 = 61.6 CSS px，而 2D 棋子高 = 123.2 CSS px，**3D 只有 2D 的一半大**。
- 我的处置（宿主侧桥接，未改 config/pass）：`main.ts` 把 profile 副本的
  `screenHeightPxAtReference × dpr` 传进 runtime，使 3D 人高与 2D 棋子高在**同一屏上相等**。
- 请裁：① 语义定谁（建议：config 注释改「逻辑参考高」，pass 侧乘 pixelRatio —— 需 arch 定 pass 是否吃 pixelRatio）；
  ② 我这次的宿主侧桥接是否作为 S1 正式口径保留到 C 卡/正式接入（若 arch 在 pass 侧修，我这条桥接要同步删）。

## Q2-2 · `renderer.resize()` 首调「尺寸未变即早退」⇒ 正交投影可能永不初始化

- 事实：`renderer.ts` 的 `orthoPixel(projection, …)` **只在 `resize()` 内**调用，而 `resize()` 首行
  `if (w === backbufferW && h === backbufferH) return;`；`backbufferW/H` 初值取创建时的 `canvas.width/height`。
  ⇒ 宿主若按目标背衬尺寸建画布再 `resize(W,H,dpr)`，首调必早退、`projection` 保持全零、**人物不可见**（dpr=1 必踩）。
- 我的处置：`main.ts` 先以 `1×1` 建离屏画布再 `resize(W,H,dpr)`，保证首调不早退（`main.ts` 有显式注释）。
- 请裁：是否需要给卡 A/C 的 owner 补一条「buildAll 内初始化投影 / resize 去掉早退对首调的影响」的小修；
  我未改 `ui/character3d/**`（不在本卡文件面）。

## Q2-3 · 分支内方案文档比真源 commit 落后 2 行

- 事实：任务卡声明真源 = `9e824cb5`（契约含 `isJump`）；该 commit **不是** `task/t31-fea` HEAD 的祖先——
  分支内 `docs/design/01-基础功能/2.5D角色运行时接入技术方案.md` 的 blob 仍是 `a35ccb0d`（= `9e824cb5` 的父版），
  缺的正是 §3 `isJump` 契约行与 §4.1 的「禁 hopPx 猜」句（其余逐字相同）。
- 影响：**零实现影响**（卡 A 已按 `9e824cb5` 落地契约与判据，我按同口径实现，并以 `git show 9e824cb5` 复核过差异）。
- 请裁：文档属 arch/PM 域，我未改；若希望分支自含真源，需一条 arch 侧的 doc commit（或在 C 卡基座里带上）。

## 附：一条工具链影响（无需裁决，仅同步）

T29 的 2D hero 武器层按 §8 卡 B 已对 3D hero 停用（配置/素材/用例保留）。因此：
- `proto/battle_demo/shot_weapon_layer.mjs`、`shot_sixdir.mjs` 若在**新基座重跑**，画面里的主角将是 3D 人物，
  这两个脚本的三视口留档不再演示 2D 剑层（资源门断言仍会 PASS）；T29 的既有 `weapon45_*`/`t45six_*` 留档我**未覆盖**（保持历史证据）。
- preview 仍会预载 55 张 2D hero 帧（不再被绘制）。是否随「微信 2D 宿主迁移」卡一并清理预载，请 PM 排卡。
