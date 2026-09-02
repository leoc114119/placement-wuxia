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
  CTRL_ART,
  CTRL_BUTTONS,
  ROW_H,
  TILE_W,
  hexToWorld,
} from '../config/battle-hex';
import {
  axialToOffset,
  boardBounds,
  computeCamera,
  movableBounds,
  createView,
  drawFrame,
  isMovableCell,
  pieceHop,
  updateView,
  worldToHex,
  type BattleHexAssets,
  type BattleHexView,
} from '../ui/battle-hex-render';
import { createBattleInput, pickSkillButton } from '../ui/battle-input';
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

  it('isMovableCell：居中 8×8 可移动区（col/row 4..11）', () => {
    expect(isMovableCell({ q: 1, r: 8 })).toBe(true); // col 5, row 8
    expect(isMovableCell({ q: 2, r: 4 })).toBe(true); // col 4, row 4（西北角）
    expect(isMovableCell({ q: 6, r: 11 })).toBe(true); // col 11, row 11（东南角）
    expect(isMovableCell({ q: 7, r: 11 })).toBe(false); // col 12 出带
    expect(axialToOffset({ q: 7, r: 11 })).toEqual({ col: 12, row: 11 });
    expect(isMovableCell({ q: -4, r: 4 })).toBe(false); // col -2 出界
    expect(isMovableCell({ q: -1, r: 15 })).toBe(false); // col 6? floor(15/2)=7 → col 6 在 8×8 列带但 row 15 行在外
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

  it('点可移动格=移动；激活非轻功技能时点格=施放攻击；点无效格=取消', () => {
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
    // ② 激活 te：点敌人=施放（skillId 带出）
    snap.selectedSkill = 'te';
    p = cellCenter({ q: 3, r: 7 });
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[1]).toMatchObject({ type: 'attack', targetId: 'e1', skillId: 'te' });
    // ③ 激活 te：点无效格=取消
    p = cellCenter({ q: 6, r: 12 });
    input.up(view, snap, p.x, p.y, 375, 667);
    expect(sent[2]).toEqual({ type: 'cancelSkill' });
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
      { id: 'hero', name: '小虾米', animState: 'idle' },
      { id: 'e1', side: 'enemy', name: '山贼甲', pos: { q: 3, r: 7 }, renderPos: { q: 3, r: 7 }, spriteKey: 'npc-shanzei' },
    ]);
    snap.pendingInput = true;
    snap.turnActorId = 'hero';
    snap.moveCells = [{ q: 1, r: 9 }, { q: 0, r: 9 }, { q: 2, r: 9 }];
    snap.heroSkills = [
      { id: 'te', label: '特', disabled: false },
      { id: 'jue', label: '绝', disabled: true },
    ];
    const img = { width: 128, height: 256 };
    const assets: BattleHexAssets = {
      env: img,
      topbar: { width: 1440, height: 300 },
      plaque: { width: 310, height: 757 },
      ctrl: { width: 223, height: 448 },
      frames: new Map([
        ['hero', [img, img, img, img, img, img, img, img]],
        ['npc-shanzei', [img, img, img, img, img, img, img, img]],
      ]),
    };
    const view = createView();
    updateView(view, snap, 0.016, 375, 667);
    drawFrame({ ctx, width: 375, height: 667, dt: 0.016 }, snap, assets, view);
    expect(calls.drawImage).toBeGreaterThan(5); // env+棋子帧+三组件
    expect(calls.fillText).toBeGreaterThanOrEqual(6); // 两名字+四钮字
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
    const emptyAssets: BattleHexAssets = { env: null, topbar: null, plaque: null, ctrl: null, frames: new Map() };
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
    expect(calls.fillText).toBeGreaterThanOrEqual(2); // 占位牌文字（装备/武功）
  });

  it('pieceHop 跳跃真值：isJump 才有抛物线高度，贴地恒 0（联调 F1 禁启发式）', () => {
    const view: BattleHexView = createView();
    // 相位基准=跳跃起点（updateView 上升沿同款记录）
    view.moveFrom.set('hero', { q: 2, r: 8 }); // 起点(2,8) → 终点 pos(3,8)，renderPos(2.5) 恰为中点
    // 中点：抛物线顶附近 >0
    const mid = makeSnapshot([{ id: 'hero', animState: 'walk', isJump: true, pos: { q: 3, r: 8 }, renderPos: { q: 2.5, r: 8 } }]).actors[0];
    expect(pieceHop(view, mid)).toBeGreaterThan(0);
    // 同位置但 isJump=false（贴地 lerp）→ 0
    const grounded = { ...mid, isJump: false };
    expect(pieceHop(view, grounded)).toBe(0);
    // 无相位基准 → 0（防御）
    const noFrom: BattleHexView = createView();
    expect(pieceHop(noFrom, mid)).toBe(0);
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
    const assets: BattleHexAssets = { env: null, topbar: null, plaque: null, ctrl: null, frames: new Map() };
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
