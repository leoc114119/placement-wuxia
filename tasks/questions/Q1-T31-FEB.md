# Q1-T31-FEB · 轻功 3D 动作窗口被 isJump 窗口截断（升段 300ms / 演出 600ms）

- 提出：ZCode（frontend / T31-FE-B）
- 日期：2026-09-14
- 状态：**停等 PM/arch 裁决**（本卡不阻塞 T31-FE-B 其余交付；我按方案字面实现，未自行改口径）
- 依据：`docs/design/01-基础功能/2.5D角色运行时接入技术方案.md`（真源 commit `9e824cb5`）§4.1 / §5 jump 行；
  `types.ts` `CharacterRenderCommand.isJump` 契约注释；`systems/battle-session.ts`（非本栈）

## 1. 现象

3D 主角的 `jump` 动作只在**起跳后半程之前**结束，抛物线剩余段（含顶点与落地）播的是 walk/idle：

- 会话侧 `isJump` 的可见窗口 = `c.isJump && c.moveT < 1`（`battle-session.ts:1281`），
  而 `moveT` 以 `ANIM_MS.walk = 300ms` 收敛到 1（`battle-session.ts:930`）；
- 视图侧轻功抛物线演出时长 = `jumpParamsFor(dist).duration` = **0.6s（≤2 格）/ 最远 1.2s**
  （`config/battle-hex.ts` JUMP 段），即人还在空中时快照 `isJump` 已翻 false；
- 按 §4.1（`isJump` 原样透传、**禁用 hopPx 猜**）+ 卡 A 已验收的状态机（判据 = `state==='walk' && isJump`，
  `arch seq=417`），3D 动作在 isJump 翻 false 的当帧即从 `jump_v6_1p5s` 切走。

实测（`proto/battle_demo/shot_character3d.mjs`，三视口同值）：

```
升段：hop=15.3px  isJump=true   state=walk   → 播 jump clip
降段：hop=87.7px  isJump=false  state=walk   → 已切走（顶点/下降段不是 jump 动作）
```

证据图：`proto/battle_demo/shots/c3d_560x700_state_jump_rise.png`（升段，人在空中且抬升正常）
与 `c3d_560x700_state_jump_descend.png`（apex 处人仍在空中、动作已非 jump）。
横向位移与垂直位移本身**无问题**（垂直位移唯一来源=pieceHop，无双抬升；会话链路 `shot.mjs` ② PASS）。

## 2. 为什么我不自决

- §4.1/§5 与卡 A 的整改（seq=414 B1）明确锁死「`isJump` 直读快照、禁 hopPx 推断」，
  **渲染层没有可用的第二判据**；把窗口延长到「演出结束」等于在渲染层重新引入 hop 推断（与已验收锁冲突）。
- 根治点在**会话窗口**（`systems/*`，backend-battle 域）或**契约**（`types.ts` / 方案 §4.1，arch 域），
  两者都不在 T31-FE-B 的授权文件面内。

## 3. 待裁选项（请 PM 转 arch / backend-battle 定）

- 甲：**会话侧延长 isJump 窗口**至演出结束（如 `isJump = c.isJump && moveT < 1` 改为
  「轻功意图保持到 `moveAnim` 结束」或「按 `jumpParamsFor` 时长设 `animLeftMs`」）——
  渲染层零改，2D/3D 表现同时正确；风险=会话表现字段语义变化，需 backend-battle 卡 + 既有行为用例复核。
- 乙：**契约加一个 view 侧轻功演出窗字段**（如 `CharacterRenderCommand.jumpHold` 由渲染层按 `pieceHop` 给），
  arch 修订 §4.1/§5；需说明与「禁 hop 推断」的边界（是**呈现窗口**而非**意图判据**）。
- 丙：**接受现状**（jump 动作只覆盖起跳段），在方案 §5 jump 行显式写明该边界，本卡按现状收口；
  但需 Leo 目验确认「下降段播走路姿势」可接受。

## 4. 影响面

- T31-FE-B 其余交付不受阻（自验全绿，见交付报告）。
- T31-FE-C（真机门）会录到同一现象；若选甲/乙，C 卡的真机动作证据应在新口径下重录。
