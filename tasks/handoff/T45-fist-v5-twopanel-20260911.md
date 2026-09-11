# T45 · 拳交替 v5：**弃用链式**，改双格同图 + 单帧直生（Leo 2026-09-11 令"你试试吧"）

**背景**：链式换手 **4 次全败**（v1 不动 / v2 方向错 / v3 三帧同图 / v4 α→α→α）。已按纪律停止同路径。
**本单弃用链式**，走两条**从未试过**的路径。

---

## 一、为什么换路径（判据依据）

| 事实 | 数据 |
|---|---|
| 同一套链式，**腿成功、拳 4 败** | 腿：相位反转 2 次、前脚极差 120px；拳：0 次换手 |
| **独立生成也失败过** | 现右向批 `atk_right_1/2/3` 即独立生成 → 三帧同一只手 |
| 链式失败的技术原因 | 拳的交替＝**远侧臂横穿躯干 + 收旧手/伸新手两个同时改动**，与 edit 的「最小改动」先验冲突 |

→ **唯一没试过的是"同一张图里同时出现两种姿势"**（模型无法用"少改"回避）。

## 二、两条并行路径（各独立判定）

### 路径 A — **双格同图**（主推）

**一次生成一张图，图内左右两格**：
- **左格**：拳α 朝画面右打出（肩高、伸直）、拳β 收腰侧
- **右格**：**拳β 朝画面右打出**、拳α 收腰侧

**切帧** → 得到 2 帧（α出拳 / β出拳）。

**说明（重要）**：这是**规范 §1c 的「双格对比用法」**（同一张图内表达两种状态），**不是红线 10 所禁的「多帧动作网格」**（后者指一次出 6+ 帧序列）。两格**只要求姿势不同**，切帧后按本单判据过门即可。

**参照**：`Image 1 = idle_right`（身份/画风/比例锚）；prompt 声明两格各自的姿势要求。

**prompt 要点（禁写 left/right hand，用位置指称）**：
1. "Two panels side by side. **Left panel**: the fist that sits at approximately **x=183, y=193** (on a 240-wide canvas) is extended forward **toward the image-right** at shoulder height; the other fist stays retracted at the waist."
2. "**Right panel**: the OPPOSITE fist extends — the one that sits at approximately **x=101, y=205** in the reference — extended forward toward the image-right at shoulder height; the other retracted at the waist."
3. "Both panels: same character, same identity, same costume, same camera, same facing (image-right), same scale. Only the punching arm differs."

### 路径 B — **单帧直生**（备选，成本更低）

不用双格，**分别独立生成两帧**（不做链、不互作参照），prompt 同上按位置指称要求"哪只拳伸出"。
- 风险：可能又出现"两次都画同一只手"（此形态已出现过）；
- 但成本仅 2 张，可与 A 并行做对照。

## 三、判据（PM2 独立复跑）

**先给可机械判定的换手判据（本单新增，前几轮一直缺）**：

> 两帧的**腰侧拳位置**不同即为换手：
> - **α出拳帧**：腰侧拳落在 **β 的原始位（x≈101, y≈205）**
> - **β出拳帧**：腰侧拳落在 **α 的原始位（x≈183, y≈193）**
> - 两者 **x 相差 82px** → **可机械判定**

| # | 判据 | 通过条件 |
|---|---|---|
| D1 | **每帧姿势正确** | 每帧恰好 1 只拳在**前伸区**（240 系 x≥190 且 y∈[150,180]）；1 只在**腰侧区**（y∈[185,215]） |
| D2 | **换手（核心）** | 两帧的腰侧拳**分别落在 x≈101±18 与 x≈183±18 两个不同位置**（即两帧收的是不同的拳） |
| D3 | **两帧可交替播放** | 两帧在**非手臂区域**（y∈[40%,70%] 躯干以外取全身）像素差 **≤8%**（避免播放时身体跳变；若略超，登记为"需归一化/对齐"） |
| D4 | 拳数 | 每帧恰好 2 只拳 |
| D5 | 人数 | 每帧单一角色（双格图切帧后每格内只有 1 个角色） |

**D2 是本轮的关键**——它不靠命名、不靠目视，直接量"收在腰侧的那只拳在哪"。

## 四、产出

```
assets/_trial_<日期>/t45_fist_v5/
  pathA/sheet_2panel.png        （双格原图）
  pathA/atk_alpha.png  atk_beta.png   （切帧）
  pathB/atk_alpha.png  atk_beta.png   （独立生成）
  prompts/（两条路径的 prompt 原文，含位置指称与分工声明）
  qa/fist_v5.json               （A/B 两组的 D1~D5 实测）
  contact/fist_v5_compare.png   （idle + A两帧 + B两帧，1:1 同基线并排）
  credits.json                  （provider=codex-native、cost=0）
```

**交付须附画面逐项描述**：每帧「伸出的是哪只拳（用 idle 坐标指称）／腰侧是哪只／拳到达位置」。

## 五、红线

- **路径 A 1 张 + 路径 B 2 张 = 最多 3 张**，不铺量；
- **不再做链式**（本单明令）；透明/背景不判；比例不判；
- prompt **禁写 left/right hand**（用 idle 坐标指称）；
- 双格图**必须切帧后逐格过 D1/D4/D5**，切帧不合格的格作废重生成（至多 1 次）；
- **A/B 结果都交**——哪条成功就用哪条；**两条都不成就如实报**，届时 PM2 上报 Leo 转路线 D（改动作设计）。
