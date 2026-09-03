# check_left.py —— 左格锁死校验：返回图左 240×320 与源帧逐像素 diff
from PIL import Image, ImageChops
src = Image.open("assets/characters/hero/walk_q/frames/idle_down.png").convert("RGBA")
ret = Image.open("assets/_trial_20260903/c03/battle_idle_fist_raw.png").convert("RGBA")
w, h = src.size
left = ret.crop((0, 0, w, h)).resize(src.size) if ret.size != (640, 320) else ret.crop((0, 0, w, h))
bbox = ImageChops.difference(left, src).getbbox()
print(f"DIFF={'0' if bbox is None else bbox}")
