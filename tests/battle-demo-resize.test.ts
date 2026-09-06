// ═══ 补卡（09-06）：battle_demo resize() 375×667 默认视口首调早退 → 坏缓冲缺陷锁 ═══
// 根因：proto/battle_demo/main.ts 模块初值 W=375/H=667；index.html 舞台 #cvWrap 为 9:16，
//   375×667 视口（iPhone 6/7/8 逻辑尺寸）下 rect 恰为 375×667 → resize() 首调 `w===W&&h===H`
//   早退 → canvas 缓冲滞留 HTML 默认 300×150（且 setTransform(dpr) 未执行）→ 画面左上裁区
//   非均匀拉伸、hero 裁出画外（上卡 t45six_375x667_* 证据即经坏缓冲截出）。
// 测试面说明（等效单测口径）：main.ts 顶层即 document.getElementById（DOM 入口模块），
//   node 环境（vitest 默认无 DOM）不可 import 直测——按 battle-structure.test.ts「源码形状
//   测试」先例：切片提取 resize 函数源码 + 模块 W/H 初值，注入 mock canvas/ctx 真实执行，
//   断言首调行为（非纯文本匹配）。初值从源码动态提取=提取到旧默认值时本组自动复红。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('proto/battle_demo/main.ts', 'utf8');

/** 提取函数源码（从 `function <name>` 到闭 braces——与 battle-structure.test.ts 同式粗粒度切片） */
function fnSrc(name: string): string {
  const start = SRC.indexOf(`function ${name}`);
  expect(start, `function ${name} 应存在于 main.ts`).toBeGreaterThanOrEqual(0);
  const braceStart = SRC.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') {
      depth--;
      if (depth === 0) return SRC.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} 未闭合`);
}

// 模块 W/H 初值（缺陷根因位）：动态提取保持与源码同步——源码回潮旧默认值 375/667 时用例①自动转红
const INIT_W = Number(/let W = (\d+);/.exec(SRC)?.[1]);
const INIT_H = Number(/let H = (\d+);/.exec(SRC)?.[1]);
const RESIZE_SRC = fnSrc('resize').replace('(): void', '()'); // 剥 TS 注解 → 可执行 JS

interface ResizeMod {
  resize(): void;
  getW(): number;
  getH(): number;
}
interface MockCanvas {
  width: number;
  height: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}
type Rect = { width: number; height: number };

/** mock 环境 + 源码 resize 真实执行：canvas 缓冲初值=HTML 规范默认 300×150（缺陷滞留位） */
function makeHarness(rect: Rect, dpr: number): {
  canvas: MockCanvas;
  writes: string[];
  transforms: number[][];
  mod: ResizeMod;
  rect: Rect;
} {
  let bufW = 300; // HTML 规范默认缓冲（未被 resize 覆写时的滞留值）
  let bufH = 150;
  const writes: string[] = [];
  const transforms: number[][] = [];
  const canvas: MockCanvas = {
    get width() {
      return bufW;
    },
    set width(v: number) {
      bufW = v;
      writes.push('width');
    },
    get height() {
      return bufH;
    },
    set height(v: number) {
      bufH = v;
      writes.push('height');
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: rect.width, height: rect.height }),
  };
  const ctx = {
    setTransform: (...a: number[]) => {
      transforms.push(a);
    },
  };
  const factory = new Function(
    'canvas',
    'ctx',
    'dpr',
    'W',
    'H',
    `${RESIZE_SRC}\nreturn { resize: resize, getW: function () { return W; }, getH: function () { return H; } };`,
  );
  const mod = factory(canvas, ctx, dpr, INIT_W, INIT_H) as ResizeMod;
  return { canvas, writes, transforms, mod, rect };
}

describe('[补卡 09-06] battle_demo resize()：375×667 默认视口首调不得早退（坏缓冲缺陷锁）', () => {
  it('首调即分配缓冲（红·修前）：375×667 视口下 resize 后 canvas 缓冲 = 375×667×dpr、transform=dpr 缩放（旧代码滞留 HTML 默认 300×150 = 画面裁切拉伸根因）', () => {
    expect(Number.isFinite(INIT_W) && Number.isFinite(INIT_H), 'W/H 模块初值提取失败（声明式变更？请同步本用例提取式）').toBe(true);
    const dpr = 2; // retina 场景（受染证据 t45six_375x667 同类环境）
    const { canvas, transforms, mod } = makeHarness({ width: 375, height: 667 }, dpr);
    mod.resize();
    expect(canvas.width).toBe(375 * dpr); // 旧代码此处=300（首调早退未覆写）→ 红
    expect(canvas.height).toBe(667 * dpr); // 旧代码此处=150 → 红
    expect(transforms).toEqual([[dpr, 0, 0, dpr, 0, 0]]); // 旧代码 dpr 缩放从未设定 → 红
    expect(mod.getW()).toBe(375);
    expect(mod.getH()).toBe(667);
  });

  it('同尺寸重复调用仍早退（恒绿）：二调零新缓冲写入、零 transform 重设——主循环每帧调 resize 的性能语义零回归（修前修后均绿：修前=两调皆早退 0 写入，修后=首调 1 写入后早退）', () => {
    const { writes, transforms, mod } = makeHarness({ width: 375, height: 667 }, 2);
    mod.resize();
    const firstWrites = writes.length;
    const firstTransforms = transforms.length;
    mod.resize(); // 同尺寸二调：不得重复写缓冲/重设 transform
    expect(writes.length).toBe(firstWrites);
    expect(transforms.length).toBe(firstTransforms);
  });

  it('尺寸变化路径零回归（恒绿）：视口 375×667 → 450×800 后缓冲随之更新为 450×800×dpr', () => {
    const dpr = 1; // headless 截图环境（shot_sixdir 375 档同类）
    const h = makeHarness({ width: 375, height: 667 }, dpr);
    h.mod.resize();
    h.rect.width = 450;
    h.rect.height = 800;
    h.mod.resize();
    expect(h.canvas.width).toBe(450);
    expect(h.canvas.height).toBe(800);
    expect(h.mod.getW()).toBe(450);
    expect(h.mod.getH()).toBe(800);
  });
});
