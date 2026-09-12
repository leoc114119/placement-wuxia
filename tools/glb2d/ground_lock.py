#!/usr/bin/env python3
"""地面锁定：把一个动作的全部帧整体竖直平移，使其**脚底最深的那一帧**落到游戏地面线。

为什么需要（2026-09-12 Leo 叮嘱「注意一下身高的问题」）：
  渲染器把**髋关节钉在模型 rest 的髋高**上，这是为了固定机位（否则上下位移会被抵消）。
  但副作用是：**腿一弯，脚就抬起来**——站姿越屈膝，脚离地越高。
  实测同一套重定向下：idle（直腿，源髋−踝 84.9）脚底在 307；atk（屈膝，源髋−踝 64.8）脚底在 298。
  而**游戏现行的 61 张 hero 帧，末实体行全部是 299**（`assets/characters/hero/battle45/`，
  与 config/battle-hex.ts 注释「battle45 y=300 同口径」一致）。
  → 不锁定的话，切动作时人物会上下跳 8~20px。

判据：**一个动作里脚底最深的那一帧 = 地面接触帧 = 该动作的地面**（跳跃类也一样：
  空中帧的"最低点"比接触帧高，取最深即取落地/蹲踞帧）。

用法：
  python3 ground_lock.py <dir> <glob> [--target 299] [--dry]

退出码：0 = 已对齐或本就是 299；1 = 找不到帧/无实体像素。
"""
import sys, os, glob, argparse
from PIL import Image


def last_solid_row(im, alpha_min=33):
    """末实体行 y（alpha>alpha_min 的最大 y）；无实体返回 None。"""
    a = im.getchannel('A')
    w, h = a.size
    px = a.load()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y] > alpha_min:
                return y
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('glob')
    ap.add_argument('--target', type=int, default=299,
                    help='目标末实体行 y（游戏口径 299；见 config/battle-hex.ts 注释 y=300 基线）')
    ap.add_argument('--dry', action='store_true', help='只报告不改文件')
    a = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(a.dir, a.glob)))
    if not paths:
        print('❌ 没匹配到帧：%s/%s' % (a.dir, a.glob)); sys.exit(1)

    rows = []
    for p in paths:
        im = Image.open(p).convert('RGBA')
        r = last_solid_row(im)
        if r is None:
            print('❌ %s 无实体像素' % os.path.basename(p)); sys.exit(1)
        rows.append(r)

    deepest = max(rows)
    delta = a.target - deepest          # >0 表示整体下移，<0 表示整体上移
    print('%s/%s  %d 帧  脚底最深=%d  目标=%d  → 整体平移 %+d px'
          % (a.dir, a.glob, len(paths), deepest, a.target, delta))
    if delta == 0:
        print('✅ 已对齐，无需改动'); return
    if a.dry:
        print('（--dry：未改文件）'); return

    W, H = Image.open(paths[0]).size
    for p in paths:
        im = Image.open(p).convert('RGBA')
        out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        out.paste(im, (0, delta))       # 越界部分自然裁掉（地面锁定不会把人物推出画布）
        out.save(p)
    # 复核
    after = [last_solid_row(Image.open(p).convert('RGBA')) for p in paths]
    print('✅ 平移完成；复核脚底最深=%d（目标 %d）' % (max(after), a.target))


if __name__ == '__main__':
    main()
