// ═══ T25 trial_fx_01 光影组合播放器（方案 §6 测试面）验收测试 ═══
// 真源：《光影组合试点方案-trial_fx_01-v0.1》§2/§3.1/§4.2/§5 + 《光影序列素材库》§6.1。
// 纯逻辑用例（时窗/帧序/终止清理）不依赖微信运行时与真实 Canvas：ctx 用记录型 stub，
// 图片用 {width,height} 结构 stub（FxImg 最小接口）。
// 素材接线用例：40 张实际 PNG 口径（Q-FX-01 裁决 B：L3 七逻辑帧剔 1 空帧，12+22+6）锁目录与清单。
// 运行：npm run test:battle（vitest，node 环境）。
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path 的最小类型声明见 env.d.ts（全局 ambient）
declare const __dirname: string;
import { FxPlayer, loadFxFramePack, pickLayerFrame, validateRecipe, type FxFramePack } from '../ui/fx-player';
import { TRIAL_FX_01 } from '../config/battle-hex';
import type { FxRecipe } from '../types';

const ROOT = path.resolve(__dirname, '..');

// ---------- 基建：记录型 ctx stub（只记 drawImage/globalCompositeOperation/save/restore） ----------

interface DrawCall {
  img: { width: number; height: number };
  x: number;
  y: number;
  w: number;
  h: number;
}

function stubCtx() {
  const draws: DrawCall[] = [];
  const ops: string[] = []; // save/restore/composite 轨（泄漏断言用）
  let current = 'source-over';
  const ctx = {
    save: () => ops.push('save'),
    restore: () => {
      ops.push('restore');
      current = 'source-over';
    },
    drawImage: (img: { width: number; height: number }, x: number, y: number, w: number, h: number) => {
      draws.push({ img, x, y, w, h, composite: current } as DrawCall & { composite: string });
    },
    set globalCompositeOperation(v: string) {
      current = v;
      ops.push(`gco:${v}`);
    },
    get globalCompositeOperation(): string {
      return current;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, draws, ops };
}

/** 帧图 stub：宽=高=side（素材正方形帧口径）；pack 按 layer.frameDir+帧名填充 */
function stubPack(sideByLayer: Record<string, number>, missLayers: string[] = []): FxFramePack {
  const pack: FxFramePack = new Map();
  for (const layer of TRIAL_FX_01.layers) {
    for (const name of layer.frames) {
      const side = sideByLayer[layer.id] ?? 100;
      pack.set(`${layer.frameDir}/${name}`, missLayers.includes(layer.id) ? null : { width: side, height: side });
    }
  }
  return pack;
}

function recipeOver(over: Partial<FxRecipe>): FxRecipe {
  return { ...JSON.parse(JSON.stringify(TRIAL_FX_01)) as FxRecipe, ...over };
}

// ---------- 配方约束（方案 §2） ----------

describe('T25 · validateRecipe 配方约束', () => {
  it('TRIAL_FX_01 配方常量合法（零违规）', () => {
    expect(validateRecipe(TRIAL_FX_01)).toEqual([]);
  });

  it('时窗 0 ≤ start < end ≤ 1：start≥end / end>1 / start<0 均报违规', () => {
    const r = recipeOver({});
    r.layers[0].windowStart = 0.5;
    r.layers[0].windowEnd = 0.5; // start>=end
    r.layers[1].windowEnd = 1.2; // end>1
    r.layers[2].windowStart = -0.1; // start<0
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('layers[0]');
    expect(errs).toContain('layers[1]');
    expect(errs).toContain('layers[2]');
  });

  it('frames 空数组 / scale ≤ 0 / blendMode ≠ lighter 均报违规', () => {
    const r = recipeOver({});
    r.layers[0].frames = [];
    r.layers[1].scale = 0;
    (r.layers[2].blendMode as string) = 'source-over';
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('layers[0]');
    expect(errs).toContain('layers[1]');
    expect(errs).toContain('layers[2]');
  });

  it('结构枚举：durationSource/anchor 只收方案口径两值', () => {
    const r = recipeOver({ durationSource: 'free' as FxRecipe['durationSource'], anchor: 'targetCell' as FxRecipe['anchor'] });
    const errs = validateRecipe(r).join(' ');
    expect(errs).toContain('durationSource');
    expect(errs).toContain('anchor');
  });
});

// ---------- 帧选择（方案 §2/§5.1：左闭右开 + 末段层夹取末帧） ----------

describe('T25 · pickLayerFrame 时窗与帧序', () => {
  const T = 3000; // 演示口径 T=3000ms（castDurationMs 缺省合成 0.8+0.2=1.0 → 3000）

  it('t < windowStart 返回 -1（该层不画）', () => {
    // L2 窗 [0.35, 0.90)：t=0.34T 未进窗
    expect(pickLayerFrame(22, 0.35, 0.9, 0.34 * T, T)).toBe(-1);
  });

  it('窗内等分帧序：t=windowStart 恰帧 0（左闭）；帧号随 progress 单调推进', () => {
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T, T)).toBe(0); // 左闭
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T + 1, T)).toBe(0); // 帧宽=0.55T/22=75ms
    expect(pickLayerFrame(22, 0.35, 0.9, 0.35 * T + 100, T)).toBe(1); // 等分推进（断言避开浮点帧界）
    expect(pickLayerFrame(12, 0, 0.45, 0, T)).toBe(0); // L1 从 t=0 起
    expect(pickLayerFrame(12, 0, 0.45, 0.44 * T, T)).toBe(11); // 窗尾邻域=末帧
  });

  it('L1/L2 窗尾右开：t ≥ windowEnd 停播（-1），不定格残留', () => {
    expect(pickLayerFrame(12, 0, 0.45, 0.45 * T, T)).toBe(-1);
    expect(pickLayerFrame(22, 0.35, 0.9, 0.9 * T, T)).toBe(-1);
  });

  it('末段层 windowEnd=1（L3 [.78T, T] 闭）：窗内等分，夹取末帧播到 T（浮点尾帧不丢）', () => {
    expect(pickLayerFrame(6, 0.78, 1, 0.77 * T, T)).toBe(-1); // 未进窗
    expect(pickLayerFrame(6, 0.78, 1, 0.78 * T, T)).toBe(0); // 左闭
  });

  it('L3 等分精确值：帧宽=0.22T/6=110ms，t=0.78T+330ms → 帧 3', () => {
    expect(pickLayerFrame(6, 0.78, 1, 0.78 * T + 330, T)).toBe(3);
    expect(pickLayerFrame(6, 0.78, 1, T - 1, T)).toBe(5); // T 前一瞬仍末帧
    expect(pickLayerFrame(6, 0.78, 1, T, T)).toBe(5); // t=T 夹取末帧
  });

  it('越界防御：frameCount=0 / durationMs=0 返回 -1 不抛', () => {
    expect(pickLayerFrame(0, 0, 1, 0, 1000)).toBe(-1);
    expect(pickLayerFrame(6, 0.78, 1, 100, 0)).toBe(-1);
  });
});

// ---------- 生命周期（方案 §3.1/§5.2：start/update/draw/clear；死亡不截断；重建清空） ----------

describe('T25 · FxPlayer 生命周期', () => {
  const T_LEN = 3000;

  it('start 返回实例 ID 单调不复用；update 到期清理（播完 t0+T 即收，不提前）', () => {
    const p = new FxPlayer(stubPack({}));
    const t0 = 100;
    const id1 = p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, T_LEN);
    const id2 = p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, T_LEN);
    expect(id1).not.toBe(id2); // ID 不复用
    expect(p.activeCount).toBe(2);
    p.update(t0 + (T_LEN - 1) / 1000); // update 收秒（演出钟），T_LEN 为毫秒
    expect(p.activeCount).toBe(2); // T 前不截断（死亡/终局不回滚——实例照常在）
    p.update(t0 + T_LEN / 1000);
    expect(p.activeCount).toBe(0); // 播完 t0+T 清理
  });

  it('三层时窗叠加：重叠区按层各画一帧（lighter 叠加面），非重叠区单层/零层', () => {
    const p = new FxPlayer(stubPack({}));
    const t0 = 0;
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, t0, 1000);
    const { ctx, draws } = stubCtx();
    // t=0.2T：仅 L1（窗 [0,0.45)）
    p.update(0.2); // 秒（T=1000ms）
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
    // t=0.4T：L1+L2 重叠（[0.35,0.45)∩[0,0.45)）
    draws.length = 0;
    p.update(0.4);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(2);
    // t=0.5T：仅 L2
    draws.length = 0;
    p.update(0.5);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
    // t=0.8T：L2+L3 重叠（[0.78,0.90)）
    draws.length = 0;
    p.update(0.8);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(2);
    // t=0.95T：仅 L3（末段层夹取末帧）
    draws.length = 0;
    p.update(0.95);
    p.draw(ctx, { x: 0, y: 0 }, 375, 667);
    expect(draws.length).toBe(1);
  });

  it('绘制形态：lighter 经 save/restore 包围不泄漏；中心对齐 ×scale（L2=150×1.4=210）', () => {
    const p = new FxPlayer(stubPack({ L1: 350, L2: 150, L3: 150 }));
    p.start(TRIAL_FX_01, { x: 100, y: 200 }, 0, 1000);
    const { ctx, draws, ops } = stubCtx();
    p.update(0.4); // L1+L2
    p.draw(ctx, { x: 10, y: 20 }, 375, 667);
    // save/restore 与层绘制一一配对；restore 后回 source-over（无泄漏）
    expect(ops.filter((o) => o === 'save').length).toBe(2);
    expect(ops.filter((o) => o === 'restore').length).toBe(2);
    expect(draws.every((d) => (d as DrawCall & { composite: string }).composite === 'lighter')).toBe(true);
    // 屏幕锚 = 世界锚 − cam + 视口/2（渲染层 drawFrame 同款换算）
    const cxBase = 100 - 10 + 375 / 2;
    const cyBase = 200 - 20 + 667 / 2;
    // L2：img 150² ×1.4=210，中心对齐
    const l2 = draws[1];
    expect(l2.w).toBe(210);
    expect(l2.h).toBe(210);
    expect(l2.x).toBe(Math.round(cxBase - 210 / 2));
    expect(l2.y).toBe(Math.round(cyBase - 210 / 2));
    // anchorOffsetPx=0 默认：L1 锚同点，350×0.5=175
    const l1 = draws[0];
    expect(l1.w).toBe(175);
    expect(l1.h).toBe(175);
    expect(l1.x).toBe(Math.round(cxBase - 175 / 2));
    expect(l1.y).toBe(Math.round(cyBase - 175 / 2));
  });

  it('缺图跳帧：该帧 null 槽跳过不抛，其余层照画', () => {
    const p = new FxPlayer(stubPack({}, ['L2'])); // L2 全缺
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    const { ctx, draws } = stubCtx();
    p.update(0.4); // 本应 L1+L2
    expect(() => p.draw(ctx, { x: 0, y: 0 }, 375, 667)).not.toThrow();
    expect(draws.length).toBe(1); // L1 照画，L2 跳帧
  });

  it('clear(id) 单实例清除；clearAll 全清（session 重建语义）；ID 仍不复用', () => {
    const p = new FxPlayer(stubPack({}));
    const a = p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    const b = p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    p.clear(a);
    expect(p.activeCount).toBe(1);
    p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000);
    expect(p.start(TRIAL_FX_01, { x: 0, y: 0 }, 0, 1000)).toBeGreaterThan(b); // seq 单调
    p.clearAll();
    expect(p.activeCount).toBe(0);
  });
});

// ---------- 预载器（方案 §4.2：注入式，全部 settle；缺图告警+null 槽） ----------

describe('T25 · loadFxFramePack 注入式预载', () => {
  it('40 张全部请求；全就绪 missing=[]；失败帧 null 槽+missing 记路径', async () => {
    const requested: string[] = [];
    const loadImage = async (url: string): Promise<{ width: number; height: number } | null> => {
      requested.push(url);
      return url.includes('125-1_f06') ? null : { width: 150, height: 150 };
    };
    const { pack, missing } = await loadFxFramePack(TRIAL_FX_01, loadImage);
    expect(requested.length).toBe(40); // 12+22+6
    expect(pack.size).toBe(40);
    expect(missing).toEqual(['assets/ui/fx/trial_fx_01/L3/125-1_f06.png']);
    expect(pack.get('assets/ui/fx/trial_fx_01/L3/125-1_f06.png')).toBeNull();
  });

  it('非法配方 fail-fast throw（进场阶段暴露，不进战斗中途）', async () => {
    const bad = recipeOver({});
    bad.layers[0].windowEnd = 2;
    await expect(loadFxFramePack(bad, async () => null)).rejects.toThrow(/非法/);
  });
});

// ---------- 素材接线一致性（Q-FX-01 裁决 B：40 张实际 PNG=12+22+6） ----------

describe('T25 · 素材目录与配方一致（40 张口径）', () => {
  const FX_DIR = path.join(ROOT, 'assets/ui/fx/trial_fx_01');

  it('L1=12 / L2=22 / L3=6 张，目录文件名与配方 frames 数组逐一对应', () => {
    const counts: Record<string, number> = { L1: 12, L2: 22, L3: 6 };
    for (const layer of TRIAL_FX_01.layers) {
      const dir = path.join(FX_DIR, layer.id);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
      expect(files).toEqual([...layer.frames].sort()); // 配方与目录零漂移
      expect(files.length).toBe(counts[layer.id]);
    }
  });

  it('SHA256SUMS.txt 恰 40 行且每行指向存在的 PNG', () => {
    const sums = readFileSync(path.join(FX_DIR, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    expect(sums.length).toBe(40);
    for (const line of sums) {
      const [hash, rel] = line.trim().split(/\s+/);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(path.join(FX_DIR, rel))).toBe(true);
    }
  });
});
