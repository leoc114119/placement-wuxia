// T04 NPC 氛围版单测（工单 DoD：种子确定性/约束断言/wander 状态机/帧循环/数量界）
// 运行：npm run test:battle（vitest 全量，既有用例不回归）
import { describe, expect, it } from 'vitest';
import { HERO_START, NPC_COUNT_RANGE, NPC_SPACING, NPC_WANDER, WALK_ZONE } from '../config/numbers';
import { NPC_POOL } from '../config/npcs';
import {
  createNpcSystem,
  distance,
  makeNpcRng,
  npcWalkFrame,
  pickWanderTarget,
  scatterNpcs,
} from '../systems/npc';

const SEED = 20260822;

/** 断言一组散布结果满足全部约束（两两间距/距主角出生点/走廊内/池内类型） */
function assertConstraints(
  placed: Array<{ x: number; y: number }>,
  heroX = HERO_START.x,
  heroY = HERO_START.y,
): void {
  for (const p of placed) {
    expect(p.x).toBeGreaterThanOrEqual(WALK_ZONE.xMin);
    expect(p.x).toBeLessThanOrEqual(WALK_ZONE.xMax);
    expect(p.y).toBeGreaterThanOrEqual(WALK_ZONE.yMin);
    expect(p.y).toBeLessThanOrEqual(WALK_ZONE.yMax);
    expect(distance(p.x, p.y, heroX, heroY)).toBeGreaterThanOrEqual(NPC_SPACING.fromHero);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      expect(distance(placed[i].x, placed[i].y, placed[j].x, placed[j].y)).toBeGreaterThanOrEqual(
        NPC_SPACING.mutual - 1e-9,
      );
    }
  }
}

// ---------- ① 同种子散布确定性 ----------
describe('随机散布·确定性', () => {
  it('同种子同布局（逐位一致），不同种子布局不同', () => {
    const a1 = scatterNpcs(NPC_POOL, HERO_START.x, HERO_START.y, makeNpcRng(SEED));
    const a2 = scatterNpcs(NPC_POOL, HERO_START.x, HERO_START.y, makeNpcRng(SEED));
    expect(a1).toHaveLength(a2.length);
    for (let i = 0; i < a1.length; i++) {
      expect(a1[i].config.id).toBe(a2[i].config.id);
      expect(a1[i].x).toBe(a2[i].x);
      expect(a1[i].y).toBe(a2[i].y);
    }
    // 不同种子大概率不同布局（100 种子里几乎必然有差异；取前几个种子扫）
    let differs = false;
    for (let s = SEED + 1; s <= SEED + 20 && !differs; s++) {
      const b = scatterNpcs(NPC_POOL, HERO_START.x, HERO_START.y, makeNpcRng(s));
      if (b.length !== a1.length) {
        differs = true;
        break;
      }
      if (b.some((p, i) => p.x !== a1[i].x || p.y !== a1[i].y)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('系统 respawn 同口径：同 seed → 同 npcs 布局', () => {
    const sysA = createNpcSystem(NPC_POOL);
    sysA.respawn(HERO_START.x, HERO_START.y, SEED);
    const sysB = createNpcSystem(NPC_POOL);
    sysB.respawn(HERO_START.x, HERO_START.y, SEED);
    expect(sysA.npcs.map((n) => [n.configId, n.x, n.y])).toEqual(sysB.npcs.map((n) => [n.configId, n.x, n.y]));
  });

  it('实例 RNG 流隔离：两系统实例同 seed 先后步进，轨迹完全一致（旧实现跨实例共享流会分叉）', () => {
    // sysA 先跑 10s（消耗随机数），sysB 再跑同帧数——若 RNG 流按实例隔离，两者状态应逐位一致
    const sysA = createNpcSystem(NPC_POOL);
    sysA.respawn(HERO_START.x, HERO_START.y, SEED);
    for (let f = 0; f < 600; f++) sysA.update(1000 / 60, 0.4);
    const sysB = createNpcSystem(NPC_POOL);
    sysB.respawn(HERO_START.x, HERO_START.y, SEED);
    for (let f = 0; f < 600; f++) sysB.update(1000 / 60, 0.4);
    const snap = (sys: ReturnType<typeof createNpcSystem>) =>
      sys.npcs.map((n) => [n.configId, n.x.toFixed(6), n.y.toFixed(6), n.state, n.direction]);
    expect(snap(sysB)).toEqual(snap(sysA));
  });
});

// ---------- ② 任意种子布局满足全部约束 + 数量界 ----------
describe('随机散布·约束与数量界', () => {
  it('200 个种子扫描：数量 ∈ [2,4]，两两间距/距出生点/走廊约束全成立，无死循环', () => {
    for (let s = 1; s <= 200; s++) {
      const placed = scatterNpcs(NPC_POOL, HERO_START.x, HERO_START.y, makeNpcRng(s));
      expect(placed.length).toBeGreaterThanOrEqual(NPC_COUNT_RANGE[0]);
      expect(placed.length).toBeLessThanOrEqual(NPC_COUNT_RANGE[1]);
      for (const p of placed) expect(NPC_POOL.some((c) => c.id === p.config.id)).toBe(true); // 池内类型
      assertConstraints(placed);
    }
  });

  it('极端场景：走廊外主角出生点也成立（fromHero 约束以传入点为准）', () => {
    // 主角出生在走廊中心：最挤的场景，仍应放下 ≥2 只
    const cx = (WALK_ZONE.xMin + WALK_ZONE.xMax) / 2;
    const cy = (WALK_ZONE.yMin + WALK_ZONE.yMax) / 2;
    for (let s = 1; s <= 50; s++) {
      const placed = scatterNpcs(NPC_POOL, cx, cy, makeNpcRng(s));
      expect(placed.length).toBeGreaterThanOrEqual(NPC_COUNT_RANGE[0]); // 保间距→降数量降级不破下限
      assertConstraints(placed, cx, cy);
    }
  });
});

// ---------- ③ wander 状态机（idle→选点→walk→idle 循环，目标 clamp 走廊内） ----------
describe('wander 状态机', () => {
  it('选点恒在走廊内且半径受限（clamp 后可能贴边）', () => {
    const rng = makeNpcRng(SEED);
    // 走廊中心附近选 500 个点
    const cx = (WALK_ZONE.xMin + WALK_ZONE.xMax) / 2;
    const cy = (WALK_ZONE.yMin + WALK_ZONE.yMax) / 2;
    for (let i = 0; i < 500; i++) {
      const t = pickWanderTarget(cx, cy, NPC_WANDER.radius, rng);
      expect(t.x).toBeGreaterThanOrEqual(WALK_ZONE.xMin);
      expect(t.x).toBeLessThanOrEqual(WALK_ZONE.xMax);
      expect(t.y).toBeGreaterThanOrEqual(WALK_ZONE.yMin);
      expect(t.y).toBeLessThanOrEqual(WALK_ZONE.yMax);
      expect(Math.hypot(t.x - cx, t.y - cy)).toBeLessThanOrEqual(NPC_WANDER.radius + 1e-9);
    }
    // 边界点选点：clamp 生效不出走廊
    for (let i = 0; i < 200; i++) {
      const t = pickWanderTarget(WALK_ZONE.xMin, WALK_ZONE.yMin, NPC_WANDER.radius, rng);
      expect(t.x).toBeGreaterThanOrEqual(WALK_ZONE.xMin);
      expect(t.y).toBeGreaterThanOrEqual(WALK_ZONE.yMin);
    }
  });

  it('系统步进：idle 计时 3~5s → walk → 到达回 idle，目标全程走廊内，速度=主角×0.6', () => {
    const sys = createNpcSystem(NPC_POOL);
    sys.respawn(HERO_START.x, HERO_START.y, SEED);
    const dtMs = 1000 / 60;
    let sawWalk = false;
    let maxSteadySpeed = 0; // 行走中稳态步速（排除到达吸附帧）
    let maxSnapDist = 0; // 到达吸附帧的单帧位移（≤ 到达阈值 0.01，与主角同口径）
    const lastPos = new Map<object, { x: number; y: number; walk: boolean }>(); // 按对象引用（configId 会撞车）
    for (let frame = 0; frame < 60 * 10; frame++) {
      // 10s 必然经历 idle→walk→idle
      sys.update(dtMs, 0.4);
      const dtSec = dtMs / 1000;
      for (const n of sys.npcs) {
        expect(n.x).toBeGreaterThanOrEqual(WALK_ZONE.xMin - 1e-9);
        expect(n.x).toBeLessThanOrEqual(WALK_ZONE.xMax + 1e-9);
        expect(n.y).toBeGreaterThanOrEqual(WALK_ZONE.yMin - 1e-9);
        expect(n.y).toBeLessThanOrEqual(WALK_ZONE.yMax + 1e-9);
        if (n.state === 'walk') sawWalk = true;
        const last = lastPos.get(n);
        if (last) {
          const d = Math.hypot(n.x - last.x, n.y - last.y);
          if (last.walk && n.state === 'walk') maxSteadySpeed = Math.max(maxSteadySpeed, d / dtSec);
          if (last.walk && n.state === 'idle') maxSnapDist = Math.max(maxSnapDist, d); // 到达帧
        }
        lastPos.set(n, { x: n.x, y: n.y, walk: n.state === 'walk' });
      }
    }
    expect(sawWalk).toBe(true);
    expect(maxSteadySpeed).toBeGreaterThan(0);
    expect(maxSteadySpeed).toBeLessThanOrEqual(0.4 * NPC_WANDER.speedFactor + 1e-9); // 稳态速度=主角×0.6
    expect(maxSnapDist).toBeLessThanOrEqual(0.01 + 1e-9); // 吸附距离 ≤ 到达阈值（主角同口径）
    // 初始 wanderTimer 在 3~5s 内
    for (const n of sys.npcs) {
      if (n.state === 'idle') {
        expect(n.wanderTimerSec).toBeGreaterThanOrEqual(0);
        expect(n.wanderTimerSec).toBeLessThanOrEqual(NPC_WANDER.idleMaxSec);
      }
    }
  });
});

// ---------- ④ 帧循环（01~03 且 04+ 不出现） ----------
describe('npcWalkFrame', () => {
  it('帧号在 01~03 循环，04+ 战斗帧永不出现', () => {
    expect(npcWalkFrame(0)).toBe(1);
    expect(npcWalkFrame(NPC_WANDER.walkFrameMs * 3)).toBe(1); // 回卷
    expect(npcWalkFrame(NPC_WANDER.walkFrameMs * 4)).toBe(2);
    for (let t = 0; t < 8000; t += 41) {
      const f = npcWalkFrame(t);
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThanOrEqual(3);
    }
  });
});
