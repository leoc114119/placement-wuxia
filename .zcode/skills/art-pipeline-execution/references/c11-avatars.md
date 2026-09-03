# 类 11 · 头像 —— 双路线对照（山贼甲内芯，P-7 裁决实证）

> 依据：规范 §2.11 + Leo 09-03 拍板（同角色：切图 0 分 + 生成 2 分，并列交 Leo 定量产路线）。

## 前置检查

```bash
ls assets/characters/enemy/shanzei_a/frames/idle_side.png   # 切图源（既有整稿形象帧）
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 路线 A：切图 | 下方 `crop_avatar.py` 逐字存 `c11/crop_avatar.py` 并执行（源=idle_side.png，圆拟合取头部近似：主体包络上部 40% 高度带内最大内切圆） | `c11/avatar_cut.png` 256×256 | PIL 开图；空图 → E-GATE-01 |
| 2 | 路线 B：生成 | 【prompt C】逐字存 `c11/prompts/avatar_shanzei.txt` → `python3 scripts/mxai_gen.py --prompt "$(cat ...)" --out c11/avatar_gen_raw.png`（2 分） | PNG | E-GEN 分支 |
| 3 | 路线 B 抠图 | `python3 scripts/cutout_white_bg.py c11/avatar_gen_raw.png c11/avatar_gen.png` | 透明底 | E-CUT 分支 |
| 4 | 路线 B 规格化 | PIL 居中裁切缩放至 256×256 存 `c11/avatar_gen_256.png`（脚本同文件第三函数，规则给死：主体包络短边满 256） | 256×256 | 记录包络占比 |
| 5 | 并列拼板 | 两路线产物并排同高存 `c11/compare_board.png`（只排版禁改内容） | 1 张 | — |
| 6 | credits 记账 | 1 条（2 分，路线 A 记 0） | — | — |

**【prompt C · 山贼头像内芯】**
```
精美像素风格游戏头像，单人：中国武侠山贼男性头像，绑头巾，粗布短打，络腮胡茬，凶悍但带喜感的表情，胸像构图居中。纯色浅米背景，无文字，无水印，无边框。
```

```python
# crop_avatar.py —— 路线A：程序化切头像（近似规则定死；正式口径归 FE 联调）
from PIL import Image
SRC = "assets/characters/enemy/shanzei_a/frames/idle_side.png"
OUT = "assets/_trial_20260903/c11/avatar_cut.png"
img = Image.open(SRC).convert("RGBA")
w, h = img.size
head = img.crop((0, 0, w, round(h * 0.4)))       # 头部带=顶部 40%
box = head.getbbox()
side = min(box[2]-box[0], box[3]-box[1])
tile = head.crop((box[0], box[1], box[0]+side, box[1]+side)).resize((256, 256), Image.LANCZOS)
tile.save(OUT); print("OK", tile.size)
```

## 异常分支（本类特有）

- 切图源帧头部不在顶部 40% 带（姿势特殊）→ 按实测包络记录结果交 Leo（近似规则失灵本身是 P-7 路线裁决的输入数据），**禁自调比例参数**。
- 生成头像带边框/文字 → E-GEN-03。
- 两路线谁好 = 纯审美 → 全部停点交 Leo（本类产物即对照板，无合格/不合格判定权）。

## 停点产出

- `c11/avatar_cut.png`、`c11/avatar_gen_256.png`、`c11/compare_board.png`、prompt、credits（2 分）。
- 验收：量产路线 = Leo 看对照板裁决（P-7 关闭动作）。
