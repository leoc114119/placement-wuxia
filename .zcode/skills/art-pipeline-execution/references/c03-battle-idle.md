# 类 3 · 战斗待机帧 —— 锚定表法（v2 修订：--aspect + 缩放容差校验）

> 依据：规范 §2.3（09-03 v1.3 K3-1 修复定案）。本 v2 版已并入试产勘误，取代初版命令与零像素校验。
> 45° 俯视战斗帧（T45）另有专用手册 `c13-battle45.md`；本类=正面/侧身口径通用锚定表。

## 前置检查

```bash
ls assets/characters/hero/walk_v2/raw/q_anchor_v5_clean.png    # 参照系
ls assets/_trial_20260903/c01/anchor_noweapon_raw.png 2>/dev/null || ls assets/characters/hero/walk_q/frames/idle_down.png
# 左格优先级：无武器锚（c01 产物或正式无武器版）> idle_down（回退须报告注明"带剑遗传风险已知情"）
cat assets/characters/hero/walk_v2/prompts/q_battle_idle_sheet2.txt   # 配方句式真源
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 选定左格 | 无武器锚优先；带剑帧回退须登记 | 左格文件确定 | — |
| 2 | 构造 2 格表 | `make_sheet.py`（640×320，左格贴左格帧原点不缩放、右格纯白） | sheet.png | 尺寸 640×320 |
| 3 | 生成试产 prompt | `q_battle_idle_sheet2.txt` 两处机械替换：「持剑战斗待机帧」→「战斗待机帧」；「长剑出鞘握在右手中（剑尖朝前斜下方），」→「双手握空拳成戒备姿势，」 | prompt 落盘 | diff 仅两处 |
| 4 | img2img（**必传 --aspect**） | `python3 scripts/mxai_img2img.py <sheet> <out> --prompt-file <配方> --aspect 2:1`（2 分） | 2:1 档位缩放图 | **返回非 2:1 → E-GEN-06 停上报**（默认 9:16 重排=K3-1 已修，复发即 API 行为变化，上报） |
| 5 | 左格保真校验 v2 | `check_left_v2.py`（下方脚本，缩放感知+容差） | `MEAN=x.x/255 PASS` | FAIL → 机械失败重跑 1 次 → 再犯上报附数值 |
| 6 | 高度比校验 | 程序化：右主体包络高/左主体包络高 ∈ [0.9, 1.1] | 比值记录 | 出界 → 数据交 Leo（禁自判） |
| 7 | credits 记账 | name/model/cost/ts/note | — | — |

```python
# check_left_v2.py —— 左格保真校验 v2：返回图左半区缩放回源帧尺寸做容差比对（规范 §2.3-3）
# 零像素断言作废：img2img 全图重编码是物理现实，缩放+容差才是可过的门
import sys
from PIL import Image, ImageChops

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/characters/hero/walk_q/frames/idle_down.png"
RET = sys.argv[2] if len(sys.argv) > 2 else "assets/_trial_20260903/c03/battle_idle_fist_raw.png"
T = 12  # RGB 距离均值阈值（/255），初值待复跑校准；调阈值=改门，须上报

src = Image.open(SRC).convert("RGB"); w, h = src.size
ret = Image.open(RET).convert("RGB")
left = ret.crop((0, 0, ret.width // 2, ret.height)).resize((w, h), Image.LANCZOS)
diff = ImageChops.difference(left, src)
cols = list(diff.getdata())
mean = sum(sum(px) for px in cols) / (len(cols) * 3)
print(f"MEAN={mean:.2f}/255 T={T} {'PASS' if mean <= T else 'FAIL'}")
```

## 异常分支（本类特有）

- 右格凭空出现武器/剑鞘（左格无武器时）→ 机械失败重跑 1 次 → 再犯上报附图。
- v2 校验 FAIL 但结构未变（肉眼可辨同一形象）→ 阈值属门定义，**禁自行调 T**，附数据上报由 Leo 定。

## 停点产出

- raw 双格表 + prompt + v2 校验数值 + 高度比 + credits。
- 验收：机械门全过即停点；姿势/形象观感 = Leo 目验。
