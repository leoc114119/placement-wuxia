# 类 5 · 武器独立贴图 —— 剑 2 张（腰挂态+手持态）+ anchors.json

> 依据：规范 §2.5（6 类清单/三挂载/渲染组合规格，Leo 09-03 定稿）。本类首次立项实跑。
> 注意：下列两条武器 prompt 为**首次成文**（此前无配方），要素全部取自规范 §2.5-② 模板要素，句式组合为本 skill 定稿——Leo 样张目验时可否决，否决即修订本文件，禁代理自行改写。

## 前置检查

```bash
python3 scripts/cutout_white_bg.py 2>&1 | head -3   # 确认脚本可执行（用法报错属正常，ImportError 属 E-ENV-03）
```

## 步骤表

| # | 动作 | 命令/规则 | 预期 | 校验 |
|---|---|---|---|---|
| 1 | 落腰挂态 prompt | 将下方【prompt A】逐字存 `c05/prompts/sword_sheathed.txt` | 文件存在 | — |
| 2 | 落手持态 prompt | 将下方【prompt B】逐字存 `c05/prompts/sword_held.txt` | 文件存在 | — |
| 3 | 生成腰挂态 | `python3 scripts/mxai_gen.py --prompt "$(cat assets/_trial_<日期>/c05/prompts/sword_sheathed.txt)" --out assets/_trial_<日期>/c05/sword_sheathed_raw.png`（2 分） | PNG | E-GEN 分支 |
| 4 | 生成手持态 | 同上，`--prompt-file` 换 B、输出 `sword_held_raw.png`（2 分） | PNG | E-GEN 分支 |
| 5 | 抠图×2 | `python3 scripts/cutout_white_bg.py <raw> <out>`（常规白底 flood 抠图，非残留清除，不在废止之列）；输出 `sword_sheathed.png` / `sword_held.png` 透明底 | 透明 PNG | E-CUT-02 分支 |
| 6 | 程序化校验×2 | PIL：四角 alpha=0；主体非空（非透明像素 >1% 画布）；记录包络尺寸 | 三项全过 | 失败 → E-CUT/GATE 分支 |
| 7 | 锚点标定×2 | 存下方 `mark_anchor.py` 并分别执行 | `c05/anchors.json` | json 可解析、字段齐全 |
| 8 | credits 记账 | 2 条（4 分合计） | — | — |

**【prompt A · 腰挂态】**
```
精美像素风格游戏武器贴图，单独一把中国武侠长剑连鞘：剑鞘深棕木纹配铜色鞘口，挂绳环完整可见，剑柄缠绳。仅武器单体，无手，无人物，无背景物件。纯白背景，侧面水平视角，无文字，无水印。
```

**【prompt B · 手持态】**
```
精美像素风格游戏武器贴图，单独一把中国武侠长剑出鞘：剑身银白笔直，剑尖朝向右上方倾斜约四十五度，金铜色护手，剑柄缠绳无手无人物。仅武器单体。纯白背景，无文字，无水印。
```

```python
# mark_anchor.py —— 锚点近似标定（规则定死，禁目测修正；精标归 FE 联调任务）
# 规则：手持态 anchor=主体包络底边中点（握柄尾近似）；腰挂态 anchor=主体包络左边缘中点（挂环近似）
# angle：手持态冻结 45（0°=竖直向上逆时针为正，规范 §2.5-4）；腰挂态 90（水平）
import json
from PIL import Image

ITEMS = [
    ("sword_held",   "assets/_trial_20260903/c05/sword_held.png",   45, "bottom-center"),
    ("sword_sheathed","assets/_trial_20260903/c05/sword_sheathed.png", 90, "left-center"),
]
out = {}
for name, path, angle, mode in ITEMS:
    img = Image.open(path).convert("RGBA")
    box = img.getbbox()                      # 主体包络 (l,t,r,b)
    assert box, f"{name} 空图"
    l, t, r, b = box
    ax = (l + r) // 2 if mode == "bottom-center" else l
    ay = b if mode == "bottom-center" else (t + b) // 2
    out[name] = {"anchor": [ax, ay], "angle": angle, "mode": mode, "bbox": [l, t, r, b]}
with open("assets/_trial_20260903/c05/anchors.json", "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("OK", list(out))
```

## 异常分支（本类特有）

- 生成的"单体武器"**带手/带人物/带背景场景** → E-GEN-04（重跑 1 次→上报）。
- 手持态剑尖方向**明显不是右上**（程序化辅助判读：主体包络对角线走向目视记录即可，禁自判合格）→ 记录现象停上报，方向接受与否=Leo。
- 45°/90°/anchor 近似点只是**试产口径**：正式精标在 FE 联调任务，本类禁在此纠结。

## 停点产出

- `c05/sword_sheathed.png`、`c05/sword_held.png`、`c05/anchors.json`、2 个 prompt、credits（4 分）。
- 验收：透明底、单体、无文字、json 合法；武器好不好看、方向度数是否合意 = Leo 目验（规范 §2.5-4：度数以样张目验为准）。
