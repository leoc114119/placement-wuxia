#!/usr/bin/env python3
"""白底生成图 → 泛洪抠图 + bbox 裁切 → 存入 walk_q/raw/（T14 八向全量）。
复刻 down 向口径：raw 目录放的是"已抠图 + 已 bbox 裁切"的图，
与 build_walk_frames.py 的 flood_cut/feather 同源（二次 feather 与 down 向历史处理一致）。
用法: python3 scripts/cut_raw.py <gen.png 白底> <out.png 透明底裁切>
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from build_walk_frames import flood_cut

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    cut, n_bg = flood_cut(Image.open(src))
    bbox = cut.getbbox()
    if bbox is None:
        print(f"ERR: {src} 抠图后全透明"); sys.exit(1)
    crop = cut.crop(bbox)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    crop.save(dst)
    print(f"[OK] {dst} {crop.size} (bg cleared {n_bg}px, bbox={bbox})")

if __name__ == "__main__":
    main()
