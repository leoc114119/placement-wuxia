#!/usr/bin/env python3
"""明暗图「形状门检」——拦 AI 把人物画变形（脸变宽/头画大/身体拉长）。

背景：生成模型会把明暗图当插画重画，实测出现过脸变宽、头发体积变大。
      这种变形**配准救不回来**（配准只做等比缩放+平移），所以必须在回填前拦。

掩膜为什么要做三步清洗：
  1) 明暗图上有 AI 撒的背景散点 → bbox 被撑大 → 宽高比失真
  2) AI 画的墨线是纯黑，与深色背景色距很近 → 轮廓内部被打出一堆洞 → IoU 失真
  3) 所以：降采样(BOX)收散点+补细线洞 → 取最大连通域去孤立块 → 补内部洞成实心轮廓

判据（三层，全过才算 PASS）：
  ① 宽高比 ar = bboxW/bboxH，与基准比 |Δ| ≤ 3%
  ② 归一化轮廓 IoU：两张轮廓等比缩放到同一高度、水平居中对齐后叠加，IoU ≥ 0.90
  ③ 分带宽度：人物等高切 20 带，逐带量平均宽度，与基准逐带比 |Δ| ≤ 30%
     （①②可能互相抵消——头画大了、腿画细了，ar 和整体 IoU 都可能看不出来）
     基准带宽 < 最大带宽 8% 的带跳过（头顶马尾尖等极窄带，比值无意义）

用法：python3 tools/glb2d/qa_shading_shape.py <基准图> <待检图> [待检图...]
退出码：0 = 全过门，1 = 有不过门
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

BG = (20, 20, 24)
# 阈值标定（09-13）：目前唯一的标注样本是「负对照」= raw_国风_A.png
#   —— 它是产出 Leo 已驳回那张「脸变宽 / 重渲染后脸变形」的源图。
#   A 实测 ar +7.02% / IoU 0.7955 / 最大带差 +91%，三条判据各自独立把它挡下。
#   尚无「正对照」（被认可过门的明暗图），所以阈值只保证「不比 A 更差」，
#   不代表过门即达标 —— 过门只说明可以进回填，观感仍须人眼定夺。
AR_TOL = 0.03
IOU_MIN = 0.90
BAND_TOL = 0.30
NBAND = 20
WORK = 1024      # 统一工作分辨率（长边）
COARSE = 256     # 连通域分析分辨率
NORM = 512       # 归一化轮廓画布
NARROW = 0.08    # 基准带宽 < 最大带宽×此值 → 跳过该带


def _clean_cc(m: Image.Image) -> Image.Image:
    """保留所有够大的连通域、丢弃散点噪声，再补内部洞，返回实心轮廓。

    为什么不是"只留最大连通域"：马尾在低分辨率掩膜上是**独立连通域**（与身体之间
    有断口），只留最大块会把马尾整条丢掉 → 基准宽高比从 0.499 假摔到 0.354。
    散点噪声是几个像素级，马尾是大块，用面积阈值区分。

    纯 PIL 实现（环境无 numpy/scipy）：4 邻接洪泛，O(n)。
    """
    w, h = m.size
    px = m.load()
    seen = bytearray(w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            i0 = sy * w + sx
            if seen[i0] or not px[sx, sy]:
                continue
            stack = [i0]
            seen[i0] = 1
            comp = []
            while stack:
                i = stack.pop()
                cy, cx = divmod(i, w)
                comp.append(i)
                if cx and not seen[i - 1] and px[cx - 1, cy]:
                    seen[i - 1] = 1; stack.append(i - 1)
                if cx + 1 < w and not seen[i + 1] and px[cx + 1, cy]:
                    seen[i + 1] = 1; stack.append(i + 1)
                if cy and not seen[i - w] and px[cx, cy - 1]:
                    seen[i - w] = 1; stack.append(i - w)
                if cy + 1 < h and not seen[i + w] and px[cx, cy + 1]:
                    seen[i + w] = 1; stack.append(i + w)
            comps.append(comp)
    if not comps:
        raise SystemExit("FATAL: 掩膜为空，找不到人物")

    # 面积门槛：最大块的 0.5% 且至少 50 px（散点远小于此，马尾远大于此）
    floor = max(50, 0.005 * max(len(c) for c in comps))
    keep = [c for c in comps if len(c) >= floor]
    fg = bytearray(w * h)
    for c in keep:
        for i in c:
            fg[i] = 1

    # 从画面边界洪泛背景，洪不到的背景即内部洞
    bgseen = bytearray(w * h)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not fg[i] and not bgseen[i]:
                bgseen[i] = 1; stack.append(i)
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not fg[i] and not bgseen[i]:
                bgseen[i] = 1; stack.append(i)
    while stack:
        i = stack.pop()
        cy, cx = divmod(i, w)
        for j, ok in ((i - 1, cx), (i + 1, cx + 1 < w), (i - w, cy), (i + w, cy + 1 < h)):
            if ok and not fg[j] and not bgseen[j]:
                bgseen[j] = 1; stack.append(j)
    for i in range(w * h):
        if not fg[i] and not bgseen[i]:
            fg[i] = 1

    return Image.frombytes("L", (w, h), bytes(255 if v else 0 for v in fg))


def _bgdist(a: Image.Image) -> Image.Image:
    """到背景色的距离 = 三通道绝对差**之和**（不是亮度差）。

    用亮度差会漏掉深色头发：头发 (55,42,38) 对背景 (20,20,24) 的亮度差仅 25，
    而三通道和是 35+22+14=71。历史上按亮度阈值做掩膜就漏过头发。
    add 会在 255 截顶，但判据只关心 >40，截顶值必然 >40，结论不受影响。
    """
    d = ImageChops.difference(a, Image.new("RGB", a.size, BG))
    r, g, b = d.split()
    return ImageChops.add(ImageChops.add(r, g), b)


def silhouette(im: Image.Image) -> Image.Image:
    """图 → 清洗后的实心轮廓，"L" 模式前景 255，工作分辨率长边=WORK。"""
    a = im.convert("RGB")
    w, h = a.size
    s = WORK / max(w, h)
    a = a.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BOX)
    m = _bgdist(a).point(lambda v: 255 if v > 40 else 0)
    # 降采样收散点 + 补细墨线洞，再阈值回来；连通域在低分辨率上做（快）
    cw = max(1, round(a.size[0] * COARSE / max(a.size)))
    ch = max(1, round(a.size[1] * COARSE / max(a.size)))
    coarse = m.resize((cw, ch), Image.BOX).point(lambda v: 255 if v > 30 else 0)
    coarse = _clean_cc(coarse)
    return coarse.resize(a.size, Image.NEAREST)


def bbox(m: Image.Image):
    b = m.getbbox()
    if b is None:
        raise SystemExit("FATAL: 轮廓为空")
    return b


def norm_shape(m: Image.Image, size: int = NORM) -> Image.Image:
    """裁到 bbox → 等比缩放到高=size → 水平居中放进 size×size 画布。mode "1"。"""
    crop = m.crop(bbox(m))
    w, h = crop.size
    nw = max(1, round(w * size / h))
    crop = crop.resize((nw, size), Image.NEAREST)
    canvas = Image.new("L", (size, size), 0)
    canvas.paste(crop, ((size - nw) // 2, 0))
    return canvas.convert("1")


def band_widths(m: Image.Image, n: int = NBAND) -> list[float]:
    """人物等高切 n 带，每带取前景像素数/带高 = 平均宽度。"""
    x0, y0, x1, y1 = bbox(m)
    H = y1 - y0
    out = []
    for i in range(n):
        lo = y0 + H * i // n
        hi = max(y0 + H * (i + 1) // n, lo + 1)
        out.append(m.crop((x0, lo, x1, hi)).histogram()[255] / (hi - lo))
    return out


def count1(m: Image.Image) -> int:
    # mode "1" 的直方图仍是 256 槽，计数落在 0 与 255 两槽（不是 [0,1] 两元素）
    return m.histogram()[255]


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2

    bmask = silhouette(Image.open(args[0]))
    bx0, by0, bx1, by1 = bbox(bmask)
    bar = (bx1 - bx0) / (by1 - by0)
    bnorm = norm_shape(bmask)
    bnorm_n = count1(bnorm)
    bbw = band_widths(bmask)
    bmax = max(bbw)
    print(f"基准 {Path(args[0]).name}: {Image.open(args[0]).size[0]}x{Image.open(args[0]).size[1]}  "
          f"bbox {bx1-bx0}x{by1-by0}  ar={bar:.4f}\n")

    fail = 0
    for path in args[1:]:
        im = Image.open(path)
        m = silhouette(im)
        x0, y0, x1, y1 = bbox(m)
        ar = (x1 - x0) / (y1 - y0)
        dar = ar / bar - 1

        nm = norm_shape(m)
        inter = count1(ImageChops.logical_and(bnorm, nm))
        iou = inter / (bnorm_n + count1(nm) - inter)

        bw = band_widths(m)
        checked = [i for i in range(NBAND) if bbw[i] >= bmax * NARROW]
        ratios = {i: bw[i] / bbw[i] - 1 for i in checked}
        worst = max(ratios, key=lambda i: abs(ratios[i]))

        bad = []
        if abs(dar) > AR_TOL:
            bad.append(f"宽高比 {dar*100:+.2f}%")
        if iou < IOU_MIN:
            bad.append(f"IoU {iou:.4f}")
        if abs(ratios[worst]) > BAND_TOL:
            bad.append(f"第{worst+1}带宽度 {ratios[worst]*100:+.2f}%")
        if bad:
            fail += 1
        print(f"{'✅ PASS' if not bad else '❌ FAIL'}  {Path(path).name}")
        print(f"      {im.size[0]}x{im.size[1]}  bbox {x1-x0}x{y1-y0}  ar={ar:.4f} ({dar*100:+.2f}%)  "
              f"IoU={iou:.4f}  最大带差={ratios[worst]*100:+.2f}% (第{worst+1}带，共{len(checked)}带可比)")
        if bad:
            print("      超出项：" + "；".join(bad))
        print()

    n = len(args) - 1
    print(f"结论：{n-fail}/{n} 过门" + ("  ← 全过" if fail == 0 else ""))
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
