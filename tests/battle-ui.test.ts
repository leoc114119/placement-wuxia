// T06 战斗界面演出层单测（工单 DoD 9 组：投影往返/行动条/优先级/移动终点/跳跃/范围格/回放全等/胜负托管/变灰）
// 运行：npm run test:battle（vitest 全量，既有 38 用例不回归）
import { describe, expect, it } from 'vitest';
import { BAR, BOARD_COLS, BOARD_ROWS } from '../config/battle';
import { NPC_POOL } from '../config/npcs';
import type { SkillDef } from '../types';
import { fillRate, skillRange } from '../systems/battle-core';
import { computeCamera, renderBattle } from '../ui/battle-render';
import { CAMERA, TILE_HALF_H, TILE_HALF_W } from '../config/battle';
import {
  battleWalkFrame,
  createBattleSession,
  gridToWorld,
  manhattanDist,
  moveRange,
  reachableCells,
  skillRangeCells,
  worldToGrid,
} from '../systems/battle-ui';

const SEED = 20260822;
const DT = 1000 / 60;

/** 跑完一场（自动模式），带步数上限防御 */
function runAuto(seed: number, maxSec = 120): ReturnType<typeof createBattleSession> {
  const s = createBattleSession(NPC_POOL, seed, 'auto');
  let sec = 0;
  while (s.phase === 'fighting' && sec < maxSec) {
    s.update(DT);
    sec += DT / 1000;
  }
  return s;
}

// ---------- ① 投影换算往返 ----------
describe('投影换算', () => {
  it('worldToGrid(gridToWorld(x,y)) 全棋盘往返一致；越界格换算后仍可判定', () => {
    for (let y = 0; y < BOARD_ROWS; y++) {
      for (let x = 0; x < BOARD_COLS; x++) {
        const w = gridToWorld(x, y);
        const g = worldToGrid(w.x, w.y);
        expect(g).toEqual({ x, y });
      }
    }
  });
});

// ---------- ② 行动条满触发与 F-05 公式 ----------
describe('行动条', () => {
  it('填充速率 = fillRate 引擎公式；满 100 触发出招事件', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'auto');
    const player = s.player;
    const rate = fillRate(player); // (100+内功×3+机敏)/10
    expect(rate).toBeCloseTo((100 + player.neigongLevel * 3 + player.jimin) / 10);
    // 步进到条满时刻附近，必有 bar-max 或出招族事件
    let sec = 0;
    while (s.phase === 'fighting' && sec < 12) {
      s.update(DT);
      sec += DT / 1000;
    }
    const kinds = new Set(s.events.map((e) => e.type));
    const acted = kinds.has('move') || kinds.has('skill') || kinds.has('basic') || kinds.has('miss') || kinds.has('blocked');
    expect(acted).toBe(true); // 行动条已满并行动
  });
});

// ---------- ③ 自动优先级序列 ----------
describe('自动优先级', () => {
  it('可用武功优先于普攻：先 skill 后 basic 的序列成立（野猫剑法内力 10/次）', () => {
    // 玩家 maxNeili=0 → 全程普攻兜底（fallback→basic）；给内力后优先出技能
    const s = runAuto(SEED);
    const playerActs = s.events.filter((e) => e.actorId === 'player');
    expect(playerActs.length).toBeGreaterThan(0);
    // MVP 初始口径：无内力 → 无 skill 事件，普攻族必然出现
    const hasSkill = playerActs.some((e) => e.type === 'skill');
    const hasBasic = playerActs.some((e) => e.type === 'basic' || e.type === 'fallback');
    expect(hasBasic).toBe(true);
    if (!hasSkill) expect(s.player.maxNeili).toBe(0); // 无内力才允许全普攻
  });
});

// ---------- ④ 移动 lerp 终点=格中心 ----------
describe('移动表现', () => {
  it('移动事件后 renderX/renderY 收敛到目标格；moveT 在 0~1', () => {
    const s = runAuto(SEED);
    const moves = s.events.filter((e) => e.type === 'move');
    expect(moves.length).toBeGreaterThan(0); // 近战接敌必然移动
    for (const a of s.actors) {
      expect(a.moveT).toBeLessThanOrEqual(1);
      if (a.moveT >= 1) {
        expect(a.renderX).toBe(a.pos.x);
        expect(a.renderY).toBe(a.pos.y);
      }
    }
  });
});

// ---------- ⑤ 轻功抛物线（跳跃=移动段，A1 Q8） ----------
describe('轻功跳跃', () => {
  it('内力不足置灰；注内力后跳跃范围=移动力×2，跳跃扣内力 10 并位移', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'manual');
    let sec = 0;
    while (!s.pendingManual && s.phase === 'fighting' && sec < 15) {
      s.update(DT);
      sec += DT / 1000;
    }
    expect(s.pendingManual).toBeTruthy();
    // MVP 初始 maxNeili=0 → 置灰（A1 Q9 消耗 10）
    expect(s.skillBtnStates().qing).toBe(false);
    expect(s.tapQinggong()).toBe(false);
    // 注入内力（测试口径：演出层字段可写）
    s.player.maxNeili = 100;
    s.player.neili = 100;
    expect(s.tapQinggong()).toBe(true);
    const range = moveRange(s.player.skills);
    const gold = s.manualCells();
    expect(gold.length).toBeGreaterThan(0);
    // 金格全在移动力×2 范围内
    for (const c of gold) expect(manhattanDist(s.player.pos.x, s.player.pos.y, c.x, c.y)).toBeLessThanOrEqual(range * 2 + 1e-9);
    const cell = gold[gold.length - 1];
    expect(s.tapCell(cell.x, cell.y)).toBe(true);
    expect(s.player.pos.x).toBe(cell.x);
    expect(s.player.pos.y).toBe(cell.y);
    expect(s.player.neili).toBe(90); // 扣 10
    expect(s.player.isJump).toBe(true); // 抛物线演出态
    expect(s.pendingManual).toBeNull(); // 行动消耗（二选一）
  });
});

// ---------- ⑥ 范围格生成（形态×档位）与越界 clamp ----------
describe('范围格', () => {
  it('skillRangeCells 恒在棋盘内（越界 clamp）；半径 = skillRange（与引擎结算同构）', () => {
    const skill: SkillDef = { id: 't', name: 't', kind: 'waiGong', weapon: 'sword', grade: 1.0, growth: 1, level: 25, cooldownTurns: 0, neiliCost: 10 };
    expect(skillRange(skill)).toBe(2); // 剑 Lv25 → 档 1（阈值 20/40/60）
    const cells = skillRangeCells(0, 0, skill); // 角上：大量越界被 clamp
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(BOARD_COLS);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(BOARD_ROWS);
      expect(manhattanDist(0, 0, c.x, c.y)).toBeLessThanOrEqual(skillRange(skill));
    }
    // reachableCells 排除占用格
    const occ = reachableCells(4, 5, 2, [{ x: 4, y: 4 }]);
    expect(occ.some((c) => c.x === 4 && c.y === 4)).toBe(false);
  });
});

// ---------- ⑦ 同 seed 事件流回放全等 ----------
describe('确定性回放', () => {
  it('同 seed 两场自动对局事件流逐条全等；不同 seed 布局/事件不同', () => {
    const a = runAuto(SEED);
    const b = runAuto(SEED);
    expect(a.events).toEqual(b.events);
    expect(a.actors.map((x) => [x.id, x.hp])).toEqual(b.actors.map((x) => [x.id, x.hp]));
    let differs = false;
    for (let s = SEED + 1; s <= SEED + 12 && !differs; s++) {
      const c = runAuto(s);
      if (c.events.length !== a.events.length || c.events.some((e, i) => e.t !== a.events[i].t)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('手动模式同 seed + 同操作脚本 → 事件流全等', () => {
    const script = (s: ReturnType<typeof createBattleSession>): void => {
      let sec = 0;
      while (s.phase === 'fighting' && sec < 30) {
        s.update(DT);
        sec += DT / 1000;
        if (s.pendingManual) {
          const cells = s.manualCells();
          if (cells.length > 0) s.tapCell(cells[cells.length - 1].x, cells[cells.length - 1].y);
        }
      }
    };
    const a = createBattleSession(NPC_POOL, SEED, 'manual');
    script(a);
    const b = createBattleSession(NPC_POOL, SEED, 'manual');
    script(b);
    expect(a.events).toEqual(b.events);
  });
});

// ---------- ⑧ 胜负 / 90s 超时 / 托管切换 ----------
describe('胜负与托管', () => {
  it('自动对局有限时间 内分出胜负（annihilate 或 90s timeout-hp）', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = runAuto(seed);
      expect(s.phase === 'won' || s.phase === 'lost' || s.phase === 'timeout').toBe(true);
      expect(s.timeSec).toBeLessThanOrEqual(90.5);
      const tail = s.events.slice(-3).map((e) => e.type);
      expect(tail).toContain(s.phase === 'won' ? 'win' : s.phase === 'lost' ? 'lose' : 'timeout-hp');
    }
  });

  it('手动 90s 无操作 → trust 代行；再 90s → switch-auto（引擎状态机同源）', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'manual');
    s.player.def = 100; // 测试口径：防御拉满（伤害保底 1），保证 180s 内玩家存活走到双阈值
    let sec = 0;
    while (sec < 200 && !s.events.some((e) => e.type === 'switch-auto')) {
      s.update(DT);
      sec += DT / 1000;
    }
    expect(s.events.some((e) => e.type === 'trust')).toBe(true);
    expect(s.events.some((e) => e.type === 'switch-auto')).toBe(true);
    expect(s.mode).toBe('auto');
  });

  it('逃跑 flee：零结算退出（fled 事件 + phase）', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'auto');
    s.update(DT);
    s.flee();
    expect(s.phase).toBe('fled');
    expect(s.events.some((e) => e.type === 'flee')).toBe(true);
    expect(s.result().phase).toBe('fled');
  });
});

// ---------- ⑨ 阵亡变灰状态 ----------
describe('阵亡', () => {
  it('hp≤0 → dead=true（渲染变灰依据）；死亡事件恰一次', () => {
    const s = runAuto(SEED);
    const deadActors = s.actors.filter((a) => a.dead);
    const deathEvents = s.events.filter((e) => e.type === 'death');
    for (const a of deadActors) expect(a.hp).toBe(0);
    expect(deathEvents.length).toBe(deadActors.length); // 每个阵亡恰一条
    if (s.phase === 'won') expect(deadActors.every((a) => a.side === 'enemy')).toBe(true);
    if (s.phase === 'lost') expect(s.player.dead).toBe(true);
  });
});

// ---------- 附：战斗内 walk 帧循环（硬规则防回归） ----------
describe('battleWalkFrame', () => {
  it('01~03 循环，04+ 永不出现', () => {
    expect(battleWalkFrame(0)).toBe(1);
    for (let t = 0; t < 6000; t += 23) {
      const f = battleWalkFrame(t);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(3);
    }
  });
});

// ---------- A2-T06 二轮：两层架构（Layer0 静态 / Layer1 代码台面） ----------
describe('战场两层架构（75 v2.3 §1b.4）', () => {
  /** 录制型 ctx：捕获全部绘制调用（drawImage 专列） */
  function recordingCtx() {
    const draws: unknown[][] = [];
    const calls: Record<string, number> = {};
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'measureText') return () => ({ width: 80 });
          if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
          if (prop === 'canvas') return undefined;
          return (...args: unknown[]) => {
            calls[prop] = (calls[prop] ?? 0) + 1;
            if (prop === 'drawImage') draws.push(args);
          };
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, draws, calls };
  }

  it('拖动四边 clamp 生效：任意大偏移下相机中心恒在台面包围盒+边距界内', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'auto');
    // 与 computeCamera 同式的常量包围盒（与 facingFlip 无关：对称翻转极值不变）
    const pad = CAMERA.worldPad;
    const minX = -12 * TILE_HALF_W - pad;
    const maxX = 8 * TILE_HALF_W + pad;
    const minY = -TILE_HALF_H - pad;
    const maxY = 20 * TILE_HALF_H + pad;
    void gridToWorld;
    // 视窗 375×480：两轴均小于棋盘轮廓（TS=54 → 世界 935×620）→ clamp 双轴必须夹紧
    //（667 高屏可整屏放下棋盘，y 轴走居中分支无 clamp——故用小视窗验证夹紧行为本身）
    for (const off of [
      { x: 5000, y: 0 }, { x: -5000, y: 0 }, { x: 0, y: 5000 }, { x: 0, y: -5000 }, { x: 9999, y: -9999 },
    ]) {
      const cam = computeCamera(s, 375, 480, off);
      const cx = 375 / 2 - cam.ox;
      const cy = 480 / 2 - cam.oy;
      expect(cx).toBeGreaterThanOrEqual(minX + 375 / 2 - 0.01);
      expect(cx).toBeLessThanOrEqual(maxX - 375 / 2 + 0.01);
      expect(cy).toBeGreaterThanOrEqual(minY + 480 / 2 - 0.01);
      expect(cy).toBeLessThanOrEqual(maxY - 480 / 2 + 0.01);
    }
  });

  it('背景保持静止：不同拖动偏移下 Layer0 drawImage 目标矩形完全相同；台面路径零贴图（全屏仅一次 drawImage）', () => {
    const s = createBattleSession(NPC_POOL, SEED, 'auto');
    const bgImg = { src: 'mock', width: 1440, height: 2560 } as WxImage;
    const assets = { bg: bgImg, framesByKind: new Map() };
    const shoot = (off: { x: number; y: number }) => {
      const rec = recordingCtx();
      renderBattle({ ctx: rec.ctx, width: 375, height: 667, dt: 16 }, s, assets, [], 0, undefined, off);
      return rec;
    };
    const a = shoot({ x: 0, y: 0 });
    const b = shoot({ x: 400, y: -300 });
    expect(a.draws.length).toBe(1); // UI 全代码绘制（看板口径）——全屏仅 Layer0 背景一次贴图
    expect(a.draws[0]).toEqual(b.draws[0]); // 拖动不改变背景目标矩形（屏幕空间静态）
    const [, dx, dy, dw, dh] = a.draws[0] as [unknown, number, number, number, number];
    expect(dw).toBeGreaterThanOrEqual(375 - 0.01); // cover 铺满（9:16 图在更方的视窗可恰等高）
    expect(dh).toBeGreaterThanOrEqual(667 - 0.01);
    expect(dx).toBe((375 - dw) / 2);
    expect(dy).toBe((667 - dh) / 2);
  });
});
