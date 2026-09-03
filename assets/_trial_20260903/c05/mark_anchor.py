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
