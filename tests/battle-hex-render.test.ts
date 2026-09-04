// T16 用例：渲染层红线扫描 + 六边形几何 + 帧组播报 + 镜头 + 输入翻译 + mock 快照渲染烟雾 + mock 会话契约咬合
// 运行：npm run test:battle
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// vitest 运行时注入（vite-node）；node:fs / node:path 的最小类型声明见 env.d.ts（全局 ambient）
declare const __dirname: string;
import {
  ANIM_FRAMES,
  ANIM_LOOP_GROUPS,
  ARC_BTNS,
  COMPONENT_LAYOUT,
  CTRL_ACTIVE,
  CTRL_ART,
  CTRL_BUTTONS,
  JUMP,
  ROW_H,
  TILE_W,
  TOPBAR,
  hexDist,
  hexToWorld,
  jumpParamsFor,
} from '../config/battle-hex';
import {
  axialToOffset,
  boardBounds,
  computeCamera,
  computeMovePath,
  movableBounds,
  moveAnimDrawPosPx,
  createView,
  drawFrame,
  isMovableCell,
  pieceHop,
  spawnNoteFx,
  updateView,
  worldToHex,
  type BattleHexAssets,
  type BattleHexView,
} from '../ui/battle-hex-render';
import { createBattleInput, pickCtrlButton, pickPlaqueButton, pickSkillButton } from '../ui/battle-input';
import { createMockSession } from '../proto/battle_demo/mock_session';
import type { BattleSnapshot, CombatantInput, HexPos, SnapshotActor } from '../types';

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
    const b = boardBounds(); // 仍导出：drawCells 战区裁剪用全图包围盒
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
    hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 100, facing: 'right',
    animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
  };
  const enemy: SnapshotActor = {
    id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 3, r: 7 }, renderPos: { q: 3, r: 7 },
    hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left',
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
    input.up(view, snap, 100, 100, 375, 667);
    expect(sent).toEqual([{ type: 'selectSkill', skillId: 'te' }]);
    snap.selectedSkill = 'te';
    input.up(view, snap, 100, 100, 375, 667);
    expect(sent[1]).toEqual({ type: 'cancelSkill' });
    let blocked = '';
    const input2 = createBattleInput({ dispatch: () => {}, onBlocked: (m) => (blocked = m) });
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
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[0]).toMatchObject({ type: 'move', to: { q: 1, r: 9 } });
    // ② 激活 te：点敌逻辑格=派 cast（【T20-FE · 方案 B / ATK-2 v2.0】skill 态点格统一 cast，格上有敌=对敌
    // 结算；方案 §2.5/:339 锚实指本行 :330——行号为写作时快照，经 git 考古语义唯一，PM 裁决 2026-09-03）
    snap.selectedSkill = 'te';
    p = cellCenter({ q: 3, r: 7 });
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[1]).toMatchObject({ type: 'cast', to: { q: 3, r: 7 }, skillId: 'te' });
    // ③ 激活 te：点无效格=取消
    p = cellCenter({ q: 6, r: 12 });
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
      hp: 100, maxHp: 100, neili: 80, maxNeili: 100, actionBar: 100, facing: 'right',
      animState: 'idle', statusIcons: [], isBoss: false, spriteKey: 'hero', isJump: false,
    };
    // 敌逻辑格 (5,6)，动画位 (4.2,6.5)（移动中）——点击逻辑格
    const enemy: SnapshotActor = {
      id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 5, r: 6 }, renderPos: { q: 4.2, r: 6.5 },
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left',
      animState: 'walk', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
    };
    const snap = makeSnapshot([hero, enemy]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    const w = hexToWorld(5, 6);
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
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left',
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
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([]);
    expect(blocked).toBe('目标移动中');
    // ② dead 排除：同几何敌已亡（moveAnims 残留）→ 不走新分支，零反馈零派发
    blocked = '';
    const moverInSnap = snap.actors.find((a) => a.id === 'e1')!; // makeSnapshot 是拷贝，须改快照内份身
    moverInSnap.animState = 'dead';
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
      hp: 60, maxHp: 60, neili: 40, maxNeili: 40, actionBar: 10, facing: 'left',
      animState: 'walk', statusIcons: [], isBoss: false, spriteKey: 'npc-shanzei', isJump: false,
    };
    const snap = makeSnapshot([hero, mover]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    // 可视位量化与绘制/点击同链（禁自造取整）：worldToHex(wx, wy) 双参签名，组合式分两步展开
    const vis = worldToHex(hexToWorld(4.2, 6.5).x, hexToWorld(4.2, 6.5).y);
    snap.moveCells = [vis]; // 演出位量化格恰为合法移动格
    const w = hexToWorld(vis.q, vis.r);
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
    input.up(view, snap, 335, 505, 375, 667); // 第一钮
    expect(sent[0]).toMatchObject({ type: 'setMode', mode: 'auto' });
    input.up(view, snap, 335, 555, 375, 667); // 第二钮
    expect(sent[1]).toEqual({ type: 'toggleSpeed' });
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
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([{ type: 'move', to: { q: gapCell.q, r: gapCell.r } }]); // 棋盘真受理，未被组件吞
    // 反向对照（HIT-1 正向）：钮实体内一点仍组件命中优先——(335,540) 换算 ax=111.5/ay=64 ∈ 钮1 标定矩形
    sent.length = 0;
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
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent).toEqual([{ type: 'move', to: { q: decorCell.q, r: decorCell.r } }]); // 棋盘受理
    expect(plaques).toEqual([]); // 未触发木牌占位反馈（装饰件不吞点击）
    // 反向对照（HIT-1 正向）：牌1 面内点仍组件命中——(157.6, 456.9) 换算 art (162.5, 248.2) ∈ 牌1 标定矩形
    sent.length = 0;
    plaques.length = 0;
    snap.moveCells = [];
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
    hp: 50, maxHp: 50, neili: 30, maxNeili: 30, actionBar: 0, facing: 'right',
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
      frames: new Map([
        ['hero', [img, img, img, img, img, img, img, img]],
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
  imgs: Array<{ x: number; y: number; w: number; h: number }>;
  texts: string[];
  strokeStyles: string[];
  gradients: Array<{ x0: number; y0: number; x1: number; y1: number; stops: Array<[number, string]> }>;
}
function makeArgProbeCtx(): { ctx: CanvasRenderingContext2D; probe: ArgProbe } {
  const probe: ArgProbe = { rects: [], imgs: [], texts: [], strokeStyles: [], gradients: [] };
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
        if (prop === 'fillRect') probe.rects.push({ x: num(args[0]), y: num(args[1]), w: num(args[2]), h: num(args[3]) });
        else if (prop === 'drawImage') probe.imgs.push({ x: num(args[1]), y: num(args[2]), w: num(args[3]), h: num(args[4]) });
        else if (prop === 'fillText' || prop === 'strokeText') probe.texts.push(String(args[0]));
      };
    },
    set(t, prop, v) {
      if (prop === 'strokeStyle') probe.strokeStyles.push(String(v));
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
