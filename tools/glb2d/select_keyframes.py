#!/usr/bin/env python3
"""关键帧挑选器：从 N 帧动画里挑 K 帧，使「动作覆盖度」最大。

为什么需要：3D→2D 可以渲很多帧，但游戏包体放不下。要在这两者之间取平衡，
不能「均匀每 N 帧取一张」（会漏掉动作的极值帧，比如下蹲最低点、腾空最高点），
而要用「最大覆盖度」选帧——贪心最远点采样：
    ① 必留首帧与末帧
    ② 每次新增「到已选集合的最小距离」最大的那帧
这样选出的 K 帧能最大程度代表整个动作的形态变化。

距离定义 = 两帧之间「不透明区域差异」+「不透明像素的 RGB 差异」加权。

用法：
  python3 select_keyframes.py <frames_dir> <out_dir> <K> [--pattern f*.raw] [--w 240] [--h 320]
"""
import sys, os, glob, re
import argparse
from PIL import Image, ImageChops


def load_frames(d, pattern, W, H):
    fs = sorted(glob.glob(os.path.join(d, pattern)),
                key=lambda p: int(re.search(r'(\d+)', os.path.basename(p)).group(1)))
    return [(p, Image.frombytes('RGBA', (W, H), open(p, 'rb').read())) for p in fs]


def dist(a, b, W, H):
    """两帧差异：alpha 形状差 + 颜色差"""
    aa, bb = a.split()[-1], b.split()[-1]
    da = ImageChops.difference(aa, bb).point(lambda v: 1 if v > 32 else 0)
    na = sum(da.getdata())
    # 颜色差（只在不透明处比）
    ca, cb = a.convert('RGB'), b.convert('RGB')
    dc = ImageChops.difference(ca, cb).convert('L').point(lambda v: 1 if v > 24 else 0)
    nc = sum(dc.getdata())
    return na + nc * 0.35


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('k', type=int)
    ap.add_argument('--pattern', default='*.raw')
    ap.add_argument('--w', type=int, default=240)
    ap.add_argument('--h', type=int, default=320)
    a = ap.parse_args()

    frames = load_frames(a.src, a.pattern, a.w, a.h)
    n = len(frames)
    if a.k >= n:
        sel = list(range(n))
    else:
        # 预计算距离矩阵
        D = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                D[i][j] = D[j][i] = dist(frames[i][1], frames[j][1], a.w, a.h)
        # 贪心最远点：首末帧必留
        sel = [0, n - 1]
        while len(sel) < a.k:
            best, bestd = -1, -1
            for i in range(n):
                if i in sel:
                    continue
                d = min(D[i][s] for s in sel)
                if d > bestd:
                    bestd, best = d, i
            sel.append(best)
        sel = sorted(set(sel))

    os.makedirs(a.out, exist_ok=True)
    for f in glob.glob(os.path.join(a.out, '*')):
        os.remove(f)
    for k_, i in enumerate(sel):
        open(os.path.join(a.out, f'k{k_:02d}.raw'), 'wb').write(frames[i][1].tobytes())

    print(f'源 {n} 帧 → 选 {len(sel)} 帧')
    print('选中帧号:', sel)
    # 覆盖度报告
    if len(sel) < n:
        cov = []
        for i in range(n):
            cov.append(min(D[i][s] for s in sel))
        print(f'未被选中帧到最近选中帧的平均距离 = {sum(cov)/len(cov):.0f}（越小=覆盖越好）')


if __name__ == '__main__':
    main()
