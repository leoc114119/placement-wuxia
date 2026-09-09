// T29 用例：hero 武器层 R2（方案 v2.1 §DoD-2 + 任务卡需求表 #9——按 v2.1 全量重写，v1 预摆层用例退役）
// 运行：npm run test:battle（vitest 全量含本文件）
// 覆盖：48 行 config↔manifest 双向一致 / 模型元数据（左右握点含 flipX 派生 [64,57] 锁定）/
//       §5 状态覆盖=消费帧集精确相等（jump/die 不入） / §4.1 绕模型握点旋转手算对照+屏幕角口径 /
//       §4.2 bounds 扩展（body∪rotated+2px，出招长剑越出身体矩形） / §4.3 weapon_front·body_front
//       合成次序（destination-out/over 仅离屏、destination-in 全链禁用、零 getImageData） /
//       drawPieces 单层贴回（主 canvas 零 rotate 零 gCO、无角色矩形 clip、缺层降级、jump·dead 不查询、
//       NPC 零 overlay） / §6 退役扫描（production 零候选·旧预摆 png·旧符号·第二入口，历史审计在库） /
//       §3 preflight 正常+负例 spawn
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path / node:child_process 的最小类型声明见 env.d.ts
declare const __dirname: string;
import { FACINGS, PIECE, SPRITE_PROFILES, TILE_H, type BattleClip, type DirectionalSpriteProfile } from '../config/battle-hex';
import {
  WEAPON_LAYER_PROFILES,
  WEAPON_MODELS,
  type HeroWeaponRuntimeRow,
} from '../config/hero-weapon-layer';
import {
  composeWeaponModelLayer,
  createView,
  directionalBodySrcOf,
  directionalFrameOf,
  drawFrame,
  frameKeyOf,
  rotatedSwordBounds,
  updateView,
  weaponLayerOf,
  weaponLayerRectOf,
  weaponMissingTag,
  WEAPON_BODY_CANVAS,
  WEAPON_LAYER_MARGIN_PX,
  type BattleHexAssets,
  type DirectionalFrameStore,
  type ImgLike,
  type OffscreenCanvasFactory,
  type WeaponLayerDiag,
  type WeaponLayerImages,
} from '../ui/battle-hex-render';
import type { BattleFacingHex, SnapshotActor } from '../types';

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_V2_REL = 'assets/characters/hero/weapon45/manifest.runtime.v2.json';

// ---------- 测试图与 ctx ----------

/** 身份标记测试图（tag 供 drawImage 身份断言） */
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
/** 假 canvas 工厂：记录 drawImage/translate/rotate/globalCompositeOperation；
 * 主 ctx（贴回面）与离屏 ctx（合成面）分池记录——destination-out/over 仅允许出现在离屏池。 */
function makeFakeFactory(): {
  factory: OffscreenCanvasFactory;
  offscreen: FakeCtx[];
} {
  const offscreen: FakeCtx[] = [];
  const makeCtx = (canvas: ImgLike, pool: FakeCtx[] | null): CanvasRenderingContext2D => {
    const self: FakeCtx = { ops: [], ctx: null as unknown as CanvasRenderingContext2D, canvas };
    pool?.push(self);
    const ctx = {
      canvas,
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      drawImage: (...a: unknown[]) => {
        self.ops.push({ op: 'drawImage', args: a });
      },
    } as unknown as CanvasRenderingContext2D;
    self.ctx = ctx;
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
  };
}

/** 主 ctx 记录器（drawFrame 身份断言：drawImage/rotate/gCO） */
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

/** 武器层测试资源包：hero 48 行全部给合成层 tag 图（tag=`layer:${bodyFrame}`） */
function makeWeaponAssets(): { assets: BattleHexAssets; diag: WeaponLayerDiag; mainOps: RecordedOp[] } {
  const mainOps: RecordedOp[] = [];
  const heroMap = new Map<string, ImgLike | null>();
  for (const [bodySrc] of WEAPON_LAYER_PROFILES.hero) {
    heroMap.set(bodySrc, tagImg(`layer:${bodySrc}`));
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

/** 期望身体帧路径（directionalBodySrcOf 单一出处） */
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

/** 取主 ctx 上指定 tag 的 drawImage 实参（x,y,w,h） */
function drawRectOf(ops: RecordedOp[], tag: string): { x: number; y: number; w: number; h: number } | null {
  const hit = ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === tag);
  if (!hit) return null;
  const [x, y, w, h] = hit.args.slice(1) as number[];
  return { x, y, w, h };
}

/** 棋子渲染高（与 drawPieces 同源：TILE_H×heightPerTile，非 Boss） */
const PIECE_H = TILE_H * PIECE.heightPerTile;

// ---------- §2.2 配置与模型元数据 ----------

describe('[T29 §2.2] 48 行 config↔manifest.runtime.v2 双向一致 + 模型元数据', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST_V2_REL), 'utf8'));

  it('hero map 恰 48 条；bodyFrame 键唯一；模型/标定路径全零候选树引用且声明即存在', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    expect(hero.size).toBe(48);
    expect(new Set(hero.keys()).size).toBe(48);
    expect(Object.keys(WEAPON_LAYER_PROFILES)).toEqual(['hero']); // NPC/敌方条目须后续需求卡授权
    for (const row of hero.values()) {
      expect(row.status).toBe('runtime-release');
      expect(row.weaponModelKey === 'hero-sword-right' || row.weaponModelKey === 'hero-sword-left').toBe(true);
      expect(WEAPON_MODELS[row.weaponModelKey].src.startsWith('assets/characters/hero/weapon45/models/')).toBe(true);
      if (row.maskPath) {
        expect(row.maskPath.startsWith('assets/characters/hero/weapon45/masks/')).toBe(true);
        expect(row.maskPath).not.toContain('_tri' + 'al');
        expect(existsSync(path.join(ROOT, row.maskPath))).toBe(true);
      }
      expect(existsSync(path.join(ROOT, row.bodyFrame))).toBe(true);
    }
  });

  it('manifest.runtime.v2 ↔ config 逐行双向一致（modelKey/SHA/grip/fist/angle/layerOrder/mask/status）', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    expect(manifest.frameCount).toBe(48);
    expect(manifest.rows).toHaveLength(48);
    for (const r of manifest.rows) {
      const row = hero.get(r.bodyFrame);
      expect(row, `config 缺行 ${r.bodyFrame}`).toBeTruthy();
      expect(row!.frameId).toBe(r.frameId);
      expect(row!.weaponModelKey).toBe(r.weaponModelKey);
      expect(row!.modelSha256).toBe(r.modelSha256);
      expect(row!.gripPointPx[0]).toBeCloseTo(r.gripPointPx[0], 6);
      expect(row!.gripPointPx[1]).toBeCloseTo(r.gripPointPx[1], 6);
      expect(row!.fistCenterPx[0]).toBeCloseTo(r.fistCenterPx[0], 6);
      expect(row!.fistCenterPx[1]).toBeCloseTo(r.fistCenterPx[1], 6);
      expect(row!.angleDeg).toBe(r.angleDeg);
      expect(row!.layerOrder).toBe(r.layerOrder);
      expect(row!.status).toBe('runtime-release');
      expect(row!.maskPath ?? null).toBe(r.maskPath ? `assets/characters/hero/weapon45/${r.maskPath}` : null); // manifest 相对/ config 全路径（T28 约定）
      if (r.maskPath) expect(row!.maskSha256).toBe(r.maskSha256);
    }
    // sourceLedger 来源可追溯（§3.1：第一批/第二批/统一 manifest/model manifest）
    for (const k of ['unifiedManifest', 'firstBatch26', 'secondBatch22', 'modelManifest']) {
      expect(manifest.sourceLedger?.[k]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('WEAPON_MODELS 两件：88×80/握点在画布内/屏幕角口径；左握点=右握点 flipX 派生 [64,57]（像素实测镜像锁定）', () => {
    const keys = Object.keys(WEAPON_MODELS).sort();
    expect(keys).toEqual(['hero-sword-left', 'hero-sword-right']); // 恰两件全局模型（§2.2 不复制 48 次）
    const right = WEAPON_MODELS['hero-sword-right'];
    const left = WEAPON_MODELS['hero-sword-left'];
    for (const m of [right, left]) {
      expect(m.canvasPx).toEqual([88, 80]);
      expect(m.angleDefinition).toBe('screen-clockwise-positive-y-down');
      const [gx, gy] = m.gripPointModelPx;
      expect(gx).toBeGreaterThanOrEqual(0);
      expect(gx).toBeLessThan(m.canvasPx[0]);
      expect(gy).toBeGreaterThanOrEqual(0);
      expect(gy).toBeLessThan(m.canvasPx[1]);
    }
    expect(right.gripPointModelPx).toEqual([23, 57]); // seq252 标定
    // 左模=右模 flipX 逐像素镜像（x→87-x，7040/7040 实测）→ 握点随镜像映射；
    // 若误用右值 [23,57]，左系 24 行绕错点旋转（横移 41px）——preflight 握点像素检查同锁此项
    expect(left.gripPointModelPx).toEqual([87 - 23, 57]);
    expect(left.sha256).not.toBe(right.sha256); // 左右模独立文件零运行时镜像
    expect(existsSync(path.join(ROOT, right.src))).toBe(true);
    expect(existsSync(path.join(ROOT, left.src))).toBe(true);
  });

  it('mask 治理：恰 22 行消费 mask（16 第一批+6 第二批转换）；mask 文件名=本行身体帧 stem（禁借邻帧）', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    const masked = [...hero.values()].filter((r) => r.maskPath);
    expect(masked.length).toBe(22);
    for (const r of hero.values()) {
      expect(!!r.maskPath).toBe(!!r.maskSha256);
      if (r.maskPath) {
        const stem = (r.bodyFrame.split('/').pop() ?? '').replace(/\.png$/, '');
        expect((r.maskPath.split('/').pop() ?? '')).toBe(`mask_${stem}.png`);
      }
    }
  });
});

// ---------- §5 48 行状态覆盖 ----------

describe('[T29 §5] 状态覆盖：idle 6/walk 12/atk 12/cast 18=消费帧集精确相等；jump/die 显式无武器', () => {
  it('48 行=hero directional 消费帧集（idle∪walk∪atk∪cast）精确相等——不多不少零缺口', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    const p = SPRITE_PROFILES.hero as DirectionalSpriteProfile;
    const consumed = new Set<string>();
    for (const facing of FACINGS) {
      for (const clip of ['idle', 'walk', 'atk', 'cast'] as BattleClip[]) {
        for (let o = 1; o <= p.clipCounts[clip]; o++) consumed.add(bodySrcOf(clip, facing, o));
      }
    }
    expect(consumed.size).toBe(48);
    for (const key of hero.keys()) expect(consumed.has(key), `配置行未被消费：${key}`).toBe(true);
    for (const c of consumed) expect(hero.has(c), `消费帧缺标定行：${c}`).toBe(true);
  });

  it('分状态计数：idle 6/walk 12/atk 12/cast 18；jump/die 不入配置（§5 不查询 overlay）', () => {
    const hero = WEAPON_LAYER_PROFILES.hero;
    const byClip = (prefix: string): number => [...hero.keys()].filter((k) => (k.split('/').pop() ?? k).startsWith(prefix)).length;
    expect(byClip('battle_idle_')).toBe(6);
    expect(byClip('walk_')).toBe(12);
    expect(byClip('atk_')).toBe(12);
    expect(byClip('cast_')).toBe(18);
    for (const facing of FACINGS) {
      expect(hero.has(`assets/characters/hero/battle45/jump_${facing}_2.png`)).toBe(false);
    }
    expect(hero.has('assets/characters/hero/battle45/die_common.png')).toBe(false);
  });
});

// ---------- §4.1 旋转几何 ----------

describe('[T29 §4.1] rotatedSwordBounds：绕模型握点旋转手算对照 + 屏幕角口径', () => {
  const GW = 88;
  const GH = 80;
  const GX = 23;
  const GY = 57;
  const FX = 100;
  const FY = 200;

  it('0°（向右）：bounds=模型外接框平移到拳心（grip 为旋转中心不动点）', () => {
    const b = rotatedSwordBounds(0, [GW, GH], [GX, GY], [FX, FY]);
    expect(b.x1).toBeCloseTo(FX - GX, 10);
    expect(b.y1).toBeCloseTo(FY - GY, 10);
    expect(b.x2).toBeCloseTo(FX + (GW - GX), 10);
    expect(b.y2).toBeCloseTo(FY + (GH - GY), 10);
  });

  it('+90°（顺时针=向下，+Y down 口径）：corner 旋转 (dx,dy)→(-dy,dx)', () => {
    const b = rotatedSwordBounds(90, [GW, GH], [GX, GY], [FX, FY]);
    // dx∈[-23,65], dy∈[-57,23] → rx=-dy∈[-23,57], ry=dx∈[-23,65]
    expect(b.x1).toBeCloseTo(FX - 23, 10);
    expect(b.x2).toBeCloseTo(FX + 57, 10);
    expect(b.y1).toBeCloseTo(FY - 23, 10);
    expect(b.y2).toBeCloseTo(FY + 65, 10);
  });

  it('-40°（右上）：四角手算对照（全精度）；剑尖 y 分量向上=屏幕上方（禁 atan2 数学口径的实证）', () => {
    // 手算（cos40°=0.766044443118978，sin40°=0.6427876096865394；角 -40 → sin 取负）：
    // 四角相对握点 (dx,dy)：A(-23,-57) B(65,-57) C(-23,23) D(65,23)
    //   A: rx=-54.25791594 ry=-28.88041823  B: rx=13.15399505 ry=-85.44572789（剑尖）
    //   C: rx=-2.83490717  ry=32.40313721   D: rx=64.57700383 ry=-24.16217244
    const b = rotatedSwordBounds(-40, [GW, GH], [GX, GY], [FX, FY]);
    expect(b.x1).toBeCloseTo(FX - 54.25791594, 6);
    expect(b.y1).toBeCloseTo(FY - 85.44572789, 6); // 剑尖=最高点（-40° 向右上）
    expect(b.x2).toBeCloseTo(FX + 64.57700383, 6);
    expect(b.y2).toBeCloseTo(FY + 32.40313721, 6);
  });

  it('左模握点绕点旋转：grip=[64,57] 为几何锚（与 bbox 中心口径可区分）', () => {
    const lg: [number, number] = [64, 57];
    const b0 = rotatedSwordBounds(0, [GW, GH], lg, [FX, FY]);
    const b90 = rotatedSwordBounds(90, [GW, GH], lg, [FX, FY]);
    // 0° 时模型左缘=FX-64（若误用 bbox 中心 [44,40] 会得 FX-44——两口径在此分野）
    expect(b0.x1).toBeCloseTo(FX - 64, 10);
    // 90° 时左缘=-(GH-GY)=-23（bbox 中心口径会得 -40）
    expect(b90.x1).toBeCloseTo(FX - 23, 10);
  });
});

// ---------- §4.2 越界扩展 ----------

describe('[T29 §4.2] weaponLayerRectOf：body∪rotated bounds+2px margin——出招长剑完整显示不裁剪', () => {
  it('atk_right_2（frame04，-40°）越出身体矩形右缘——layer 严格大于身体 240×320（Leo 验收点机器面）', () => {
    const row = WEAPON_LAYER_PROFILES.hero.get('assets/characters/hero/battle45/atk_right_2.png')!;
    const rect = weaponLayerRectOf(row, WEAPON_MODELS[row.weaponModelKey]);
    expect(rect.x).toBeLessThanOrEqual(-WEAPON_LAYER_MARGIN_PX);
    expect(rect.y).toBeLessThanOrEqual(-WEAPON_LAYER_MARGIN_PX);
    expect(rect.w).toBeGreaterThan(WEAPON_BODY_CANVAS.w); // 越出右缘
    expect(rect.h).toBeGreaterThan(WEAPON_BODY_CANVAS.h); // 2px margin 上下
  });

  it('48 行逐行：layer 恒包含身体∪bounds+2px；越界行全部正确扩展（无角色矩形 clip）', () => {
    let exceeded = 0;
    for (const row of WEAPON_LAYER_PROFILES.hero.values()) {
      const meta = WEAPON_MODELS[row.weaponModelKey];
      const b = rotatedSwordBounds(row.angleDeg, meta.canvasPx, meta.gripPointModelPx, row.fistCenterPx);
      const exceeds = b.x1 < 0 || b.y1 < 0 || b.x2 > WEAPON_BODY_CANVAS.w || b.y2 > WEAPON_BODY_CANVAS.h;
      const rect = weaponLayerRectOf(row, meta);
      expect(rect.x).toBeLessThanOrEqual(-WEAPON_LAYER_MARGIN_PX);
      expect(rect.y).toBeLessThanOrEqual(-WEAPON_LAYER_MARGIN_PX);
      expect(rect.x + rect.w).toBeCloseTo(Math.max(WEAPON_BODY_CANVAS.w, b.x2) + WEAPON_LAYER_MARGIN_PX, 9);
      expect(rect.y + rect.h).toBeCloseTo(Math.max(WEAPON_BODY_CANVAS.h, b.y2) + WEAPON_LAYER_MARGIN_PX, 9);
      if (exceeds) {
        exceeded++;
        const beyond =
          rect.w > WEAPON_BODY_CANVAS.w + 2 * WEAPON_LAYER_MARGIN_PX ||
          rect.h > WEAPON_BODY_CANVAS.h + 2 * WEAPON_LAYER_MARGIN_PX;
        expect(beyond, `${row.frameId} 越界行 layer 未扩展`).toBe(true);
      }
    }
    expect(exceeded).toBeGreaterThanOrEqual(9); // 实测 14 行越界（atk/cast 刺击系为主）——越界能力实际生效
  });
});

// ---------- §4.1/§4.3 离屏合成 ----------

describe('[T29 §4.1/§4.3] composeWeaponModelLayer：translate(fist)→rotate→drawImage(-握点)+挖拳+层序（全离屏）', () => {
  const bodyRow = (): HeroWeaponRuntimeRow =>
    WEAPON_LAYER_PROFILES.hero.get('assets/characters/hero/battle45/battle_idle_right.png')!;

  it('weapon_front+mask：gCO 序列 source-over→destination-out→destination-over→source-over；剑模绘制=-握点/88×80', () => {
    const { factory, offscreen } = makeFakeFactory();
    const row = bodyRow();
    const meta = WEAPON_MODELS[row.weaponModelKey];
    const rect = weaponLayerRectOf(row, meta);
    const out = composeWeaponModelLayer(tagImg('body'), tagImg('model', 88, 80), meta, tagImg('mask'), row, factory);
    expect(out).not.toBeNull();
    const comp = offscreen[0];
    expect(comp.canvas.width).toBe(Math.ceil(rect.w));
    expect(comp.canvas.height).toBe(Math.ceil(rect.h));
    // §4.1 公式：translate(fist−layerOffset) → rotate(angleDeg·π/180) → drawImage(model,−grip,88,80)
    const rot = comp.ops.find((o) => o.op === 'rotate');
    expect(rot).toBeTruthy();
    expect(rot!.args[0]).toBeCloseTo((row.angleDeg * Math.PI) / 180, 12);
    const trans = comp.ops.find((o) => o.op === 'translate');
    expect(trans!.args[0]).toBeCloseTo(row.fistCenterPx[0] - rect.x, 10); // 拳心对齐（fist=剑模握点落点）
    expect(trans!.args[1]).toBeCloseTo(row.fistCenterPx[1] - rect.y, 10);
    const swordDraw = comp.ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'model');
    expect(swordDraw!.args.slice(1)).toEqual([-meta.gripPointModelPx[0], -meta.gripPointModelPx[1], 88, 80]);
    // gCO 序列（§4.3：挖拳+身体垫剑下全在离屏 layer）
    const gcos = comp.ops.filter((o) => o.op === 'set:gCO').map((o) => o.args[0]);
    expect(gcos).toEqual(['source-over', 'destination-out', 'destination-over', 'source-over']);
    // mask/body 以 body-space 240×320 在 layer 偏移处绘制
    const maskDraw = comp.ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'mask');
    expect(maskDraw!.args.slice(1)).toEqual([-rect.x, -rect.y, 240, 320]);
    const bodyDraw = comp.ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'body');
    expect(bodyDraw!.args.slice(1)).toEqual([-rect.x, -rect.y, 240, 320]);
    expect(out).toBe(comp.canvas);
  });

  it('body_front：身体 source-over 盖剑上（无 destination-over）；无 mask 行零 destination-out', () => {
    const { factory, offscreen } = makeFakeFactory();
    const row = WEAPON_LAYER_PROFILES.hero.get('assets/characters/hero/battle45/battle_idle_rightup.png')!; // frame05
    const meta = WEAPON_MODELS[row.weaponModelKey];
    expect(row.layerOrder).toBe('body_front');
    const out = composeWeaponModelLayer(tagImg('body'), tagImg('model', 88, 80), meta, null, row, factory);
    expect(out).not.toBeNull();
    const gcos = offscreen[0].ops.filter((o) => o.op === 'set:gCO').map((o) => o.args[0]);
    expect(gcos).toEqual(['source-over', 'source-over', 'source-over']);
    expect(offscreen[0].ops.some((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'mask')).toBe(false);
  });

  it('红线：destination-in 全链零出现；零 getImageData/putImageData；工厂缺失=null 空手降级', () => {
    const { factory, offscreen } = makeFakeFactory();
    const row = bodyRow();
    const meta = WEAPON_MODELS[row.weaponModelKey];
    composeWeaponModelLayer(tagImg('body'), tagImg('model', 88, 80), meta, tagImg('mask'), row, factory);
    for (const surf of offscreen) {
      expect(surf.ops.some((o) => o.op === 'set:gCO' && o.args[0] === 'destination-in')).toBe(false);
      expect(surf.ops.some((o) => o.op === 'getImageData' || o.op === 'putImageData')).toBe(false);
    }
    expect(composeWeaponModelLayer(tagImg('body'), tagImg('model', 88, 80), meta, tagImg('mask'), row, null)).toBeNull();
  });

  it('weaponLayerOf 纯查询：命中=row+model+layer；缺层→missing；未配置→gaps；注入扩展缝；NPC 零诊断', () => {
    const diag: WeaponLayerDiag = { missing: new Set(), gaps: new Set() };
    const bodyKey = 'assets/characters/hero/battle45/battle_idle_right.png';
    const images: WeaponLayerImages = new Map([['hero', new Map([[bodyKey, tagImg('w')]])]]);
    const hit = weaponLayerOf({ spriteKey: 'hero' }, bodyKey, images, diag);
    expect(hit?.row.frameId).toBe('frame01');
    expect(hit?.model.gripPointModelPx).toEqual([23, 57]);
    expect((hit?.layer as TagImg).tag).toBe('w');
    expect(weaponLayerOf({ spriteKey: 'hero' }, 'assets/characters/hero/battle45/walk_right_1.png', new Map(), diag)).toBeNull();
    expect(diag.missing.has('assets/characters/hero/battle45/walk_right_1.png')).toBe(true);
    // 扩展缝：注入 map 项即命中（渲染函数零改动）
    const castBody = 'assets/characters/hero/battle45/cast_right_1.png';
    const entries: Array<[string, HeroWeaponRuntimeRow]> = [...WEAPON_LAYER_PROFILES.hero];
    entries.push([castBody, { ...WEAPON_LAYER_PROFILES.hero.get(bodyKey)!, bodyFrame: castBody, frameId: 'inject' }]);
    const injected = { hero: new Map(entries) };
    const hit2 = weaponLayerOf(
      { spriteKey: 'hero' },
      castBody,
      new Map([['hero', new Map([[castBody, tagImg('c')]])]]),
      diag,
      injected,
    );
    expect(hit2?.row.frameId).toBe('inject');
    // NPC spriteKey 无 profile=天然无 overlay 零诊断
    expect(weaponLayerOf({ spriteKey: 'npc-shanzei-a' }, bodyKey, images, diag)).toBeNull();
    expect(diag.gaps.size).toBe(0);
    expect(diag.missing.size).toBe(1);
  });
});

// ---------- drawPieces 单层贴回 ----------

describe('[T29 drawPieces] 武器行单层贴回：主 canvas 零 rotate 零 gCO/无角色矩形 clip/缺层降级/jump·dead/NPC', () => {
  it('三向 idle：身体+剑一体层单次 drawImage（无独立身体绘制/第二入口）；贴回尺寸=layerRect×s；主 canvas 零 rotate/零 gCO', () => {
    const s = PIECE_H / 320; // §4.1：与身体同 scale
    for (const facing of ['right', 'rightup', 'left'] as BattleFacingHex[]) {
      const { assets, mainOps } = makeWeaponAssets();
      assets.frames.set('hero', makeHeroStore());
      const hero = dirActor({ facingHex: facing, facing: facing === 'left' ? 'left' : 'right' });
      const view = createView();
      const snap = snapWith([hero]);
      updateView(view, snap, 0.016, 375, 667);
      drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view);
      const bodyTag = `idle|${facing}|1`;
      const bodySrc = bodySrcOf('idle', facing, 1);
      const layerRect = drawRectOf(mainOps, `layer:${bodySrc}`);
      expect(layerRect, `${facing} 层未贴回`).not.toBeNull();
      expect(drawRectOf(mainOps, bodyTag)).toBeNull(); // 身体已在层内（无重复绘制入口）
      const row = WEAPON_LAYER_PROFILES.hero.get(bodySrc)!;
      const lr = weaponLayerRectOf(row, WEAPON_MODELS[row.weaponModelKey]);
      expect(layerRect!.w).toBe(Math.round(lr.w * s));
      expect(layerRect!.h).toBe(Math.round(lr.h * s));
      // 主 canvas 红线：零 rotate/零合成态切换（旋转/挖拳全在离屏完成）
      expect(mainOps.some((o) => o.op === 'rotate')).toBe(false);
      expect(mainOps.some((o) => o.op === 'set:gCO')).toBe(false);
    }
  });

  it('缺层降级：已配置但合成层缺失 → 身体照绘不崩 + missing 诊断 + hero-weapon-missing gate 格式', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
    assets.frames.set('hero', makeHeroStore());
    const body = bodySrcOf('idle', 'right', 1);
    assets.weaponLayers!.get('hero')!.set(body, null); // 配置在、层缺
    const view = createView();
    const snap = snapWith([dirActor({})]);
    updateView(view, snap, 0.016, 375, 667);
    expect(() => drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view)).not.toThrow();
    expect(diag.missing.has(body)).toBe(true);
    expect(weaponMissingTag(body)).toBe(`hero-weapon-missing:${body}`);
    expect(diag.gaps.size).toBe(0); // 已配置帧缺层≠缺口
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag);
    expect(draws).toContain('idle|right|1'); // 身体照绘（空手降级）
    expect(draws).not.toContain(`layer:${body}`); // 无整剑盖拳
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
    expect(draws.some((t) => t.startsWith('layer:'))).toBe(false);
  });

  it('NPC/敌方无 overlay：enemy directional 身体帧不命中 hero 武器层（零 side 特判）', () => {
    const { assets, diag, mainOps } = makeWeaponAssets();
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
    expect(diag.gaps.size).toBe(0);
    expect(diag.missing.size).toBe(0);
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag ?? '');
    expect(draws).toContain('idle|right|1'); // 敌身体照常
    expect(draws.some((t) => t.startsWith('layer:'))).toBe(false);
  });

  it('cast 行贴回：strike→cast 帧族正常单层贴回（第二批 cast 18 行入冻结配置）', () => {
    const { assets, mainOps } = makeWeaponAssets();
    assets.frames.set('hero', makeHeroStore());
    const view = createView();
    const snap = snapWith([dirActor({ animState: 'strike' })]); // hero strike=cast_2→3 单播
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx: makeRecordingCtx(mainOps), width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    const row = [...WEAPON_LAYER_PROFILES.hero.values()].find((r) => r.bodyFrame.includes('cast_right'));
    expect(row!.layerOrder).toBe('weapon_front');
    const draws = mainOps.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string })?.tag ?? '');
    expect(draws.some((t) => t.startsWith('layer:assets/characters/hero/battle45/cast_right'))).toBe(true);
  });
});

// ---------- §6 旧路线退役扫描 ----------

describe('[T29 §6] T28 预摆路线退役：production source 零候选/旧 png/旧符号/第二入口；历史文件留审计', () => {
  // 模式串拼接构造（避免本文件自命中）
  const P_TRIAL = '_tri' + 'al';
  const P_OLD_PNG = 'weapon45/weapon' + '_';
  const P_OLD_MAP = 'HERO_WEAPON' + '_FRAMES';
  const P_OLD_COMPOSE = 'composite' + 'WeaponLayer';
  const P_OLD_MANIFEST = 'manifest.runtime' + '.json';

  const PRODUCTION_FILES = [
    'config/hero-weapon-layer.ts',
    'ui/battle-hex-render.ts',
    'proto/battle_demo/main.ts',
    'proto/battle_demo/bundle.js',
    'proto/battle_demo/index.html',
  ];
  const FORBIDDEN: Array<[string, string]> = [
    [P_TRIAL, '候选树引用'],
    [P_OLD_PNG, '旧预摆剑层 png 引用'],
    [P_OLD_MAP, '旧预摆 map 符号'],
    [P_OLD_COMPOSE, '旧合成入口符号'],
    [P_OLD_MANIFEST, 'v1 台账引用（v2 已取代）'],
  ];

  it('production source 逐文件零命中', () => {
    for (const rel of PRODUCTION_FILES) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      for (const [pattern, label] of FORBIDDEN) {
        expect(src.includes(pattern), `${rel} 含 ${label}（${pattern}）`).toBe(false);
      }
    }
  });

  it('非授权第二入口：hero-weapon-layer config 仅被 渲染器/main/测试 三处 import', () => {
    const allowed = ['ui/battle-hex-render.ts', 'proto/battle_demo/main.ts', 'tests/battle-weapon-layer.test.ts'];
    const hits: string[] = [];
    const scan = (dir: string): void => {
      let entries: string[] = [];
      try {
        entries = readdirSync(path.join(ROOT, dir));
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = `${dir}/${e}`;
        let isDir = false;
        try {
          readdirSync(path.join(ROOT, rel));
          isDir = true;
        } catch {
          isDir = false;
        }
        if (isDir) {
          if (rel === 'tools' || rel === 'scripts' || rel === 'node_modules' || rel === 'dist') continue; // 工具/脚本/构建产物非 production 运行时
          scan(rel);
        } else if (/\.(ts|mjs)$/.test(e)) {
          if (allowed.includes(rel)) continue; // 授权三入口：渲染器/main/测试
          // bundle.js 为构建派生产物（模块镜像，非第二入口——内容面由上一用例的模式扫描覆盖），js 不扫描
          const src = readFileSync(path.join(ROOT, rel), 'utf8');
          if (src.includes('hero-weapon-layer')) hits.push(rel);
        }
      }
    };
    for (const d of ['config', 'ui', 'systems', 'net', 'proto', 'tests']) scan(d);
    expect(hits).toEqual([]);
  });

  it('历史审计文件在库不删（26 预摆 png+v1 台账+归档工具）；旧预检/导入器不入 production 扫描面', () => {
    expect(existsSync(path.join(ROOT, 'assets/characters/hero/weapon45/manifest.runtime.json'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'assets/characters/hero/weapon45/weapon_battle_idle_right.png'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'tools/archive/import_hero_weapon_layer.mjs'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'tools/archive/preflight_hero_weapon_layer.mjs'))).toBe(true);
  });
});

// ---------- §3 preflight spawn ----------

describe('[T29 §3] preflight_hero_weapon_model：正常模式 exit 0 + 负例 3/3 判红', () => {
  it('正常模式：48 行/双模型/蒙版/SHA256SUMS/越界与 preview 推演全绿（exit 0）', () => {
    const r = spawnSync('node', ['tools/preflight_hero_weapon_model.mjs'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('PASS');
  }, 30000);

  it('--self-test-negative：错模型/错 SHA/角色矩形 clip 三负例全部正确检出（exit 0）', () => {
    const r = spawnSync('node', ['tools/preflight_hero_weapon_model.mjs', '--self-test-negative'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('3/3');
  }, 30000);
});
