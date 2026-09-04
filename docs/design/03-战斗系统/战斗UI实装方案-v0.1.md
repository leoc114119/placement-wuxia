# 战斗 UI 实装方案（T23 · mini 方案 v0.1）

> 分类：03-战斗系统 · 状态：待 PM 审阅（2026-09-04 · 单段式：事实取证+设计一次成文）
> 依据：《战斗UI实装需求文档》v0.9（需求表 6 行/开放点 3/V1-V5）；素材交付 fe52743/8c92b24/1858a47；本方案全部坐标/色值经像素实测复核（测法见 §二注）
> 红线：battle-core/types/battle-session/battle-input 零改动；渲染层禁 import core（宿主中转）；数值零改动；契约零新增

## 一、范围红线（逐项取证）

### 1.1 零改动清单（T23 交付后 `git diff` 须为 0 的文件）

| 文件 | 取证（为什么可以不碰） |
|---|---|
| `types.ts` | 状态图标数据源=既有冻结字段 `SnapshotActor.statusIcons: string[]`（types.ts:290，注释明示「顶栏四槽数据源…MVP 恒空数组，字段先冻结」）；mode/speed 无需契约（见 1.3-⑤） |
| `systems/battle-session.ts` + `systems/battle-core/*` | 顶栏读快照既有字段（name/hp/maxHp/neili/maxNeili，battle-session.ts:819-837）；托管态经 `_debug.mode()`（:868-874，宿主已在用 main.ts:141/258）；加速态经宿主镜像 `speedOn`（main.ts:116/137，session 内部 `speedFast` 无对外读口，此为既有链路非新增） |
| `ui/battle-input.ts` | ctrl 热区三行标定矩形 `CTRL_BUTTONS`（config:263-267）与三张新切图尺寸逐钮对齐（见 2.4-①），命中判定零变化；plaque 热区与 `hooks.onPlaque` 可选调用（battle-input.ts:143-147）保持——开放点③只动宿主回调（2.3） |
| `systems/hex.ts`、云函数、`config/battle.ts` | 本卡纯表现层，无结算/数值接触 |

### 1.2 授权改动清单

| 文件 | 改动性质 |
|---|---|
| `ui/battle-hex-render.ts` | drawComponents 顶栏段（:931-979）重写为 base+代码绘制；ctrl 段（:1007-1045）三钮独立化+代码字+金框激活态（替换现行绿 rim :1036-1044）；`BattleHexAssets` 结构调整（render 私有类型，:41-49）；view 增渲染私有镜像 `topbarHud`（观测面，2.6） |
| `config/battle-hex.ts` | `BATTLE_HEX_RES.topbar` 换 `topbar_base.png`、增 ctrl 三脸/状态图标路径、`ver` bump（:282-296）；`TOPBAR` 常量组按 topbar_meta 重标定（:213-232）；增 ctrl 代码字/激活样式常量。ADR-004 口径：均为只读展示参数 |
| `proto/battle_demo/main.ts` | 仅渲染接线段：loadAssets（:59-85）换图加载；`onPlaque` toast 回调移除（:140，开放点③默认）。speedOn/uiState/事件消费/帧循环零改动 |
| `tests/battle-hex-render.test.ts`、`tests/battle-hit-feedback.test.ts` | `BattleHexAssets` mock 构造同步（render 测 :609-615、hit-feedback :25）；fillText 计数断言语义随代码字新增而更新（:622/:734）；新增 T23 用例（§三） |
| `proto/battle_demo/bundle.js` | rebuild（`node proto/battle_demo/build.mjs`）+ verTag bump，交付惯例 |

### 1.3 关键现状取证（方案事实基础）

1. **顶栏现状**：整稿 `topbar.png`（带字 1440×300，烘焙名字/满条/「100%」/3 枚图标）全宽贴屏顶 + `rgba(0,0,0,0.25)` 压暗层 + 代码条（`TOPBAR.cover*` 覆盖矩形盖烘焙条后重画，平色）+ 状态槽代码色块。名字与百分比**当前不代码绘制**（烘焙在图里）；条已动态（hp/neili 比例）。
2. **topbar_base.png 实测**（1440×300）：血/内力条=**空槽**（y=100..130 行扫无红蓝填充），四状态槽=空（第 1-3 槽有木色框、第 4 槽边缘无框色——目验项④见 §六），名字区无墨。代码条可直接画进槽内，无需覆盖矩形。
3. **topbar_meta.json 坐标双格式**（实测复核）：`bar_red_fill`/`bar_blue_fill`/`name_bbox` = `[x0,y0,x1,y1]`（原稿烘焙红填充实测 x=321..758，与 `bar_red_fill` 严丝合缝）；`icon_*` = `[x,y,w,h]`；`slots` = `{x0,x1,y0,y1}` 对象；`art_size=[1440,300]`。落库时统一转 `{x,y,w,h}`。
4. **原稿烘焙字定位**（复刻依据）：名字 bbox 322..472 / 23..69（=name_bbox），左起垂直居中；「100%」奶黄字 x≈694..756 / y≈104..126，**右对齐至填充末端**（x1=758）、垂直居中（中心 115=条中心）。填充为纵向渐变：红 rgb(226,42,35)→rgb(147,26,21)，蓝 rgb(26,148,244)→rgb(6,79,175)（条顶/底行均值，剔除边缘高光行）。
5. **ctrl 现状**：整稿 `ctrl_r_alpha.png`（223×448）贴右下 + 激活态代码 strokeRect（托管米黄/加速**绿** rim，:1038——与「金框、无绿点」新口径冲突，本卡替换）。
6. **ctrl 新切图实测**：`ctrl_tuoguan_face.png` 216×128 = `CTRL_BUTTONS[0]`（5,2,216,128）**逐像素同尺寸**；`ctrl_jiasu_face.png` 213×126 ≈ `CTRL_BUTTONS[1]`（213×126）；`ctrl_flee.png` 213×127 = `CTRL_BUTTONS[2]` 同尺寸——**切图已按既有热区标定预裁至钮本体**，布局/热区可零改动换图。meta 的 `canvas 252×164 / button_rect 18,18 / draw_offset -18,-18` 为设计画布溯源信息（交付 PNG=button_rect 裁片），代码不使用。
7. **plaque 现状**：`BATTLE_HEX_RES.plaque` = `plaque_l_alpha.png`，**已在 v8 左上位置上板**（T16 起）；实测 `plaque_l.png` 与 `plaque_l_alpha.png` RGB 通道全等（delta sum=0，仅 alpha 精度差异）——需求#3「上板」现状已满足，本卡 plaque 零改动（口径待背书，§六-5）。
8. **测试/门禁现状**：基线三零全绿（typecheck/lint/test:battle=194 passed、14 skipped 为 BEHAVIOR 门控）；lint 面=game/types/config/systems/ui/net（**不含 proto/battle_demo**，main.ts 以 typecheck 兜底，tsconfig include 含 proto）；import 红线扫描用例既有（render 测 :22-36）。

## 二、设计

### 2.1 顶栏绘制（需求#1）

绘制序（drawComponents 顶栏段重写）：

```
base 贴图（全宽，高=width×300/1440，现状公式不变）
→ 压暗层 rgba(0,0,0,0.25)（保留 dimAlpha 现状，零行为变更；目验可调）
→ hero = snapshot.actors.find(a => a.side === 'player')
→ 血条 / 内力条（渐变填充）
→ 名字 / 两个百分比数字
```

- **art→屏换算**：沿用 `k = width / TOPBAR.artW`（=1440，现行 :941 同式），全部坐标 ×k、整数像素定位（drawImg 同口径 Math.round）。
- **条填充**：槽区 `redFill={x:321,y:94,w:437,h:43}`、`blueFill={x:322,y:153,w:315,h:42}`（meta 值转 `{x,y,w,h}` 落 config）；填充宽 `= w × clamp01(hp/maxHp)`（maxHp≤0 防除零，现行 :875 同防）；色=纵向 `createLinearGradient(y0→y1)` 两停：红 `#e22a23→#931a15`、蓝 `#1a94f4→#064faf`（开放点①默认=采样渐变复刻原稿；Leo 可降为平色，§六-1）。
- **名字**：`hero.name`；`textAlign='left'`、`textBaseline='middle'`、锚 `(nameBox.x×k, nameBox 中心y×k)`；字号 `44 art px ×k`；样式沿用 ctrl_face_text_meta 同族（宋体/奶黄 242,228,192/深描边 42,29,18 宽≈5×k，strokeText 先描后填——DMG 冒字同手法 :1079-1081）。宋体字体栈：`"Songti SC","STSong","SimSun",serif`。
- **百分比**：`${Math.round(frac×100)}%`；`textAlign='right'`、锚 `(fillEndX − 6 art px)×k`（fillEndX=条区 x0+fullW×frac，**随填充末端移动**=复刻烘焙稿位，§六-6）、y=条中心×k；字号 `34 art px ×k`，样式同名字。禁 measureText（右对齐用 textAlign，mock 友好）。
- 现行 `TOPBAR.cover*/barInset/barH/hpColor/neiliColor/statusSlots/statusColors` 常量组由新常量组替换（同区块重写，注释标定出处「topbar_meta.json + 像素实测 2026-09-04」，沿 :218 先例）。

### 2.2 状态图标接口（需求#2 · 开放点②默认：全隐藏留接口）

- 数据面：读既有 `hero.statusIcons: string[]`（冻结字段零新增）——**传入 key 即点亮，不传/空数组=空槽**（base 空槽自然露出，不再画代码色块）。
- 渲染：`i∈0..3`，`key=statusIcons[i]`；key 命中映射表 → `drawImage(iconImg, 槽 i 中心对齐, icon meta 尺寸×k)`；空或未知 key → 不画。
- 映射表（config 资源外置）：`STATUS_ICONS = { poison: 'icon_status_poison.png', blood: 'icon_status_blood.png', skull: 'icon_status_skull.png' }`——key 词表与 types.ts:290 注释语义对齐（中毒→poison、流血→blood、skull=濒死/重伤占位）；第 4 槽无素材预留（不映射即不亮）。
- MVP 快照恒 `[]` → 恒空（V2 验收口径）。

### 2.3 plaque 木牌（需求#3 · 开放点③默认：点击无反应）

- 绘制/热区/位置**零改动**（已上板，§一.3-7；plaqueRect 回归断言既有）。
- 开放点③默认落法：main.ts 移除 `onPlaque` toast 回调（:140）——input 层命中牌面后静默 return（吞点击、不冒提示、不落穿棋盘），符合「无反应（纯占位）、不做未开放提示」。`hooks.onPlaque` 可选调用本身保留（battle-input.ts 零改动）。

### 2.4 ctrl 三钮独立实装（需求#4）

- **布局/热区零改动**：ctrlRect 公式、`CTRL_BUTTONS`、`pickCtrlButton` 全保持；钮 i 屏矩形 = `(cx + b.x/223×cw, cy + b.y/448×ch, b.w/223×cw, b.h/448×ch)`（与现行占位钮换算同构 :1021）。
- **贴图**：`BattleHexAssets.ctrl: ImgLike|null` → `ctrlFaces: { tuoguan; jiasu; flee }`（各自 `ImgLike|null`）。有图 → 铺满钮矩形（切图与标定矩形同尺寸 1:1）；缺图 → 保留现行代码占位钮兜底（L④ 用例锁「热区照常产出」）。
- **代码字（仅托管/加速）**：`label = active ? active_text : normal_text`（托管↔自动、加速↔两倍）；样式按 ctrl_face_text_meta：宋体、size `50/216×btnW`（等比）、奶黄 242,228,192、描边 42,29,18 宽 `5/216×btnW`、阴影偏移 `3/216×btnW`；文字中心=钮内 `(132,66)/216×btnW` 比例位（**meta 最新值 132**，git ac10608 Leo 反馈 122→132；需求文档括注 122 为旧值，§六-4）。逃跑=纯静态图，不叠字。
- **激活态**（判定源=既有 `view.uiState`，宿主每帧填充 main.ts:258 零改动）：`mode==='auto'`（托管）/`speed===true`（加速）：
  - 金框：`strokeRect` 绕钮矩形，`rgba(255,205,95,~0.95)`，lineWidth `≈4/216×btnW`；
  - 亮度提升：**叠亮法**——`save → globalCompositeOperation='lighter' → globalAlpha(外置≈0.2) → 暖色 fillRect 钮矩形 → restore`（近似 brightness 1.24；不采用 `ctx.filter`，微信 canvas 兼容弱）；
  - 柔光：外圈低透明金描边（glow_alpha 0.45 折算，外置可调）；
  - **现行绿 rim 段（:1036-1044）整段删除**（「激活态无绿点/绿框」）。
- 参数全部进 config（`CTRL_TEXT`/`CTRL_ACTIVE` 常量组，出处注释 ctrl_face_text_meta.json）。

### 2.5 宿主接线（main.ts 渲染接线段）

- `loadAssets`：topbar→`topbar_base.png`；增 ctrl 三脸 + 状态图标三枚（图标进 `Map<string,ImgLike>`）；plaque 不动；失败降级 null 不崩（现行口径）。
- `onPlaque` 回调移除（2.3）；`speedOn` 镜像/`view.uiState` 填充/evCursor 事件消费/帧循环**零改动**。
- `BATTLE_HEX_RES.ver`：`t16v2`→`t23v1`；`node proto/battle_demo/build.mjs` 重打包；preview 目验（需求#6）。

### 2.6 观测面（e2e 断言出口，零契约新增）

view 增渲染私有镜像 `topbarHud`（drawComponents 每帧写 last-drawn 值）：

```ts
{ name, hpFrac, neiliFrac, hpPctText, neiliPctText,
  statusIcons: string[], ctrlActive: { mode: boolean, speed: boolean } }
```

e2e 经既有 `__demo.getView()` 读取（behavior_e2e 先例 :53-99），不加新钩子、不进 types.ts。

## 三、验收（V1-V5 → 可观测断言）

| 编号 | e2e 断言（behavior_e2e 扩展段，playwright + __demo） | 单测断言（vitest，mock ctx 计数/参数采样） | 目验留档 |
|---|---|---|---|
| V1 顶栏真实数据 | ①起局 `waitForFunction(pendingInput)` → `getView().topbarHud` 与快照对表：name='小虾米'、`abs(hpFrac − hero.hp/maxHp)<0.01`、`hpPctText === round(hpFrac×100)+'%'`；②既有驱动敌反击（受击事件）→ `waitForFunction(hpFrac 下降)` 且与快照同帧一致；③施放特技（Q2 每次扣内力 1）→ neiliFrac 同步下降 | drawFrame 采样：hp=50% mock 快照 → 血条 fillRect 宽 `=437×k×0.5±1`；fillText 序列含 name 与 `'50%'`；渐变 createLinearGradient 两停色值断言 | shot_t23_topbar_full / _damaged |
| V2 状态槽空占位+接口 | 默认局 `topbarHud.statusIcons.length===0`（快照恒 []） | mock 快照 `statusIcons:['poison','blood']` → drawImage 含两枚图标且槽 1/2 坐标对表；`['',  'unknown']` → 零额外 drawImage | 截图空槽目验（含第 4 槽框体，§六-9） |
| V3 plaque 上板对照 v8 | 回归：`layout.plaqueRect` 与 COMPONENT_LAYOUT 换算一致（既有断言）；点击牌面无 toast/无反应（开放点③默认） | 既有 plaque 热区用例零回归 | 截图对照 v8 左上 |
| V4 ctrl 三钮 | `cssOf(ctrlRect 内钮 1 中心)` 点击 → `session._debug.mode()==='auto'` ∧ `topbarHud.ctrlActive.mode===true`；再点回 manual；speed 同理；逃跑点击 → `phase==='fled'` | uiState.mode='auto' → fillText 含『自动』、strokes 含金 255,205,95；uiState.speed=true → 『两倍』；**strokes 断言不再出现现行绿 rim `'rgba(160, 240, 160, 0.9)'`**；三脸 drawImage 逐钮坐标对表 | shot_t23_ctrl_normal / _active |
| V5 门禁 | — | `npm run typecheck/lint/test:battle` 全绿；`git diff --stat` 核对 1.1 零改动清单=0；import 红线用例绿（既有 :22-36） | bundle rebuild + ver bump + preview file:// 目验 |

注：fillText 计数既有断言（render 测 :622 `≥6`/:734 `≥2`）随代码字新增**按新语义随卡更新**（如顶栏+3 字、ctrl+2 字），注释同步改写——先例：ATK-2 用例 :330 随卡改写。

## 四、易错点（从用例与实测长出）

1. **meta 坐标双格式**：`bar_*_fill/name_bbox` 是 `[x0,y0,x1,y1]`、`icon_*` 是 `[x,y,w,h]`——解析/落库时统一转 `{x,y,w,h}`，混用会把 758 当宽（条宽变 758 而非 437）。落库为 TS 常量+出处注释，**禁运行时读 json**（config 模式与 TILE_SPRITES/:218 一致）。
2. **ctrl 切图已预裁**：PNG=钮本体（216×128 等），**勿按 meta 的 252×164 canvas 缩放**（钮会缩小 ~16% 且错位）；金框/光效为代码绘制，出界部分接受裁切（素材无边距）。
3. **激活判定源**：读 `view.uiState`（宿主填充），**禁渲染层直调 `session._debug`**（渲染层只收快照+view+assets，宿主中转铁律）；`speedOn` 为宿主镜像，flee/reset 时序下镜像会重置（resetDemo :147），e2e 断言注意换局清零。
4. **plaque 点击=吞而非穿透**：移除 onPlaque 后 input 层仍 `return`（battle-input.ts:147），点击不落穿棋盘——「无反应」指无提示，非事件穿透；与开放点③措辞对齐（§六-3）。
5. **fillText 计数与 BattleHexAssets 结构**牵连 3 处 mock 构造（render 测 :609-615/:710、hit-feedback :25）+ main.ts——一次性改齐，防逐个补。
6. **百分比随填充末端移动**：frac→0 时文字贴条左端，深槽底上奶黄+深描边可读性靠描边；若 Leo 目验嫌跳动可改「固定槽右端」（§六-6 备选）。
7. **压暗层同时压暗代码字**：dimAlpha=0.25 先保留（零行为变更），顶栏字发闷则单独降顶栏区 dim 或调字号——参数已外置，不动其他区域。
8. **宋体跨端**：preview 用 "Songti SC"/"STSong"/"SimSun" 栈；微信端无系统宋体回退 serif，M4 接入时目验（本卡 preview 先行，不阻塞）。
9. **jiasu_meta.json 的 `"pair":"tuoguan"` 为切图脚本复制残留**——代码按文件名引用，勿按 pair 字段路由（美术侧已知，非本卡修复项）。
10. **lint 面不含 proto/battle_demo**：main.ts 改动无 lint 门禁，DoD 以 typecheck+test 兜底（tsconfig include 覆盖 proto）。

## 五、拆单（预期 T23 frontend 单卡）

- **T23（frontend，单卡）**：§二全部 + §三用例 + bundle/ver 收尾。无 backend 卡（零契约、零云函数、数值零接触）。
- 预估文件清单=1.2 授权表 7 项；DoD=三零 + 既有 194 用例零回归（允许 §三注明的计数断言随卡改写）+ 1.1 零改动清单 diff=0 + e2e V1-V4 断言绿 + 截图留档。
- 依赖：素材已切齐（fe52743/1858a47），无外部阻塞；人物帧/光影/毒不在本卡（另行接续）。

## 六、评审确认点（需 Leo/PM 背书；默认落法均可先施工后回改，均为 config 参数级）

| # | 事项 | 默认落法 | 备注 |
|---|---|---|---|
| 1 | 开放点① 条填充色 | **采样渐变**：红 #e22a23→#931a15、蓝 #1a94f4→#064faf（纵渐变复刻原稿，实测值）；备选=需求文档平均平色 #b3272a/#2a6fd4 | 渐变更贴原稿；降平色=改 config 两行 |
| 2 | 开放点② 状态图标 | MVP 全隐藏、经既有 `statusIcons` 冻结字段留接口（key 词表 poison/blood/skull，§2.2） | 零契约新增 |
| 3 | 开放点③ plaque 点击 | 无反应：移除 demo toast，点击吞不穿透（§2.3/§四-4） | 「不做未开放提示」按需求默认 |
| 4 | 需求文档勘误 | 需求#4 括注「中心 x=122」应改 **132**（git ac10608 Leo 反馈 122→132，ctrl_face_text_meta 已最新；需求文自身写明「样式按 ctrl_face_text_meta」故以 meta 为准） | 请 PM 回填 v1.0 |
| 5 | plaque 现状口径 | 需求#3「上板」现状已满足（plaque_l 与 plaque_l_alpha RGB 全等，现用 alpha 版更优）→ 本卡 plaque 零改动；若 PM 意图含视觉更新或换文件名，需另说明 | 影响验收 V3 解释 |
| 6 | 百分比文字位置 | 随填充末端右对齐（复刻烘焙稿位）；备选=固定槽右端不动 | 目验拍板 |
| 7 | 名字/百分比字色 | 沿用 ctrl_face_text_meta 同族奶黄+深描边（需求#1 明示沿用）；烘焙原稿为近白色，若要逐像素复刻原稿可改近白 #f8fafa | 目验拍板 |
| 8 | 激活亮度实现 | 叠亮法（'lighter'+暖色低透明，微信兼容）近似 brightness 1.24；不用 ctx.filter | 实现取向 |
| 9 | 第 4 状态槽框体 | topbar_base 第 4 槽无木色框（实测），先按美术现状目验；若视觉异样报美术管线补框 | 非代码项 |

## 更新记录

| 日期 | 变更 | 签字 |
|---|---|---|
| 2026-09-04 | v0.1 初版：单段式取证+设计（坐标/色值像素实测复核；三开放点默认落法+6 项事实性确认点；V1-V5 落 e2e/单测断言） | ZCode 主架构 |
