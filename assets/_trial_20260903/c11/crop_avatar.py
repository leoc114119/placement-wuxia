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
