# T45 · 拳交替 v4：方向恒定 + 换手交替（Leo 2026-09-11 令）

**前置更正（PM2 自查）：v3 失败是我的规格写错**——v3 单写「三帧同方向同高度」，把"方向"当成了变量，等于要求三帧**画同一个姿势**，结果 atk_2/atk_3 只差 **1.91% 像素**、拳心坐标完全相同（1086 系 (996,728)）。**方向从来不是变量**。

## 一、需求（Leo 原话口径）

> **右向交替左右手出拳**——角色朝画面右，出拳永远朝画面右（＝面朝方向，**恒定**）；**唯一变量是哪只手**。正常出拳不会只用一只手。

```
恒定：方向 = 朝画面右（角色面朝方向）；高度 = 肩高；手臂伸直
变量：哪只手伸出 —— 逐帧交替
```

## 二、两条拳的定义（**用位置指称，禁用"左手/右手"命名**）

在起点 `idle_right`（240×320）上，两只拳的实测位置：

| 代号 | idle 位置 | 说明 |
|---|---|---|
| **拳α** | **(183, 193)** | 两只拳中**更靠画面右**的那只（离身体中线更远） |
| **拳β** | **(101, 205)** | 更靠画面左、更靠下（腰带侧）的那只 |

**全单只用 α / β 指称，prompt 里也必须用位置描述**（如 "the fist that is closer to the image-right in the input, at roughly x=183,y=193 on a 240-wide canvas"），**禁写 left/right hand**——已三次因命名歧义出错。

## 三、链与逐帧目标（写死）

```
链：idle_right → atk_1 → atk_2 → atk_3
每步输入 = 上一步产物（SEQUENTIAL，非首帧并行）
```
| 帧 | 伸出 | 收回 |
|---|---|---|
| atk_1 | **拳α** 朝画面右打出（肩高、伸直） | 拳β 收至腰侧 |
| atk_2 | **拳β** 朝画面右打出 ★**换手** | 拳α 收至腰侧 |
| atk_3 | **拳α** 朝画面右打出 ★**换回** | 拳β 收至腰侧 |

**共 3 张**（原生通道、0 积分）。

## 四、参照（**不画示意图**；用已验证成品当姿势样板）

```
Image 1 = 上一步产物             （身份/画风/连续性/当前姿势）
Image 2 = v2 atk_1 成品          （★"朝画面右出拳"的姿势与位置样板）
          assets/_trial_20260910/t45_chain_limb_alternation_v2/raw/atk_right_1_chain.png
```
**prompt 分工声明**：Image 1 提供身份/画风/镜头/服饰/当前姿势；**Image 2 提供"伸出拳"的伸展形状、高度与终点位置**（只取这个，不取身份）。

**prompt 必须包含的动作描述（按位置指称，**禁写 left/right hand**）**：
1. "**The character faces the image-right. The punch always goes toward the image-right — this never changes.**"
2. "One fist extends **forward toward the image-right**, fully extended at shoulder height, reaching the same forward extent as the extended fist in Image 2. The other fist is **retracted at the waist**."
3. "**Alternate the punching arm.** The arm extended in Image 1 must be **the retracted one** in this frame, and the other arm must extend forward. (Do not repeat the same punching arm.)"
4. "**Do not raise the back arm behind the character** — the punching arm must cross to the front and reach forward, not lift backward toward the image-left."

**明确禁止（写入 prompt）**：禁把方向当变量（v3 错法）；禁让后手抬到画面左后方（v2 atk_2 错法）；禁用 left/right hand 命名（连错三轮的根源）。

## 五、判据（PM2 独立复跑）

**先说明一个技术限制（决定判据怎么写）**：本项目的**手臂被青色衣袖覆盖、只有拳头露肤色**，所以**拳块无法追踪"这只拳接在哪条肩上"** —— 靠像素自动判定"哪只手"不可靠。故：

| # | 判据 | 通过条件 | 可量化? |
|---|---|---|---|
| C1 | **出拳到位**（硬门） | 每帧**恰好一只拳**落在「前伸区」：240 画布 **x ≥ 190 且 y ∈ [150,180]**（肩高、画面最右）；另一只落在「腰侧区」x ∈ [85,135] 且 y ∈ [185,215] | ✅ 自动 |
| C2 | **帧间确有变化**（硬门） | 相邻帧在上身躯干带（y 40%~70%）的像素差 **≥ 6%**（v3 实测仅 **1.91%** ＝同一张图；真换手必然更大） | ✅ 自动 |
| C3 | **确实换手**（**人判**） | PM2 目视对照图，逐帧判定「前伸的是哪只拳（α 或 β）」，要求序列**交替**（α→β→α 或 β→α→β） | ⚠️ **目视**（理由见上） |
| C4 | 拳数 | 每帧恰好 **2 只拳** | ✅ 自动 |
| C5 | 链真实性 | 第 N 步输入 SHA == 第 N−1 步输出 SHA | ✅ 自动 |

**C1 抓"手抬到画面左＝朝后"**（v2 atk_2 的 `x=167` 正是此形态，会直接被 C1 判失败）；
**C2 抓"三帧同一张图"**（v3 的 1.91%，会直接判失败）；
**C3 抓"三帧都是同一只手"**（v3/v2 的真实病根）——由 PM2 目视 + 画面逐项描述判定，**不假装能自动量**。

## 六、产出

```
assets/_trial_<日期>/t45_chain_fist_v4/
  chain/idle_right.png（来源 SHA 标注）
  raw/atk_right_1/2/3.png（3 张原生）
  prompts/（3 次 prompt 原文，须含 Image1/Image2 分工声明与"朝向画面右"描述）
  refs.json（含 Image 2 的 SHA）
  qa/fist_alternation.json（C1~C5 全部实测值）
  contact/fist_v4_4up.png（idle + 三帧并排，1:1 同基线）
  credits.json（provider=codex-native、cost=0）
```

**交付须附画面逐项描述**：每帧「伸出的是哪只拳（用 idle 位置指称：α 或 β）／拳到达的画面位置／另一只拳在哪」。

## 七、红线

- **只跑 3 张**；透明/背景不判；**比例不判**；
- **prompt 禁出现 left/right hand**（用位置指称）；
- **禁把"方向"当变量**（v3 的错法）；
- 每步机械失败重跑至多 1 次，再失败停手上报；
- 若 v4 仍出现"三帧同一只手"（C2 不过），**如实交结论并停**——届时 PM2 上报 Leo，不再加试。
