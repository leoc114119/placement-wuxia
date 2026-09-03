# 类 3 · 战斗待机帧 —— 锚定表法试产 1 张（空拳口径）

> ⚠️ 2026-09-03 v1.3 勘误待同步（以规范 §2.3 为准执行）：①img2img 命令必传 `--aspect 2:1`（默认 9:16 会重排横版，试产 K3-1 实锤）②左格必用无武器锚（c01 产物，带剑帧遗传剑鞘）③校验用 check_left v2=返回图左半区缩放回 240×320 后 RGB 距离均值容差比对（T=12/255 初值），零像素断言作废。本文件步骤表待复跑验证通过后统一修订。

> 依据：规范 §2.3 + b 案已拍板口径（持剑→双手握空拳）。锚定表法=帧生成标准方法。

## 前置检查

```bash
ls assets/characters/hero/walk_q/frames/idle_down.png           # 左格基准帧
cat assets/characters/hero/walk_v2/prompts/q_battle_idle_sheet2.txt   # 配方句式真源
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 构造 2 格表 | 存下方脚本原文为 `c03/make_sheet.py` 并执行 | `assets/_trial_<日期>/c03/sheet.png`（640×320，左格=idle_down 原像素，右格纯白） | PIL 复核尺寸 |
| 2 | 生成试产 prompt | 复制 `q_battle_idle_sheet2.txt` 全文到 `c03/prompts/battle_idle_fist.txt`，**只做两处机械替换**：① 「持剑战斗待机帧」→「战斗待机帧」；② 删除「长剑出鞘握在右手中（剑尖朝前斜下方），」一句，原位插入「双手握空拳成戒备姿势，」 | prompt 落盘 | diff 确认仅差上述两处（程序化） |
| 3 | img2img | `python3 scripts/mxai_img2img.py assets/_trial_<日期>/c03/sheet.png assets/_trial_<日期>/c03/battle_idle_fist_raw.png --prompt-file assets/_trial_<日期>/c03/prompts/battle_idle_fist.txt`（2 分） | 返回 PNG | E-GEN 分支 |
| 4 | **左格锁死校验（必做）** | 存 `c03/check_left.py`（下方脚本）并执行 | 输出 `DIFF=0` | `DIFF>0` → E-ANCHOR-01：作废重跑 1 次（从步骤 3），再犯上报附 diff 值 |
| 5 | credits 记账 | 同 c01 步骤 5 格式 | — | — |

```python
# make_sheet.py —— 锚定表构造：640×320，左格贴基准帧，右格纯白
from PIL import Image
SRC = "assets/characters/hero/walk_q/frames/idle_down.png"
OUT = "assets/_trial_20260903/c03/sheet.png"
base = Image.open(SRC).convert("RGBA")            # 240×320
sheet = Image.new("RGBA", (640, 320), (255, 255, 255, 255))
sheet.paste(base, (0, 0), base)                   # 左格原点粘贴，禁缩放
sheet.save(OUT); print("OK", sheet.size)
```

```python
# check_left.py —— 左格锁死校验：返回图左 240×320 与源帧逐像素 diff
from PIL import Image, ImageChops
src = Image.open("assets/characters/hero/walk_q/frames/idle_down.png").convert("RGBA")
ret = Image.open("assets/_trial_20260903/c03/battle_idle_fist_raw.png").convert("RGBA")
w, h = src.size
left = ret.crop((0, 0, w, h)).resize(src.size) if ret.size != (640, 320) else ret.crop((0, 0, w, h))
bbox = ImageChops.difference(left, src).getbbox()
print(f"DIFF={'0' if bbox is None else bbox}")
```

## 异常分支（本类特有）

- 返回尺寸非 2:1 比例（锚定表被改布局）→ E-GEN-06 上报。
- 左格校验通过但**右格身高/体型与左格明显失衡**（程序化可测：右格主体包络高度/左格主体包络高度 比值 ∉ [0.9, 1.1]）→ 机械口径可测项：记录比值，作为样张数据交 Leo；**禁据此自行重跑**（是否接受=审美）。

## 停点产出

- `c03/battle_idle_fist_raw.png` + sheet 构造/校验脚本 + prompt + credits + 高度比值实测值。
- 验收：DIFF=0、比值数据在案；像不像、姿势对不对 = Leo 目验。
