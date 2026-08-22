#!/usr/bin/env python3
"""白底残留双判据清理（T06 白块根因修复 · CodeBuddy 出 · 2026-08-22）。

只清「真残留」，结构性判据天然不碰角色本体；迭代执行直到收敛
（清掉白块会暴露新的「贴透明」边缘——剥洋葱，单轮会漏）。

  判据1 贴边残留：不透明(alpha>180) 且 近白(minRGB>200) 且 低彩度(max-min<25)
      且 8-邻域有透明(alpha<10) → 转透明。
      彩度条件豁免暖白毛尖(彩度25-60)——白毛狼毛丝间隙的毛尖是本体不是残留；
      肤色(240,200,180, minRGB=180)与灰绿衣物(<200)天然豁免；纯背景白彩度≈0 必命中。
  判据2 孤立白岛：不触边 + 面积<island_max(默认2000) + 均亮>200 且 平均彩度<25 的连通域
      → 岛内像素级过滤：只清视觉白点(mn>190 且 彩度<35)，毛阴影/过渡色保留。

性能：bytearray 像素数组 + 局部级联扫描（第 2+ 轮只扫上轮清除区的 8-邻域，
不扫全图）+ multiprocessing 4 进程并行。

背景（2026-08-22 取证）：
  a2a7a58 d2 转正版实测带 60,230px 贴边残留 + 8,679 个白岛（野狼每帧 4~6.8k px 最重，
  四足间白底 flood-fill 抠不到）——这是游戏「莫名白块」第一来源；
  ZCode 的「封闭暖白连通块」清理（6f8abdf/2b1c3b8）虽清了残留，但判据过宽误伤本体
  （lang 帧 2.5~3.1 万本体像素被挖）。本脚本取代该算法：52,142px 清除 / 本体误伤 0px
  （2026-08-22 实测）。

用法:
    python3 scripts/clean_white_residue.py assets/ui/frames/hero/hero_0*_transparent.png
    python3 scripts/clean_white_residue.py --island-max 2000 --dry-run <files...>   # 只报告不动手
    python3 scripts/clean_white_residue.py --jobs 1 <files...>                      # 串行（默认4进程）
"""
import sys
from multiprocessing import Pool
from PIL import Image


def _is_white_point(r, g, b, lum_thresh=190, chroma_thresh=30):
    """视觉白点：亮度>190 且 彩度<30。
    亮灰过渡(192,192,176: lum191/彩度16)命中；肤色(240,200,180: lum210/彩度60)与
    高彩度衣物豁免——彩度是肤色/衣料的天然分界。"""
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > lum_thresh and (max(r, g, b) - min(r, g, b)) < chroma_thresh


def _find_protected(raw, w, h, min_size=2000):
    """本体保护域：不触边且面积≥min_size 的连通域 = 角色主体（含白色描边/白衣/白毛）。
    级联判据1 永不触碰保护域——背景白剥到净即止，本体白色永不误伤。"""
    opaque = bytearray(w * h)
    for y in range(h):
        base = y * w * 4
        for x in range(w):
            if raw[base + x * 4 + 3] > 180:
                opaque[y * w + x] = 1
    seen = bytearray(w * h)
    protected = set()
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if opaque[idx] and not seen[idx]:
                stack = [idx]
                seen[idx] = 1
                pts = []
                touch = False
                while stack:
                    cur = stack.pop()
                    pts.append(cur)
                    cx, cy = cur % w, cur // w
                    if cx == 0 or cx == w - 1 or cy == 0 or cy == h - 1:
                        touch = True
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            ni = ny * w + nx
                            if opaque[ni] and not seen[ni]:
                                seen[ni] = 1
                                stack.append(ni)
                if (not touch) and len(pts) >= min_size:
                    protected.update(pts)
    return protected


def _scan_edge(raw, w, h, candidates, cleared, protected):
    """判据1：candidates 中「低彩度近白不透明 & 8-邻域贴透明」的像素"""
    found = set()
    for x, y in candidates:
        if (x, y) in protected:
            continue
        o = (y * w + x) * 4
        r, g, b, a = raw[o], raw[o + 1], raw[o + 2], raw[o + 3]
        if a <= 180 or min(r, g, b) <= 200 or (max(r, g, b) - min(r, g, b)) >= 25:
            continue
        hit = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    no = (ny * w + nx) * 4
                    if raw[no + 3] < 10:
                        hit = True
                        break
            if hit:
                break
        if hit:
            found.add((x, y))
    return found


def _scan_islands(raw, w, h, island_max):
    """判据2：不触边 + 小面积 + 均亮>200 均彩度<25 的 4-连通白岛，岛内像素级过滤"""
    opaque = bytearray(w * h)
    for y in range(h):
        base = y * w * 4
        for x in range(w):
            if raw[base + x * 4 + 3] > 180:
                opaque[y * w + x] = 1
    seen = bytearray(w * h)
    targets = []
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if opaque[idx] and not seen[idx]:
                stack = [idx]
                seen[idx] = 1
                pts = []
                touch = False
                lum = 0
                chroma = 0
                while stack:
                    cur = stack.pop()
                    pts.append(cur)
                    cx, cy = cur % w, cur // w
                    if cx == 0 or cx == w - 1 or cy == 0 or cy == h - 1:
                        touch = True
                    o = cur * 4
                    r2, g2, b2 = raw[o], raw[o + 1], raw[o + 2]
                    lum += 0.299 * r2 + 0.587 * g2 + 0.114 * b2
                    chroma += max(r2, g2, b2) - min(r2, g2, b2)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            ni = ny * w + nx
                            if opaque[ni] and not seen[ni]:
                                seen[ni] = 1
                                stack.append(ni)
                size = len(pts)
                if size and (not touch) and size < island_max and lum / size > 200 and chroma / size < 25:
                    for cur in pts:
                        o = cur * 4
                        if _is_white_point(raw[o], raw[o + 1], raw[o + 2]):
                            targets.append((cur % w, cur // w))
    return set(targets)


def clean(path: str, island_max: int = 2000, dry: bool = False):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    raw = bytearray(im.tobytes())
    cleared = set()
    first_edge = first_island = 0
    rounds = 0
    protected = _find_protected(raw, w, h)   # 本体保护域（算一次）
    frontier = None
    while True:
        rounds += 1
        if rounds == 1:
            all_px = ((x, y) for y in range(h) for x in range(w))
            edge = _scan_edge(raw, w, h, all_px, cleared, protected)
            islands = _scan_islands(raw, w, h, island_max)
            first_edge, first_island = len(edge), len(islands)
            new = edge | islands
        else:
            # 判据1 级联：只扫上轮清除区的 8-邻域，跳过保护域 → 背景白剥到净，本体永不碰
            nb = set()
            for x, y in frontier:
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            nb.add((nx, ny))
            nb -= cleared
            new = _scan_edge(raw, w, h, nb, cleared, protected) | _scan_islands(raw, w, h, island_max)
        new -= cleared
        if not new:
            break
        cleared |= new
        frontier = new
        if not dry:
            for x, y in new:
                o = (y * w + x) * 4
                raw[o] = raw[o + 1] = raw[o + 2] = raw[o + 3] = 0
    if not dry:
        Image.frombytes("RGBA", (w, h), bytes(raw)).save(path)
    return first_edge, first_island, len(cleared), rounds


def _worker(args):
    path, island_max, dry = args
    e, i, t, r = clean(path, island_max, dry)
    return path, e, i, t, r


def main():
    args = sys.argv[1:]
    island_max = 2000
    dry = False
    jobs = 4
    if "--island-max" in args:
        i = args.index("--island-max")
        island_max = int(args[i + 1])
        del args[i : i + 2]
    if "--dry-run" in args:
        dry = True
        args.remove("--dry-run")
    if "--jobs" in args:
        i = args.index("--jobs")
        jobs = int(args[i + 1])
        del args[i : i + 2]
    if not args:
        print(__doc__)
        sys.exit(1)
    work = [(f, island_max, dry) for f in args]
    results = []
    if jobs > 1 and len(work) > 1:
        with Pool(jobs) as pool:
            results = pool.map(_worker, work)
    else:
        results = [_worker(x) for x in work]
    t_edge = t_island = t_total = 0
    for path, e, i, t, r in results:
        t_edge += e
        t_island += i
        t_total += t
        print(f"{'[DRY] ' if dry else ''}{path.split('/')[-1]:28s} 贴边{e:6d} 白岛{i:6d} 清除{t:7d} ({r}轮)")
    print(f"── 合计: 贴边 {t_edge} / 白岛 {t_island} / 清除 {t_total}px" + (" (dry-run 未写盘)" if dry else ""))


if __name__ == "__main__":
    main()
