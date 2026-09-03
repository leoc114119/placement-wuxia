# 类 8 · 六边形瓦片 —— 双样张对照（P-2 裁决实证）

> ⚠️ 2026-09-03 v1.3：几何锁契约不变（RX=HW/cos30° 修正式为正式实现）；材质风格目标改为第 9 张 AI 样张（厚金棕描边/顶亮面+斜中间调+侧暗面三段受光/植绒颗粒，规范 §2.8）——程序化材质 v2 迭代待真实需要瓦片时启动（按需标准化）。AI 直出路线已否决（形态缺陷）。

> 依据：规范 §2.8 + Leo 09-03 拍板（程序化样张 0 分 + AI 样张 1 张 2 分，并列交 Leo 定路线）。
> 本类是唯一允许修改既有脚本的任务：`scripts/gen_hex_tileset.py`（flat-top → pointy-top 改写），diff 全文附报告。

## 代码契约（config/battle-hex.ts TILE_SPEC，唯一真值，禁改）

| 参数 | 值 | 说明 |
|---|---|---|
| TILE_W | 88 | 瓦片宽 |
| hRatio | 0.7 | 顶面高 = 62（round(88×0.7)） |
| sideRatio | 0.12 | 侧面厚 = 7（round(62×0.12)）→ 瓦片总高 69 |
| rowRatio | 0.75 | 行距 ROW_H = 46（round(62×0.75)，拼贴用） |
| 拼贴 | px=(col+(row 奇?0.5:0))×88；py=row×46 | 奇偶行错位半格 |

## 前置检查

```bash
head -30 scripts/gen_hex_tileset.py        # 确认为 flat-top 旧版（ANGLES 0/60/…/300）
cat config/battle-hex.ts | sed -n '9,20p'  # TILE_SPEC 在位
```

## 步骤表

| # | 动作 | 规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 改写脚本 | 按下方【改写规格表】逐项修改 `scripts/gen_hex_tileset.py`；仅动几何常量与顶点角度/材质色值相关行，禁重构无关代码 | 脚本可运行 | `python3 scripts/gen_hex_tileset.py` 无异常退出 |
| 2 | 渲染样张 | 脚本输出：单块 grass、单块 dirt、2×1 横排 tileset、4×4 拼贴验证图 → 全部落 `assets/_trial_<日期>/c08/`（**不入库正式目录**） | 4 个文件 | PIL 开图+尺寸=规格算式 |
| 3 | AI 样张 | `python3 scripts/mxai_gen.py --prompt "$(cat assets/ui/pixel/battle/prompts/tileset_v2.txt)" --out assets/_trial_<日期>/c08/tileset_ai_raw.png`（2 分，prompt **逐字用原文禁改**） | PNG | E-GEN 分支；AI 图透明度不保证，如实记录 |
| 4 | 并列拼板 | 程序化把【程序化 2×1】与【AI 样张】缩放同高并列存 `c08/compare_board.png`（禁改内容只排版） | 1 张对照图 | — |
| 5 | diff 留档 | `git diff scripts/gen_hex_tileset.py > assets/_trial_<日期>/c08/gen_hex_tileset.diff` | diff 文件 | — |
| 6 | credits 记账 | 1 条（2 分） | — | — |

## 【改写规格表】（逐项给死）

1. 顶点角度：flat-top `ANGLES=(0,60,120,180,240,300)`（左右尖）→ pointy-top **(30,90,150,210,270,330)**（上下尖 90°/270°、左右竖直边）。
2. `TILE_W` 256 → **88**；`SQUASH` 0.63 → **0.70**（顶面高 62）；`SIDE` 13% → **12%**（=7，总高 69）。
3. 输出追加 4×4 拼贴验证图（按契约拼贴算式摆放，奇偶行错位半格）。
4. 草地/土路两材质保留原纹理逻辑，色值不动（样张目验时 Leo 若嫌色不对，属审美反馈再调）。

## 异常分支（本类特有）

- 旧脚本结构与规格表冲突、无法局部改写（需重写>50%）→ 停上报说明冲突点，**禁整体重写**（重写=设计变更，归 Leo 裁决）。
- 样张渲染成功但**方向仍不对**（尖角没朝上下）→ 机械性失败（几何公式错），改角度重渲染（程序化产物，不受重跑限制，但每次都要记录）→ 两轮仍不对 → 停上报。
- 方向对但观感差 → 审美，交 Leo（这是双样张对照的本来目的）。

## 停点产出

- `c08/`：程序化 grass/dirt 单块+2×1+4×4 拼贴、AI 样张、compare_board.png、脚本 diff、credits（2 分）。
- 验收：方向由程序化几何保证；**路线选择 = Leo 看对照板裁决（P-2 关闭动作）**。
