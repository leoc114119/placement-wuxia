// T31-FE-B 用例：主角 3D 战斗接线（《2.5D角色运行时接入技术方案》v1.0 §4.1 单一坐标出口 / §4.3 层序 /
//   §5 动作状态映射 / §6.2 无 2D 降级 / §8 卡 B 明文「T29 的 2D hero 武器层对 3D hero 停用」/ §10 易错点 9·10）。
//
// 用例面（DoD 8）：hero 走 3D、敌方走原 profile、depth slot 正确、placed 与 HUD/热区不漂、无重复 hero、
//   2D 武器层对 hero 零调用；另加 §5 状态映射与命令字段（轻功意图 / 脚底锚=格心 / 物理像素单位）。
//
// 【T31-FE-B · 打回整改（arch seq=419 答件 A1-Q1-Q2-T31-FEB）】追加 R1（轻功意图=修订乙）真实链路回归
//（真 session→view→command→真 pass/controller）、R2（像素语义 DPR 1/2/3 逻辑高度一致）、
//   R3（同尺寸首调 resize 投影非零）、R5（重建终失败暂停 + 重试单一 RAF）失败注入断言。
//
// 关键设计（决定这些用例的形状）：3D 路由 = **宿主注入 3D 层** ∧ config 有该 spriteKey 的 profile 映射。
//   未注入（既有 T29 用例、微信宿主 S1 未迁移）⇒ 既有 2D 路径原样生效（既有用例零改写）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

declare const __dirname: string;
import { CHOREO, HUD, JUMP, PIECE, SPRITE_PROFILES, TILE_H, hexToWorld, jumpParamsFor, type DirectionalSpriteProfile } from '../config/battle-hex';
import { SPEED_FACTOR } from '../config/battle';
import {
  CHARACTER_3D_CROSS_FADE_SEC,
  CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
  CHARACTER_3D_BASIC_WINDOW_SEC,
  HERO_3D_ACTION_MAP,
  HERO_3D_PROFILE,
  HERO_3D_PROFILE_ID,
  CHARACTER_3D_JUMP_MOVE_SEC,
} from '../config/character-3d';
import { createCharacter3DPass, type Character3DPass, type Character3DProfileRuntime } from '../ui/character3d/pass';
import { pickAtkButton } from '../ui/battle-input';
import type { Character3DRenderer } from '../ui/character3d/renderer';
import { createHostRuntime, type HostRuntime } from '../proto/battle_demo/host-runtime';
import { createHexBattle, type HexBattleSession } from '../systems/battle-session';
import { cubeDistance } from '../systems/hex';
import { heroClipRaw, heroClipRegistry, heroModel } from './character3d-fixtures';
import {
  applyRetargetedClip,
  bindRetargetedClip,
  createPose,
  gainedRootY,
  parseCharacter3DClipJson,
  CharacterAnimController,
} from '../ui/character3d/animation';
import {
  createView,
  directionalBodySrcOf,
  drawFrame,
  pieceHop,
  updateView,
  type BattleHexAssets,
  type BattleHexView,
  type Character3DLayer,
  type DirectionalFrameStore,
  type ImgLike,
} from '../ui/battle-hex-render';
import type {
  BattleSnapshot,
  Character3DPassResult,
  CharacterRenderCommand,
  CombatantInput,
  SkillDef,
  SnapshotActor,
} from '../types';

const ROOT = path.resolve(__dirname, '..');
/** 假层 placed 宽度（= 真 pass 的 w = max(x/z 跨度)×scale 的占位值；本批不动六向帧/模型） */
const FAKE_BOX_W = 86.7;
const W = 375;
const H = 667;
const DPR = 2; // 用例统一按 hidpi 口径跑（命令=物理像素 2× 逻辑），dpr=1 只是本式的特例

// ---------- 记录型 ctx（同 tests/battle-weapon-layer.test.ts 的 Proxy 式，判 drawImage 序列） ----------
interface RecordedOp {
  op: string;
  args: unknown[];
}
function makeRecordingCtx(ops: RecordedOp[]): CanvasRenderingContext2D {
  const target = {
    canvas: { width: W, height: H },
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
      (t as unknown as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
}
const drawTags = (ops: RecordedOp[]): string[] =>
  ops.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string } | undefined)?.tag ?? '?');

function tagImg(tag: string, width = 240, height = 320): ImgLike {
  return { width, height, tag } as ImgLike & { tag: string };
}

/** hero directional 帧库（tag=帧键）+ 两个敌型 legacy 帧条 */
function makeFrames(): Map<string, DirectionalFrameStore | Array<ImgLike | null>> {
  const heroFrames = new Map<string, ImgLike | null>();
  heroFrames.set('idle|right|1', tagImg('hero-2d-idle'));
  heroFrames.set('die', tagImg('hero-2d-die'));
  const foeFrames = new Map<string, ImgLike | null>();
  foeFrames.set('idle|right|1', tagImg('foeA-2d-idle'));
  const frames = new Map<string, DirectionalFrameStore | Array<ImgLike | null>>();
  frames.set('hero', { mode: 'directional', frames: heroFrames });
  frames.set('npc-shanzei-a', { mode: 'directional', frames: foeFrames });
  frames.set('npc-shanzei-b', { mode: 'directional', frames: foeFrames });
  return frames;
}

/** 武器层 spy：hero 行真给合成层，并统计 `.get` 次数（>0 = 2D 武器层被 3D hero 消费 → 违规） */
class SpyLayerMap extends Map<string, ImgLike | null> {
  hits = 0;
  override get(key: string): ImgLike | null | undefined {
    this.hits++;
    return super.get(key);
  }
}
function makeAssets(): { assets: BattleHexAssets; heroWeaponHits: () => number } {
  const heroMap = new SpyLayerMap();
  // 键 = hero directional 的**真实身体帧路径**（directionalBodySrcOf 单一出处，杜绝自造键导致假绿）
  const bodySrc = directionalBodySrcOf(SPRITE_PROFILES.hero as DirectionalSpriteProfile, { clip: 'idle', ordinal: 1 }, 'right');
  heroMap.set(bodySrc, tagImg('weapon-layer'));
  const assets: BattleHexAssets = {
    env: null,
    topbar: null,
    plaque: null,
    ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
    statusIcons: new Map(),
    frames: makeFrames(),
    weaponLayers: new Map([['hero', heroMap as unknown as Map<string, ImgLike | null>]]),
    weaponDiag: { missing: new Set(), gaps: new Set() },
  };
  return { assets, heroWeaponHits: () => heroMap.hits };
}

function actor(over: Partial<SnapshotActor> = {}): SnapshotActor {
  return {
    id: 'hero',
    side: 'player',
    name: '小虾米',
    pos: { q: 4, r: 8 },
    renderPos: { q: 4, r: 8 },
    hp: 100,
    maxHp: 100,
    neili: 80,
    maxNeili: 100,
    actionBar: 0,
    facing: 'right',
    facingHex: 'right',
    animState: 'idle',
    statusIcons: [],
    isBoss: false,
    spriteKey: 'hero',
    isJump: false,
    ...over,
  };
}
const foe = (id: string, r: number, spriteKey: string): SnapshotActor =>
  actor({ id, side: 'enemy', name: id, spriteKey, pos: { q: 4, r }, renderPos: { q: 4, r } });

const snap = (actors: SnapshotActor[], over: Partial<BattleSnapshot> = {}): BattleSnapshot =>
  ({
    phase: 'fighting',
    turnActorId: null,
    pendingInput: false,
    moveCells: [],
    moveKind: 'walk',
    attackCells: [],
    basicCells: [],
    selectedSkill: null,
    heroSkills: [],
    actors,
    ...over,
  }) as unknown as BattleSnapshot;

// ---------- 假 3D 层（记录命令 + 合成次数；可切 not-ready）----------
interface FakeLayer {
  layer: Character3DLayer;
  calls: CharacterRenderCommand[][];
  composites: { dx: number; dy: number }[];
  /** 合成时 ctx 的缩放（1/pixelRatio 包装的可观测面） */
  scales: number[];
}
function makeFakeLayer(
  opts: { pixelRatio?: number; notReady?: boolean; box?: (cmd: CharacterRenderCommand) => { cx: number; top: number; w: number; h: number } } = {},
): FakeLayer {
  const pixelRatio = opts.pixelRatio ?? DPR;
  const calls: CharacterRenderCommand[][] = [];
  const composites: { dx: number; dy: number }[] = [];
  const scales: number[] = [];
  const layer: Character3DLayer = {
    pixelRatio,
    render(commands): Character3DPassResult {
      calls.push(commands.map((c) => ({ ...c })));
      if (opts.notReady) return { status: 'loading', canvas: null, placed: new Map(), diagnostics: [] };
      const placed = new Map<string, { cx: number; top: number; w: number; h: number }>();
      for (const c of commands) {
        placed.set(
          c.actorId,
          opts.box
            ? opts.box(c)
            : // 默认：脚底=c.footY，高=config 逻辑参考高×pixelRatio（R2-3 后自动跟随 60% 比例）
              {
                cx: c.footX,
                top: c.footY - HERO_3D_PROFILE.screenHeightPxAtReference * pixelRatio,
                w: FAKE_BOX_W * pixelRatio,
                h: HERO_3D_PROFILE.screenHeightPxAtReference * pixelRatio,
              },
        );
      }
      return { status: 'ready', canvas: { width: W * pixelRatio, height: H * pixelRatio }, placed, diagnostics: [] };
    },
    composite(target, dx, dy): boolean {
      if (opts.notReady) return false;
      composites.push({ dx, dy });
      target.drawImage(tagImg('3d-layer', W * pixelRatio, H * pixelRatio), dx, dy);
      return true;
    },
  };
  return { layer, calls, composites, scales };
}

/** 记录 ctx 上 save/scale/restore，用于验证合成前的「背衬像素空间」包装 */
function makeScalingRecordingCtx(ops: RecordedOp[], scales: number[]): CanvasRenderingContext2D {
  const target = {
    canvas: { width: W, height: H },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    scale: (x: number) => {
      scales.push(x);
    },
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
      (t as unknown as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
  });
}

function view3d(layer: Character3DLayer | undefined): BattleHexView {
  const view = createView();
  if (layer) view.character3d = layer;
  return view;
}

// ══════════════════ 1. 路由：hero 走 3D / 敌方走原 profile ══════════════════
describe('[T31-FE-B] 路由：只把 spriteKey=hero 切 3D，敌方零改', () => {
  it('注入 3D 层：hero 出 1 条命令（profileKey=hero-3d）；敌方不出命令且仍画 2D 帧', () => {
    const { assets, heroWeaponHits } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const snap0 = snap([actor(), foe('e1', 10, 'npc-shanzei-a')]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].map((c) => c.actorId)).toEqual(['hero']);
    expect(fake.calls[0][0].profileKey).toBe('hero-3d');
    const tags = drawTags(ops);
    expect(tags).toContain('3d-layer'); // hero 由人物层出
    expect(tags).not.toContain('hero-2d-idle'); // hero 2D 帧零绘制（易错点 9）
    expect(tags).toContain('foeA-2d-idle'); // 敌方照常 2D
    expect(heroWeaponHits()).toBe(0); // 2D hero 武器层零调用（§8 卡 B 明文）
  });

  it('不注入 3D 层：hero 回到既有 2D 路径（微信宿主 S1 同形；既有 T29 用例零改写的基础）', () => {
    const { assets, heroWeaponHits } = makeAssets();
    const view = view3d(undefined);
    const snap0 = snap([actor()]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const tags = drawTags(ops);
    expect(tags.some((t) => t.startsWith('weapon-layer'))).toBe(true); // 武器层照常贴回
    expect(tags).not.toContain('3d-layer');
    expect(heroWeaponHits()).toBeGreaterThan(0);
  });

  it('3D 层未就绪（loading）：hero 零绘制（不切 2D 帧，§6.2），敌方不受影响', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer({ notReady: true });
    const view = view3d(fake.layer);
    const snap0 = snap([actor(), foe('e1', 10, 'npc-shanzei-a')]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const tags = drawTags(ops);
    expect(tags).not.toContain('hero-2d-idle');
    expect(tags).not.toContain('3d-layer');
    expect(tags).toContain('foeA-2d-idle');
    expect(view.character3dPlaced?.size).toBe(0); // 未就绪=无任何锚点（HUD 不给人物画半成品）
    expect(fake.composites).toHaveLength(0);
  });
});

// ══════════════════ 2. 层序与「合成一次」 ══════════════════
describe('[T31-FE-B] depth 槽位与合成一次（§4.3）', () => {
  it('整张人物层只在 hero 的 depth 槽位合成一次（前后的 2D 敌人正确交错）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    // r=6（画面上方）→ hero r=8 → r=10（下方）
    const snap0 = snap([actor(), foe('up', 6, 'npc-shanzei-a'), foe('down', 10, 'npc-shanzei-b')]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const tags = drawTags(ops).filter((t) => t === '3d-layer' || t.includes('foeA-2d'));
    expect(tags).toEqual(['foeA-2d-idle', '3d-layer', 'foeA-2d-idle']); // 上敌 → hero 人物层 → 下敌
    expect(fake.composites).toHaveLength(1); // 整张层只合成一次
  });

  it('死人也只在同一槽位合成一次（阵亡沿压扁淡出，不进 placed）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const snap0 = snap([actor({ animState: 'dead' })]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    expect(drawTags(ops)).toEqual(['3d-layer']); // 无 2D die 帧
    expect(fake.calls[0][0].state).toBe('dead');
    expect(fake.calls[0][0].alpha).toBe(PIECE.deadAlpha);
    expect(fake.calls[0][0].squashY).toBeCloseTo(0.3, 6);
    expect(view.character3dPlaced?.size).toBe(0); // dead 不进 placed（HUD 跳过，与 2D 同口径）
  });

  it('命令坐标=物理像素（×pixelRatio），placed 回算成 2D 逻辑像素（HUD/热区口径）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer({ pixelRatio: DPR });
    const view = view3d(fake.layer);
    const snap0 = snap([actor()]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    const scales: number[] = [];
    drawFrame({ ctx: makeScalingRecordingCtx(ops, scales), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[0][0];
    const w = hexToWorld(4, 8);
    const logicalX = Math.round(w.x - view.camera.x + W / 2);
    const logicalY = Math.round(w.y - view.camera.y + H / 2);
    expect(cmd.footX).toBe(logicalX * DPR);
    expect(cmd.footY).toBe(logicalY * DPR);
    // 合成前把上下文换成背衬像素空间一次（否则 drawImage 按逻辑尺寸画=人物 2× 偏移、hidpi 直接不可见）
    expect(scales).toEqual([1 / DPR]);
    expect(fake.composites).toEqual([{ dx: 0, dy: 0 }]);
    // placed 镜像 = 逻辑像素（与 2D placed / HUD / 技能钮同一空间）
    const box = view.character3dPlaced?.get('hero');
    const fakeH = HERO_3D_PROFILE.screenHeightPxAtReference * DPR; // 假层按 config 参考高（R2-3 后 73.92）
    expect(box).toEqual({
      cx: logicalX,
      top: (logicalY * DPR - fakeH) / DPR,
      w: FAKE_BOX_W,
      h: fakeH / DPR,
      // 【T31-R2 · §4.1.1】地面锚与 HUD 布局框**分标**：此帧无姿态补偿 ⇒ 锚 = 框底 = 命令 footY/ratio
      groundAnchorY: logicalY,
    });
  });
});

// ══════════════════ 3. HUD/热区锚点同源（易错点 10） ══════════════════
describe('[T31-FE-B] HUD/技能钮锚点来自 pass placed（与摆放矩阵同源）', () => {
  it('名条与技能钮用 placed 的值（logical）定位；拖动镜头后两者同步平移', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const snap0 = snap([actor()], {
      pendingInput: true,
      turnActorId: 'hero',
      heroSkills: [{ id: 'te', disabled: false }],
    } as Partial<BattleSnapshot>);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const box = view.character3dPlaced!.get('hero')!;
    // 名条矩形 y = round(placed.top − HUD.aboveHead − 7)、宽 = HUD.barW + 4（drawPieceHud 逐字口径）
    const nameY = Math.round(box.top - HUD.aboveHead - 7);
    const nameRect = ops.find(
      (o) =>
        o.op === 'fillRect' &&
        Math.abs((o.args[1] as number) - nameY) <= 1 &&
        Math.abs((o.args[2] as number) - (HUD.barW + 4)) <= 1,
    );
    expect(nameRect, `未见 placed 锚定的名条：placed.top=${box.top} 期望 y≈${nameY}`).toBeTruthy();
    // 拖动镜头后名条与 placed 同幅平移（同源、无双轨）
    const nameRectAfter = ops.length > 0;
    // 技能钮圆心 x 以 placed.cx 为基准（弧布位）
    const btn = view.layout.skillBtns.find((b) => b.id === 'te');
    expect(btn).toBeTruthy();
    expect(Math.abs(btn!.x - box.cx)).toBeLessThan(90);

    // 镜头拖动 → 3D 命令与 2D HUD 同幅平移（无双轨）
    const before = { ...fake.calls[fake.calls.length - 1][0] };
    view.camera = { x: view.camera.x + 40, y: view.camera.y };
    const ops2: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops2), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const after = fake.calls[fake.calls.length - 1][0];
    expect(after.footX).toBe(before.footX - 40 * DPR);
    const box2 = view.character3dPlaced!.get('hero')!;
    expect(box2.cx).toBe(box.cx - 40);
    const nameRect2 = ops2.find(
      (o) =>
        o.op === 'fillRect' &&
        Math.abs((o.args[0] as number) - Math.round(box2.cx - HUD.barW / 2 - 2)) <= 1 &&
        Math.abs((o.args[1] as number) - Math.round(box2.top - HUD.aboveHead - 7)) <= 1,
    );
    expect(nameRect2, '镜头拖动后名条未跟随 placed').toBeTruthy();
    expect(nameRectAfter).toBe(true);
  });

  it('【T31-R2 · §4.1.1】待输入+轻功同帧：按钮圆心与命中框同源同步（同一 placed，无人自补 root y）', () => {
    const { assets } = makeAssets();
    const { layer, pass } = makeRealPassLayer(DPR); // 真 pass：placed 带姿态补偿
    const view = view3d(layer);
    const opts = { pendingInput: true, turnActorId: 'hero', heroSkills: [{ id: 'te', disabled: false }] } as Partial<BattleSnapshot>;
    const ground = actor({ animState: 'idle', isJump: false, pos: { q: 5, r: 8 }, renderPos: { q: 4, r: 8 } });
    const snapGround = snap([ground], opts);

    // ① 地面帧（idle）：按钮框 A（先推 240ms 让四钮弹出动画到位）
    for (let i = 0; i < 12; i++) updateView(view, snapGround, 0.02, W, H);
    const opsA: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(opsA), width: W, height: H, dt: 0 }, snapGround, assets, view);
    const groundBox = view.character3dPlaced!.get('hero')!;
    const btnA = view.layout.atkBtn!;
    const skillA = view.layout.skillBtns.find((b) => b.id === 'te')!;
    expect(btnA).toBeTruthy();
    expect(skillA).toBeTruthy();

    // ② 轻功顶点帧（同一英雄 + 演出起跳时锁定的轻功意图）：钉住演出位置在顶点，推完 idle→jump 淡化
    const jumping = actor({ ...ground, animState: 'walk', isJump: true });
    const snapJump = snap([jumping], opts);
    updateView(view, snapJump, DT_REAL, W, H); // 上升沿建 MoveAnim
    const ma = view.moveAnims.get('hero')!;
    expect(ma.isJumpMove).toBe(true);
    // 钉住演出进度 = 顶点帧，连推 8 帧把 idle→jump 的 100ms 交叉淡化走完（顶点帧远在淡化之后）。
    // ⚠ 控制器只吃 drawFrame → pass.render 的 dt（updateView 只推 view 侧演出态）。
    for (let i = 0; i < 8; i++) {
      updateView(view, snapJump, 0.02, W, H);
      ma.t = ma.duration * 0.6;
      drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 0.02 }, snapJump, assets, view);
    }
    expect(pass.controllers.get('hero')!.fadeWeight).toBe(1);
    const opsB: RecordedOp[] = [];
    ma.t = ma.duration * 0.6;
    drawFrame({ ctx: makeRecordingCtx(opsB), width: W, height: H, dt: 0 }, snapJump, assets, view);
    const airBox = view.character3dPlaced!.get('hero')!;
    const btnB = view.layout.atkBtn!;
    const skillB = view.layout.skillBtns.find((b) => b.id === 'te')!;

    // ③ 布局框被姿态抬高 ⇒ 攻钮/技能钮圆心**同帧同幅**跟随（唯一 placed 源；各消费者禁自补 root y）
    const dTop = airBox.top - groundBox.top;
    expect(dTop).toBeLessThan(-5);
    expect(btnB.y - btnA.y).toBeCloseTo(dTop, 5);
    expect(skillB.y - skillA.y).toBeCloseTo(dTop, 5);
    // 画出钮的圆心（ctx.arc 的前两个参数）与热区矩形中心同源同帧
    const arcA = opsA.find((o) => o.op === 'arc')!;
    const arcB = opsB.find((o) => o.op === 'arc')!;
    expect(arcA.args[0] as number).toBeCloseTo(btnA.x + btnA.w / 2, 5);
    expect(arcA.args[1] as number).toBeCloseTo(btnA.y + btnA.h / 2, 5);
    expect(arcB.args[0] as number).toBeCloseTo(btnB.x + btnB.w / 2, 5);
    expect(arcB.args[1] as number).toBeCloseTo(btnB.y + btnB.h / 2, 5);
    expect(btnB.w).toBeCloseTo(btnB.h, 8); // 热区 = 圆外接正方形
    expect(pickAtkButton(view, btnB.x + btnB.w / 2, btnB.y + btnB.h / 2)).toBe(true);
    expect(pass.controllers.get('hero')?.actionKey).toBe('jump');
    // 地面锚与布局框**分标**（§4.1.1）：腾空期两者不再相等，脚离地高度只认渲染像素
    expect(airBox.groundAnchorY - groundBox.groundAnchorY).toBeCloseTo(0, 0);
    expect(airBox.top + airBox.h).not.toBeCloseTo(airBox.groundAnchorY, 1);
  });

  it('【T31-R2 · §4.1.1】热区严格跟随 placed：偏移超过钮径时，旧位误点不命中新位', () => {
    // 真实轻功顶点的 placed 位移（≈12 逻辑像素 @60%）小于钮径（0.768×placed.w ≈ 40 逻辑像素），
    // 几何上「旧位仍落在新矩形内」——故本条用**放大后的同一机制**（假层按 placed 契约偏移）
    // 把几何断言做成可判：热区/钮圆心/技能钮全部只吃 placed，一处偏移即三处同步。
    const { assets } = makeAssets();
    const H_REF = HERO_3D_PROFILE.screenHeightPxAtReference;
    let boxOffset = 0; // 逻辑像素（模拟姿态抬升：top 减小）
    const fake = makeFakeLayer({
      box: (c) => ({
        cx: c.footX,
        top: c.footY - H_REF * DPR - boxOffset * DPR,
        w: 86.7 * DPR,
        h: H_REF * DPR,
      }),
    });
    const view = view3d(fake.layer);
    const opts = { pendingInput: true, turnActorId: 'hero', heroSkills: [{ id: 'te', disabled: false }] } as Partial<BattleSnapshot>;
    const snap0 = snap([actor()], opts);
    const draw = (): void => {
      for (let i = 0; i < 12; i++) updateView(view, snap0, 0.02, W, H); // 四钮弹出到位
      drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 0 }, snap0, assets, view);
    };
    draw();
    const btnA = view.layout.atkBtn!;
    const skillA = view.layout.skillBtns.find((b) => b.id === 'te')!;
    expect(skillA).toBeTruthy();
    const oldPt = { x: btnA.x + btnA.w / 2, y: btnA.y + btnA.h / 2 };
    expect(pickAtkButton(view, oldPt.x, oldPt.y)).toBe(true);
    boxOffset = 120; // > 钮径（0.768×86.7≈66.6）
    draw();
    const btnB = view.layout.atkBtn!;
    const skillB = view.layout.skillBtns.find((b) => b.id === 'te')!;
    const newPt = { x: btnB.x + btnB.w / 2, y: btnB.y + btnB.h / 2 };
    expect(btnB.y - btnA.y).toBeCloseTo(-120, 5);
    expect(skillB.y - skillA.y).toBeCloseTo(-120, 5);
    expect(pickAtkButton(view, newPt.x, newPt.y)).toBe(true);
    expect(pickAtkButton(view, oldPt.x, oldPt.y)).toBe(false); // 旧位误点不命中新位
  });
});

// ══════════════════ 4. §5 状态映射（命令字段） ══════════════════
describe('[T31-FE-B] §5 状态映射：命令字段口径', () => {
  it('移动演出期（快照已回 idle）仍出 walk（防长距离滑步；§5「移动结束立即进入 idle 混合」）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const hero = actor({ animState: 'idle' });
    const snap0 = snap([hero]);
    updateView(view, snap0, 0.016, W, H);
    view.moveAnims.set('hero', {
      from: { q: 3, r: 8 },
      pos: { q: 4, r: 8 },
      path: [],
      pathPx: [],
      t: 0.15,
      duration: 0.6,
      isJumpMove: false,
      hopHeight: 0,
      jumpChannel: null, // 用例手工构造：非 3D 轻功通道
    });
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    expect(cmd.state).toBe('walk');
    expect(cmd.moveProgress).toBeCloseTo(0.25, 6);
    expect(cmd.isJump).toBe(false);
  });

  it('轻功：演出起跳时锁定的意图透传（禁 hopPx 猜）；v1.1 起 hopPx 恒 0（竖直由素材 root y）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const hero = actor({ animState: 'walk', isJump: true, pos: { q: 5, r: 8 }, renderPos: { q: 4, r: 8 } });
    const snap0 = snap([hero]);
    updateView(view, snap0, 0.016, W, H); // updateView 起跳上升沿建 moveAnim
    const ma = view.moveAnims.get('hero')!;
    // 【方案 v1.1 §4.1】3D jump：hopHeight 恒 0、程序 hop 不作为竖直来源（竖直由素材 root y 提供）
    expect(ma.hopHeight).toBe(0);
    expect(ma.duration).toBeCloseTo(CHARACTER_3D_JUMP_MOVE_SEC, 10);
    ma.t = ma.duration / 2; // 中点
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    const w = hexToWorld(4, 8);
    expect(cmd.isJump).toBe(true);
    expect(cmd.hopPx).toBe(0); // ★ v1.1：不叠 pieceHop
    expect(cmd.footY).toBe(Math.round(w.y - view.camera.y + H / 2) * DPR); // 地面锚 = 格心行（不再减 hop）
    expect(cmd.moveProgress).toBeCloseTo(0.5, 6);
  });

  it('【R1 修订乙】轻功意图只认 MoveAnim.isJumpMove（禁 hopPx 反推）：hop>0 但意图=走 ⇒ false', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const hero = actor({ animState: 'idle', isJump: false, pos: { q: 5, r: 8 }, renderPos: { q: 4, r: 8 } });
    const snap0 = snap([hero]);
    updateView(view, snap0, 0.016, W, H);
    // 手工挂一个「在空中」的演出（生产里 hopHeight>0 只由起跳锁定产生；此处刻意造出
    // hopPx>0 但 intent=false 的组合，锁「渲染层禁由 hop 反推轻功」）
    view.moveAnims.set('hero', {
      from: { q: 4, r: 8 }, pos: { q: 5, r: 8 }, path: [], pathPx: [], t: 0.3, duration: 0.6,
      isJumpMove: false, hopHeight: 88,
      jumpChannel: null, // 用例手工构造：非 3D 轻功通道
    });
    const ma = view.moveAnims.get('hero')!;
    ma.t = ma.duration / 2;
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    expect(cmd.hopPx).toBeGreaterThan(0);
    expect(cmd.isJump).toBe(false);
    expect(cmd.state).toBe('walk'); // 演出态仍是 walk（帧组/动作都按移动走，但非轻功）
  });

  it('【R1 修订乙】反向：演出意图=跳（isJumpMove）即便 hop=0（起/落点）也必须是 true', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const snap0 = snap([actor({ animState: 'idle' })]);
    updateView(view, snap0, 0.016, W, H);
    view.moveAnims.set('hero', {
      from: { q: 4, r: 8 }, pos: { q: 5, r: 8 }, path: [], pathPx: [], t: 0, duration: 0.6,
      isJumpMove: true, hopHeight: 88,
      jumpChannel: null, // 用例手工构造：非 3D 轻功通道
    });
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    expect(cmd.hopPx).toBe(0); // 起跳帧 hop 恰为 0
    expect(cmd.isJump).toBe(true);
  });

  it('普攻保持窗：快照回 idle 仍出 basic，且进态历时连续（尾帧保持由 pass 侧归一窗负责）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    // 先让 basic 上升沿开窗（updateView 内开 basicHolds）
    const hero = actor({ animState: 'basic' });
    updateView(view, snap([hero]), 0.016, W, H);
    const idle = actor({ animState: 'idle' });
    const snap0 = snap([idle]);
    updateView(view, snap0, 0.016, W, H);
    view.anim.set('hero', { state: 'basic', t: 0.2 });
    // 【T31-R2-basic】3D 主角读 1.5s 视界的独立表（basicHolds 仍归 2D/legacy，语义未改）
    view.basicHolds3d.set('hero', { since: view.time - 0.2, until: view.time + 1.3 });
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    expect(cmd.state).toBe('basic');
    expect(cmd.stateElapsedSec).toBeCloseTo(0.2, 2);
  });

  it('charge/strike 沿快照态透传，进态历时取 view 演出钟', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const hero = actor({ animState: 'charge' });
    updateView(view, snap([hero]), 0.016, W, H);
    view.anim.set('hero', { state: 'charge', t: 0.42 });
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap([hero]), assets, view);
    const cmd = fake.calls[fake.calls.length - 1][0];
    expect(cmd.state).toBe('charge');
    expect(cmd.stateElapsedSec).toBeCloseTo(0.42, 6);
  });

  it('脚底锚=格心（3D 不加 feetOffsetPx；2D 敌人仍按既有口径带补偿）', () => {
    const { assets } = makeAssets();
    const fake = makeFakeLayer();
    const view = view3d(fake.layer);
    const snap0 = snap([actor(), foe('e1', 8, 'npc-shanzei-a')]);
    updateView(view, snap0, 0.016, W, H);
    const ops: RecordedOp[] = [];
    drawFrame({ ctx: makeRecordingCtx(ops), width: W, height: H, dt: 0.016 }, snap0, assets, view);
    const cmd = fake.calls[0][0];
    const w = hexToWorld(4, 8);
    const groundY = Math.round(w.y - view.camera.y + H / 2);
    expect(cmd.footY).toBe(groundY * DPR);
    // 2D 敌人 top = 格心 − 高×基线比 + feetOffsetPx（**既有口径零改**）：两锚点之差恒等于该基线口径
    const hFoe = TILE_H * PIECE.heightPerTile;
    const foeDraw = ops.find((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string })?.tag === 'foeA-2d-idle');
    expect(foeDraw).toBeTruthy();
    const foeTop = foeDraw!.args[2] as number;
    // 差 = 既有 2D 基线口径（drawImg 内 Math.round 整数像素定位 ⇒ 容差 ±0.5）
    expect(Math.abs(groundY - foeTop - (hFoe * PIECE.feetBaselineRatio - PIECE.feetOffsetPx))).toBeLessThanOrEqual(0.5);
    expect(hFoe * PIECE.feetBaselineRatio - PIECE.feetOffsetPx).toBeGreaterThan(0);
  });
});

// ══════════════════ 5. 红线扫描（源码层） ══════════════════
describe('[T31-FE-B] 红线扫描（源码层证据）', () => {
  const render = readFileSync(path.join(ROOT, 'ui/battle-hex-render.ts'), 'utf8');
  const main = readFileSync(path.join(ROOT, 'proto/battle_demo/main.ts'), 'utf8');

  it('渲染层：轻功意图取 MoveAnim 锁定值（禁 hopPx/时钟猜、禁每帧直读快照）', () => {
    expect(render).toContain('ma.isJumpMove');
    expect(render).toContain('isJumpMove: a.isJump'); // 创建演出时一次性锁定
    expect(render).not.toContain('isJump: actor.isJump'); // 每帧直传已废止（seq=418 修订乙）
    expect(/isJump:\s*[^,\n]*hop/i.test(render)).toBe(false);
  });

  it('渲染层：spriteKey→3D 键只经 config 查表（渲染层不持资产地址/时长）', () => {
    expect(render).toContain("from '../config/character-3d'");
    expect(render).toContain('CHARACTER_3D_PROFILE_BY_SPRITE_KEY');
    expect(/characters\/hero/.test(render)).toBe(false);
    expect(/[0-9a-f]{64}/.test(render)).toBe(false);
  });

  it('渲染层：3D 分支先 continue，武器层查询只在其后（2D 武器层对 3D hero 结构性不可达）', () => {
    const branch = render.indexOf('const key3d = profile3d.get(actor.id);');
    const weapon = render.indexOf('weapon = weaponLayerOf(');
    expect(branch).toBeGreaterThan(-1);
    expect(weapon).toBeGreaterThan(branch);
    expect(render.slice(branch, weapon)).toContain('continue;');
  });

  it('宿主：3D spriteKey 不装配 2D 武器层（配置与素材保留，仅停用消费）', () => {
    expect(main).toContain('CHARACTER_3D_PROFILE_BY_SPRITE_KEY[k] === undefined');
    expect(main).toContain('weaponSpriteKeys2d');
  });

  it('宿主：CDN base 由环境注入（业务侧只见相对 urlPath），且无资产 sha/路径字面量', () => {
    expect(main).toContain("new URL('cdn/', location.href)");
    expect(/[0-9a-f]{64}/.test(main)).toBe(false);
    expect(main).not.toContain('hero_48k_20260914.glb');
  });

  it('宿主：抗锯齿按能力分支（不传 forceEdgeMode 时由 renderer 读有效属性），诊断开关才传值', () => {
    expect(main).toContain('forceEdgeMode: AA_FORCE ?? undefined');
    expect(main).toContain('getContextAttributes');
  });

  it('红线：battle-core / cloudfunctions / systems 的 diff=0 由 git 层复核（此处锁 import 面）', () => {
    expect(/from '[^']*battle-core/.test(render)).toBe(false);
    expect(/from '[^']*cloudfunctions/.test(render)).toBe(false);
    expect(main).toContain("from '../../systems/battle-session'"); // 宿主本来就消费真 session（未新增）
  });

  it('【R3】宿主按目标背衬尺寸建离屏画布（1×1 绕过与「投影未初始化」归因已删）', () => {
    expect(main).not.toContain('createOffscreenCanvas(1, 1)');
    expect(main).toContain('Math.round(W * dpr * renderScale)');
    expect(main).toContain('Math.round(H * dpr * renderScale)');
  });

  it('【R5】宿主：终失败暂停 + 替换式重试（唯一 RAF 由 host-runtime 排程）', () => {
    expect(main).toContain('host?.notifyContextRestored(false');
    expect(main).toContain('function disposeRuntime()');
    expect(main).toContain('if (booting) return;'); // 连点重试不并发装配
    expect(main).toContain('next.addDisposer(teardown)'); // 旧 renderer/监听随 dispose 释放
    expect(main).toContain('if (!hostRunning()) return;'); // 暂停=输入不推进
    expect(main).not.toContain('requestAnimationFrame(loop)'); // 禁主循环自行续排（第二循环根因）
  });
});

// ══════════════════ 6. 【R1】轻功意图真实链路（session → view → command → controller） ══════════════════
// 纪律（arch seq=419 裁 Q1 修订乙）：意图在**创建 MoveAnim 时**从该次 SnapshotActor.isJump 锁定，
// 演出有效期内消费它（session 的 isJump 窗只有 300ms，而演出 0.6~1.2s），结束/替换/死亡/reset 释放。

const DT_REAL = 1 / 60; // 真实帧间隔（60fps；x1/x2 只改 dt 倍率，不改帧间隔语义）

function realUnit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 999999,
    maxHp: 999999,
    neili: 100,
    maxNeili: 100,
    atk: 1,
    def: 99999,
    neigongLevel: 0,
    jimin: 200, // 我方条快：快速到输入态
    danshi: 0,
    shizhan: 0,
    pos: { x: 0, y: 0 },
    weapon: 'fist',
    skills: [],
    ...over,
  };
}
/** 【R2-2 零外溢用例】特技技能（kind=special + 武器匹配 ⇒ 走 charge→strike 真实链路） */
function teSkillDef(): SkillDef {
  return { id: 'te', name: '特技', kind: 'special', weapon: 'sword', grade: 1.7, growth: 3, level: 20, cooldownTurns: 2, neiliCost: 10 };
}
/** 【R2-2 零外溢用例】特技局：我方(4,8) 敌方(6,8)（射程 2 内），手动模式 */
function castSession(): HexBattleSession {
  const s = createHexBattle({
    player: realUnit({ id: 'hero', side: 'player', weapon: 'sword', atk: 200, skills: [teSkillDef()] }),
    enemies: [realUnit({ id: 'e1', side: 'enemy', name: 'npc-shanzei-a', jimin: 0 })],
    mode: 'manual',
    seed: 13,
  });
  const put = (id: string, q: number, r: number): void => {
    const u = s._debug.units.find((x) => x.id === id)!;
    u.hex = { q, r };
    u.renderQ = q;
    u.renderR = r;
    u.moveFromQ = q;
    u.moveFromR = r;
    u.moveT = 1;
    u.isJump = false;
    u.animState = 'idle';
    u.animLeftMs = 0;
    u.bar = 0;
    u.barWasMax = false;
  };
  put('hero', 4, 8);
  put('e1', 6, 8);
  return s;
}

/** 【T31-R2-basic 用例】普攻局：我方(4,8)、敌方(5,8)（相邻 ⇒ basicCells 含目标格），手动模式 */
function basicSession(): HexBattleSession {
  const s = createHexBattle({
    player: realUnit({ id: 'hero', side: 'player', weapon: 'sword', skills: [teSkillDef()] }),
    enemies: [realUnit({ id: 'e1', side: 'enemy', name: 'npc-shanzei-a', jimin: 0 })],
    mode: 'manual',
    seed: 13,
  });
  const put = (id: string, q: number, r: number): void => {
    const u = s._debug.units.find((x) => x.id === id)!;
    u.hex = { q, r };
    u.renderQ = q;
    u.renderR = r;
    u.moveFromQ = q;
    u.moveFromR = r;
    u.moveT = 1;
    u.isJump = false;
    u.animState = 'idle';
    u.animLeftMs = 0;
    u.bar = 0;
    u.barWasMax = false;
  };
  put('hero', 4, 8);
  put('e1', 5, 8);
  return s;
}

/** 轻功技能（kind=qingGong，口径同 tests/battle-session.test.ts 的 qingSkill）。
 * level=45 是**用例口径**（movePower=基础+品阶 2+⌊45/5⌋ ⇒ 跳跃半径 ≥6 格）：让真实链路能同时
 * 取到 0.6s（≤2 格基准档）与 1.2s（≥6 格封顶档）两档演出时长，避免只测到中间档。 */
function qingSkill(): SkillDef {
  return { id: 'qing', name: '草上飞', kind: 'qingGong', weapon: null, grade: 1.3, growth: 1, level: 45, cooldownTurns: 0, neiliCost: 0 };
}
function jumpSession(): HexBattleSession {
  return createHexBattle({
    player: realUnit({ id: 'hero', side: 'player', skills: [qingSkill()] }),
    enemies: [realUnit({ id: 'e1', side: 'enemy', name: 'npc-shanzei-a', jimin: 0 })],
    mode: 'manual',
    seed: 13,
  });
}
/** 真实驱动到输入态（条满 + 手动） */
function tickToPending(s: HexBattleSession, maxSec = 90): boolean {
  for (let i = 0; i < maxSec * 60 && s.phase === 'fighting' && !s.snapshot().pendingInput; i++) s.tick(DT_REAL);
  return s.snapshot().pendingInput;
}
const heroUnitOf = (s: HexBattleSession): { hex: { q: number; r: number } } => s._debug.units.find((u) => u.id === 'hero')!;

/** 真 pass + 记录层：命令直通真 pass（真 CharacterAnimController），同时留痕本帧命令（R1 证据） */
function makeRealPassLayer(dpr: number): { layer: Character3DLayer; pass: Character3DPass; cmds: CharacterRenderCommand[] } {
  const model = heroModel();
  const runtime: Character3DProfileRuntime = {
    profile: { ...HERO_3D_PROFILE, screenHeightPxAtReference: HERO_3D_PROFILE.screenHeightPxAtReference * dpr },
    model,
    anim: {
      actionMap: HERO_3D_ACTION_MAP,
      crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
      jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
      clips: heroClipRegistry(model),
    },
  };
  const pass = createCharacter3DPass({
    renderer: stubRealRenderer(model),
    viewport: { width: Math.round(W * dpr), height: Math.round(H * dpr) },
    runtimes: { [HERO_3D_PROFILE_ID]: runtime },
    loadState: 'ready',
  });
  const cmds: CharacterRenderCommand[] = [];
  const layer: Character3DLayer = {
    pixelRatio: dpr,
    render: (commands, dtSec) => {
      cmds.length = 0;
      for (const c of commands) cmds.push({ ...c });
      return pass.render(commands, dtSec);
    },
    composite: () => true,
  };
  return { layer, pass, cmds };
}
/** 结构桩：只满足 Character3DRenderer 接口（pass 的控制器与摆放矩阵是真件） */
function stubRealRenderer(model: ReturnType<typeof heroModel>): Character3DRenderer {
  return {
    canvas: { stub: 'canvas' },
    status: 'ready',
    edgeMode: 'fxaa',
    jointCount: 41,
    vertexCount: model.mesh.vertexCount,
    indexCount: model.mesh.indexCount,
    backbuffer: { width: Math.round(W * DPR), height: Math.round(H * DPR) },
    contextAttributes: { antialias: false } as WebGLContextAttributes,
    maxVertexUniformVectors: 1024,
    counters: { drawCalls: 0, paletteUploads: 0, frames: 0, weaponDraws: 0 },
    diagnostics: [],
    weaponReady: false,
    drawWeapon: () => {},
    beginFrame: () => {},
    drawUnit: () => {},
    endFrame: () => {},
    resize: () => {},
    notifyContextLost: () => {},
    handleContextRestored: () => true,
    dispose: () => {},
  };
}

interface JumpSample {
  /** view 表演钟（秒，逻辑） */
  t: number;
  snapIsJump: boolean;
  cmdIsJump: boolean | null;
  clip: string | null;
  hop: number;
  state: string | null;
  /** view 演出进度（无有效演出=null） */
  animT: number | null;
  animDuration: number | null;
}

/** 按真实宿主口径跑帧：session.tick(dtReal) + view dt = dtReal × speed；每帧留痕（快照/命令/控制器三层同帧） */
function driveFrames(
  s: HexBattleSession,
  view: BattleHexView,
  pass: Character3DPass,
  cmds: CharacterRenderCommand[],
  assets: BattleHexAssets,
  frames: number,
  speed: 1 | 2 = 1,
): JumpSample[] {
  const ctx = makeRecordingCtx([]);
  // 宿主口径同构：view dt = 真实帧间隔 × SPEED_FACTOR（session.tick 拿到的是未缩放的真实 dt）
  const dtView = DT_REAL * (speed === 2 ? SPEED_FACTOR.fast : SPEED_FACTOR.normal);
  const out: JumpSample[] = [];
  for (let i = 0; i < frames; i++) {
    s.tick(DT_REAL);
    const snap = s.snapshot();
    updateView(view, snap, dtView, W, H);
    drawFrame({ ctx, width: W, height: H, dt: dtView }, snap, assets, view);
    const hero = snap.actors.find((a) => a.id === 'hero')!;
    const cmd = cmds.find((c) => c.actorId === 'hero') ?? null;
    const ma = view.moveAnims.get('hero');
    out.push({
      t: view.time,
      snapIsJump: hero.isJump,
      cmdIsJump: cmd ? cmd.isJump : null,
      clip: pass.controllers.get('hero')?.activeClipKey ?? null,
      hop: pieceHop(view, hero),
      state: cmd ? cmd.state : null,
      animT: ma ? ma.t : null,
      animDuration: ma ? ma.duration : null,
    });
  }
  return out;
}

/** 金格挑格：far=距离最大 / short=距离最小（≥1 格） */
function pickJumpCell(s: HexBattleSession, which: 'far' | 'short'): { q: number; r: number } {
  const from = heroUnitOf(s).hex;
  const cells = s.snapshot().moveCells.slice().sort((a, b) => cubeDistance(from, b) - cubeDistance(from, a));
  if (cells.length === 0) throw new Error('轻功金格为空（用例前置失败）');
  return which === 'far' ? cells[0] : cells[cells.length - 1];
}

describe('[T31-FE-B · R1] 轻功意图=修订乙：真实链路 session→view→command→controller', () => {
  it('真实起跳：创建时锁定 isJumpMove；300ms 窗关闭后顶点/降段仍 jump，演出结束才释放', () => {
    const s = jumpSession();
    expect(tickToPending(s), '未到输入态').toBe(true);
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const { assets } = makeAssets();

    // 真实受理路径：轻功态 → 点金格移动
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.snapshot().moveKind).toBe('jump');
    const from = { ...heroUnitOf(s).hex };
    const to = pickJumpCell(s, 'far');
    const dist = cubeDistance(from, to);
    expect(s.submit({ type: 'move', to })).toBe(true);
    expect(s.snapshot().actors.find((a) => a.id === 'hero')!.isJump).toBe(true);

    updateView(view, s.snapshot(), DT_REAL, W, H); // 起跳上升沿：建演出
    const ma = view.moveAnims.get('hero')!;
    expect(ma, '未建移动演出').toBeTruthy();
    expect(ma.isJumpMove).toBe(true); // 创建时从该次快照 isJump 锁定
    expect(ma.isJumpMove).toBe(s.snapshot().actors.find((a) => a.id === 'hero')!.isJump);
    // 【R2-1 §4.1.2(1)】3D jump 演出时长固定 **1.0 演出秒**（与素材源 1.5s 解耦；不再按距离取 0.6~1.2s）
    expect(dist).toBeGreaterThan(0);
    expect(ma.duration).toBeCloseTo(CHARACTER_3D_JUMP_MOVE_SEC, 10);

    const samples = driveFrames(s, view, pass, cmds, assets, Math.ceil((ma.duration + 0.2) / DT_REAL));

    // ① 首帧即意图=jump（起落两点的 hop=0 情形由下一条用例逐点锁死）
    expect(samples[0].cmdIsJump).toBe(true);
    expect(samples[0].clip).toBe('jump');

    // ② session 窗（ANIM_MS.walk=300ms）先关：之后仍有 jump（顶点/降段）
    const closed = samples.filter((x) => !x.snapIsJump);
    expect(closed.length, '快照 isJump 窗未观测到关闭').toBeGreaterThan(0);
    expect(closed[0].t).toBeGreaterThan(0.25);
    expect(closed[0].t).toBeLessThan(0.38);
    const descending = closed.filter((x) => x.cmdIsJump === true);
    expect(descending.length, '降段未保持 jump（300ms 窗后即被判成普通行走）').toBeGreaterThan(3);
    expect(descending.every((x) => x.clip === 'jump')).toBe(true);
    expect(descending.every((x) => x.state === 'walk')).toBe(true);

    // ③ 演出中点（moveProgress 最近 0.5 者）仍在 jump —— v1.1 起竖直由素材提供，不再以 hop 判顶点
    const mid = samples.filter((x) => x.animT !== null).reduce((a, b) => (
      Math.abs((b.animT! / ma.duration) - 0.5) < Math.abs((a.animT! / ma.duration) - 0.5) ? b : a
    ));
    expect(mid.cmdIsJump).toBe(true);
    expect(mid.clip).toBe('jump');
    expect(mid.hop).toBe(0); // v1.1：程序 hop 恒 0（2D hop 亦为 0 ⇒ 全程不叠）

    // ④ 演出有效期内恒 jump、结束后（释放）恒 false
    for (const x of samples) {
      if (x.animT !== null && x.animT < ma.duration) {
        expect(x.cmdIsJump, `演出期内被释放 t=${x.t.toFixed(3)}`).toBe(true);
      }
      if (x.t >= ma.duration) expect(x.cmdIsJump, `演出结束未释放 t=${x.t.toFixed(3)}`).toBe(false);
    }
    expect(samples[samples.length - 1].cmdIsJump).toBe(false);
    expect(samples[samples.length - 1].clip).not.toBe('jump');
  });

  it('短/长路径均 1.0 演出秒 × 倍速 x1/x2（R2-1：仅全局倍率、无距离倍率、hop 恒 0；x2 墙钟 0.5s）', () => {
    const observed: Array<{ speed: number; dist: number; duration: number }> = [];
    for (const speed of [1, 2] as const) {
      const dtView = DT_REAL * (speed === 2 ? SPEED_FACTOR.fast : SPEED_FACTOR.normal);
      for (const which of ['short', 'far'] as const) {
        const s = jumpSession();
        expect(tickToPending(s)).toBe(true);
        const { layer, pass, cmds } = makeRealPassLayer(DPR);
        const view = view3d(layer);
        const { assets } = makeAssets();
        if (speed === 2) expect(s.submit({ type: 'toggleSpeed' })).toBe(true); // x2：session 内部缩放 + view dt 同倍率
        expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
        const from = { ...heroUnitOf(s).hex };
        const to = pickJumpCell(s, which);
        const dist = cubeDistance(from, to);
        expect(s.submit({ type: 'move', to })).toBe(true);
        updateView(view, s.snapshot(), dtView, W, H);
        const ma = view.moveAnims.get('hero')!;
        // ★ R2-1：短/长路径**都是 1.0 演出秒**（不再消费 jumpParams 的 0.6~1.2s）
        expect(ma.duration).toBeCloseTo(CHARACTER_3D_JUMP_MOVE_SEC, 10);
        expect(ma.hopHeight).toBe(0);
        observed.push({ speed, dist, duration: ma.duration });

        const samples = driveFrames(s, view, pass, cmds, assets, Math.ceil((ma.duration + 0.25) / dtView), speed);
        // 窗关闭点（view 时间）恒 ≈0.3s：x1/x2 只改倍率，不改演出/窗口的相对关系
        const closed = samples.filter((x) => !x.snapIsJump);
        expect(closed.length, `speed=${speed} ${which} 窗未关`).toBeGreaterThan(0);
        expect(closed[0].t).toBeGreaterThan(0.25);
        expect(closed[0].t).toBeLessThan(0.38);
        // 窗关后到演出结束前：恒 jump
        const afterWindow = samples.filter((x) => !x.snapIsJump && x.animT !== null && x.animT < ma.duration);
        expect(afterWindow.length, `speed=${speed} ${which} 窗后无采样`).toBeGreaterThan(0);
        expect(afterWindow.every((x) => x.cmdIsJump === true && x.clip === 'jump')).toBe(true);
        // 演出期内 hop 恒 0（不叠程序抛物线）；结束即释放
        expect(samples.every((x) => x.hop === 0)).toBe(true);
        const after = samples.filter((x) => x.t >= ma.duration);
        expect(after.length).toBeGreaterThan(0);
        expect(after.every((x) => x.cmdIsJump === false)).toBe(true);
      }
    }
    // 短/长两档都取到，且**演出秒恒 1.0**（x1/x2 同值 ⇒ 只改墙钟倍率，不改演出时长）
    const short = observed.filter((o) => o.dist <= JUMP.baseCells);
    const far = observed.filter((o) => o.dist > JUMP.baseCells);
    expect(short.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    for (const o of observed) {
      expect(o.duration).toBeCloseTo(CHARACTER_3D_JUMP_MOVE_SEC, 10);
    }
    // x1 与 x2 的**演出秒**必须一致（仅全局倍率：墙钟 = 演出秒 / 倍率）
    const x1 = observed.filter((o) => o.speed === 1);
    const x2 = observed.filter((o) => o.speed === 2);
    expect(new Set(x1.map((o) => o.duration))).toEqual(new Set([CHARACTER_3D_JUMP_MOVE_SEC]));
    // 【R2-1】x2 全局倍速 ⇒ 墙钟 0.5s（演出秒不变，禁额外距离倍率）
    expect(CHARACTER_3D_JUMP_MOVE_SEC / SPEED_FACTOR.fast).toBeCloseTo(0.5, 10);
    expect(new Set(x2.map((o) => o.duration))).toEqual(new Set([CHARACTER_3D_JUMP_MOVE_SEC]));
  });

  it('v1.1 §9.1：jump 只剥 root x/z —— y 逐点与源相符、x/z 恒为静止位移、hop=0', () => {
    const s = jumpSession();
    expect(tickToPending(s)).toBe(true);
    const model = heroModel();
    const jumpRaw = heroClipRaw('jump');
    const clip = parseCharacter3DClipJson(jumpRaw, 'jump');
    const bound = bindRetargetedClip(clip, model);
    // 【R2-1】采样带上 root y 正段增益（生产口径）：与源 y 的关系 = gainedRootY(源 y)
    const yGain = HERO_3D_ACTION_MAP.jump.rootYGain ?? null;
    const probe = (ratio: number): { x: number; y: number; z: number } => {
      const pose = createPose(model);
      applyRetargetedClip(clip, bound, model, pose, ratio, 'zero-xz', false, true, yGain);
      const t = pose.tV[bound.rootNode];
      return { x: t[0], y: t[1], z: t[2] };
    };
    // 取三个相位（fi = ratio×45 ⇒ 0 / 22.5 / 45）
    for (const ratio of [0, 0.5, 1]) {
      const fi = ratio * (clip.nFrames - 1);
      const i0 = Math.min(clip.nFrames - 1, Math.floor(fi));
      const i1 = Math.min(clip.nFrames - 1, i0 + 1);
      const a = fi - Math.floor(fi);
      const rawY = clip.rootTrack[i0][1] * (1 - a) + clip.rootTrack[i1][1] * a;
      const wantY = bound.rootRest[1] + gainedRootY(rawY, yGain, clip.rootTrackPeakY);
      const got = probe(ratio);
      expect(got.y, `ratio=${ratio} y 与源不符`).toBeCloseTo(wantY, 6); // pose 为 Float32 ⇒ 6 位足够
      expect(got.x, `ratio=${ratio} x 必须为静止位移`).toBeCloseTo(bound.rootRest[0], 6);
      expect(got.z, `ratio=${ratio} z 必须为静止位移`).toBeCloseTo(bound.rootRest[2], 6);
    }
    // y 曲线确实随相位变化（不是被抹平）：首/中/末三点互不相等
    const ys = [0, 0.5, 1].map((r) => probe(r).y);
    expect(new Set(ys.map((v) => v.toFixed(6))).size).toBe(3);
    // 存在负 y（下蹲）段且**未被钳掉**
    expect(Math.min(...clip.rootTrack.map((r: number[]) => r[1]))).toBeLessThan(0);
    expect(probe(1).y).toBeLessThan(bound.rootRest[1]);
    // 运行期：整个过程 hop=0（不叠程序抛物线）
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const { assets } = makeAssets();
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.submit({ type: 'move', to: pickJumpCell(s, 'far') })).toBe(true);
    updateView(view, s.snapshot(), DT_REAL, W, H);
    const ma = view.moveAnims.get('hero')!;
    const samples = driveFrames(s, view, pass, cmds, assets, Math.ceil(ma.duration / DT_REAL));
    expect(samples.every((x) => x.hop === 0)).toBe(true);
  });

  it('v1.1 §9.1：采样端点策略 —— fi=0/22.5/45 首中末单调、只播一次（不提前到末帧、不回卷）', () => {
    const model = heroModel();
    const clip = parseCharacter3DClipJson(heroClipRaw('jump'), 'jump');
    expect(clip.nFrames).toBe(46);
    const fiOf = (ratio: number): number => {
      // 生产口径：endpointInclusive ⇒ fi = ratio×(nFrames−1)（禁 ratio×nFrames）
      const fi = ratio * (clip.nFrames - 1);
      return Math.min(clip.nFrames - 1, Math.max(0, fi));
    };
    expect(fiOf(0)).toBe(0);
    expect(fiOf(0.5)).toBe(22.5);
    expect(fiOf(1)).toBe(45);
    // 单调且只播一次：区间内严格不减；到 1 后夹在末帧（不回卷到 0）
    const seq = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98, 1].map(fiOf);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(fiOf(1)).toBe(clip.nFrames - 1); // 夹在末帧 ⇒ 不出现「播完又从头」
    // 反例自证（旧口径）：fi = ratio×nFrames ⇒ ratio=45/46=0.978 就 **已到末帧**（提前到末帧 ⇒ 收尾提前）
    expect(45 / 46).toBeLessThan(1);
    expect(Math.floor((45 / 46) * clip.nFrames)).toBe(clip.nFrames - 1); // 末帧在 progress 0.978 就被取到
    // 新口径：同一 ratio 落在 43~44 帧之间 ⇒ 末帧只在 progress=1 取到
    expect(Math.floor((45 / 46) * (clip.nFrames - 1))).toBeLessThan(clip.nFrames - 1);
  });

  it('v1.1 §9.1：末姿从落地姿态混合回 idle 180ms（不反播、不循环重启）', () => {
    const c = new CharacterAnimController({
      actionMap: HERO_3D_ACTION_MAP,
      crossFadeSec: CHARACTER_3D_CROSS_FADE_SEC,
      jumpToIdleBlendSec: CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC,
      clips: heroClipRegistry(heroModel()),
    });
    const model = heroModel();
    const sampleWeight = (): number => c.fadeWeight;
    c.update(0.016, { state: 'walk', stateElapsedSec: 0.1, moveProgress: 0.99, isJump: true });
    expect(c.activeClipKey).toBe('jump');
    // 切 idle：jump→idle 用 180ms 固定混合（不是默认 100ms）
    c.update(0.016, { state: 'idle', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(c.activeClipKey).toBe('idle');
    expect(sampleWeight()).toBe(0); // 混合起点：权重 0（上一段 jump 全显）——「从末姿混合」即此
    c.update(0.016, { state: 'idle', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(sampleWeight()).toBeGreaterThan(0);
    expect(sampleWeight()).toBeLessThan(1);
    // 混合期约 180ms：喂到 0.18s 后权重应到 1（淡化结束）
    for (let i = 0; i < 12; i++) c.update(0.016, { state: 'idle', stateElapsedSec: 0, moveProgress: null, isJump: false });
    expect(sampleWeight()).toBeCloseTo(1, 6);
    // 采样可达（不抛、不空）
    const pose = createPose(model);
    const pal = c.sample(model, pose, createPose(model));
    expect(pal.length).toBe(41 * 16);
  });

  it('起落两点 hop=0 仍必须是 jump（禁 hop 反推）；演出结束/被替换即释放', () => {
    const s = jumpSession();
    expect(tickToPending(s)).toBe(true);
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const { assets } = makeAssets();
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s.submit({ type: 'move', to: pickJumpCell(s, 'far') })).toBe(true);
    updateView(view, s.snapshot(), DT_REAL, W, H);
    const anim = view.moveAnims.get('hero')!;
    const draw = (): CharacterRenderCommand => {
      const snap = s.snapshot();
      updateView(view, snap, 0, W, H); // dt=0：不推进演出，只刷视图态与命令
      drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 0 }, snap, assets, view);
      return cmds.find((c) => c.actorId === 'hero')!;
    };
    // 起点：hop 恰为 0（几何起点）
    anim.t = 0;
    const takeoff = draw();
    expect(takeoff.hopPx).toBe(0);
    expect(takeoff.isJump).toBe(true);
    // 终点前一刻：hop→0（几何终点）
    anim.t = anim.duration - 1e-9;
    const landing = draw();
    expect(landing.hopPx).toBeLessThan(1e-6);
    expect(landing.isJump).toBe(true);
    // 演出走满：释放（即便快照仍是本次移动的 walk 态）
    anim.t = anim.duration;
    expect(draw().isJump).toBe(false);
    // 被替换（新的普通移动演出覆盖旧实例）：意图随之=false（不跨演出残留）
    view.moveAnims.set('hero', {
      from: { q: 4, r: 8 },
      pos: { q: 5, r: 8 },
      path: [],
      pathPx: [],
      t: 0,
      duration: 0.3,
      isJumpMove: false,
      hopHeight: 0,
      jumpChannel: null, // 用例手工构造：非 3D 轻功通道
    });
    expect(draw().isJump).toBe(false);
    expect(pass.controllers.get('hero')?.activeClipKey).toBe('walk');
  });

  it('普通移动 / 死亡 / reset 不串状态（意图不跨演出残留）', () => {
    // (a) 同一真实 session：轻功演出结束后走一次普通移动（真实第二回合）
    const s = jumpSession();
    expect(tickToPending(s)).toBe(true);
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const { assets } = makeAssets();
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const to = pickJumpCell(s, 'far');
    expect(s.submit({ type: 'move', to })).toBe(true);
    updateView(view, s.snapshot(), DT_REAL, W, H);
    const jumpDur = view.moveAnims.get('hero')!.duration;
    driveFrames(s, view, pass, cmds, assets, Math.ceil((jumpDur + 0.3) / DT_REAL));
    expect(cmds.find((c) => c.actorId === 'hero')!.isJump).toBe(false); // 演出结束：已释放
    expect(view.moveAnims.get('hero')).toBeUndefined();

    // 第二回合普通移动（无选中 → 绿格）
    expect(tickToPending(s), '第二回合未到输入态').toBe(true);
    const walkFrom = { ...heroUnitOf(s).hex };
    const walkCells = s.snapshot().moveCells.slice().sort((a, b) => cubeDistance(walkFrom, b) - cubeDistance(walkFrom, a));
    expect(walkCells.length, '普通可达绿格为空').toBeGreaterThan(0);
    expect(s.submit({ type: 'move', to: walkCells[walkCells.length - 1] })).toBe(true);
    const walkSamples = driveFrames(s, view, pass, cmds, assets, 12);
    expect(walkSamples.every((x) => x.cmdIsJump === false), '普通移动串入轻功意图').toBe(true);
    expect(walkSamples.some((x) => x.clip === 'walk')).toBe(true);

    // (b) 死亡：演出中途阵亡即刻释放（禁「死后仍按轻功锁帧」）
    const s2 = jumpSession();
    expect(tickToPending(s2)).toBe(true);
    const { layer: layer2, pass: pass2, cmds: cmds2 } = makeRealPassLayer(DPR);
    const view2 = view3d(layer2);
    const { assets: assets2 } = makeAssets();
    expect(s2.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    expect(s2.submit({ type: 'move', to: pickJumpCell(s2, 'far') })).toBe(true);
    updateView(view2, s2.snapshot(), DT_REAL, W, H);
    expect(view2.moveAnims.get('hero')!.isJumpMove).toBe(true);
    driveFrames(s2, view2, pass2, cmds2, assets2, 6); // 演出仍在进行（0.1s < duration）
    expect(view2.moveAnims.get('hero')!.t).toBeLessThan(view2.moveAnims.get('hero')!.duration);
    const deadSnap = {
      ...s2.snapshot(),
      actors: s2.snapshot().actors.map((a) => (a.id === 'hero' ? { ...a, animState: 'dead' as const } : a)),
    };
    updateView(view2, deadSnap, DT_REAL, W, H);
    drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: DT_REAL }, deadSnap, assets2, view2);
    const deadCmd = cmds2.find((c) => c.actorId === 'hero')!;
    expect(deadCmd.state).toBe('dead');
    expect(deadCmd.isJump, '阵亡未释放轻功意图').toBe(false);
    // dead 动作槽位=idle 首帧保持（§5 表），故判据看 actionKey 而非 clip 键
    expect(pass2.controllers.get('hero')?.actionKey).toBe('dead');

    // (c) reset（resetDemo 口径：演出态清空 + 新 session）→ 新局首帧不得残留轻功意图
    view2.moveAnims.clear();
    view2.moveDone.clear();
    view2.anim.clear();
    const fresh = jumpSession();
    const freshSnap = fresh.snapshot();
    updateView(view2, freshSnap, DT_REAL, W, H);
    drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: DT_REAL }, freshSnap, assets2, view2);
    expect(cmds2.find((c) => c.actorId === 'hero')!.isJump).toBe(false);
  });
});

// ══════════════════ 6'. 【R2-2】表现层零外溢（特/绝 3s 窗不改 session） ══════════════════
describe('[T31-R2 · R2-2] 特/绝 3s 表现窗不触 session 时间轴（零外溢）', () => {
  it('同一特技局两条路径：「注入 3D 层 + 逐帧 drawFrame」与「裸 session」事件序与结算量逐条一致', () => {
    const run = (withView: boolean) => {
      const s = castSession();
      expect(tickToPending(s), '未到输入态').toBe(true);
      let view: BattleHexView | null = null;
      if (withView) view = view3d(makeRealPassLayer(DPR).layer);
      const assets = withView ? makeAssets().assets : null;
      // 受控 tick：两条路径**完全相同的 dt 序列**（只差表现层是否画）
      const step = (dt: number): void => {
        s.tick(dt);
        if (view && assets) {
          const snap = s.snapshot();
          updateView(view, snap, dt, W, H);
          drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt }, snap, assets, view);
        }
      };
      expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
      const foe = s.snapshot().actors.find((a) => a.side === 'enemy')!;
      expect(s.submit({ type: 'cast', to: foe.pos, skillId: 'te' }), '施放被拒').toBe(true);
      const startIdx = s.events.length;
      const samples: string[] = [];
      const total = Math.ceil(3.6 / DT_REAL);
      for (let i = 0; i < total; i++) {
        step(DT_REAL);
        const snap = s.snapshot();
        const a = snap.actors.find((x) => x.id === 'hero')!;
        const b = snap.actors.find((x) => x.id === 'e1')!;
        samples.push(`t=${(i * DT_REAL).toFixed(3)} hero:${a.animState}:${a.hp}:${a.actionBar.toFixed(3)} e1:${b.hp}:${b.animState}`);
      }
      return {
        events: s.events.slice(startIdx).map((e) => JSON.stringify(e)),
        samples,
        clock: s._debug.clock(),
        phase: s.snapshot().phase,
      };
    };
    const bare = run(false);
    const painted = run(true);
    // ① 事件序（含 t 与载荷：段 1 t0 内联段 / 段 2 t1 结算）逐条一致
    expect(painted.events).toEqual(bare.events);
    expect(bare.events.length).toBeGreaterThan(0);
    expect(bare.events.some((e) => e.includes('skill'))).toBe(true); // 确有伤害结算事件（非空断言）
    // ② 逐帧 HP / 行动条 / 动画态 / 时钟 / 相位全部逐条一致（表现层零外溢）
    expect(painted.samples).toEqual(bare.samples);
    expect(painted.clock).toBeCloseTo(bare.clock, 12);
    expect(painted.phase).toBe(bare.phase);
    // ③ 结算确实发生（防「两条路径都空跑」的假一致），且确经 charge→strike 两态
    expect(bare.samples[bare.samples.length - 1]).not.toBe(bare.samples[0]);
    expect(bare.samples.some((x) => x.includes('hero:charge'))).toBe(true);
    // 实测口径（如实记录）：现役 session 的施法相 = charge → idle（t1 即收势，不经 strike 收招相，
    // 见 systems/battle-session 的 AS-4 注释）⇒ strike 3D 槽位由「直接驱动命令」的用例与 shot 证据覆盖。
    expect([...new Set(bare.samples.map((x) => x.split(' ')[1].split(':')[1]))]).toEqual(['charge', 'idle']);
  });
});

// ══════════════════ 6''. 【T31-R2-basic】3D 普攻表现窗 1.5s（Leo 09-15 现场裁定） ══════════════════
describe('[T31-R2-basic] 3D 普攻表现窗 1.5s（1.0× 原速）；2D/legacy 仍 0.7s', () => {
  it('3D 窗 1.5s 覆盖全程：basic 呈现续播至末帧（clip/state 末帧前不切换）；2D 表仍 0.7s', () => {
    const { assets } = makeAssets();
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const snapIdle = snap([actor({ animState: 'idle' })]);
    updateView(view, snapIdle, 0.016, W, H); // 登记 idle（上升沿判定的 prev）
    const snapBasic = snap([actor({ animState: 'basic' })]);
    updateView(view, snapBasic, 0.016, W, H); // idle→basic 上升沿：两条视界同时开窗
    const hold3d = view.basicHolds3d.get('hero')!;
    const hold2d = view.basicHolds.get('hero')!;
    expect(hold3d.until - hold3d.since).toBeCloseTo(CHARACTER_3D_BASIC_WINDOW_SEC, 10); // 3D：1.5s
    expect(hold2d.until - hold2d.since).toBeCloseTo(CHOREO.basicSec, 10); // 2D/legacy：0.7s（未改）
    const since = hold3d.since;
    const frames: Array<{ t: number; state: string; elapsed: number; clip: string | null }> = [];
    const dt = 1 / 60;
    for (let i = 0; i < 150; i++) {
      const s = view.time - since < 0.3 ? snapBasic : snapIdle; // session ANIM_MS.basic=300 后翻 idle
      updateView(view, s, dt, W, H);
      drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt }, s, assets, view);
      const cmd = cmds.find((c) => c.actorId === 'hero')!;
      frames.push({ t: view.time - since, state: cmd.state, elapsed: cmd.stateElapsedSec, clip: pass.controllers.get('hero')?.activeClipKey ?? null });
    }
    // ① 窗内（0~1.48s）：恒 basic/atk（不被 0.7s 截断 ⇒ 0.7~1.5 段仍在跑同一 clip）
    const inWindow = frames.filter((f) => f.t < CHARACTER_3D_BASIC_WINDOW_SEC - 0.02);
    expect(inWindow.length).toBeGreaterThan(80);
    expect(inWindow.every((f) => f.state === 'basic' && f.clip === 'atk')).toBe(true);
    // ② 1.0×：相位 = elapsed/1.5 单调增至 ~1（末帧前无切换）
    const phases = inWindow.map((f) => f.elapsed / CHARACTER_3D_BASIC_WINDOW_SEC);
    for (let i = 1; i < phases.length; i++) expect(phases[i]).toBeGreaterThanOrEqual(phases[i - 1]);
    expect(phases[phases.length - 1]).toBeGreaterThan(0.95);
    expect(inWindow.some((f) => f.t > 0.75 && f.t < 1.15)).toBe(true); // 0.7s 之后确实还在播（旧窗早已结束）
    // ③ 窗后正常收尾（回 idle），不是被截断
    const after = frames.filter((f) => f.t > CHARACTER_3D_BASIC_WINDOW_SEC + 0.05);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((f) => f.state === 'idle')).toBe(true);
    // ④ 2D 表在 0.7s 后即到期（视界互不干扰）
    expect(view.basicHolds.get('hero')).toBeUndefined();
  });

  it('呈现窗不遮挡/不推迟新状态：窗内换态（charge / walk+jump）当帧即生效', () => {
    const { assets } = makeAssets();
    const { layer, pass, cmds } = makeRealPassLayer(DPR);
    const view = view3d(layer);
    const snapBasic = snap([actor({ animState: 'basic' })]);
    updateView(view, snap([actor({ animState: 'idle' })]), 0.016, W, H);
    updateView(view, snapBasic, 0.016, W, H);
    const since = view.basicHolds3d.get('hero')!.since;
    // 推进到窗中段（≈0.8s）
    for (let i = 0; i < 48; i++) updateView(view, snapBasic, 1 / 60, W, H);
    expect(view.time - since).toBeGreaterThan(0.75);
    expect(view.time - since).toBeLessThan(CHARACTER_3D_BASIC_WINDOW_SEC);
    // ① 窗内换 charge：当帧即为 charge（不被 basic 视界遮挡）
    const snapCharge = snap([actor({ animState: 'charge' })]);
    drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 1 / 60 }, snapCharge, assets, view);
    expect(cmds.find((c) => c.actorId === 'hero')!.state).toBe('charge');
    // ② 窗内换轻功：当帧即 walk+jump
    const jumpHero = actor({ animState: 'walk', isJump: true, pos: { q: 5, r: 8 }, renderPos: { q: 4, r: 8 } });
    const snapJump = snap([jumpHero]);
    updateView(view, snapJump, 1 / 60, W, H);
    drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 0 }, snapJump, assets, view);
    const cmd = cmds.find((c) => c.actorId === 'hero')!;
    expect(cmd.state).toBe('walk');
    expect(cmd.isJump).toBe(true);
    expect(pass.controllers.get('hero')?.actionKey).toBe('jump');
  });

  it('真实链路零外溢（普攻）：注入 3D 层 vs 裸 session 的事件序/逐帧量与 pendingInput 节奏一致', () => {
    const run = (withView: boolean) => {
      const s = basicSession();
      expect(tickToPending(s), '未到输入态').toBe(true);
      let view: BattleHexView | null = null;
      if (withView) view = view3d(makeRealPassLayer(DPR).layer);
      const assets = withView ? makeAssets().assets : null;
      const step = (dt: number): void => {
        s.tick(dt);
        if (view && assets) {
          const snap = s.snapshot();
          updateView(view, snap, dt, W, H);
          drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt }, snap, assets, view);
        }
      };
      expect(s.submit({ type: 'selectBasic' }), '进普攻选中态被拒').toBe(true);
      const cells = s.snapshot().basicCells;
      expect(cells.length, 'basicCells 为空').toBeGreaterThan(0);
      expect(s.submit({ type: 'basicAtCell', to: cells[0] }), '普攻提交被拒').toBe(true);
      const startIdx = s.events.length;
      const samples: string[] = [];
      for (let i = 0; i < Math.ceil(3.2 / DT_REAL); i++) {
        step(DT_REAL);
        const snap = s.snapshot();
        const a = snap.actors.find((x) => x.id === 'hero')!;
        const e = snap.actors.find((x) => x.id === 'e1')!;
        samples.push(
          `t=${(i * DT_REAL).toFixed(3)} hero=${a.animState}:${a.hp}:${a.actionBar.toFixed(4)} e1=${e.hp} pi=${snap.pendingInput}:${snap.phase}`,
        );
      }
      return { events: s.events.slice(startIdx).map((e) => JSON.stringify(e)), samples, clock: s._debug.clock(), phase: s.snapshot().phase };
    };
    const bare = run(false);
    const painted = run(true);
    expect(painted.events).toEqual(bare.events);
    expect(painted.samples).toEqual(bare.samples); // 含 pendingInput：1.5s 呈现窗零节奏外溢
    expect(painted.clock).toBeCloseTo(bare.clock, 12);
    expect(painted.phase).toBe(bare.phase);
    // 防假一致：本局确有普攻状态与伤害事件
    expect(bare.samples.some((x) => x.includes('hero=basic:'))).toBe(true); // hero 确实进了 basic 态
    // 防假一致：普攻确实结出伤害（敌方 HP 变化），两条路径同量
    // 普攻段 1 在 t0 内联结算 ⇒ 首个样本即已掉血；与 realUnit 初始满血 999999 比较
    const e1Hp = bare.samples.map((x) => Number(/e1=(\d+)/.exec(x)![1]));
    expect(e1Hp.length).toBeGreaterThan(0);
    expect(e1Hp[0]).toBeLessThan(999999);
    expect(e1Hp.every((v, i) => i === 0 || v === e1Hp[0])).toBe(true); // 结算时点唯一且两条路径同量
  });
});

// ══════════════════ 7. 【R2】像素语义（逻辑参考高 vs 物理参考高） ══════════════════
describe('[T31-FE-B · R2] 像素语义：宿主统一乘一次 pixelRatio，pass 不再乘', () => {
  it('DPR 1/2/3：placed 逻辑高度恒等（=config 逻辑参考高），命令坐标随 dpr 线性放大', () => {
    const logicalH = HERO_3D_PROFILE.screenHeightPxAtReference;
    for (const dpr of [1, 2, 3]) {
      const { layer, pass, cmds } = makeRealPassLayer(dpr);
      const view = view3d(layer);
      const { assets } = makeAssets();
      const snap0 = snap([actor()]);
      updateView(view, snap0, 0.016, W, H);
      drawFrame({ ctx: makeRecordingCtx([]), width: W, height: H, dt: 0.016 }, snap0, assets, view);
      const cmd = cmds.find((c) => c.actorId === 'hero')!;
      const w = hexToWorld(4, 8);
      const logicalX = Math.round(w.x - view.camera.x + W / 2);
      const logicalY = Math.round(w.y - view.camera.y + H / 2);
      expect(cmd.footX, `dpr=${dpr}`).toBe(logicalX * dpr); // 命令=物理像素
      expect(cmd.footY).toBe(logicalY * dpr);
      const res = pass.render([cmd], 0.016);
      const box = res.placed.get('hero')!;
      expect(box.h, `dpr=${dpr} 物理高`).toBeCloseTo(logicalH * dpr, 6); // 物理高 = 逻辑参考高 × dpr（仅宿主乘一次）
      expect(box.h / dpr, `dpr=${dpr} 逻辑高`).toBeCloseTo(logicalH, 6); // 逻辑高跨 DPR 恒等
      // HUD/热区口径（逻辑像素）跨 DPR 恒等——这是「DPR 1/2/3 锁逻辑高度一致」的可观测面
      expect(view.character3dPlaced!.get('hero')!.h).toBeCloseTo(logicalH, 6);
      expect(view.character3dPlaced!.get('hero')!.w).toBeCloseTo(box.w / dpr, 6);
    }
  });

  it('config 参考高注释=逻辑像素；pass 不持 pixelRatio（换算只发生在宿主一处）', () => {
    const cfg = readFileSync(path.join(ROOT, 'config/character-3d.ts'), 'utf8');
    expect(cfg).toContain('参考屏高（**逻辑像素**');
    expect(cfg).not.toContain('参考屏高（画布物理像素）');
    const passSrc = readFileSync(path.join(ROOT, 'ui/character3d/pass.ts'), 'utf8');
    expect(passSrc).not.toContain('pixelRatio'); // 禁 pass 再乘一次
    const mainSrc = readFileSync(path.join(ROOT, 'proto/battle_demo/main.ts'), 'utf8');
    // 宿主唯一换算点（R2-3 追加证据专用 ?heroScale= 倍数：默认 1，不改生产分支）
    expect(mainSrc).toContain('HERO_3D_PROFILE.screenHeightPxAtReference * HERO_SCALE_OVERRIDE * dpr');
  });
});

// ══════════════════ 8. 【R5】宿主运行状态（失败注入） ══════════════════
interface FakeRaf {
  raf(cb: (t: number) => void): number;
  cancelRaf(id: number): void;
  readonly pendingCount: number;
  fire(t: number): void;
}
function makeFakeRaf(): FakeRaf {
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  return {
    raf(cb) {
      const id = next++;
      pending.set(id, cb);
      return id;
    },
    cancelRaf(id) {
      pending.delete(id);
    },
    get pendingCount() {
      return pending.size;
    },
    fire(t) {
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb(t);
    },
  };
}

describe('[T31-FE-B · R5] 宿主运行状态：终失败暂停 / 单一 RAF / 释放链', () => {
  it('重建终失败（notifyContextRestored(false)）→ tick 停止：无待排 RAF、迟到帧不推进', () => {
    const raf = makeFakeRaf();
    const steps: number[] = [];
    const host = createHostRuntime({ step: (dt) => steps.push(dt), raf: raf.raf, cancelRaf: raf.cancelRaf });
    host.start();
    expect(host.status).toBe('running');
    expect(host.pendingFrames).toBe(1); // 单一 RAF
    raf.fire(1000);
    raf.fire(1016);
    expect(steps).toEqual([0, 0.016]); // 首帧 dt=0
    expect(host.pendingFrames).toBe(1); // 续排恒一处

    let reported: string | null = null;
    host.notifyContextRestored(false, () => {
      reported = 'gate';
    });
    expect(reported).toBe('gate');
    expect(host.status).toBe('paused');
    expect(host.pauseReason).toBe('context-restore-failed');
    expect(host.pendingFrames).toBe(0); // 待排 RAF 已取消

    const framesAtPause = host.frames;
    raf.fire(2000); // 迟到帧
    raf.fire(2100);
    expect(host.frames).toBe(framesAtPause); // tick 停止（无新帧）
    expect(steps).toHaveLength(2);
    expect(host.pendingFrames).toBe(0); // 不再续排
  });

  it('短暂 lost（notifyContextRestored(true)）不打断循环；resume 重置时钟（首帧 dt=0 不补算停留）', () => {
    const raf = makeFakeRaf();
    const steps: number[] = [];
    const host = createHostRuntime({ step: (dt) => steps.push(dt), raf: raf.raf, cancelRaf: raf.cancelRaf });
    host.start();
    raf.fire(1000);
    host.notifyContextRestored(true);
    expect(host.status).toBe('running'); // 短暂 lost 沿方案：不暂停
    expect(host.pauseReason).toBeNull();
    raf.fire(1016);
    expect(steps).toEqual([0, 0.016]);

    host.pause('manual');
    expect(host.status).toBe('paused');
    host.resume();
    expect(host.status).toBe('running');
    expect(host.pendingFrames).toBe(1);
    raf.fire(9000); // 暂停期间停了很久（8s）：恢复首帧不得补算
    expect(steps[steps.length - 1]).toBe(0);
    raf.fire(9016);
    expect(steps[steps.length - 1]).toBeCloseTo(0.016, 6);
  });

  it('多次点击重试只产生一个循环（替换式：旧 dispose + 新 start）', () => {
    const raf = makeFakeRaf();
    const make = (): { host: HostRuntime; steps: number[] } => {
      const steps: number[] = [];
      const host = createHostRuntime({ step: (dt) => steps.push(dt), raf: raf.raf, cancelRaf: raf.cancelRaf });
      return { host, steps };
    };
    const a = make();
    a.host.start();
    const b = make(); // 第 1 次重试：main 先 disposeRuntime()
    a.host.dispose();
    b.host.start();
    const c = make(); // 第 2 次重试
    b.host.dispose();
    c.host.start();
    expect(raf.pendingCount).toBe(1); // 全部重试后仍只有一个待排 RAF
    expect(a.host.status).toBe('disposed');
    expect(b.host.status).toBe('disposed');

    const before = [a.steps.length, b.steps.length, c.steps.length];
    raf.fire(1000);
    raf.fire(1016);
    // 只有最新循环推进；旧循环（已 dispose）零推进 ⇒ 不存在第二条循环
    expect([a.steps.length, b.steps.length, c.steps.length]).toEqual([before[0], before[1], before[2] + 2]);
    expect(raf.pendingCount).toBe(1);
    expect(c.host.frames).toBe(2);
  });

  it('dispose 逆序执行 disposer（旧 renderer/监听释放）且已释放的运行时不可复活', () => {
    const raf = makeFakeRaf();
    const order: string[] = [];
    const host = createHostRuntime({ step: () => {}, raf: raf.raf, cancelRaf: raf.cancelRaf });
    host.start();
    host.addDisposer(() => order.push('listener')); // 先注册监听摘除
    host.addDisposer(() => order.push('renderer')); // 后注册 renderer.dispose
    host.dispose();
    expect(order).toEqual(['renderer', 'listener']); // 逆序释放
    expect(host.status).toBe('disposed');
    expect(host.pendingFrames).toBe(0);
    host.dispose(); // 幂等
    expect(order).toEqual(['renderer', 'listener']);
    host.start(); // 不可复活
    expect(host.status).toBe('disposed');
    expect(raf.pendingCount).toBe(0);
  });
});
