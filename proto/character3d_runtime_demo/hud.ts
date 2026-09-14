// T31-FE-C · proto/character3d_runtime_demo/hud.ts —— 屏上大字面板 / 按钮命中框 / 分页查看（纯 Canvas 2D，零宿主依赖）
//
// 设计口径：
//   · 按钮命中框一律用**画布背衬像素**记录（与触摸回调同一空间；S0 真机踩过「逻辑像素 vs 背衬像素」
//     不命中 ⇒ 所有按钮点了没反应，故此处与 host 的坐标换算配套，README §6 有回归门说明）；
//   · 分页查看：第 1 页人读摘要，后续页原始 JSON 分片（每页固定字符数）——逐页截图即可回收；
//   · 「近邻按钮距离」一并回传：tap 没命中时用它判定是坐标问题还是命中框问题。

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HudButton {
  id: string;
  label: string;
  rect: Rect;
}

export interface HudLayout {
  width: number;
  height: number;
  buttonsH: number;
  buttons: HudButton[];
  footerY: number;
}

export const HUD_BUTTON_IDS = ['copy', 'share', 'view', 'perf', 'source', 'retry3d'] as const;
export type HudButtonId = (typeof HUD_BUTTON_IDS)[number];

/** 视图态：摘要页 or 分页查看页。 */
export interface HudView {
  /** 面板正文行（已排版好的短行） */
  lines: string[];
  /** 末行提示（如 `▶ 复制：成功`） */
  footer: string;
  /** 分页查看态：非 null 时用页面模式绘制 */
  page: { index: number; total: number; text: string } | null;
}

/** 底部按钮带高度（按屏高比例，最小 64 背衬像素）。 */
export function computeLayout(width: number, height: number, buttonIds: readonly string[]): HudLayout {
  const buttonsH = Math.max(64, Math.round(height * 0.075));
  const buttons: HudButton[] = [];
  const n = buttonIds.length;
  const w = width / n;
  for (let i = 0; i < n; i++) {
    buttons.push({
      id: buttonIds[i],
      label: buttonIds[i],
      rect: { x0: w * i, y0: height - buttonsH, x1: w * (i + 1), y1: height },
    });
  }
  return { width, height, buttonsH, buttons, footerY: height - buttonsH - 8 };
}

/** 命中测试：返回命中的按钮 id 与**最近**按钮的距离（没命中时定位用）。 */
export function hitTest(layout: HudLayout, x: number, y: number): { hit: string | null; nearest: { id: string; d: number } | null } {
  let nearest: { id: string; d: number } | null = null;
  for (const b of layout.buttons) {
    const inside = x >= b.rect.x0 && x < b.rect.x1 && y >= b.rect.y0 && y < b.rect.y1;
    const cx = Math.max(b.rect.x0, Math.min(x, b.rect.x1));
    const cy = Math.max(b.rect.y0, Math.min(y, b.rect.y1));
    const d = inside ? 0 : Math.round(Math.hypot(x - cx, y - cy));
    if (nearest === null || d < nearest.d) nearest = { id: b.id, d };
    if (inside) return { hit: b.id, nearest: { id: b.id, d: 0 } };
  }
  return { hit: null, nearest };
}

/** 原始 JSON 分片（每页 charsPerPage 字符，含页码边界提示）。 */
export function paginate(text: string, charsPerPage: number): string[] {
  if (charsPerPage <= 0) return [text];
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += charsPerPage) pages.push(text.slice(i, i + charsPerPage));
  return pages.length ? pages : [''];
}

export const BUTTON_LABELS: Record<string, string> = {
  copy: '复制结果',
  share: '分享结果',
  view: '查看结果',
  perf: '重跑压测',
  source: '切资源源',
  retry3d: '重试3D',
};

const FONT = '"PingFang SC","Microsoft YaHei",monospace';

export interface HudDrawTarget {
  fillStyle: unknown;
  strokeStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText?(text: string): { width: number };
}

/**
 * 绘制面板 + 按钮（返回实际绘制的按钮 rect，供命中框使用）。
 * 字号按背衬宽等比（真机 1080 宽背衬与浏览器 780 宽背衬都要可读）。
 */
export function drawHud(ctx: HudDrawTarget, layout: HudLayout, view: HudView): HudButton[] {
  const w = layout.width;
  const fs = Math.max(12, Math.round(w / 46));
  // 面板只盖到需要的行数（不盖住人物 —— 截图要能看清六向/动作证据）
  const panelH = view.page
    ? Math.max(fs * 6, layout.footerY - fs * 2)
    : view.lines.length * fs * 1.45 + fs * 1.6;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, w, panelH);
  ctx.font = fs + 'px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (view.page) {
    drawPaged(ctx, layout, view.page, fs);
  } else {
    ctx.fillStyle = '#ffe9b8';
    let y = fs * 0.6;
    for (const line of view.lines) {
      ctx.fillText(line, fs * 0.6, y);
      y += fs * 1.45;
    }
  }

  // 末行提示（正反馈/失败原因都在这）
  ctx.fillStyle = '#8fe3a0';
  ctx.fillText(view.footer, fs * 0.6, layout.footerY - fs * 1.2);

  // 按钮
  const bfont = Math.max(11, Math.round(w / 52));
  for (const b of layout.buttons) {
    ctx.fillStyle = 'rgba(40,32,22,0.92)';
    ctx.fillRect(b.rect.x0 + 3, b.rect.y0 + 3, b.rect.x1 - b.rect.x0 - 6, b.rect.y1 - b.rect.y0 - 6);
    ctx.strokeStyle = '#c9a25e';
    ctx.lineWidth = Math.max(1, Math.round(w / 720));
    ctx.strokeRect(b.rect.x0 + 3, b.rect.y0 + 3, b.rect.x1 - b.rect.x0 - 6, b.rect.y1 - b.rect.y0 - 6);
    ctx.fillStyle = '#ffe9b8';
    ctx.font = bfont + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BUTTON_LABELS[b.id] ?? b.id, (b.rect.x0 + b.rect.x1) / 2, (b.rect.y0 + b.rect.y1) / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fs + 'px ' + FONT;
  }
  return layout.buttons;
}

function drawPaged(ctx: HudDrawTarget, layout: HudLayout, page: { index: number; total: number; text: string }, fs: number): void {
  const w = layout.width;
  const perLine = Math.max(8, Math.floor(w / (fs * 0.62)));
  ctx.fillStyle = '#d8e6f2';
  let y = fs * 0.6;
  for (let i = 0; i < page.text.length; i += perLine) {
    ctx.fillText(page.text.slice(i, i + perLine), fs * 0.6, y);
    y += fs * 1.25;
    if (y > layout.footerY - fs * 2) break;
  }
  ctx.fillStyle = '#9ec8f0';
  ctx.fillText(
    '第 ' + (page.index + 1) + '/' + page.total + ' 页 · 点右半下一页 / 左半上一页 / 底部按钮返回',
    fs * 0.6,
    layout.footerY - fs * 2.2,
  );
}
