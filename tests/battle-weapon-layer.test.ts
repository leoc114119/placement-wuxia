// T28 用例：hero 武器层接线（《主角武器层接线实施方案》§7.3-4 + 任务卡需求表 #7）
// 运行：npm run test:battle（vitest 全量含本文件）
// 覆盖：bodySrc 键唯一 / 26 行 manifest↔config 双向映射 / 左右六向与四缺口 / mask 与无 mask /
//       缺层降级 / jump·dead 无武器 / 第二批 cast 可扩展 / NPC 无 overlay /
//       spy canvas 四例（right/rightup/rightdown/left：身体武器矩形相同 / destination-out 仅离屏 / 主 canvas 无 rotate）
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path 的最小类型声明见 env.d.ts（全局 ambient）
declare const __dirname: string;
import { FACINGS, SPRITE_PROFILES, type BattleClip, type DirectionalSpriteProfile } from '../config/battle-hex';
import { WEAPON_LAYER_PROFILES, type WeaponLayerFrame } from '../config/hero-weapon-layer';
import {
  compositeWeaponLayer,
  createView,
  directionalBodySrcOf,
  directionalFrameOf,
  drawFrame,
  frameKeyOf,
  updateView,
  weaponLayerOf,
  weaponMissingTag,
  type BattleHexAssets,
  type DirectionalFrameStore,
  type ImgLike,
  type OffscreenCanvasFactory,
  type WeaponLayerDiag,
  type WeaponLayerImages,
} from '../ui/battle-hex-render';
import type { BattleFacingHex, SnapshotActor } from '../types';

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_REL = 'assets/characters/hero/weapon45/manifest.runtime.json';

// ---------- 测试图与 ctx ----------

/** 身份标记测试图（tag 供 drawImage 身份断言；240×320=武器层源画布） */
type TagImg = ImgLike & { tag: string };
const tagImg = (tag: string, width = 240, height = 320): TagImg => ({ width, height, tag });

interface RecordedOp {
  op: string;
  args: unknown[];
}
interface FakeCtx {
  ops: RecordedOp[];
  ctx: CanvasRenderingContext2D;
  canvas: ImgLike;
}
/** 假 canvas 工厂：记录 drawImage/globalCompositeOperation/getImageData/putImageData；
 * 主 ctx（武器绘制面）与离屏 ctx（合成面）分池记录——destination-out 仅允许出现在离屏池。 */
function makeFakeFactory(): {
  factory: OffscreenCanvasFactory;
  offscreen: FakeCtx[];
  makeMainCtx: () => CanvasRenderingContext2D;
} {
  const offscreen: FakeCtx[] = [];
  const makeCtx = (canvas: ImgLike, pool: FakeCtx[] | null): CanvasRenderingContext2D => {
    const self: FakeCtx = { ops: [], ctx: null as unknown as CanvasRenderingContext2D, canvas };
    pool?.push(self);
    const ctx = {
      canvas,
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getImageData: (x: number, y: number, w: number, h: number) => {
        self.ops.push({ op: 'getImageData', args: [x, y, w, h] });
        return {
          data: new Uint8ClampedArray(w * h * 4).fill(255),
          width: w,
          height: h,
          colorSpace: 'srgb',
        };
      },
      putImageData: (...a: unknown[]) => {
        self.ops.push({ op: 'putImageData', args: a });
      },
      drawImage: (...a: unknown[]) => {
        self.ops.push({ op: 'drawImage', args: a });
      },
    } as unknown as CanvasRenderingContext2D;
    self.ctx = ctx;
    // 属性写入（globalCompositeOperation 等）按 set 拦截记录
    return new Proxy(ctx, {
      get(target, prop) {
        const t = target as unknown as Record<string | symbol, unknown>;
        if (prop in t) return t[prop];
        return (...args: unknown[]) => {
          self.ops.push({ op: String(prop), args });
        };
      },
      set(target, prop, value) {
        if (prop === 'globalCompositeOperation') self.ops.push({ op: 'set:gCO', args: [value] });
        return true;
      },
    });
  };
  return {
    factory: (w, h) => {
      const canvas: ImgLike = { width: w, height: h };
      return { canvas, ctx: makeCtx(canvas, offscreen) };
    },
    offscreen,
    makeMainCtx: () => makeCtx({ width: 375, height: 667 }, null),
  };
}

/** 武器层测试资源包：hero 全 26 帧给带 tag 图（tag 统一 `weapon:<bodySrc>`；§7.4 另断言绘制次序）；
 * 返回主 ctx 记录池 mainOps（drawImage/rotate/gCO 身份断言用）。 */
function makeWeaponAssets(): { assets: BattleHexAssets; diag: WeaponLayerDiag; mainOps: RecordedOp[] } {
  const mainOps: RecordedOp[] = [];
  const target = {
    canvas: { width: 375, height: 667 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as unknown as Record<string | symbol, unknown>;
  const main = new Proxy(target as unknown as CanvasRenderingContext2D, {
    get(t, prop) {
      const rec = t as unknown as Record<string | symbol, unknown>;
      if (prop in rec) return rec[prop];
      return (...args: unknown[]) => {
        mainOps.push({ op: String(prop), args });
      };
    },
    set(t, prop, value) {
      if (prop === 'globalCompositeOperation') mainOps.push({ op: 'set:gCO', args: [value] });
      (t as unknown as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
  const heroMap = new Map<string, ImgLike | null>();
  for (const [bodySrc] of WEAPON_LAYER_PROFILES.hero) {
    heroMap.set(bodySrc, tagImg(`weapon:${bodySrc}`));
  }
  const diag: WeaponLayerDiag = { missing: new Set(), gaps: new Set() };
  const assets: BattleHexAssets = {
    env: null,
    topbar: null,
    plaque: null,
    ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
    statusIcons: new Map(),
    frames: new Map(),
    weaponLayers: new Map([['hero', heroMap]]),
    weaponDiag: diag,
  };
  void main; // 主 ctx 由 makeRecordingCtx(mainOps) 按需重建（同池共享 mainOps）
  return { assets, diag, mainOps };
}

/** directional 测试 actor（与 battle-hex-render.test dirActor 同式） */
function dirActor(over: Partial<SnapshotActor> = {}): SnapshotActor {
  return {
    id: 'hero', side: 'player', name: '小虾米', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 },
    hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 0, facing: 'right', facingHex: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
    ...over,
  };
}

/** hero directional 帧库（每 key 独立 tag；die 走 clip 键） */
function makeHeroStore(): DirectionalFrameStore {
  const p = SPRITE_PROFILES.hero;
  if (p.mode !== 'directional') throw new Error('hero profile 未切 directional');
  const frames = new Map<string, ImgLike | null>();
  for (const facing of FACINGS) {
    for (const clip of Object.keys(p.clipCounts) as BattleClip[]) {
      if (p.sharedSrc[clip] !== undefined) continue;
      for (let o = 1; o <= p.clipCounts[clip]; o++) frames.set(frameKeyOf(clip, facing, o), tagImg(frameKeyOf(clip, facing, o)));
    }
  }
  for (const clip of Object.keys(p.sharedSrc) as BattleClip[]) frames.set(clip, tagImg(clip));
  return { mode: 'directional', frames };
}

/** 期望身体帧路径（第一覆盖帧序表） */
function bodySrcOf(clip: BattleClip, facing: BattleFacingHex, ordinal: number): string {
  const p = SPRITE_PROFILES.hero as DirectionalSpriteProfile;
  return directionalBodySrcOf(p, { clip, ordinal }, facing);
}

const snapWith = (actors: SnapshotActor[]) => ({
  phase: 'fighting' as const,
  turnActorId: null,
  pendingInput: false,
  moveCells: [],
  moveKind: 'walk' as const,
  attackCells: [],
  basicCells: [],
  selectedSkill: null,
  heroSkills: [],
  actors,
  cameraTargetId: 'hero',
});

/** 取主 ctx 上武器 tag 的 drawImage 实参（x,y,w,h） */
function drawRectOf(ops: RecordedOp[], tag: string): { x: number; y: number; w: number; h: number } | null {
  const hit = ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === tag);
  if (!hit) return null;
  const [x, y, w, h] = hit.args.slice(1) as number[];
  return { x, y, w, h };
}

// ---------- §7.3 配置与映射 ----------

describe('[T28 §7.3] 武器层配置键唯一与 26 行映射', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST_REL), 'utf8'));

  it('hero map 恰 26 条；bodySrc/weaponSrc 全仓唯一且零候选树引用', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    expect(hero.size).toBe(26);
    const bodySet = new Set(hero.keys());
    expect(bodySet.size).toBe(26); // bodySrc 键唯一（键=身体帧完整路径）
    const weapons = [...hero.values()].map((f) => f.weaponSrc);
    expect(new Set(weapons).size).toBe(26);
    for (const f of hero.values()) {
      expect(f.weaponSrc.startsWith('assets/characters/hero/weapon45/')).toBe(true);
      expect(f.weaponSrc).not.toContain('_trial/');
      expect(existsSync(path.join(ROOT, f.weaponSrc))).toBe(true); // 声明即存在
      expect(existsSync(path.join(ROOT, f.bodySrc))).toBe(true);
    }
    expect(Object.keys(WEAPON_LAYER_PROFILES)).toEqual(['hero']); // NPC/敌方条目须后续需求卡授权
  });

  it('manifest.runtime.json ↔ config 逐行双向一致（bodySrc/grip/fist/angle/layerOrder/occlusion/SHA/status）', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    expect(manifest.frameCount).toBe(26);
    expect(manifest.rows).toHaveLength(26);
    const bodies = new Set<string>();
    for (const r of manifest.rows) {
      bodies.add(r.bodyFrame);
      const f = hero.get(r.bodyFrame);
      expect(f, `config 缺行 ${r.bodyFrame}`).toBeTruthy();
      expect(f!.weaponSrc).toBe(`assets/characters/hero/weapon45/${r.weaponPath}`);
      expect(f!.weaponSha256).toBe(r.weaponSha256);
      expect(f!.gripPointPx[0]).toBeCloseTo(r.gripPointPx[0], 6);
      expect(f!.gripPointPx[1]).toBeCloseTo(r.gripPointPx[1], 6);
      expect(f!.fistCenterPx[0]).toBeCloseTo(r.fistCenterPx[0], 6);
      expect(f!.fistCenterPx[1]).toBeCloseTo(r.fistCenterPx[1], 6);
      expect(f!.angleDeg).toBe(r.angleDeg);
      expect(f!.layerOrder).toBe(r.layerOrder);
      if (r.maskPolicy === 'none') {
        expect(f!.occlusion).toEqual({ kind: 'none' });
      } else {
        expect(f!.occlusion).toEqual({
          kind: 'body-alpha-tight-fist-roi',
          maskSrc: `assets/characters/hero/weapon45/${r['occlusionMaskPath+occlusionMaskSha256'].path}`,
          maskSha256: r['occlusionMaskPath+occlusionMaskSha256'].sha256,
        });
        expect(existsSync(path.join(ROOT, f!.occlusion.kind === 'none' ? '' : f!.occlusion.maskSrc))).toBe(true);
      }
      expect(r.status).toBe('runtime-release');
    }
    expect(bodies.size).toBe(26); // 26 行 bodyFrame 无重复
  });

  it('maskPolicy 枚举化：policy=none 行（frame05/05_left 等）恒 kind none——有蒙版文件也不消费（policy 治理非文件存在性）', () => {
    const rowsByBody = new Map<string, Record<string, unknown>>(manifest.rows.map((r: Record<string, unknown>) => [r.bodyFrame as string, r]));
    for (const [bodySrc, r] of rowsByBody) {
      const f = WEAPON_LAYER_PROFILES.hero.get(bodySrc)!;
      const policy = r.maskPolicy as string;
      if (policy === 'none') expect(f.occlusion).toEqual({ kind: 'none' });
      else expect(f.occlusion.kind).toBe('body-alpha-tight-fist-roi');
    }
    // frame05（idle_rightup）= 候选 manifest 带 mask 文件但 policy=none 的代表行
    const f05 = WEAPON_LAYER_PROFILES.hero.get('assets/characters/hero/battle45/battle_idle_rightup.png')!;
    expect(f05.occlusion).toEqual({ kind: 'none' });
    expect(existsSync(path.join(ROOT, 'assets/characters/hero/weapon45/masks/mask_battle_idle_rightup.png'))).toBe(true); // 文件落库（溯源）但运行时不消费
  });

  it('左右六向覆盖：idle 6 + walk 10 + atk 10=26；第一缺口四帧不入配置；jump/die 不入配置', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    const byClip = (prefix: string): number => [...hero.keys()].filter((k) => (k.split('/').pop() ?? k).startsWith(prefix)).length;
    expect(byClip('battle_idle_')).toBe(6); // 右系3+左系3（idle 六向全独立身体键）
    expect(byClip('walk_')).toBe(10); // right 2/rightup 2/rightdown 1 ×左右
    expect(byClip('atk_')).toBe(10); // right 2/rightup 2/rightdown 2 ×左右 → 12−2（right_1/left_1 未到）
    // 第一批显式缺口（方案 §1/§5）：禁借邻帧/镜像填补——必须查无条目
    for (const gap of ['walk_rightdown_2.png', 'walk_leftdown_2.png', 'atk_right_1.png', 'atk_left_1.png']) {
      expect(hero.has(`assets/characters/hero/battle45/${gap}`)).toBe(false);
    }
    for (const facing of FACINGS) {
      expect(hero.has(`assets/characters/hero/battle45/jump_${facing}_2.png`)).toBe(false); // jump 显式无武器
    }
    expect(hero.has('assets/characters/hero/battle45/die_common.png')).toBe(false); // die 显式无武器
  });
});

// ---------- §7.3 缺层降级 / 无武器态 / 可扩展 / NPC ----------

describe('[T28 §7.3] 缺层降级 / jump·dead 无武器 / cast 可扩展 / NPC 无 overlay', () => {
  it('缺层降级：已配置但图缺失 → 只绘身体不崩 + hero-weapon-missing:<bodyFrame> 写诊断（宿主进 asset gate）', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
    assets.frames.set('hero', makeHeroStore()); // 身体帧在（T27 门辖），武器图缺（本卡 gate 辖）
    const body = bodySrcOf('idle', 'right', 1);
    assets.weaponLayers!.get('hero')!.set(body, null); // 配置在、图缺
    const view = createView();
    const snap = snapWith([dirActor({})]);
    updateView(view, snap, 0.016, 375, 667);
    expect(() => drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view)).not.toThrow();
    expect(diag.missing.has(body)).toBe(true);
    expect(weaponMissingTag(body)).toBe(`hero-weapon-missing:${body}`);
    expect(diag.gaps.size).toBe(0); // 已配置帧缺图≠缺口
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag);
    expect(draws).toContain('idle|right|1'); // 身体照绘
    expect(draws).not.toContain(`weapon:${body}`); // 无整剑盖拳（禁无孔剑层）
  });

  it('jump/dead 显式无武器（不查询不诊断）；die 压扁淡出路径零变化', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
    for (const actor of [
      dirActor({ animState: 'walk', isJump: true, pos: { q: 5, r: 8 }, renderPos: { q: 1, r: 8 } }),
      dirActor({ animState: 'dead' }),
    ]) {
      const view = createView();
      const snap = snapWith([actor]);
      updateView(view, snap, 0.016, 375, 667);
      drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view);
      const sel = directionalFrameOf(view, actor);
      expect(['jump', 'die']).toContain(sel.clip);
    }
    expect(diag.missing.size).toBe(0);
    expect(diag.gaps.size).toBe(0); // 显式无武器不产缺口诊断
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag ?? '');
    expect(draws.some((t) => t.startsWith('weapon:'))).toBe(false);
  });

  it('第一批四缺口帧：显式空手 + gaps 开发诊断（禁借邻帧/镜像）', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
    const heroStore = makeHeroStore();
    assets.frames.set('hero', heroStore);
    const view = createView();
    // walk rightdown 循环至 ordinal 2（缺口帧）——pos==renderPos 不触发移动演出（纯帧循环口径同六向截图）
    const walker = dirActor({ animState: 'walk', facingHex: 'rightdown', facing: 'right' });
    updateView(view, snapWith([walker]), 0.016, 375, 667);
    view.anim.set('hero', { state: 'walk', t: 0.15 }); // >140ms → ordinal 2
    drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snapWith([walker]), assets, view);
    expect(diag.gaps.has('assets/characters/hero/battle45/walk_rightdown_2.png')).toBe(true);
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag);
    expect(draws).toContain('walk|rightdown|2'); // 身体照常
    expect(draws.some((t) => t?.startsWith('weapon:'))).toBe(false); // 空手
  });

  it('第二批 cast 可扩展：同接口注入新增 map 项即命中（渲染零改动——weaponLayerOf 扩展缝）', () => {
    const diag: WeaponLayerDiag = { missing: new Set(), gaps: new Set() };
    const castBody = 'assets/characters/hero/battle45/cast_right_1.png';
    const castFrame: WeaponLayerFrame = {
      bodySrc: castBody,
      weaponSrc: 'assets/characters/hero/weapon45/weapon_cast_right_1.png',
      weaponSha256: '0'.repeat(64),
      gripPointPx: [120, 180],
      fistCenterPx: [110, 190],
      angleDeg: -40,
      layerOrder: 'weapon_front',
      occlusion: { kind: 'none' },
    };
    // 第二批=新增资源+manifest 行+map 项（方案 §3）：扩展 map 传入 weaponLayerOf 即命中，渲染函数签名不变
    const extended: Readonly<Record<string, ReadonlyMap<string, WeaponLayerFrame>>> = {
      hero: new Map([...WEAPON_LAYER_PROFILES.hero, [castBody, castFrame]]),
    };
    const images: WeaponLayerImages = new Map([['hero', new Map([[castBody, tagImg(`weapon:${castBody}`)]])]]);
    const hit = weaponLayerOf({ spriteKey: 'hero' }, castBody, images, diag, extended);
    expect(hit?.frame.layerOrder).toBe('weapon_front');
    expect((hit?.img as TagImg).tag).toBe(`weapon:${castBody}`);
    // 生产默认（不传 profile）仍查冻结配置：cast 未到批=缺口空手
    const prodMiss = weaponLayerOf({ spriteKey: 'hero' }, castBody, images, diag);
    expect(prodMiss).toBeNull();
    expect(diag.gaps.has(castBody)).toBe(true);
  });

  it('NPC/敌方无 overlay：enemy directional 身体帧不命中 hero 武器层（零 side 特判，键不命中即无 overlay 且零诊断）', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
    // 给敌方真实帧库（帧资源在位=走满 weaponLayerOf 查询路径——纯 spriteKey 无 profile 分支）
    const foeStore: DirectionalFrameStore = { mode: 'directional', frames: new Map([['idle|right|1', tagImg('idle|right|1')]]) };
    assets.frames.set('npc-shanzei-a', foeStore);
    const view = createView();
    const foe = dirActor({
      id: 'e1', side: 'enemy', name: '山贼甲', spriteKey: 'npc-shanzei-a',
      facingHex: 'right', facing: 'right',
    });
    const snap = snapWith([foe]);
    updateView(view, snap, 0.016, 375, 667);
    expect(() => drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view)).not.toThrow();
    expect(diag.gaps.size).toBe(0); // NPC 身体帧路径不在 hero 表=天然无 overlay，非缺口
    expect(diag.missing.size).toBe(0);
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag ?? '');
    expect(draws).toContain('idle|right|1'); // 敌身体照常（enemy 帧）
    expect(draws.some((t) => t.startsWith('weapon:'))).toBe(false);
  });
});

// ---------- §7.4 spy canvas 四例 + 离屏合成 ----------

describe('[T28 §7.4] spy canvas 四例：矩形相同 / destination-out 仅离屏 / 主 canvas 零 rotate', () => {
  const cases: Array<{ facing: BattleFacingHex; body: string; layerOrder: string }> = [
    { facing: 'right', body: 'assets/characters/hero/battle45/battle_idle_right.png', layerOrder: 'weapon_front' },
    { facing: 'rightup', body: 'assets/characters/hero/battle45/battle_idle_rightup.png', layerOrder: 'body_front' },
    { facing: 'rightdown', body: 'assets/characters/hero/battle45/battle_idle_rightdown.png', layerOrder: 'weapon_front' },
    { facing: 'left', body: 'assets/characters/hero/battle45/battle_idle_left.png', layerOrder: 'weapon_front' },
  ];
  for (const c of cases) {
    it(`facing=${c.facing}（${c.layerOrder}）：身体/武器绘制矩形严格相同；主 canvas 无 rotate、无 destination-out`, () => {
      const { assets, mainOps } = makeWeaponAssets();
      assets.frames.set('hero', makeHeroStore());
      const hero = dirActor({ facingHex: c.facing, facing: c.facing === 'left' ? 'left' : 'right' });
      const view = createView();
      const snap = snapWith([hero]);
      updateView(view, snap, 0.016, 375, 667);
      drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view);
      const bodyRect = drawRectOf(mainOps, `idle|${c.facing}|1`);
      const weaponTag = `weapon:${c.body}`;
      const weaponRect = drawRectOf(mainOps, weaponTag);
      expect(bodyRect).not.toBeNull();
      expect(weaponRect).not.toBeNull();
      expect(weaponRect).toEqual(bodyRect); // 同 left/top/w/h 叠画（方案 §4.2 零旋转）
      expect(mainOps.some((o) => o.op === 'rotate')).toBe(false); // 主 canvas 零 rotate
      expect(mainOps.some((o) => o.op === 'set:gCO')).toBe(false); // 主 canvas 零合成态切换（无 destination-out）
      // 绘制次序：body_front 剑在身体前；weapon_front 剑在身体后
      const bi = mainOps.findIndex((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === `idle|${c.facing}|1`);
      const wi = mainOps.findIndex((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === weaponTag);
      expect(wi).toBeGreaterThan(0);
      if (c.layerOrder === 'body_front') expect(wi).toBeLessThan(bi);
      else expect(wi).toBeGreaterThan(bi);
    });
  }
});

describe('[T28 §4.3] compositeWeaponLayer 离屏预合成（destination-out 仅离屏 / alpha 蒙版 / 降级）', () => {
  it('有遮挡：单离屏 source-over 剑层 → destination-out alpha 蒙版 → 复位；全链零 getImageData', () => {
    const { factory, offscreen } = makeFakeFactory();
    const weapon = tagImg('weapon-src');
    const mask = tagImg('mask-src');
    const out = compositeWeaponLayer(weapon, mask, factory);
    expect(out).not.toBeNull();
    expect(offscreen).toHaveLength(1); // 单离屏一次合成（蒙版已是 alpha 形态——导入期机械转换）
    const comp = offscreen[0];
    // 合成离屏：先 source-over 剑层，再 destination-out 蒙版，后复位 source-over
    const gcos = comp.ops.filter((o) => o.op === 'set:gCO').map((o) => o.args[0]);
    expect(gcos).toEqual(['source-over', 'destination-out', 'source-over']);
    expect(comp.ops.some((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'weapon-src')).toBe(true);
    expect(comp.ops.some((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'mask-src')).toBe(true);
    expect(out).toBe(comp.canvas); // 返回合成离屏成品（loader 缓存它，主 canvas 只 drawImage 它）
    // 红线：destination-in 全链零出现（语义相反禁用）；零像素回读（file:// 污染/wx 开销——禁 getImageData）
    for (const surf of offscreen) {
      expect(surf.ops.some((o) => o.op === 'set:gCO' && o.args[0] === 'destination-in')).toBe(false);
      expect(surf.ops.some((o) => o.op === 'getImageData' || o.op === 'putImageData')).toBe(false);
    }
  });

  it('降级：无蒙版/无工厂 → null（该帧空手，禁画整剑盖拳）；kind=none 行不走合成直出原图', () => {
    const { factory } = makeFakeFactory();
    expect(compositeWeaponLayer(tagImg('w'), null, factory)).toBeNull();
    expect(compositeWeaponLayer(tagImg('w'), tagImg('m'), null)).toBeNull();
    // kind=none 的 config 行：loader 直出原图（weaponLayerOf 不看蒙版）——此处验证纯查询语义
    const f = WEAPON_LAYER_PROFILES.hero.get('assets/characters/hero/battle45/battle_idle_rightup.png')!;
    expect(f.occlusion).toEqual({ kind: 'none' });
  });

  it('weaponLayerOf：未配置→gaps；已配置缺图→missing；命中→frame+img（纯查询不改语义）', () => {
    const diag: WeaponLayerDiag = { missing: new Set(), gaps: new Set() };
    const images: WeaponLayerImages = new Map([
      ['hero', new Map([['assets/characters/hero/battle45/battle_idle_right.png', tagImg('w')]])],
    ]);
    const hit = weaponLayerOf({ spriteKey: 'hero' }, 'assets/characters/hero/battle45/battle_idle_right.png', images, diag);
    expect(hit?.frame.layerOrder).toBe('weapon_front');
    expect((hit?.img as TagImg).tag).toBe('w');
    expect(weaponLayerOf({ spriteKey: 'hero' }, 'assets/characters/hero/battle45/walk_rightdown_2.png', images, diag)).toBeNull();
    expect(diag.gaps.has('assets/characters/hero/battle45/walk_rightdown_2.png')).toBe(true);
    expect(weaponLayerOf({ spriteKey: 'hero' }, 'assets/characters/hero/battle45/walk_right_1.png', images, diag)).toBeNull();
    expect(diag.missing.has('assets/characters/hero/battle45/walk_right_1.png')).toBe(true);
  });
});

// ---------- 工具（主 ctx 记录器：drawImage/rotate/gCO 等身份断言） ----------

function makeRecordingCtx(ops: RecordedOp[]): CanvasRenderingContext2D {
  const target = {
    canvas: { width: 375, height: 667 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  } as unknown as Record<string | symbol, unknown>;
  return new Proxy(target as unknown as CanvasRenderingContext2D, {
    get(t, prop) {
      const rec = t as unknown as Record<string | symbol, unknown>;
      if (prop in rec) return rec[prop];
      return (...args: unknown[]) => {
        ops.push({ op: String(prop), args });
      };
    },
    set(t, prop, value) {
      if (prop === 'globalCompositeOperation') ops.push({ op: 'set:gCO', args: [value] });
      (t as unknown as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
}
