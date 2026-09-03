# make_sheet.py —— 锚定表构造：640×320，左格贴基准帧，右格纯白
from PIL import Image
SRC = "assets/characters/hero/walk_q/frames/idle_down.png"
OUT = "assets/_trial_20260903/c03/sheet.png"
base = Image.open(SRC).convert("RGBA")            # 240×320
sheet = Image.new("RGBA", (640, 320), (255, 255, 255, 255))
sheet.paste(base, (0, 0), base)                   # 左格原点粘贴，禁缩放
sheet.save(OUT); print("OK", sheet.size)
