// T16 用例：渲染层红线扫描 + 六边形几何 + 帧组播报 + 镜头 + 输入翻译 + mock 快照渲染烟雾 + mock 会话契约咬合
// 运行：npm run test:battle
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path 的最小类型声明见 env.d.ts（全局 ambient）
declare const __dirname: string;
import {
  ANIM_FRAMES,
  ANIM_LOOP_GROUPS,
  ARC_BTNS,
  BOARD,
  BOARD_SHAPE,
  COMPONENT_LAYOUT,
  CTRL_ACTIVE,
  CTRL_ART,
  CTRL_BUTTONS,
  FACINGS,
  FIELD,
  JUMP,
  PIECE,
  ROW_H,
  SHADOW,
  SPRITE_PROFILES,
  TILE,
  TILE_H,
  TILE_W,
  TOPBAR,
  hexDist,
  hexToWorld,
  jumpParamsFor,
  type BattleClip,
  type DirectionalSpriteProfile,
} from '../config/battle-hex';
import {
  axialToOffset,
  boardBounds,
  cellHash,
  computeCamera,
  computeMovePath,
  directionalFrameOf,
  envWorldRect,
  frameKeyOf,
  isBoardCell,
  isMovableCell,
  movableBounds,
  moveAnimDrawPosPx,
  createView,
  drawFrame,
  pieceHop,
  spawnNoteFx,
  updateView,
  worldToHex,
  type BattleHexAssets,
  type BattleHexView,
  type DirectionalFrameStore,
  type ImgLike,
  type LegacyFrameStrip,
} from '../ui/battle-hex-render';
import { createBattleInput, createPointerTracker, pickCtrlButton, pickPlaqueButton, pickSkillButton } from '../ui/battle-input';
import { createMockSession } from '../proto/battle_demo/mock_session';
import type { BattleFacingHex, BattleSnapshot, CombatantInput, HexPos, SnapshotActor } from '../types';

const ROOT = path.resolve(__dirname, '..');

// ---------- 红线：渲染层零 import battle-core（DoD 自动化检查） ----------
describe('架构红线：渲染/输入层 import battle-core = 0', () => {
  const files = [
    'ui/battle-hex-render.ts',
    'ui/battle-input.ts',
    'config/battle-hex.ts',
    'proto/battle_demo/mock_session.ts',
    'proto/battle_demo/main.ts',
  ];
  for (const f of files) {
    it(`${f} 不引用 battle-core`, () => {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      // 只匹配真实模块路径引用（from '...battle-core' / require('...battle-core')）；注释宣示字样不计数
      const refRe = /from\s+['"][^'"]*battle-core|require\(\s*['"][^'"]*battle-core/;
      expect(refRe.test(src)).toBe(false);
    });
  }
});

// ---------- 瓦片投影（尖角压扁 + 奇偶行错位，逻辑格不变） ----------
describe('瓦片投影（尖角压扁 + 奇偶行错位，逻辑格不变）', () => {
  it('hexToWorld：px=(col+(row&1?0.5:0))×TILE_W；py=row×ROW_H（col=q+⌊r/2⌋）', () => {
    expect(hexToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(hexToWorld(1, 0).x).toBe(TILE_W); // row 0 不偏移
    const odd = hexToWorld(0, 1); // col=0，奇数行偏移半格
    expect(odd.x).toBeCloseTo(TILE_W * 0.5, 6);
    expect(odd.y).toBeCloseTo(ROW_H, 6);
    const even = hexToWorld(2, 4); // col=4，偶数行
    expect(even.x).toBeCloseTo(TILE_W * 4, 6);
    expect(even.y).toBeCloseTo(ROW_H * 4, 6);
  });

  it('worldToHex 中心点往返恒等（压扁网格反算）', () => {
    for (const c of [{ q: 0, r: 0 }, { q: 3, r: -2 }, { q: -4, r: 9 }, { q: 7, r: 7 } as HexPos]) {
      const w = hexToWorld(c.q, c.r);
      const back = worldToHex(w.x, w.y);
      expect(back.q).toBe(c.q);
      expect(back.r).toBe(c.r);
    }
  });

  it('axialToOffset odd-r 换算与出界判 null', () => {
    expect(axialToOffset({ q: 1, r: 8 })).toEqual({ col: 5, row: 8 }); // q = col - ⌊row/2⌋
    expect(axialToOffset({ q: -7, r: 15 })).toEqual({ col: 0, row: 15 });
    expect(axialToOffset({ q: 0, r: 16 })).toBeNull();
    expect(axialToOffset({ q: 0, r: -1 })).toBeNull();
  });

  it('isMovableCell：可动区 FIELD（T15 R3 定版 col 4..11 / row 2..13，12 高 × 8 宽）', () => {
    expect(isMovableCell({ q: 1, r: 8 })).toBe(true); // col 5, row 8
    expect(isMovableCell({ q: 0, r: 2 })).toBe(false); // col 1 < 4 出带
    expect(isMovableCell({ q: 3, r: 2 })).toBe(true); // col 4, row 2（西北角）
    expect(isMovableCell({ q: 7, r: 11 })).toBe(false); // col 12 > 11 出带
    expect(isMovableCell({ q: 5, r: 13 })).toBe(true); // col 5, row 13（东南角）
    expect(axialToOffset({ q: 5, r: 13 })).toEqual({ col: 11, row: 13 });
    expect(isMovableCell({ q: -4, r: 4 })).toBe(false); // col -2 出界
    expect(isMovableCell({ q: -1, r: 15 })).toBe(false); // row 15 > 13
    expect(isMovableCell({ q: 0, r: 1 })).toBe(false); // col 0, row 1 出带
  });

  it('boardBounds 覆盖 16×16 全图角格', () => {
    const b = boardBounds(); // T24 起战区 clip 已撤：全图包围盒保留为几何基准（诊断/用例用）
    const c0 = hexToWorld(0, 0);
    const c15 = hexToWorld(8, 15); // 底行最右格（q = 15 - 7）
    expect(b.minX).toBeLessThan(c0.x);
    expect(b.maxY).toBeGreaterThan(c15.y);
  });
});

// ---------- 帧组播报铁律 ----------
describe('帧组播报（组内单播、组间不跨）', () => {
  it('animState→帧组映射与 config/battle BATTLE_FRAME 同源', () => {
    expect(ANIM_FRAMES.idle).toEqual([7]);
    expect(ANIM_FRAMES.walk).toEqual([1, 2, 3]);
    expect(ANIM_FRAMES.charge).toEqual([4]);
    expect(ANIM_FRAMES.strike).toEqual([5]);
    expect(ANIM_FRAMES.basic).toEqual([6]);
    expect(ANIM_LOOP_GROUPS).toContain('walk');
  });

  it('状态切换重置动画钟（新组从组首帧重放）并在出招/受击时派生特效', () => {
    const view = createView();
    const snap = makeSnapshot([{ id: 'hero', animState: 'idle' }]);
    updateView(view, snap, 0.2, 375, 667); // 首帧：登记为组首（t=0）
    expect(view.anim.get('hero')).toMatchObject({ state: 'idle', t: 0 });
    updateView(view, snap, 0.2, 375, 667); // 次帧起累计
    expect(view.anim.get('hero')).toMatchObject({ state: 'idle', t: 0.2 });
    snap.actors[0].animState = 'strike';
    updateView(view, snap, 0.05, 375, 667);
    expect(view.anim.get('hero')).toMatchObject({ state: 'strike', t: 0 }); // 组切换重置
    expect(view.fx).toHaveLength(1); // slash 特效派生（Q1②：animState 驱动）
    expect(view.fx[0].kind).toBe('slash');
  });
});

// ---------- 镜头 ----------
describe('镜头（拖动偏移 + 包围盒 clamp）', () => {
  it('镜头：跟随聚焦可动区（轴小于视口居中 / 轴大于视口夹界）', () => {
    const snap = makeSnapshot([{ id: 'hero', animState: 'idle', pos: { q: 0, r: 0 }, renderPos: { q: 0, r: 0 } }]);
    snap.cameraTargetId = 'hero';
    const b = movableBounds();
    const inClamp = (v: number, axis: 'x' | 'y', span: number): boolean => {
      const min = axis === 'x' ? b.minX : b.minY;
      const max = axis === 'x' ? b.maxX : b.maxY;
      return v >= min + span / 2 - 0.01 && v <= max - span / 2 + 0.01;
    };
    // y 轴：聚焦盒 672 略大于视口 667 → 夹界；主角 (0,0) 在下缘 → 夹于下界
    const cam = computeCamera(snap, { x: 0, y: 0 }, 375, 667);
    expect(inClamp(cam.y, 'y', 667)).toBe(true);
    expect(cam.y).toBeCloseTo(b.minY + 667 / 2, 1);
    // x 轴：战区宽 > 视口宽 → 夹于包围盒内
    expect(cam.x).toBeGreaterThanOrEqual(b.minX + 375 / 2 - 0.01);
    expect(cam.x).toBeLessThanOrEqual(b.maxX - 375 / 2 + 0.01);
    // 拖动偏移把镜头推得更远时仍被夹回
    const cam2 = computeCamera(snap, { x: -9999, y: 9999 }, 375, 667);
    expect(cam2.x).toBeCloseTo(b.minX + 375 / 2, 1);
    expect(inClamp(cam2.y, 'y', 667)).toBe(true);
  });
});

// ---------- L 环追加③：镜头策略（敌方行动静止 / 主角条满回拉） ----------
describe('镜头策略（L③）', () => {
  it('敌方行动时镜头静止；主角条满时平滑回拉主角', () => {
    const view = createView();
    const snap = makeSnapshot([
      { id: 'hero', animState: 'idle', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 } },
      { id: 'e1', side: 'enemy', animState: 'walk', pos: { q: 7, r: 4 }, renderPos: { q: 6, r: 4 } },
    ]);
    snap.cameraTargetId = 'hero';
    updateView(view, snap, 0.016, 375, 667); // 首帧定位
    const c0 = { ...view.camera };
    // 敌方行动 1 秒（敌 renderPos 持续变化）
    for (let i = 0; i < 60; i++) {
      snap.actors[1].renderPos = { q: 6 - i * 0.02, r: 4 };
      updateView(view, snap, 0.016, 375, 667);
    }
    expect(view.camera.x).toBeCloseTo(c0.x, 1); // 镜头静止
    expect(view.camera.y).toBeCloseTo(c0.y, 1);
    // 主角条满 → 平滑回拉主角（长帧收敛）
    snap.actors[0].pos = { q: 7, r: 11 };
    snap.actors[0].renderPos = { q: 7, r: 11 };
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    updateView(view, snap, 0.016, 375, 667);
    for (let i = 0; i < 150; i++) updateView(view, snap, 0.016, 375, 667); // 2.4s 平滑充分收敛
    const dest = computeCamera(snap, view.camDrag, 375, 667);
    expect(Math.abs(view.camera.x - dest.x)).toBeLessThan(5);
    expect(Math.abs(view.camera.y - dest.y)).toBeLessThan(5);
  });
});


// ---------- L 环终验：演出计时主导——移动帧序列单调无跳变（跳跃/普通移动双复现） ----------
describe('移动演出帧序列单调（查修一体复现转正）', () => {
  /** 模拟 session：位移 lerp 0.3s（快照 renderPos），isJump/animState 窗口同短——快照侧真实时序 */
  function drive(view: BattleHexView, snap: BattleSnapshot, actor: SnapshotActor, from: { q: number; r: number }, jump: boolean, frames: number): Array<{ q: number; hop: number }> {
    const seq: Array<{ q: number; hop: number }> = [];
    for (let f = 0; f < frames; f++) {
      const t = f * 0.016;
      const p = Math.min(1, t / 0.3);
      actor.renderPos = { q: from.q + (actor.pos.q - from.q) * p, r: from.r + (actor.pos.r - from.r) * p };
      (actor as { isJump: boolean }).isJump = jump && t < 0.3;
      actor.animState = t < 0.3 ? 'walk' : 'idle';
      updateView(view, snap, 0.016, 375, 667);
      const ma = view.moveAnims.get(actor.id);
      const mp = ma ? Math.min(1, ma.t / ma.duration) : 1;
      const drawQ = ma ? ma.from.q + (ma.pos.q - ma.from.q) * mp : actor.renderPos.q;
      seq.push({ q: +drawQ.toFixed(3), hop: +pieceHop(view, actor).toFixed(1) });
    }
    return seq;
  }
  const monotonic = (seq: Array<{ q: number }>): number[] => {
    let prev = -99;
    const jumps: number[] = [];
    for (const [i, s] of seq.entries()) {
      if (s.q < prev - 0.01) jumps.push(i);
      prev = Math.max(prev, s.q);
    }
    return jumps;
  };

  it('跳跃 3 格：演出位置序列单调（空中帧组不随快照切 idle）', () => {
    const view = createView();
    const snap = makeSnapshot([{ id: 'hero', animState: 'walk', pos: { q: 4, r: 8 }, renderPos: { q: 1, r: 8 } }]);
    const seq = drive(view, snap, snap.actors[0], { q: 1, r: 8 }, true, 50);
    expect(monotonic(seq)).toEqual([]);
    // 0.3s 后快照 animState 已 idle，但演出期帧组仍 walk（空中不站立）
    expect(seq[Math.floor(0.35 / 0.016)].hop).toBeGreaterThan(20); // 演出中段仍有抛物线高度
  });

  it('普通移动 3 格：演出位置序列单调（纳入演出插值，消灭双轨闪变）', () => {
    const view = createView();
    const snap = makeSnapshot([{ id: 'hero', animState: 'walk', pos: { q: 4, r: 8 }, renderPos: { q: 1, r: 8 } }]);
    const seq = drive(view, snap, snap.actors[0], { q: 1, r: 8 }, false, 50);
    expect(monotonic(seq)).toEqual([]);
  });
});

// ---------- 输入翻译 ----------
function makeViewForInput(): ReturnType<typeof createView> {
  const view = createView();
  view.camera = { x: 0, y: 0 };
  view.skillPop = 1;
  view.layout = {
    skillBtns: [
      { id: 'te', x: 100, y: 100, r: 11, disabled: false },
      { id: 'jue', x: 140, y: 100, r: 11, disabled: true },
    ],
    ctrlRect: { x: 300, y: 500, w: 70, h: 140 }, // 375×667 内
    plaqueRect: { x: 6, y: 50, w: 64, h: 156 },
  };
  return view;
}

describe('输入翻译（指针事件 → ActionRequest）', () => {
  const hero: SnapshotActor = {
    id: 'hero', side: 'player', name: '小虾米', pos: { q: 1, r: 8 }, renderPos: { q: 1, r: 8 },
    hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 100, facing: 'right', facingHex: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
  };
  const enemy: SnapshotActor = {
    id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 3, r: 7 }, renderPos: { q: 3, r: 7 },
    hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left', facingHex: 'left',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
  };

  it('拖动 >8px 判定为拖镜头：不平移不足不发请求，超阈平移 camDrag', () => {
    const view = makeViewForInput();
    const sent: string[] = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r.type) });
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    input.down(view, snap, 100, 100, 375, 667);
    input.move(view, 103, 102); // <8px：仍可能点选
    input.up(view, snap, 103, 102, 375, 667); // 视作点选（此处点空白格）→ 不崩
    input.down(view, snap, 100, 100, 375, 667);
    input.move(view, 130, 120); // >8px：拖镜头（L⑤：画面跟手=相机反向平移）
    input.up(view, snap, 130, 120, 375, 667);
    expect(view.camDrag.x).toBe(-30);
    expect(view.camDrag.y).toBe(-20);
  });

  it('弧形技能钮：命中派发 selectSkill；再点同钮=取消；置灰钮不派发', () => {
    const view = makeViewForInput();
    const sent: Array<{ type: string; skillId?: string }> = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r as { type: string }) });
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    input.down(view, snap, 100, 100, 375, 667); // A07：tap=down+up 配对（语义零变化，下同）
    input.up(view, snap, 100, 100, 375, 667);
    expect(sent).toEqual([{ type: 'selectSkill', skillId: 'te' }]);
    snap.selectedSkill = 'te';
    input.down(view, snap, 100, 100, 375, 667);
    input.up(view, snap, 100, 100, 375, 667);
    expect(sent[1]).toEqual({ type: 'cancelSkill' });
    let blocked = '';
    const input2 = createBattleInput({ dispatch: () => {}, onBlocked: (m) => (blocked = m) });
    input2.down(view, snap, 140, 100, 375, 667);
    input2.up(view, snap, 140, 100, 375, 667); // jue 置灰
    expect(blocked).toContain('冷却');
    expect(sent.length).toBe(2);
  });

  it('点可移动格=移动；激活技能点敌格=派 cast（T20 方案 B）；点无效格=取消', () => {
    const view = makeViewForInput();
    view.skillPop = 0; // 收起弧钮（pendingInput 时钮才弹；此处直接置 0 模拟未弹出）
    view.layout.skillBtns = [];
    const sent: Array<Record<string, unknown>> = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r as Record<string, unknown>) });
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    snap.moveCells = [{ q: 1, r: 9 }];
    // 主角世界坐标 → 屏幕坐标（camera 0,0 居中）
    const cellCenter = (c: HexPos) => {
      const w = hexToWorld(c.q, c.r);
      return { x: w.x + 375 / 2, y: w.y + 667 / 2 };
    };
    // ① 无技能：点移动格
    let p = cellCenter({ q: 1, r: 9 });
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[0]).toMatchObject({ type: 'move', to: { q: 1, r: 9 } });
    // ② 激活 te：点敌逻辑格=派 cast（【T20-FE · 方案 B / ATK-2 v2.0】skill 态点格统一 cast，格上有敌=对敌
    // 结算；方案 §2.5/:339 锚实指本行 :330——行号为写作时快照，经 git 考古语义唯一，PM 裁决 2026-09-03）
    snap.selectedSkill = 'te';
    p = cellCenter({ q: 3, r: 7 });
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[1]).toMatchObject({ type: 'cast', to: { q: 3, r: 7 }, skillId: 'te' });
    // ③ 激活 te：点无效格=取消
    p = cellCenter({ q: 6, r: 12 });
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[2]).toEqual({ type: 'cancelSkill' });
  });

  it('L 环终验根因 A：敌移动动画中点击逻辑格=普攻受理（命中与 renderPos 解耦）', () => {
    const view = makeViewForInput();
    view.skillPop = 0;
    view.layout.skillBtns = [];
    const sent: Array<Record<string, unknown>> = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r as Record<string, unknown>) });
    const hero: SnapshotActor = {
      id: 'hero', side: 'player', name: '小虾米', pos: { q: 1, r: 8 }, renderPos: { q: 1, r: 8 },
      hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 100, facing: 'right', facingHex: 'right',
      animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
    };
    // 敌逻辑格 (5,6)，动画位 (4.2,6.5)（移动中）——点击逻辑格
    const enemy: SnapshotActor = {
      id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 5, r: 6 }, renderPos: { q: 4.2, r: 6.5 },
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left', facingHex: 'left',
      animState: 'walk', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
    };
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    const w = hexToWorld(5, 6);
    input.down(view, snap, w.x + 375 / 2, w.y + 667 / 2, 375, 667);
    input.up(view, snap, w.x + 375 / 2, w.y + 667 / 2, 375, 667);
    expect(sent).toEqual([{ type: 'attack', targetId: 'e1', skillId: null }]);
  });

  it('T19/N2②（方案 §4）：无选中点移动中敌演出位=零派发+「目标移动中」反馈（双通道并存）；dead/我方不拦', () => {
    const view = makeViewForInput();
    view.skillPop = 0;
    view.layout.skillBtns = [];
    const sent: Array<Record<string, unknown>> = [];
    let blocked = '';
    const input = createBattleInput({
      dispatch: (r) => sent.push(r as Record<string, unknown>),
      onBlocked: (m) => (blocked = m),
    });
    const mover: SnapshotActor = {
      id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 5, r: 6 }, renderPos: { q: 4.2, r: 6.5 },
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left', facingHex: 'left',
      animState: 'walk', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
    };
    const snap = makeSnapshot([hero, mover]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    snap.moveCells = []; // 演出位量化格 ∉ 绿格（否则走移动意图分支）
    // 可视位量化与绘制/点击同链（禁自造取整）：worldToHex(wx, wy) 双参签名，组合式分两步展开
    const vis = worldToHex(hexToWorld(mover.renderPos.q, mover.renderPos.r).x, hexToWorld(mover.renderPos.q, mover.renderPos.r).y);
    updateView(view, snap, 0.016, 375, 667); // 驱动一帧：真实页面同一帧即启动 FE 演出
    expect(view.moveAnims.has('e1')).toBe(true); // 前置：session 轨（renderPos≠pos）+FE 轨并存
    const center = (c: HexPos) => {
      const cw = hexToWorld(c.q, c.r);
      return { x: cw.x + 375 / 2 - view.camera.x, y: cw.y + 667 / 2 - view.camera.y };
    };
    const p = center(vis);
    // ① 拦截面：零派发 + onBlocked('目标移动中')、选中保持（本就无选中）
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([]);
    expect(blocked).toBe('目标移动中');
    // ② dead 排除：同几何敌已亡（moveAnims 残留）→ 不走新分支，零反馈零派发
    blocked = '';
    const moverInSnap = snap.actors.find((a) => a.id === 'e1')!; // makeSnapshot 是拷贝，须改快照内份身
    moverInSnap.animState = 'dead';
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([]);
    expect(blocked).toBe('');
    // ③ 我方排除：友军演出位点击不拦（无选中态落既有分支语义=无操作）
    mover.animState = 'walk';
    const ally: SnapshotActor = {
      ...hero, id: 'ally', pos: { q: 8, r: 4 }, renderPos: { q: 7.4, r: 4.5 }, animState: 'walk',
    };
    snap.actors = [hero, mover, ally];
    const avis = worldToHex(hexToWorld(ally.renderPos.q, ally.renderPos.r).x, hexToWorld(ally.renderPos.q, ally.renderPos.r).y);
    const ap = center(avis);
    input.down(view, snap, ap.x, ap.y, 375, 667);
    input.up(view, snap, ap.x, ap.y, 375, 667);
    expect(sent).toEqual([]);
    expect(blocked).toBe('');
  });

  it('T19/N2②（方案 §4.3 分支序）：敌演出位飘在绿格上 → 无选中点击仍派发移动（移动意图优先，不拦）', () => {
    const view = makeViewForInput();
    view.skillPop = 0;
    view.layout.skillBtns = [];
    const sent: Array<Record<string, unknown>> = [];
    let blocked = '';
    const input = createBattleInput({
      dispatch: (r) => sent.push(r as Record<string, unknown>),
      onBlocked: (m) => (blocked = m),
    });
    const mover: SnapshotActor = {
      id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 5, r: 6 }, renderPos: { q: 4.2, r: 6.5 },
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left', facingHex: 'left',
      animState: 'walk', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
    };
    const snap = makeSnapshot([hero, mover]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    // 可视位量化与绘制/点击同链（禁自造取整）：worldToHex(wx, wy) 双参签名，组合式分两步展开
    const vis = worldToHex(hexToWorld(4.2, 6.5).x, hexToWorld(4.2, 6.5).y);
    snap.moveCells = [vis]; // 演出位量化格恰为合法移动格
    const w = hexToWorld(vis.q, vis.r);
    input.down(view, snap, w.x + 375 / 2, w.y + 667 / 2, 375, 667);
    input.up(view, snap, w.x + 375 / 2, w.y + 667 / 2, 375, 667); // camera 未驱动=0,0
    expect(sent).toEqual([{ type: 'move', to: { q: vis.q, r: vis.r } }]);
    expect(blocked).toBe('');
  });

  it('ctrl 三钮行命中映射托管/加速/逃跑', () => {
    const view = makeViewForInput();
    const sent: Array<Record<string, unknown>> = [];
    let mode: 'auto' | 'manual' = 'manual';
    const input = createBattleInput({
      dispatch: (r) => sent.push(r as Record<string, unknown>),
      mode: () => mode,
    });
    const snap = makeSnapshot([hero]);
    // 行高 448/140：三钮 art y 2..130 / 163..289 / 319..446 → ctrl rect 顶起 0/35%/71% 处
    input.down(view, snap, 335, 505, 375, 667);
    input.up(view, snap, 335, 505, 375, 667); // 第一钮
    expect(sent[0]).toMatchObject({ type: 'setMode', mode: 'auto' });
    input.down(view, snap, 335, 555, 375, 667);
    input.up(view, snap, 335, 555, 375, 667); // 第二钮
    expect(sent[1]).toEqual({ type: 'toggleSpeed' });
    input.down(view, snap, 335, 605, 375, 667);
    input.up(view, snap, 335, 605, 375, 667); // 第三钮
    expect(sent[2]).toEqual({ type: 'flee' });
    expect(CTRL_BUTTONS).toHaveLength(3);
  });

  it('D-13/HIT-1 fall-through（ctrl）：外接矩形内、标定矩形外的格中心点击=棋盘受理；图形内仍组件优先', () => {
    const view = makeViewForInput();
    // 取点布点（§七-19：点击点须为「外接矩形内、标定矩形外」的格中心）：屏内格中心分布（sx≥187.5）
    // 与带间隙（art y 130..163）共同约束——ctrlRect.y 由 500 微调至 520（测试自造 mock，不碰生产常量），
    // 使带间隙恰好含 row5 col1 格中心（换算 ay=142.4 ∈ [130,163]、ax=62.1 ∈ 钮 x 带）。
    view.layout.ctrlRect = { x: 300, y: 520, w: 70, h: 140 };
    const sent: Array<Record<string, unknown>> = [];
    let mode: 'auto' | 'manual' = 'manual';
    const input = createBattleInput({ dispatch: (r) => sent.push(r as Record<string, unknown>), mode: () => mode });
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    // 具体取点法：格 row5 col1（axial −1,5）中心屏坐标 hexToWorld(−1,5)+(187.5,333.5)=(319.5,564.5)；
    // 「外接矩形内、标定矩形外」以与实现同源的双条件形式化：inRect(ctrlRect, p) ∧ pickCtrlButton(view,p)=null
    const gapCell: HexPos = { q: -1, r: 5 };
    const gapW = hexToWorld(gapCell.q, gapCell.r);
    const p = { x: gapW.x + 375 / 2, y: gapW.y + 667 / 2 }; // (319.5, 564.5)
    const rect = view.layout.ctrlRect;
    if (!rect) throw new Error('ctrlRect 缺失（mock 布点问题）');
    const inOuter = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    expect(inOuter).toBe(true); // 前置①：外接矩形内
    expect(pickCtrlButton(view, p.x, p.y)).toBeNull(); // 前置②：标定矩形外（带间隙 fall-through 环带）
    snap.moveCells = [gapCell]; // 该格=合法移动格 → fall-through 后应走移动语义
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([{ type: 'move', to: { q: gapCell.q, r: gapCell.r } }]); // 棋盘真受理，未被组件吞
    // 反向对照（HIT-1 正向）：钮实体内一点仍组件命中优先——(335,540) 换算 ax=111.5/ay=64 ∈ 钮1 标定矩形
    sent.length = 0;
    input.down(view, snap, 335, 540, 375, 667);
    input.up(view, snap, 335, 540, 375, 667);
    expect(sent).toEqual([{ type: 'setMode', mode: 'auto' }]);
  });

  it('D-13/HIT-1 fall-through（plaque）：装饰区（横杆/挂绳，不设热区）格中心点击=棋盘受理；牌面内仍组件优先', () => {
    const view = makeViewForInput();
    // 取点布点：屏内格中心 sx≥187.5 与 plaque 装饰区（art y<牌1顶−容差≈155）共同约束——plaqueRect
    // 挪至 {x:124,y:400}（测试自造 mock；尺寸不变）使装饰带含 row2 col0 格中心（换算 ay=112.9<155.4）。
    view.layout.plaqueRect = { x: 124, y: 400, w: 64, h: 156 };
    const sent: Array<Record<string, unknown>> = [];
    const plaques: string[] = [];
    const input = createBattleInput({
      dispatch: (r) => sent.push(r as Record<string, unknown>),
      onPlaque: (label) => plaques.push(label),
    });
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    // 具体取点法：格 row2 col0（axial −1,2）中心 (187.5, 425.9)；「外接矩形内、标定矩形外」同式双条件：
    // inRect(plaqueRect, p) ∧ pickPlaqueButton(view,p)=null（装饰件不设热区 → 装饰区整带皆环带）
    const decorCell: HexPos = { q: -1, r: 2 };
    const decorW = hexToWorld(decorCell.q, decorCell.r);
    const p = { x: decorW.x + 375 / 2, y: decorW.y + 667 / 2 }; // (187.5, 425.9)
    const rect = view.layout.plaqueRect;
    if (!rect) throw new Error('plaqueRect 缺失（mock 布点问题）');
    const inOuter = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    expect(inOuter).toBe(true); // 前置①：外接矩形内
    expect(pickPlaqueButton(view, p.x, p.y)).toBeNull(); // 前置②：装饰区无热区
    snap.moveCells = [decorCell];
    input.down(view, snap, p.x, p.y, 375, 667);
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([{ type: 'move', to: { q: decorCell.q, r: decorCell.r } }]); // 棋盘受理
    expect(plaques).toEqual([]); // 未触发木牌占位反馈（装饰件不吞点击）
    // 反向对照（HIT-1 正向）：牌1 面内点仍组件命中——(157.6, 456.9) 换算 art (162.5, 248.2) ∈ 牌1 标定矩形
    sent.length = 0;
    plaques.length = 0;
    snap.moveCells = [];
    input.down(view, snap, 157.6, 456.9, 375, 667);
    input.up(view, snap, 157.6, 456.9, 375, 667);
    expect(plaques).toEqual(['装备']);
    expect(sent).toEqual([]);
  });

  it('pickCtrlButton/pickPlaqueButton 纯函数命中与 fall-through（pickSkillButton 先例对齐）', () => {
    const view = makeViewForInput();
    view.layout.ctrlRect = { x: 300, y: 520, w: 70, h: 140 };
    view.layout.plaqueRect = { x: 124, y: 400, w: 64, h: 156 };
    // ctrl：三钮图形内各返回 action（art 中心换算屏点）；带间隙/边缘 null（tol=0 裁决：标定矩形本体）
    expect(pickCtrlButton(view, 335, 540)).toBe('mode'); // art (111.5, 64) ∈ 钮1
    expect(pickCtrlButton(view, 335, 590.75)).toBe('speed'); // art (111.5, 226.4) ∈ 钮2
    expect(pickCtrlButton(view, 335, 639.4)).toBe('flee'); // art (111.5, 381.6) ∈ 钮3
    expect(pickCtrlButton(view, 319.5, 564.5)).toBeNull(); // 带间隙 art y=142.4 ∈ [130,163]
    expect(pickCtrlButton(view, 299, 540)).toBeNull(); // 外接矩形外
    // plaque：牌面内返回 label；装饰区 null（容差 0.15×短边 142.8≈21.4 art px，装饰区主体不被吞）
    expect(pickPlaqueButton(view, 157.6, 456.9)).toBe('装备'); // art (162.5, 248.2) ∈ 牌1
    expect(pickPlaqueButton(view, 157.6, 502.1)).toBe('武功'); // art (162.5, 445.4) ∈ 牌2
    expect(pickPlaqueButton(view, 187.5, 425.9)).toBeNull(); // art (307.7, 112.9) 装饰区
  });

  it('pickSkillButton 纯函数命中', () => {
    const view = makeViewForInput();
    expect(pickSkillButton(view, 102, 101)?.id).toBe('te');
    expect(pickSkillButton(view, 400, 400)).toBeNull();
  });
});

// ---------- 渲染烟雾（mock 快照驱动 + Proxy ctx） ----------
function makeSnapshot(parts: Array<Partial<SnapshotActor>>): BattleSnapshot {
  const base: SnapshotActor = {
    id: 'x', side: 'player', name: '单位', pos: { q: 1, r: 8 }, renderPos: { q: 1, r: 8 },
    hp: 50, maxHp: 50, neili: 30, maxNeili: 30, actionBar: 0, facing: 'right', facingHex: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
  };
  return {
    phase: 'fighting',
    turnActorId: null,
    pendingInput: false,
    moveCells: [],
    moveKind: 'walk',
    attackCells: [],
    selectedSkill: null,
    heroSkills: [],
    actors: parts.map((p) => ({ ...base, ...p })),
    cameraTargetId: 'hero',
  };
}

/** T23：全缺图资源包（BattleHexAssets 新结构；缺图降级路径共用，hit-feedback 测同款常量） */
const EMPTY_ASSETS: BattleHexAssets = {
  env: null,
  topbar: null,
  plaque: null,
  ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
  statusIcons: new Map(),
  frames: new Map(),
};

// ---------- A06 roundRect 能力检测（缺图降级占位钮，兼容旧基础库） ----------
/** 路径记录 ctx：withRoundRect=false 时显式缺席 roundRect（旧基础库），其余未声明方法自动补空实现 */
function makePathRecordingCtx(withRoundRect: boolean): {
  ctx: CanvasRenderingContext2D;
  calls: Array<{ op: string; args: unknown[] }>;
} {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const tracked = new Set(['beginPath', 'moveTo', 'arcTo', 'closePath', 'roundRect', 'fill', 'stroke', 'fillText']);
  const ctx = new Proxy(
    {
      canvas: { width: 640, height: 480 },
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      // 有 roundRect 时登记记录版（args 采样用）；无时不声明——get 显式返回 undefined=能力缺席
      ...(withRoundRect
        ? {
            roundRect: (...a: unknown[]) => {
              calls.push({ op: 'roundRect', args: a });
            },
          }
        : {}),
    } as unknown as CanvasRenderingContext2D,
    {
      get(t, prop) {
        if (prop === 'roundRect' && !withRoundRect) return undefined; // A06：能力检测须命中缺席分支
        const rec = t as unknown as Record<string | symbol, unknown>;
        if (prop in rec) return rec[prop];
        const name = String(prop);
        return (...args: unknown[]) => {
          if (tracked.has(name)) calls.push({ op: name, args });
        };
      },
      set() {
        return true;
      },
    },
  );
  return { ctx, calls };
}

describe('A06 roundRect 能力检测（缺图降级占位钮）', () => {
  it('ctx 无 roundRect（旧基础库）：缺脸占位钮走 arcTo 手工路径不抛异常，几何=圆角矩形采样（矩形角偏移 rad），热区/占位字照常', () => {
    const { ctx, calls } = makePathRecordingCtx(false);
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米', animState: 'idle' }]);
    const view = createView();
    updateView(view, snap, 0.016, 640, 480);
    expect(() => drawFrame({ ctx, width: 640, height: 480, dt: 0.016 }, snap, EMPTY_ASSETS, view)).not.toThrow();
    const cr = view.layout.ctrlRect;
    expect(cr).not.toBeNull(); // 热区照常产出（L④ 口径不受 A06 影响）
    // 全帧仅占位钮使用 arcTo：每钮 4 段（手工路径），无 roundRect 调用
    const arcs = calls.filter((c) => c.op === 'arcTo');
    expect(calls.some((c) => c.op === 'roundRect')).toBe(false);
    expect(arcs).toHaveLength(CTRL_BUTTONS.length * 4);
    const near = (v: number, e: number): boolean => Math.abs(v - e) < 1e-6;
    // 逐钮几何采样：x=cx+cw*0.04、w=cw*0.92、rad=min(6, w/2, bh/2)；arcTo 锚点=矩形四角 ± rad
    let ai = 0;
    for (const b of CTRL_BUTTONS) {
      const by = cr!.y + (b.y / CTRL_ART.h) * cr!.h;
      const bh = (b.h / CTRL_ART.h) * cr!.h;
      const x = cr!.x + cr!.w * 0.04;
      const w = cr!.w * 0.92;
      const rad = Math.min(6, w / 2, bh / 2);
      const anchors = [
        [x + w, by, x + w, by + bh, rad],
        [x + w, by + bh, x, by + bh, rad],
        [x, by + bh, x, by, rad],
        [x, by, x + w, by, rad],
      ];
      for (const [ax1, ay1, ax2, ay2, ar] of anchors) {
        const got = arcs[ai++].args as number[];
        expect(near(got[0], ax1) && near(got[1], ay1) && near(got[2], ax2) && near(got[3], ay2) && near(got[4], ar)).toBe(true);
      }
      // 路径起点 = 左上角圆弧起点 (x+rad, by)
      const moves = calls.filter((c) => c.op === 'moveTo').map((c) => c.args as number[]);
      expect(moves.some((m) => near(m[0], x + rad) && near(m[1], by))).toBe(true);
    }
    // 占位字仍绘制（功能不缺位）
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
    expect(texts).toEqual(expect.arrayContaining(['托管', '加速', '逃跑']));
  });

  it('ctx 有 roundRect：能力检测直通零行为变化——逐钮参数锁定 (cx+cw*0.04, by, cw*0.92, bh, 6) 且零 arcTo', () => {
    const { ctx, calls } = makePathRecordingCtx(true);
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米', animState: 'idle' }]);
    const view = createView();
    updateView(view, snap, 0.016, 640, 480);
    drawFrame({ ctx, width: 640, height: 480, dt: 0.016 }, snap, EMPTY_ASSETS, view);
    const cr = view.layout.ctrlRect;
    expect(cr).not.toBeNull();
    const rrs = calls.filter((c) => c.op === 'roundRect');
    expect(rrs).toHaveLength(CTRL_BUTTONS.length);
    expect(calls.some((c) => c.op === 'arcTo')).toBe(false); // 有 roundRect 不走手工路径
    let i = 0;
    for (const b of CTRL_BUTTONS) {
      const by = cr!.y + (b.y / CTRL_ART.h) * cr!.h;
      const bh = (b.h / CTRL_ART.h) * cr!.h;
      expect(rrs[i++].args).toEqual([cr!.x + cr!.w * 0.04, by, cr!.w * 0.92, bh, 6]);
    }
  });
});

// ---------- A07 指针生命周期（同指针配对 + cancel/blur 重置 + 无 down up 忽略） ----------
describe('A07 指针生命周期（同指针配对 + cancel/blur 重置 + 无 down up 忽略）', () => {
  const heroA: SnapshotActor = {
    id: 'hero', side: 'player', name: '小虾米', pos: { q: 1, r: 8 }, renderPos: { q: 1, r: 8 },
    hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 100, facing: 'right', facingHex: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
  };
  const enemyA: SnapshotActor = {
    id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 3, r: 7 }, renderPos: { q: 3, r: 7 },
    hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left', facingHex: 'left',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
  };

  it('无有效 down 的 up=忽略：零派发、状态不变（A07 核实：原实现真处理点击 → 本卡改忽略并锁死）', () => {
    const view = makeViewForInput();
    const sent: Array<Record<string, unknown>> = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r as Record<string, unknown>) });
    const snap = makeSnapshot([heroA, enemyA]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    input.up(view, snap, 100, 100, 375, 667); // 直接 up（无 down）：弧钮 te 位置
    expect(sent).toEqual([]); // 非配对释放不产生点击
    expect(input.pointer.down).toBe(false);
    expect(input.pointer.dragging).toBe(false);
  });

  it('tracker 配对：首指受理、第二指 down 忽略、id 不匹配 move/up 忽略、匹配 release 清归属', () => {
    const t = createPointerTracker();
    expect(t.activeId).toBeNull();
    expect(t.down(7)).toBe(true); // 首指受理
    expect(t.activeId).toBe(7);
    expect(t.down(8)).toBe(false); // 多指交叉：第二指忽略
    expect(t.owns(7)).toBe(true);
    expect(t.owns(8)).toBe(false); // 非活动指 move 忽略
    expect(t.release(8)).toBe(false); // id 不匹配 up 忽略
    expect(t.release(99)).toBe(false); // 无关 id 不影响活动态
    expect(t.activeId).toBe(7);
    expect(t.release(7)).toBe(true); // 匹配 up=结算并清归属
    expect(t.activeId).toBeNull();
    expect(t.owns(7)).toBe(false);
    expect(t.release(7)).toBe(false); // 迟到重复 up=忽略
  });

  it('tracker 同 id 重复 down=丢失 up 自愈重锚（桌面鼠标 pointerId 恒定）；他指仍被拒', () => {
    const t = createPointerTracker();
    expect(t.down(1)).toBe(true);
    expect(t.down(1)).toBe(true); // 同 id 重复 down（丢失 up 后再按）
    expect(t.down(2)).toBe(false);
  });

  it('cancel 组合语义（宿主接线同款）：拖动中 cancel → 拖动态清零、move 不再平移、迟到 up 零点击、新指正常', () => {
    const view = makeViewForInput();
    const sent: Array<Record<string, unknown>> = [];
    const input = createBattleInput({ dispatch: (r) => sent.push(r as Record<string, unknown>) });
    const ptr = createPointerTracker();
    const snap = makeSnapshot([heroA, enemyA]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    // down(5) → 拖动超阈（camDrag 平移，L⑤ 既有口径零回归锚）
    ptr.down(5);
    input.down(view, snap, 100, 100, 375, 667);
    input.move(view, 130, 120);
    expect(input.pointer.dragging).toBe(true);
    expect(view.camDrag.x).toBe(-30);
    // pointercancel(5)：tracker release 匹配 → input.reset()
    expect(ptr.release(5)).toBe(true);
    input.reset();
    expect(input.pointer.down).toBe(false);
    expect(input.pointer.dragging).toBe(false);
    // cancel 后 move 不再平移（守卫 pointer.down）
    input.move(view, 150, 140);
    expect(view.camDrag.x).toBe(-30);
    // 迟到 up(5)：tracker 已清 → 忽略；即便误调 input.up 亦被无 down 守卫拦截 → 零派发
    expect(ptr.release(5)).toBe(false);
    input.up(view, snap, 130, 120, 375, 667);
    expect(sent).toEqual([]);
    // 新一指 down(9) 正常受理 → 点击恢复派发（弧钮 te）
    expect(ptr.down(9)).toBe(true);
    input.down(view, snap, 100, 100, 375, 667);
    input.up(view, snap, 100, 100, 375, 667);
    expect(sent).toEqual([{ type: 'selectSkill', skillId: 'te' }]);
  });

  it('blur 语义：tracker.reset + input.reset 全清（拖镜中失焦不残留）', () => {
    const view = makeViewForInput();
    const input = createBattleInput({ dispatch: () => {} });
    const ptr = createPointerTracker();
    const snap = makeSnapshot([heroA]);
    ptr.down(3);
    input.down(view, snap, 100, 100, 375, 667);
    input.move(view, 130, 120);
    expect(input.pointer.dragging).toBe(true);
    ptr.reset(); // 宿主 blur 处理器同款组合
    input.reset();
    expect(ptr.activeId).toBeNull();
    expect(input.pointer.down).toBe(false);
    expect(input.pointer.dragging).toBe(false);
  });
});

describe('渲染烟雾（Proxy ctx 计数）', () => {
  it('快照驱动全层绘制：格子/棋子/HUD/组件/结算遮罩均产生调用', () => {
    const calls: Record<string, number> = {};
    const fills: string[] = [];
    const ctx = new Proxy(
      {
        canvas: { width: 375, height: 667 },
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D,
      {
        get(t, prop) {
          const rec = t as unknown as Record<string | symbol, unknown>;
          if (prop in rec) return rec[prop];
          calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
          return () => {};
        },
        set(t, prop, v) {
          if (prop === 'fillStyle') fills.push(String(v));
          return true;
        },
      },
    );
    const snap = makeSnapshot([
      { id: 'hero', name: '小虾米', animState: 'idle', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 } },
      { id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 6, r: 7 }, renderPos: { q: 6, r: 7 }, spriteKey: 'npc-shanzei' },
    ]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    snap.moveCells = [{ q: 4, r: 9 }, { q: 3, r: 9 }, { q: 5, r: 9 }];
    snap.heroSkills = [
      { id: 'te', label: '特', disabled: false },
      { id: 'jue', label: '绝', disabled: true },
    ];
    const img = { width: 128, height: 256 };
    const assets: BattleHexAssets = {
      env: img,
      topbar: { width: 1440, height: 300 },
      plaque: { width: 310, height: 757 },
      // T23：三脸给实尺寸（切图=钮本体 1:1）走有脸分支；图标空 Map=恒空槽（MVP）
      ctrlFaces: { tuoguan: { width: 216, height: 128 }, jiasu: { width: 213, height: 126 }, flee: { width: 213, height: 127 } },
      statusIcons: new Map(),
      // 六向帧接线机械适配：hero 切 directional 帧库（断言语义不变——仍为「棋子帧绘制」）；
      // npc-shanzei 保持 legacy 8 帧条
      frames: new Map<string, LegacyFrameStrip | DirectionalFrameStore>([
        ['hero', makeHeroStore()],
        ['npc-shanzei', [img, img, img, img, img, img, img, img]],
      ]),
    };
    const view = createView();
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(calls.drawImage).toBeGreaterThan(5); // env+棋子帧+三组件（T23 起 ctrl 逐钮三脸+顶栏）
    // T23 语义更新（先例 ATK-2 :330 随卡改写）：两名字(2)+弧钮字(4)+顶栏三字(名字/两百分比=3)+ctrl 代码字
    // （托管/加速各=阴影垫底+主字 2 次 fillText → 4）= 13
    expect(calls.fillText).toBeGreaterThanOrEqual(13);
    expect(view.layout.skillBtns).toHaveLength(ARC_BTNS.ids.length);
    expect(view.layout.skillBtns.find((b) => b.id === 'jue')?.disabled).toBe(true); // 置灰=会话真值（F2）
    expect(view.layout.ctrlRect).not.toBeNull();
    // 联调 F1：moveKind='jump' → 移动格金色高亮（fillStyle 出现 jump 金）
    snap.moveKind = 'jump';
    fills.length = 0;
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(fills).toContain('rgba(245, 205, 70, 0.45)');
    // walk 态则不出现金色移动高亮
    snap.moveKind = 'walk';
    fills.length = 0;
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(fills).not.toContain('rgba(245, 205, 70, 0.45)');
  });

  it('L 环终验根因 B：BFS 绕行路径——路径不含占用格，分段采样连续不穿模', () => {
    // 纵向直线 col 5，row 5..8，中间 (5,6) 被占 → 必须绕行
    const from: HexPos = { q: 5 - 3, r: 5 }; // col 5? q=col-⌊r/2⌋=5-2=3
    const to: HexPos = { q: 5 - 4, r: 8 }; // col 5, row 8 → q=1
    const occupied = new Set(['5,6']); // col 5, row 6
    const path = computeMovePath(from, to, occupied);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    const inPath = path.some((c) => c.q === 5 && c.r === 6);
    expect(inPath).toBe(false); // 不穿占格
    // 路径逐段相邻（6 邻）
    for (let i = 1; i < path.length; i++) {
      const dq = path[i].q - path[i - 1].q;
      const dr = path[i].r - path[i - 1].r;
      expect(Math.abs(dq + dr)).toBeLessThanOrEqual(1);
    }
    // 分段采样连续：像素序列相邻差 ≤ 半格宽，且不进入占格中心（格中心像素）
    const ma = { from, pos: to, path, pathPx: path.map((c) => hexToWorld(c.q, c.r)), t: 0, duration: 0.9, hopHeight: 0 };
    const occPx = hexToWorld(5, 6); // 占格中心像素
    let last = ma.pathPx[0];
    for (let t = 0; t <= 900; t += 30) {
      ma.t = t / 1000;
      const pos = moveAnimDrawPosPx(ma);
      expect(Math.hypot(pos.x - last.x, pos.y - last.y)).toBeLessThan(TILE_W); // 帧间步进 < 1 格宽
      const dOcc = Math.hypot(pos.x - occPx.x, pos.y - occPx.y);
      expect(dOcc).toBeGreaterThan(6); // 不贴占格中心（>6px）
      last = pos;
    }
  });

  it('L 环终验：walk 空场直线优先——无遮挡时走 hex 直线（不长甩锯齿绕行）', () => {
    const from: HexPos = { q: 3, r: 5 }; // col 5, row 5
    const to: HexPos = { q: 1, r: 8 }; // col 5, row 8
    const path = computeMovePath(from, to, new Set());
    expect(path).toHaveLength(hexDist(from, to) + 1); // 直线=距离+1 格，非 BFS 等距多解
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('L 环终验：jump 凌空飞越——中间单位不构成阻挡，恒走直线（Leo 09-02 轻功绕行缺陷回归锁）', () => {
    const from: HexPos = { q: 3, r: 5 }; // col 5, row 5
    const to: HexPos = { q: 1, r: 8 }; // col 5, row 8
    const occupied = new Set(['5,6']); // 直线正中占格
    const path = computeMovePath(from, to, occupied, true);
    expect(path).toHaveLength(hexDist(from, to) + 1); // 直线长度（未被绕行加长）
    // 直线穿越占格 (col5,row6)=axial(2,6)——飞越而非绕开
    expect(path.some((c) => c.q === 2 && c.r === 6)).toBe(true);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('L④ 组件资源失败时代码占位兜底：热区照常产出（托管/加速/逃跑永不消失）', () => {
    const calls: Record<string, number> = {};
    const ctx = new Proxy(
      {
        canvas: { width: 375, height: 667 },
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D,
      {
        get(t, prop) {
          const rec = t as unknown as Record<string | symbol, unknown>;
          if (prop in rec) return rec[prop];
          calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
          return () => {};
        },
        set() {
          return true;
        },
      },
    );
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米', animState: 'idle' }]);
    const emptyAssets: BattleHexAssets = EMPTY_ASSETS; // T23：全缺图资源包（新结构共用常量）
    const view = createView();
    // 非常规比例（宽窗 640×480）：ctrl 恒贴右下且完整在屏内
    updateView(view, snap, 0.016, 640, 480);
    drawFrame({ ctx, width: 640, height: 480, dt: 0.016 }, snap, emptyAssets, view);
    const cr = view.layout.ctrlRect;
    expect(cr).not.toBeNull();
    expect(cr!.x).toBeGreaterThanOrEqual(0);
    expect(cr!.x + cr!.w).toBeLessThanOrEqual(640);
    expect(cr!.y).toBeGreaterThanOrEqual(0);
    expect(cr!.y + cr!.h).toBeLessThanOrEqual(480);
    // 三钮逐行在屏（L 环二反馈②：加速/逃跑不许溢出/重叠消失）
    for (const row of CTRL_BUTTONS) {
      const rowTop = cr!.y + (row.y / CTRL_ART.h) * cr!.h;
      const rowBottom = cr!.y + ((row.y + row.h) / CTRL_ART.h) * cr!.h;
      expect(rowTop).toBeGreaterThanOrEqual(0);
      expect(rowBottom).toBeLessThanOrEqual(480);
      expect(cr!.x).toBeGreaterThanOrEqual(0);
      expect(cr!.x + cr!.w).toBeLessThanOrEqual(640);
    }
    const pr = view.layout.plaqueRect;
    expect(pr).not.toBeNull();
    expect(pr!.x + pr!.w).toBeLessThanOrEqual(640);
    expect(pr!.y + pr!.h).toBeLessThanOrEqual(480);
    // T23 语义更新（先例 ATK-2 :330 随卡改写）：占位牌文字（装备/武功=2）+占位钮文字（托管/加速/逃跑=3）
    expect(calls.fillText).toBeGreaterThanOrEqual(5);
  });



  it('Leo 实测反馈：跳跃参数随距离插值（基准 2 格，每 +1 格 +0.15s/+25%，封顶）', () => {
    const p2 = jumpParamsFor(2);
    expect(p2.duration).toBeCloseTo(JUMP.baseDuration, 6);
    expect(p2.height).toBe(JUMP.baseHeight); // 基准不变
    const p4 = jumpParamsFor(4); // +2 格：0.6+0.15×2 / 88×(1+0.25×2)
    expect(p4.duration).toBeCloseTo(0.9, 6);
    expect(p4.height).toBeCloseTo(132, 6);
    const pMax = jumpParamsFor(10); // 封顶
    expect(pMax.duration).toBe(JUMP.maxDuration);
    expect(pMax.height).toBe(JUMP.maxHeight);
    expect(hexDist({ q: 0, r: 0 }, { q: 4, r: 0 })).toBe(4);
    // 渲染侧：上升沿按距离锁定参数
    const view = createView();
    const snap = makeSnapshot([{ id: 'hero', animState: 'walk', isJump: true, pos: { q: 4, r: 8 }, renderPos: { q: 1, r: 8 } }]);
    updateView(view, snap, 0.016, 375, 667);
    const ma = view.moveAnims.get('hero');
    const expectP = jumpParamsFor(hexDist({ q: 4, r: 8 }, { q: 1, r: 8 }));
    expect(ma?.duration).toBeCloseTo(expectP.duration, 6);
    expect(ma?.hopHeight).toBeCloseTo(expectP.height, 6);
  });

  it('T15 R3 rejected 消费：spawnNoteFx 头顶冒字（上浮渐隐，寿命到即亡）', () => {
    const view = createView();
    spawnNoteFx(view, 100, 200, '行动条未就绪');
    expect(view.fx).toHaveLength(1);
    expect(view.fx[0].kind).toBe('note');
    expect(view.fx[0].text).toBe('行动条未就绪');
    const snap = makeSnapshot([{ id: 'hero', animState: 'idle' }]);
    const calls: Record<string, number> = {};
    const ctx = new Proxy(
      {
        canvas: { width: 375, height: 667 },
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D,
      {
        get(t, prop) {
          const rec = t as unknown as Record<string | symbol, unknown>;
          if (prop in rec) return rec[prop];
          calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
          return () => {};
        },
        set() {
          return true;
        },
      },
    );
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, EMPTY_ASSETS, view);
    expect(calls.fillText).toBeGreaterThanOrEqual(1); // 冒字绘制
    updateView(view, snap, 1.2, 375, 667); // 超寿命
    expect(view.fx.some((f) => f.kind === 'note')).toBe(false); // 消亡
  });
});

// ---------- T23 战斗 UI 实装（顶栏真实化 + 状态图标接口 + ctrl 三钮独立；V1/V2/V4 单测列） ----------
/** 实参探针（T23 新基建）：既有烟雾/hit-feedback 探针只记调用次数或属性写——V1 条宽 / V2 图标位 /
 * V4 三脸坐标断言需方法实参级采样；strokeStyle 全帧集（金框正向 + 绿 rim 负向锁）与渐变两停色值同源记录。 */
interface ArgProbe {
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  imgs: Array<{ x: number; y: number; w: number; h: number; img?: unknown }>;
  texts: string[];
  strokeStyles: string[];
  fillStyles: string[];
  gradients: Array<{ x0: number; y0: number; x1: number; y1: number; stops: Array<[number, string]> }>;
  ops: string[]; // 绘制方法调用序（T24 V3 层级/clip 计数断言用）
}
function makeArgProbeCtx(): { ctx: CanvasRenderingContext2D; probe: ArgProbe } {
  const probe: ArgProbe = { rects: [], imgs: [], texts: [], strokeStyles: [], fillStyles: [], gradients: [], ops: [] };
  const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
  const base = {
    canvas: { width: 375, height: 667 },
    measureText: (): { width: number } => ({ width: 10 }),
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      const g = { x0, y0, x1, y1, stops: [] as Array<[number, string]> };
      probe.gradients.push(g);
      return { addColorStop: (o: number, c: string): void => void g.stops.push([o, String(c)]) };
    },
  } as unknown as CanvasRenderingContext2D;
  const ctx = new Proxy(base, {
    get(t, prop) {
      const rec = t as unknown as Record<string | symbol, unknown>;
      if (prop in rec) return rec[prop];
      return (...args: unknown[]): void => {
        probe.ops.push(String(prop));
        if (prop === 'fillRect') probe.rects.push({ x: num(args[0]), y: num(args[1]), w: num(args[2]), h: num(args[3]) });
        else if (prop === 'drawImage') probe.imgs.push({ x: num(args[1]), y: num(args[2]), w: num(args[3]), h: num(args[4]), img: args[0] });
        else if (prop === 'fillText' || prop === 'strokeText') probe.texts.push(String(args[0]));
      };
    },
    set(t, prop, v) {
      if (prop === 'strokeStyle') probe.strokeStyles.push(String(v));
      else if (prop === 'fillStyle') probe.fillStyles.push(String(v));
      return true;
    },
  });
  return { ctx, probe };
}

/** T23 有脸资源包（三脸尺寸=切图实测 216×128 / 213×126 / 213×127，与 CTRL_BUTTONS 逐钮同尺寸 1:1） */
function makeFaceAssets(statusIcons: Array<[string, { width: number; height: number }]> = []): BattleHexAssets {
  return {
    env: null,
    topbar: { width: 1440, height: 300 },
    plaque: null,
    ctrlFaces: { tuoguan: { width: 216, height: 128 }, jiasu: { width: 213, height: 126 }, flee: { width: 213, height: 127 } },
    statusIcons: new Map(statusIcons),
    frames: new Map(),
  };
}

describe('T23 顶栏真实化（V1：代码条/名字/百分比 + topbarHud 镜像）', () => {
  const K = 375 / TOPBAR.artW;
  it('hp=50%/neili=30% 快照：血条填充宽=437×K×0.5±1、内力条=315×K×0.3±1、fillText 含名字与两百分比、渐变纵向两停色值', () => {
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米', hp: 50, maxHp: 100, neili: 30, maxNeili: 100 }]);
    const view = createView();
    const { ctx, probe } = makeArgProbeCtx();
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    // 条矩形按 y/h/x 定位过滤（w 为被断量，防它层矩形混入）
    const redBar = probe.rects.find(
      (r) =>
        Math.abs(r.x - TOPBAR.redFill.x * K) < 1.5 &&
        Math.abs(r.y - TOPBAR.redFill.y * K) < 1.5 &&
        Math.abs(r.h - TOPBAR.redFill.h * K) < 1.5,
    );
    expect(redBar).toBeDefined();
    expect(Math.abs(redBar!.w - TOPBAR.redFill.w * 0.5 * K)).toBeLessThanOrEqual(1);
    const blueBar = probe.rects.find(
      (r) =>
        Math.abs(r.x - TOPBAR.blueFill.x * K) < 1.5 &&
        Math.abs(r.y - TOPBAR.blueFill.y * K) < 1.5 &&
        Math.abs(r.h - TOPBAR.blueFill.h * K) < 1.5,
    );
    expect(blueBar).toBeDefined();
    expect(Math.abs(blueBar!.w - TOPBAR.blueFill.w * 0.3 * K)).toBeLessThanOrEqual(1);
    expect(probe.texts).toContain('小虾米');
    expect(probe.texts).toContain('50%');
    expect(probe.texts).toContain('30%');
    const stops = probe.gradients.flatMap((g) => g.stops.map(([, c]) => c));
    expect(stops).toContain('#e22a23'); // 血条 条顶（采样原稿 rgb(226,42,35)）
    expect(stops).toContain('#931a15'); // 血条 条底
    expect(stops).toContain('#1a94f4'); // 内力 条顶
    expect(stops).toContain('#064faf'); // 内力 条底
    for (const g of probe.gradients) {
      expect(g.x0).toBe(0); // 纵向渐变（同 x，y0→y1）
      expect(g.x1).toBe(0);
      expect(g.y1).toBeGreaterThan(g.y0);
    }
    // 观测面镜像（§2.6 last-drawn）
    expect(view.topbarHud).toMatchObject({ name: '小虾米', hpFrac: 0.5, neiliFrac: 0.3, hpPctText: '50%', neiliPctText: '30%' });
  });

  it('maxHp≤0/maxNeili≤0 防除零：沿 :875 Math.max(1,max) 同式——max=0 视为 1，clamp01 不产生 NaN/Infinity（本例 hp=10→满条 100%）', () => {
    const snap = makeSnapshot([{ id: 'hero', name: '空血者', hp: 10, maxHp: 0, neili: 5, maxNeili: 0 }]);
    const view = createView();
    const { ctx, probe } = makeArgProbeCtx();
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    const redBar = probe.rects.find(
      (r) =>
        Math.abs(r.x - TOPBAR.redFill.x * K) < 1.5 &&
        Math.abs(r.y - TOPBAR.redFill.y * K) < 1.5 &&
        Math.abs(r.h - TOPBAR.redFill.h * K) < 1.5,
    );
    expect(redBar).toBeDefined();
    expect(redBar!.w).toBe(Math.round(TOPBAR.redFill.w * K)); // clamp01(10/1)=1 → 满宽
    expect(Number.isFinite(view.topbarHud.hpFrac)).toBe(true);
    expect(Number.isFinite(view.topbarHud.neiliFrac)).toBe(true);
    expect(view.topbarHud.hpFrac).toBe(1);
    expect(view.topbarHud.neiliFrac).toBe(1);
    expect(view.topbarHud.hpPctText).toBe('100%');
    expect(view.topbarHud.neiliPctText).toBe('100%');
  });
});

describe('T23 状态图标接口（V2：命中才画、恒空=空槽、未知 key 不画）', () => {
  it("['poison','blood'] → 两枚 drawImage 槽 0/1 中心对齐（icon 实际尺寸×K）；['', 'unknown'] → 与恒空基线零差", () => {
    const K = 375 / TOPBAR.artW;
    const run = (statusIcons: string[]): ArgProbe => {
      const snap = makeSnapshot([{ id: 'hero', name: '小虾米', statusIcons }]);
      const view = createView();
      const { ctx, probe } = makeArgProbeCtx();
      drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets([
        ['poison', { width: 67, height: 67 }],
        ['blood', { width: 72, height: 67 }],
        ['skull', { width: 73, height: 67 }],
      ]), view);
      return probe;
    };
    const centers = TOPBAR.statusSlots.map((s) => ({ x: (s.x + s.w / 2) * K, y: (s.y + s.h / 2) * K }));
    const probe2 = run(['poison', 'blood']);
    for (let i = 0; i < 2; i++) {
      const hit = probe2.imgs.find(
        (m) => Math.abs(m.x + m.w / 2 - centers[i].x) <= 1 && Math.abs(m.y + m.h / 2 - centers[i].y) <= 1,
      );
      expect(hit).toBeDefined();
    }
    const probe0 = run([]);
    const probeU = run(['', 'unknown']);
    expect(probeU.imgs.length).toBe(probe0.imgs.length); // 未知 key 零额外 drawImage
  });
});

describe('T23 ctrl 三钮独立（V4：三脸坐标对表 + 代码字 + 金框激活；绿 rim 负向锁）', () => {
  // 与渲染层同式换算（config 驱动无硬编码）：375×667 下钮条几何
  const ART_AR = CTRL_ART.h / CTRL_ART.w;
  const CW = Math.min(COMPONENT_LAYOUT.ctrl.wRatio * 375, (COMPONENT_LAYOUT.ctrl.maxHRatio * 667) / ART_AR);
  const CH = CW * ART_AR;
  const CX = Math.round(375 - COMPONENT_LAYOUT.ctrl.rightRatio * 375 - CW);
  const CY = Math.round(667 - COMPONENT_LAYOUT.ctrl.bottomRatio * 667 - CH);
  const btnRect = (b: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } => ({
    x: CX + (b.x / CTRL_ART.w) * CW,
    y: CY + (b.y / CTRL_ART.h) * CH,
    w: (b.w / CTRL_ART.w) * CW,
    h: (b.h / CTRL_ART.h) * CH,
  });

  it('三脸 drawImage 逐钮坐标对表（铺满 CTRL_BUTTONS 标定矩形=1:1 换图）；ctrlRect 布局不变', () => {
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米' }]);
    const view = createView();
    const { ctx, probe } = makeArgProbeCtx();
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    for (const b of CTRL_BUTTONS) {
      const r = btnRect(b);
      const hit = probe.imgs.find(
        (m) => Math.abs(m.x - r.x) <= 1 && Math.abs(m.y - r.y) <= 1 && Math.abs(m.w - r.w) <= 1 && Math.abs(m.h - r.h) <= 1,
      );
      expect(hit).toBeDefined();
    }
    expect(view.layout.ctrlRect).toEqual({ x: CX, y: CY, w: CW, h: CH });
  });

  it("uiState.mode='auto' → 『自动』+金框；speed=true → 『两倍』+『托管』常态字；常态无金框；绿 rim 串全帧零出现", () => {
    const snap = makeSnapshot([{ id: 'hero', name: '小虾米' }]);
    const view = createView();
    view.uiState = { mode: 'auto' };
    const { ctx, probe } = makeArgProbeCtx();
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    expect(probe.texts).toContain('自动');
    expect(probe.strokeStyles).toContain(CTRL_ACTIVE.goldFrame);
    expect(view.topbarHud.ctrlActive).toEqual({ mode: true, speed: false });
    // 加速激活（mode 回落 → 托管常态字）
    view.uiState = { speed: true };
    const run2 = makeArgProbeCtx();
    drawFrame({ ctx: run2.ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    expect(run2.probe.texts).toContain('两倍');
    expect(run2.probe.texts).toContain('托管');
    expect(view.topbarHud.ctrlActive).toEqual({ mode: false, speed: true });
    // 绿 rim 负向锁：现行 'rgba(160, 240, 160, 0.9)' 在激活帧 strokeStyle 集零出现（整段删除的回归锁）
    expect(probe.strokeStyles).not.toContain('rgba(160, 240, 160, 0.9)');
    expect(run2.probe.strokeStyles).not.toContain('rgba(160, 240, 160, 0.9)');
    // 常态：托管/加速、无金框
    view.uiState = {};
    const run3 = makeArgProbeCtx();
    drawFrame({ ctx: run3.ctx, width: 375, height: 667, dt: 0.016 }, snap, makeFaceAssets(), view);
    expect(run3.probe.texts).toContain('托管');
    expect(run3.probe.texts).toContain('加速');
    expect(run3.probe.strokeStyles).not.toContain(CTRL_ACTIVE.goldFrame);
  });
});

// ---------- T24 战斗场景融合（env 入世界系 + v8 缺角 + 台面落地；方案 §三 V 断言单测列） ----------
describe('T24 场景融合（方案 §三）', () => {
  const envImg = { width: 1088, height: 1920 }; // battle_env_pure.png 实际尺寸
  const envAssets = (): BattleHexAssets => ({ ...EMPTY_ASSETS, env: envImg });
  const heroSnap = (): BattleSnapshot =>
    makeSnapshot([{ id: 'hero', animState: 'idle', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 } }]);

  it('V1 env 随动：cam 平移 Δ → env drawImage 实参同步平移 −Δ（1:1 同源、同 cam 变换式、cover 非满屏）', () => {
    const er = envWorldRect(375, 667);
    const draw = (cam: { x: number; y: number }): { x: number; y: number; w: number; h: number } => {
      const view = createView();
      view.camera = cam; // drawFrame 直读 view.camera 作为 cam（与格子同源）
      const { ctx, probe } = makeArgProbeCtx();
      drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, heroSnap(), envAssets(), view);
      const m = probe.imgs.find((i) => i.img === envImg);
      expect(m).toBeDefined();
      return m!;
    };
    const a = draw({ x: 100, y: 50 });
    const b = draw({ x: 160, y: 110 });
    expect(b.x - a.x).toBe(-60); // Δcam=(60,60) → env sx/sy 各 −60（整数 cam 下 Math.round 无差）
    expect(b.y - a.y).toBe(-60);
    // 同一变换式核对：sx = er.x − cam.x + width/2（±1 容差=drawImg 取整）
    expect(Math.abs(a.x - (er.x - 100 + 375 / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y - (er.y - 50 + 667 / 2))).toBeLessThanOrEqual(1);
    // cover 式铺满 envRect（>屏宽=非满屏钉屏）
    expect(Math.abs(a.w - er.w)).toBeLessThanOrEqual(1);
    expect(a.w).toBeGreaterThan(375);
    expect(a.h).toBeGreaterThan(667);
  });

  it('V2 全域覆盖：四档屏尺寸（含极端宽窗）×镜头钳制域四角，屏面 world 投影 ⊆ envRect（不露底色）', () => {
    for (const [w, h] of [
      [375, 667],
      [900, 700],
      [640, 480],
      [1200, 400], // 极端宽窗：钳制退化为中心居中，也须被 envRect 覆盖
    ]) {
      const er = envWorldRect(w, h);
      const snap = heroSnap();
      snap.cameraTargetId = 'hero';
      for (const [dx, dy] of [
        [-9999, -9999],
        [9999, -9999],
        [-9999, 9999],
        [9999, 9999],
        [0, 0],
      ]) {
        const cam = computeCamera(snap, { x: dx, y: dy }, w, h);
        expect(cam.x - w / 2).toBeGreaterThanOrEqual(er.x - 0.01);
        expect(cam.x + w / 2).toBeLessThanOrEqual(er.x + er.w + 0.01);
        expect(cam.y - h / 2).toBeGreaterThanOrEqual(er.y - 0.01);
        expect(cam.y + h / 2).toBeLessThanOrEqual(er.y + er.h + 0.01);
      }
    }
  });

  it('V3 层级正确：env=全帧首个 drawImage 且在 clip 之前；战区矩形 clip 已撤（全帧 clip=1 仅屏幕裁剪）', () => {
    const view = createView();
    updateView(view, heroSnap(), 0.016, 375, 667); // 镜头首帧定位（真机位）
    const { ctx, probe } = makeArgProbeCtx();
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, heroSnap(), envAssets(), view);
    const envIdx = probe.imgs.findIndex((i) => i.img === envImg);
    expect(envIdx).toBe(0); // env 是全帧第一个 drawImage（层级最底）
    const firstClip = probe.ops.indexOf('clip');
    expect(firstClip).toBeGreaterThan(-1);
    expect(probe.ops.indexOf('drawImage')).toBeLessThan(firstClip); // env 在 clip 之前（不受战区/屏幕裁剪截断）
    expect(probe.ops.filter((o) => o === 'clip')).toHaveLength(1); // 旧战区矩形 clip 已撤——回归锁（Leo 09-04 翻案）
  });

  it('V4 融合观感：dirt 两档色生效且内亮外暗；边缘阴影两层存在；噪点色批量出现且静态（两帧 fill 序列全等）', () => {
    const draw = (): string[] => {
      const view = createView();
      updateView(view, heroSnap(), 0.016, 375, 667);
      const { ctx, probe } = makeArgProbeCtx();
      drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, heroSnap(), envAssets(), view);
      return probe.fillStyles;
    };
    const fills = draw();
    expect(fills).toContain(TILE.topDirtInner);
    expect(fills).toContain(TILE.topDirtOuter);
    // 由内向外渐暗：内档亮度 > 外档亮度（Rec.709 亮度）
    const lum = (hex: string): number => {
      const v = parseInt(hex.slice(1), 16);
      return 0.2126 * ((v >> 16) & 0xff) + 0.7152 * ((v >> 8) & 0xff) + 0.0722 * (v & 0xff);
    };
    expect(lum(TILE.topDirtInner)).toBeGreaterThan(lum(TILE.topDirtOuter));
    // 落地阴影两层（SHADOW 组原串，防浮点拼接漂移）
    expect(fills).toContain(`rgba(${SHADOW.rgb}, ${SHADOW.alpha})`);
    expect(fills).toContain(`rgba(${SHADOW.rgb}, ${SHADOW.alphaDeep})`);
    // 噪点：tintRgb 产出 rgb() 色批量出现（2 变体 ×3 底色族）
    const noiseFills = fills.filter((f) => /^rgb\(\d+, \d+, \d+\)$/.test(f));
    expect(noiseFills.length).toBeGreaterThan(50);
    // 静态不闪：同输入两帧 fillStyle 序列全等（seed=格哈希，禁逐帧随机）
    expect(draw()).toEqual(fills);
  });

  it('v8 缺角形状锁：FIELD 全格/两出生锚不剔；剔除仅限最外两圈非可动格；密度实测 ∈ (10%, 30%)', () => {
    let candidates = 0;
    let removed = 0;
    for (let row = 0; row < BOARD.rows; row++) {
      for (let col = 0; col < BOARD.cols; col++) {
        const q = col - Math.floor(row / 2);
        const movable = isMovableCell({ q, r: row });
        const outerTwo = Math.min(col, BOARD.cols - 1 - col, row, BOARD.rows - 1 - row) < BOARD_SHAPE.rings;
        if (outerTwo && !movable) candidates++;
        if (!isBoardCell(q, row)) {
          removed++;
          expect(movable).toBe(false); // 可动格绝不被剔
          expect(outerTwo).toBe(true); // 剔除仅限最外两圈
        }
      }
    }
    expect(candidates).toBeGreaterThan(0);
    expect(removed / candidates).toBeGreaterThan(0.1); // ~20% 密度带
    expect(removed / candidates).toBeLessThan(0.3);
    // FIELD 全格不剔（出生带=锚 hex 距 ≤3 的可动区格 ⊆ FIELD，battle-session D1 SP-1）
    for (let row = FIELD.rowMin; row <= FIELD.rowMax; row++) {
      for (let col = FIELD.colMin; col <= FIELD.colMax; col++) {
        expect(isBoardCell(col - Math.floor(row / 2), row)).toBe(true);
      }
    }
    expect(isBoardCell(4 - Math.floor(13 / 2), 13)).toBe(true); // 出生锚我方 offset(4,13)
    expect(isBoardCell(11 - Math.floor(2 / 2), 2)).toBe(true); // 出生锚敌方 offset(11,2)
  });

  it('cellHash 确定性：同格跨调用稳定、异格离散；16×16 全板 isBoardCell 两轮全等（逐帧稳定）', () => {
    expect(cellHash(3, 5)).toBe(cellHash(3, 5));
    const seen = new Set<number>();
    for (let r = 0; r < BOARD.rows; r++) {
      for (let col = 0; col < BOARD.cols; col++) {
        seen.add(cellHash(col - Math.floor(r / 2), r));
      }
    }
    expect(seen.size).toBeGreaterThan(240); // 离散性：256 格哈希几乎不撞
    const first: boolean[] = [];
    const second: boolean[] = [];
    for (let r = -2; r <= BOARD.rows + 2; r++) {
      for (let q = -9; q <= 10; q++) {
        first.push(isBoardCell(q, r));
        second.push(isBoardCell(q, r));
      }
    }
    expect(second).toEqual(first);
  });
});

// ---------- T15 契约咬合：真实 battle-session 快照驱动渲染 ----------
describe('T15 契约咬合（真实 session 快照 → 渲染全链）', () => {
  it('createHexBattle 产出的真快照喂入 updateView/drawFrame 跑通且字段形态满足渲染消费', async () => {
    const { createHexBattle } = await import('../systems/battle-session');
    const unit = (over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput => ({
      name: over.id,
      hp: 100,
      maxHp: 100,
      neili: 50,
      maxNeili: 100,
      atk: 10,
      def: 2,
      neigongLevel: 5,
      jimin: 8,
      danshi: 0,
      shizhan: 0,
      pos: { x: 0, y: 0 },
      weapon: 'fist',
      skills: [],
      ...over,
    });
    const session = createHexBattle({
      player: unit({ id: 'hero', side: 'player' }),
      enemies: [unit({ id: 'e1', side: 'enemy' }), unit({ id: 'e2', side: 'enemy' })],
      mode: 'auto',
      seed: 42,
    });
    // 快进若干帧（含 AI 行动），取战斗中真快照
    for (let i = 0; i < 120; i++) session.tick(0.1);
    const snap = session.snapshot();
    expect(snap.phase).toBe('fighting');
    expect(snap.actors.length).toBe(3);
    for (const a of snap.actors) {
      expect(typeof a.spriteKey).toBe('string');
      expect(a.animState).toBeDefined();
      expect(a.renderPos).toBeDefined();
      expect(a.actionBar).toBeGreaterThanOrEqual(0);
    }
    // 真快照 → 渲染全链（Proxy ctx 烟雾）
    const calls: Record<string, number> = {};
    const fills: string[] = [];
    const ctx = new Proxy(
      {
        canvas: { width: 375, height: 667 },
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D,
      {
        get(t, prop) {
          const rec = t as unknown as Record<string | symbol, unknown>;
          if (prop in rec) return rec[prop];
          calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
          return () => {};
        },
        set(t, prop, v) {
          if (prop === 'fillStyle') fills.push(String(v));
          return true;
        },
      },
    );
    const assets: BattleHexAssets = EMPTY_ASSETS; // T23：全缺图资源包（新结构共用常量）
    const view = createView();
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(calls.fillText).toBeGreaterThanOrEqual(3); // 三个单位的名字牌
    expect(calls.beginPath).toBeGreaterThan(0); // 格子/特效路径
    expect(view.layout).toBeDefined();
  });
});

// ---------- mock 会话契约咬合 ----------
describe('mock 会话（契约咬合：ActionRequest 消费 + 快照产出）', () => {
  it('非行动回合拒绝移动；行动回合点可达格移动后回合结束（O1 二选一）', () => {
    const s = createMockSession(42);
    const before = s.snapshot();
    expect(before.phase).toBe('fighting');
    const cell = before.moveCells[0];
    const rej = s.dispatch({ type: 'move', to: cell });
    expect(rej).toBe(false); // pendingInput=false → 拒绝
    // 快进到主角回合
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(0.05);
    expect(s.snapshot().pendingInput).toBe(true);
    const snap = s.snapshot();
    const target = snap.moveCells[0];
    const hero = snap.actors.find((a) => a.id === 'hero');
    expect(s.dispatch({ type: 'move', to: target })).toBe(true);
    expect(hero?.pos).toEqual(target);
    expect(s.snapshot().pendingInput).toBe(false); // 移动后回合结束
  });

  it('selectSkill 校验内力/冷却并产出攻击范围；快照含 heroSkills 置灰数据', () => {
    const s = createMockSession(42);
    for (let i = 0; i < 600 && !s.snapshot().pendingInput; i++) s.tick(0.05);
    const snap = s.snapshot();
    expect(Array.isArray(snap.heroSkills)).toBe(true);
    expect(snap.heroSkills.map((x) => x.id)).toEqual(['te', 'jue', 'qing', 'du']);
    expect(s.dispatch({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.snapshot().selectedSkill).toBe('te');
    // 邻近敌人才有攻击格（出生随机，断言只测字段形态）
    expect(Array.isArray(s.snapshot().attackCells)).toBe(true);
  });

  it('逃跑 → phase=fled（快照契约字段）', () => {
    const s = createMockSession(7);
    expect(s.dispatch({ type: 'flee' })).toBe(true);
    expect(s.snapshot().phase).toBe('fled');
  });
});

// ══════════ 六向帧接线 第一段（hero directional）——《战斗人物六向帧接线方案》§3/§4.1/§6.1 ══════════
// 先红后绿：本节用例随卡新增，断言锚定方案定版（profile/语义 clip/零翻转/legacy 零迁移）。

/** 身份标记测试图（tag 供 drawImage 身份断言；240×320=新帧源画布，128×256=legacy 占位帧画布） */
type TagImg = ImgLike & { tag: string };
const tagImg = (tag: string, width = 240, height = 320): TagImg => ({ width, height, tag });

/** directional 测试专用 actor 工厂（含新契约字段 facingHex；不复用 makeSnapshot base 以隔离本节语义） */
function dirActor(over: Partial<SnapshotActor> = {}): SnapshotActor {
  return {
    id: 'hero', side: 'player', name: '小虾米', pos: { q: 4, r: 8 }, renderPos: { q: 4, r: 8 },
    hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 0, facing: 'right', facingHex: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
    ...over,
  };
}

/** hero directional 帧库（每 key 独立 tag 供 drawImage 身份断言） */
function makeHeroStore(): DirectionalFrameStore {
  const p = SPRITE_PROFILES.hero;
  if (p.mode !== 'directional') throw new Error('hero profile 未切 directional');
  const frames = new Map<string, ImgLike | null>();
  for (const facing of FACINGS) {
    for (const clip of Object.keys(p.clipCounts) as BattleClip[]) {
      if (p.sharedSrc[clip] !== undefined) continue; // 共用帧走 clip 键（只解码一次）
      for (let o = 1; o <= p.clipCounts[clip]; o++) {
        const k = frameKeyOf(clip, facing, o);
        frames.set(k, tagImg(k));
      }
    }
  }
  for (const clip of Object.keys(p.sharedSrc) as BattleClip[]) frames.set(clip, tagImg(clip));
  return { mode: 'directional', frames };
}

/** drawImage/scale/translate 记录 ctx（身份断言用；其余方法自动空实现） */
function makeDrawRecordingCtx(): { ctx: CanvasRenderingContext2D; ops: Array<{ op: string; args: unknown[] }> } {
  const ops: Array<{ op: string; args: unknown[] }> = [];
  const ctx = new Proxy(
    {
      canvas: { width: 375, height: 667 },
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D,
    {
      get(t, prop) {
        const rec = t as unknown as Record<string | symbol, unknown>;
        if (prop in rec) return rec[prop];
        const name = String(prop);
        return (...args: unknown[]) => {
          if (name === 'drawImage' || name === 'scale' || name === 'translate') ops.push({ op: name, args });
        };
      },
      set() {
        return true;
      },
    },
  );
  return { ctx, ops };
}

describe('[六向接线 §3.1] hero directional profile 资源完整性（缺任一声明资源=完整性门红）', () => {
  it('六向 × idle/walk/jump/atk/cast 均解析到存在且互异的独立路径；die=sharedSrc 单路径（总量 61=右31+左镜像30）', () => {
    const p = SPRITE_PROFILES.hero;
    expect(p.mode).toBe('directional');
    const prof = p as DirectionalSpriteProfile;
    const paths = new Set<string>();
    for (const facing of FACINGS) {
      for (const clip of Object.keys(prof.clipCounts) as BattleClip[]) {
        if (clip === 'die') continue; // die 走 sharedSrc 共用
        for (let o = 1; o <= prof.clipCounts[clip]; o++) {
          const src = prof.frameSrc(clip, facing, o);
          expect(existsSync(path.join(ROOT, src))).toBe(true); // 声明即存在（缺图占位≠通过）
          paths.add(src);
        }
      }
    }
    expect(paths.size).toBe(60); // 独立路径互异：6+12+12+12+18
    expect(prof.sharedSrc.die).toBeTruthy();
    expect(existsSync(path.join(ROOT, prof.sharedSrc.die as string))).toBe(true); // die_common 六向共用
  });

  it('clipCounts 基线：idle1/walk2/jump2/atk2/cast3/die1（T45 已交付口径）', () => {
    const prof = SPRITE_PROFILES.hero as DirectionalSpriteProfile;
    expect(prof.clipCounts).toEqual({ idle: 1, walk: 2, jump: 2, atk: 2, cast: 3, die: 1 });
  });

  it('hero stateMap（§3.2 帧序表）：basic→atk1→2 / charge→cast1 / strike→cast2→3 / hit 休眠→idle1 / dead→die1', () => {
    const m = (SPRITE_PROFILES.hero as DirectionalSpriteProfile).stateMap;
    expect(m.idle).toEqual({ clip: 'idle', from: 1, to: 1 });
    expect(m.walk).toEqual({ clip: 'walk', from: 1, to: 2 });
    expect(m.basic).toEqual({ clip: 'atk', from: 1, to: 2 });
    expect(m.charge).toEqual({ clip: 'cast', from: 1, to: 1 });
    expect(m.strike).toEqual({ clip: 'cast', from: 2, to: 3 });
    expect(m.hit).toEqual({ clip: 'idle', from: 1, to: 1 }); // 休眠态无专用素材（§3.2）
    expect(m.dead).toEqual({ clip: 'die', from: 1, to: 1 });
  });

  it('npc-shanzei 保持 legacy：mode/frameCount 8/路径族零迁移（第一段不接敌型，§3.1）', () => {
    const p = SPRITE_PROFILES['npc-shanzei'];
    expect(p.mode).toBe('legacy');
    if (p.mode !== 'legacy') return;
    expect(p.frameCount).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(p.frameSrc(i)).toBe(`assets/ui/frames/battle/spr_shanzei/spr_shanzei_0${i}_transparent.png`);
    }
  });
});

describe('[六向接线 §3.2] directional 选帧语义（frameOf 升级：语义 clip 解析 + 时钟取 ordinal）', () => {
  it('charge 恒 cast1；strike cast2→cast3；basic atk1→atk2 播至尾帧保持（anim 钟驱动）', () => {
    const view = createView();
    const charge = dirActor({ animState: 'charge' });
    let snap = makeSnapshot([charge]);
    updateView(view, snap, 0.05, 375, 667);
    updateView(view, snap, 0.2, 375, 667); // 钟累计 0.25s——charge 恒第 1 帧
    expect(directionalFrameOf(view, charge)).toEqual({ clip: 'cast', ordinal: 1 });

    const strike = dirActor({ animState: 'strike' });
    snap = makeSnapshot([strike]);
    updateView(view, snap, 0.016, 375, 667); // 切组重置钟 t=0
    expect(directionalFrameOf(view, strike)).toEqual({ clip: 'cast', ordinal: 2 });
    updateView(view, snap, 0.2, 375, 667); // t≈0.216 > 140ms 一步
    expect(directionalFrameOf(view, strike)).toEqual({ clip: 'cast', ordinal: 3 });

    const basic = dirActor({ animState: 'basic' });
    snap = makeSnapshot([basic]);
    updateView(view, snap, 0.016, 375, 667);
    expect(directionalFrameOf(view, basic)).toEqual({ clip: 'atk', ordinal: 1 });
    updateView(view, snap, 0.2, 375, 667);
    expect(directionalFrameOf(view, basic)).toEqual({ clip: 'atk', ordinal: 2 });
    updateView(view, snap, 2, 375, 667); // 长待机：尾帧保持（组内单播铁律）
    expect(directionalFrameOf(view, basic)).toEqual({ clip: 'atk', ordinal: 2 });
  });

  it('walk 沿演出钟 1↔2 循环（PIECE.walkFrameMs 步频；演出期帧组由 moveAnim 主导）', () => {
    const view = createView();
    const walker = dirActor({ animState: 'walk', pos: { q: 4, r: 8 }, renderPos: { q: 2, r: 8 } });
    const snap = makeSnapshot([walker]);
    updateView(view, snap, 0.016, 375, 667); // walkRise 启动演出
    const ma = view.moveAnims.get('hero')!;
    expect(ma).toBeTruthy();
    ma.t = 0;
    expect(directionalFrameOf(view, walker)).toEqual({ clip: 'walk', ordinal: 1 });
    ma.t = 0.15; // >140ms 一步
    expect(directionalFrameOf(view, walker)).toEqual({ clip: 'walk', ordinal: 2 });
    ma.t = 0.29; // >280ms 两步 → 循环回 1
    expect(directionalFrameOf(view, walker)).toEqual({ clip: 'walk', ordinal: 1 });
  });

  it('跳跃经 moveAnim.t/duration 判段（禁 animState clock）：p<阈值=起跳1，≥阈值=腾空2 至落地', () => {
    const view = createView();
    const jumper = dirActor({
      animState: 'walk', isJump: true, pos: { q: 5, r: 8 }, renderPos: { q: 1, r: 8 },
    });
    const snap = makeSnapshot([jumper]);
    updateView(view, snap, 0.016, 375, 667); // jumpRise 启动
    const ma = view.moveAnims.get('hero')!;
    expect(ma.hopHeight).toBeGreaterThan(0); // 前置：确为跳跃演出
    ma.t = ma.duration * 0.2;
    expect(directionalFrameOf(view, jumper)).toEqual({ clip: 'jump', ordinal: 1 }); // 起跳段
    ma.t = ma.duration * 0.5;
    expect(directionalFrameOf(view, jumper)).toEqual({ clip: 'jump', ordinal: 2 }); // 腾空至落地
    ma.t = ma.duration * 0.999;
    expect(directionalFrameOf(view, jumper)).toEqual({ clip: 'jump', ordinal: 2 }); // 落地前保持
  });

  it('idle→idle1；dead→die（共用，ordinal 1）；hit 休眠态→idle1', () => {
    const view = createView();
    const idle = dirActor({ animState: 'idle' });
    updateView(view, makeSnapshot([idle]), 0.5, 375, 667);
    expect(directionalFrameOf(view, idle)).toEqual({ clip: 'idle', ordinal: 1 });
    const dead = dirActor({ animState: 'dead' });
    updateView(view, makeSnapshot([dead]), 0.1, 375, 667);
    expect(directionalFrameOf(view, dead)).toEqual({ clip: 'die', ordinal: 1 });
    const hit = dirActor({ animState: 'hit' });
    updateView(view, makeSnapshot([hit]), 0.1, 375, 667);
    expect(directionalFrameOf(view, hit)).toEqual({ clip: 'idle', ordinal: 1 });
  });

  it('阈值常量在 config（方案建议 0.35）：PIECE.jumpFrameThreshold', () => {
    expect(PIECE.jumpFrameThreshold).toBe(0.35);
  });
});

describe('[六向接线 §4.1] drawPieces：directional 六向独立 PNG 零翻转 / legacy 保留整图翻转', () => {
  it('hero facingHex=left idle：绘 idle|left|1 帧且全程无 scale(-1,1)', () => {
    const { ctx, ops } = makeDrawRecordingCtx();
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['hero', makeHeroStore()]]) };
    const hero = dirActor({ facing: 'left', facingHex: 'left' });
    const view = createView();
    const snap = makeSnapshot([hero]);
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(ops.filter((o) => o.op === 'scale')).toEqual([]); // 零翻转（§4.1 铁律）
    const pieceDraws = ops.filter((o) => o.op === 'drawImage');
    expect(pieceDraws.some((o) => (o.args[0] as { tag?: string }).tag === 'idle|left|1')).toBe(true);
  });

  it('hero facingHex=rightdown 跳跃中段：绘 jump|rightdown|2（演出钟判段，非 animState）', () => {
    const { ctx, ops } = makeDrawRecordingCtx();
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['hero', makeHeroStore()]]) };
    const hero = dirActor({
      facingHex: 'rightdown', animState: 'walk', isJump: true, pos: { q: 5, r: 8 }, renderPos: { q: 1, r: 8 },
    });
    const view = createView();
    const snap = makeSnapshot([hero]);
    updateView(view, snap, 0.016, 375, 667);
    const ma = view.moveAnims.get('hero')!;
    ma.t = ma.duration * 0.5; // ≥阈值 → 腾空帧
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    const tags = ops.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string }).tag);
    expect(tags).toContain('jump|rightdown|2');
    expect(tags).not.toContain('jump|rightdown|1');
    expect(ops.filter((o) => o.op === 'scale')).toEqual([]);
  });

  it('hero dead：绘 die 共用帧（沿既有压扁淡出路径，六向共用不镜像）', () => {
    const { ctx, ops } = makeDrawRecordingCtx();
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['hero', makeHeroStore()]]) };
    const hero = dirActor({ animState: 'dead', facingHex: 'leftdown' });
    const view = createView();
    const snap = makeSnapshot([hero]);
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    const tags = ops.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string }).tag);
    expect(tags).toContain('die'); // sharedSrc 键=clip 名
    expect(ops.filter((o) => o.op === 'scale')).toEqual([]);
  });

  it('legacy enemy（npc-shanzei）回归锁：idle 取 07 帧 + facing left 保留 ctx.scale(-1,1) 整图翻转', () => {
    const { ctx, ops } = makeDrawRecordingCtx();
    const strip: Array<ImgLike | null> = Array.from({ length: 8 }, (_, i) => tagImg(`spr${i}`, 128, 256));
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['npc-shanzei', strip]]) };
    const foe = dirActor({
      id: 'e1', side: 'enemy', name: '山贼甲', spriteKey: 'npc-shanzei',
      facing: 'left', facingHex: 'leftdown',
    });
    const view = createView();
    const snap = makeSnapshot([foe]);
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    const tags = ops.filter((o) => o.op === 'drawImage').map((o) => (o.args[0] as { tag?: string }).tag);
    expect(tags).toContain('spr7'); // idle=BATTLE_FRAME.idle=7（帧号回归不变）
    const flips = ops.filter((o) => o.op === 'scale' && (o.args[0] as number) === -1);
    expect(flips).toHaveLength(1); // legacy 翻转保留（§4.1：直至该 sprite 完成迁移）
  });

  it('directional 帧库缺帧（null）走剪影占位防崩、不镜像不翻转（缺图≠静默通过——完整性门另行红）', () => {
    const { ctx, ops } = makeDrawRecordingCtx();
    const emptyStore: DirectionalFrameStore = { mode: 'directional', frames: new Map() };
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['hero', emptyStore]]) };
    const hero = dirActor({ facing: 'left', facingHex: 'left' });
    const view = createView();
    const snap = makeSnapshot([hero]);
    updateView(view, snap, 0.016, 375, 667);
    expect(() => drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view)).not.toThrow();
    expect(ops.filter((o) => o.op === 'scale')).toEqual([]); // 占位剪影也不翻转
  });

  it('frameKeyOf 键式=clip|facing|ordinal（渲染/loader/测试单一键式，禁第二套公式）', () => {
    expect(frameKeyOf('walk', 'leftup', 2)).toBe('walk|leftup|2');
    const allKeys: string[] = [];
    for (const facing of FACINGS) for (let o = 1; o <= 2; o++) allKeys.push(frameKeyOf('walk', facing as BattleFacingHex, o));
    expect(new Set(allKeys).size).toBe(12);
  });
});

// ══════════ L 环小修卡：directional 脚底基线锚定格心（主架构验收 09-06 定版）══════════
// 根因：battle45 帧画布 240×320，素材脚底基线 y=300（底部 20px 空白）；旧代码按整画布底(320)落地
// → 人物上浮 h×20/320 ≈ 7.7px（h=TILE_H×2.0=123.2）。修法=directional 以脚底基线锚定格心：
// top = syGround − h×300/320 − hop（落地基准=脚底，非画布底）；legacy 旧帧表脚底在画布底，口径零回归。

describe('[L 环锚点修正] directional 脚底基线 y=300 锚定格心 / legacy 画布底口径零回归', () => {
  const W = 375;
  const H = 667;

  /** 单棋子 idle 静立一帧：取棋子帧 drawImage 实参（x,y,w,h）+ 按渲染同源式换算格心屏 y。
   * 镜头确定性：updateView 首帧 camInit 直定位理想机位（computeCamera 同式），无平滑/拖动噪声。 */
  function drawIdlePiece(frameAssets: BattleHexAssets, actor: SnapshotActor): { dy: number; dh: number; syGround: number } {
    const { ctx, ops } = makeDrawRecordingCtx();
    const view = createView();
    const snap = makeSnapshot([actor]);
    updateView(view, snap, 0.016, W, H);
    drawFrame({ ctx, width: W, height: H, dt: 0.016 }, snap, frameAssets, view);
    const pieceDraws = ops.filter((o) => o.op === 'drawImage' && (o.args[0] as { tag?: string }).tag);
    expect(pieceDraws).toHaveLength(1); // EMPTY_ASSETS 下带 tag 的 drawImage 唯一=棋子帧
    const dy = pieceDraws[0].args[2] as number;
    const dh = pieceDraws[0].args[4] as number;
    const w = hexToWorld(actor.renderPos.q, actor.renderPos.r);
    return { dy, dh, syGround: Math.round(w.y - view.camera.y + H / 2) };
  }

  it('常量锁：PIECE.feetBaselineRatio = 300/320（battle45 帧画布脚底基线 y=300；ADR-004 展示参数口径）', () => {
    expect(PIECE.feetBaselineRatio).toBe(300 / 320);
  });

  it('directional（hero idle）绘制底边 = 格心 y + 高度×(1−feetBaselineRatio)：脚底基线 y=300 恰落格心（drawImage y 实参 = 格心 − 高×300/320）', () => {
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['hero', makeHeroStore()]]) };
    const { dy, dh, syGround } = drawIdlePiece(assets, dirActor()); // 默认 renderPos{q:4,r:8} idle 静立 hop=0
    const h = TILE_H * PIECE.heightPerTile; // 渲染高真源 123.2（drawImg 对 w/h 独立取整 → 绘制 dh=123）
    expect(dh).toBe(Math.round(h));
    expect(dy).toBe(Math.round(syGround - h * PIECE.feetBaselineRatio)); // 主架构验收换算式锁定（旧代码此处=格心−h，红）
    // 绘制底边 = 格心 + 高×(1−ratio)（未取整口径换算式；dy/dh 独立取整 → 容差 ≤1px）
    expect(Math.abs(dy + dh - (syGround + h * (1 - PIECE.feetBaselineRatio)))).toBeLessThanOrEqual(1);
  });

  it('legacy（npc-shanzei idle）零回归锁：绘制底边 = 格心 y（整画布底落地口径不变，旧帧表脚底在画布底）', () => {
    const strip: Array<ImgLike | null> = Array.from({ length: 8 }, (_, i) => tagImg(`spr${i}`, 128, 256));
    const assets: BattleHexAssets = { ...EMPTY_ASSETS, frames: new Map([['npc-shanzei', strip]]) };
    const foe = dirActor({
      id: 'e1', side: 'enemy', name: '山贼甲', spriteKey: 'npc-shanzei',
      facing: 'right', facingHex: 'rightdown', pos: { q: 6, r: 9 }, renderPos: { q: 6, r: 9 },
    });
    const { dy, dh, syGround } = drawIdlePiece(assets, foe);
    const h = TILE_H * PIECE.heightPerTile;
    expect(dh).toBe(Math.round(h));
    expect(dy).toBe(Math.round(syGround - h)); // legacy 口径零变化（修前修后恒绿）
    expect(Math.abs(dy + dh - syGround)).toBeLessThanOrEqual(1); // 绘制底边=格心（dy/dh 独立取整容差）
  });
});
