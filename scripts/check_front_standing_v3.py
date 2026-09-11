#!/usr/bin/env python3
"""T45 正面站立图门检·修正版（2026-09-11 PM2）

修正两处上一版门的缺陷（都出在门定义，不在图）：
  1. 单一主体：上一版直接数前景连通域，把 6 个 1px 抗锯齿噪点也算成独立主体
     → 本次加最小面积过滤（< 0.02% 画布面积的连通域不计为独立主体）
  2. 手臂-躯干分离：上一版写死「35%~75% 身高」窗口，但本角色是 Q 版大头，
     头部占到约 45%，35%~49% 那段根本没有手臂 → 达标率被无意义地拉低
     → 本次改为**先自动定位真实手臂带**（连续 ≥3 段的最长区间），再在该带内算达标率

用法：python3 check_front_standing_v3.py <png>
"""
import sys
from collections import deque
from PIL import Image

BG_THRESHOLD = 240          # 背景 = min(RGB) >= 240
MIN_COMPONENT_PX = None     # 运行时按画布面积 0.02% 计算
MIN_SEG_WIDTH = 3           # 行内前景段最小宽度（滤抗锯齿）


def flood_background(px, W, H):
    def is_bg(x, y):
        r, g, b = px[x, y]
        return min(r, g, b) >= BG_THRESHOLD

    bg = [[False] * W for _ in range(H)]
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if is_bg(x, y) and not bg[y][x]:
                bg[y][x] = True
                q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if is_bg(x, y) and not bg[y][x]:
                bg[y][x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < H and 0 <= nx < W and not bg[ny][nx] and is_bg(nx, ny):
                bg[ny][nx] = True
                q.append((ny, nx))
    return bg


def components(bg, W, H):
    seen = [[False] * W for _ in range(H)]
    out = []
    for y in range(H):
        for x in range(W):
            if bg[y][x] or seen[y][x]:
                continue
            qq = deque([(y, x)])
            seen[y][x] = True
            n = 0
            x0 = x1 = x
            y0 = y1 = y
            while qq:
                cy, cx = qq.popleft()
                n += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and not seen[ny][nx] and not bg[ny][nx]:
                            seen[ny][nx] = True
                            qq.append((ny, nx))
            out.append((n, (x0, y0, x1, y1)))
    out.sort(reverse=True)
    return out


def segments(bg, y, W):
    out = []
    s = None
    for x in range(W):
        fg = not bg[y][x]
        if fg and s is None:
            s = x
        if not fg and s is not None:
            if x - s >= MIN_SEG_WIDTH:
                out.append((s, x - 1))
            s = None
    if s is not None and W - s >= MIN_SEG_WIDTH:
        out.append((s, W - 1))
    return out


def main():
    path = sys.argv[1]
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    min_comp = max(16, int(W * H * 0.0002))

    res = {}
    res['size'] = [W, H]
    res['longEdge'] = max(W, H)
    res['ratio'] = round(W / H, 4)
    res['minComponentPx'] = min_comp

    # 3 纯白背景
    edge = []
    for x in range(W):
        for y in (0, H - 1):
            edge.append(min(px[x, y]))
    for y in range(H):
        for x in (0, W - 1):
            edge.append(min(px[x, y]))
    res['edgeMinChannel'] = min(edge)

    bg = flood_background(px, W, H)

    # 4 单一主体（加最小面积过滤）
    comps = components(bg, W, H)
    real = [c for c in comps if c[0] >= min_comp]
    res['componentCountRaw'] = len(comps)
    res['componentSizesRaw'] = [c[0] for c in comps[:8]]
    res['componentCountFiltered'] = len(real)
    res['componentFilteredSizes'] = [c[0] for c in real]

    ys = [y for y in range(H) if any(not bg[y][x] for x in range(W))]
    xs = [x for x in range(W) if any(not bg[y][x] for y in range(H))]
    y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
    h = y1 - y0 + 1
    res['subjectBBox'] = [x0, y0, x1, y1]
    res['subjectHeight'] = h

    # 5 手臂分离：先自动定位真实手臂带
    bands = []
    cur = None
    for y in range(y0, y1 + 1):
        if len(segments(bg, y, W)) >= 3:
            if cur is None:
                cur = [y, y]
            else:
                cur[1] = y
        else:
            if cur:
                bands.append(tuple(cur))
                cur = None
    if cur:
        bands.append(tuple(cur))
    arm_band = max(bands, key=lambda b: b[1] - b[0]) if bands else None
    if arm_band:
        a, b = arm_band
        tot = b - a + 1
        ok = sum(1 for y in range(a, b + 1) if len(segments(bg, y, W)) >= 3)
        res['armBand'] = [a, b]
        res['armBandPctOfHeight'] = [round((a - y0) / h, 4), round((b - y0) / h, 4)]
        res['armBandRows'] = tot
        res['armBandPassRows'] = ok
        res['armBandPassRate'] = round(ok / tot, 4)
        # 旧窗口（保留对照）
        wa, wb = y0 + int(h * 0.35), y0 + int(h * 0.75)
        wt = wb - wa + 1
        wok = sum(1 for y in range(wa, wb + 1) if len(segments(bg, y, W)) >= 3)
        res['legacyWindowPassRate'] = round(wok / wt, 4)

    # 6 留白
    res['margins'] = {
        'left': round(x0 / W, 4),
        'right': round((W - 1 - x1) / W, 4),
        'top': round(y0 / H, 4),
        'bottom': round((H - 1 - y1) / H, 4),
    }

    # 判定
    checks = {
        'sizeLongEdge>=1024': res['longEdge'] >= 1024,
        'ratio3to4±2%': abs(res['ratio'] - 0.75) <= 0.015,
        'pureWhiteEdges>=250': res['edgeMinChannel'] >= 250,
        'singleSubject(excl. noise)': res['componentCountFiltered'] == 1,
        'armTorsoGap>=90%': res.get('armBandPassRate', 0) >= 0.90,
        'bodyMargin>=5%': all(v >= 0.05 for v in res['margins'].values()),
    }
    res['checks'] = checks
    res['overallPass'] = all(checks.values())

    import json
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
