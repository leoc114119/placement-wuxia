// NPC 氛围版系统：可注入 RNG 随机散布（分散约束）+ wander 状态机 + 渲染视图
// 依据：modules/03 v1.2 §2.0/§2.1/§3 + tasks/inbox T04 工单需求表（唯一真相）
// 禁区：无战斗交互（追逐/开战/血条/击败/掉落全不做）；NPC 不注册点击命中；NPC 间可穿过
import {
  NPC_COUNT_RANGE,
  NPC_FRAME,
  NPC_SPACING,
  NPC_WANDER,
  WALK_ZONE,
} from '../config/numbers';
import type { NpcConfig } from '../config/npcs';
import type { Facing, NpcAvatar, NpcFrameAssets, NpcView, TouchPoint } from '../types';

/** 可注入随机源：next() ∈ [0,1)（mulberry32 种子实现见 makeNpcRng，同种子同布局） */
export interface Rng {
  next(): number;
}

/** mulberry32：轻量确定性 PRNG（与 battle-core 同族口径），同种子序列完全一致 */
export function makeNpcRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

const randInt = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng.next() * (max - min + 1)); // [min, max] 含两端

// ---------- 散布纯函数（node 可测） ----------

/** 两点欧氏距离（逻辑坐标） */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * 随机散布：数量 2~4 均匀随机，每只等权抽池；WALK_ZONE 内撒点。
 * 分散约束：两两 ≥ mutual、距主角出生点 ≥ fromHero；单点重试 ≤ maxRetriesPerPoint，
 * 放不下按「保间距 → 降数量」降级（减少一只重排），禁止死循环。
 * 返回 [config, x, y] 列表（顺序即抽取顺序）。
 */
export function scatterNpcs(
  pool: NpcConfig[],
  heroX: number,
  heroY: number,
  rng: Rng,
): Array<{ config: NpcConfig; x: number; y: number }> {
  const wanted = randInt(rng, NPC_COUNT_RANGE[0], NPC_COUNT_RANGE[1]);
  const placed: Array<{ config: NpcConfig; x: number; y: number }> = [];
  let count = wanted;

  while (placed.length < count) {
    // 类型等权抽取（池非空防御）
    const config = pool[Math.floor(rng.next() * pool.length) % pool.length];
    // 单点重试 ≤ maxRetriesPerPoint
    let ok = false;
    for (let attempt = 0; attempt < NPC_SPACING.maxRetriesPerPoint; attempt++) {
      const x = WALK_ZONE.xMin + rng.next() * (WALK_ZONE.xMax - WALK_ZONE.xMin);
      const y = WALK_ZONE.yMin + rng.next() * (WALK_ZONE.yMax - WALK_ZONE.yMin);
      if (distance(x, y, heroX, heroY) < NPC_SPACING.fromHero) continue; // 距主角出生点约束
      if (placed.some((p) => distance(x, y, p.x, p.y) < NPC_SPACING.mutual)) continue; // 两两间距约束
      placed.push({ config, x, y });
      ok = true;
      break;
    }
    if (!ok && count > NPC_COUNT_RANGE[0]) {
      // 降级：保间距优先，减少目标数量后重排（已放下的点保留，继续放剩余）
      count -= 1;
    } else if (!ok) {
      break; // 已到下限仍放不下 → 终止（禁死循环）
    }
  }
  return placed;
}

/** wander 目标点：当前点半径 radius 内均匀取角，clamp 进走廊（纯函数） */
export function pickWanderTarget(
  curX: number,
  curY: number,
  radius: number,
  rng: Rng,
): TouchPoint {
  const angle = rng.next() * Math.PI * 2;
  const dist = Math.sqrt(rng.next()) * radius; // 面积均匀
  const c = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return {
    x: c(curX + Math.cos(angle) * dist, WALK_ZONE.xMin, WALK_ZONE.xMax),
    y: c(curY + Math.sin(angle) * dist, WALK_ZONE.yMin, WALK_ZONE.yMax),
  };
}

/** NPC 单步移动（复用主角到达语义：不过冲、到达即停回 idle；纯函数返回新化身） */
export function stepNpc(npc: NpcAvatar, speedPerSec: number, dtSec: number): NpcAvatar {
  if (!npc.moving) return npc;
  const dx = npc.targetX - npc.x;
  const dy = npc.targetY - npc.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.01 || dist <= speedPerSec * dtSec) {
    return { ...npc, x: npc.targetX, y: npc.targetY, moving: false, state: 'idle' };
  }
  return { ...npc, x: npc.x + (dx / dist) * speedPerSec * dtSec, y: npc.y + (dy / dist) * speedPerSec * dtSec };
}

/** walk 帧号（与主角同口径：01~03 循环，160ms/帧） */
export function npcWalkFrame(elapsedMs: number): number {
  const span = NPC_FRAME.walkEnd - NPC_FRAME.walkStart + 1;
  return NPC_FRAME.walkStart + (Math.floor(elapsedMs / NPC_WANDER.walkFrameMs) % span);
}

// ---------- NPC 系统（有状态） ----------

export interface NpcSystem {
  npcs: NpcAvatar[];
  /** 进入江湖场景时重刷（启动首帧/切 Tab 回归/从战斗闭关返回，同口径）；seed 可选注入 */
  respawn(heroX: number, heroY: number, seed?: number): void;
  /** 主循环步进：wander 计时 + 移动 + 动画计时 */
  update(dtMs: number, heroSpeedPerSec: number): void;
  /** 渲染视图快照（含当前帧号），供渲染层按 y 排序 z-order；帧表由渲染层自持，此参仅对齐签名 */
  view(_framesByNpcId?: Map<string, NpcFrameAssets>): NpcView[];
}

export function createNpcSystem(pool: NpcConfig[]): NpcSystem {
  const npcs: NpcAvatar[] = []; // 原地维护（respawn 清空重填），外部引用恒有效

  return {
    npcs,
    respawn(heroX, heroY, seed) {
      // RNG 注入口：传 seed 同种子同布局；缺省用时间熵
      const rng = makeNpcRng(seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)));
      const scattered = scatterNpcs(pool, heroX, heroY, rng);
      npcs.length = 0;
      npcRngs.clear(); // 实例 RNG 流随重刷重置（实例序号重新从 0 分配，保证确定性）
      npcs.push(
        ...scattered.map(({ config, x, y }) => ({
          configId: config.id,
          x,
          y,
          homeX: x,
          homeY: y,
          targetX: x,
          targetY: y,
          moving: false,
          state: 'idle' as const,
          direction: 'left' as Facing, // 素材默认面左语义（同主角）
          wanderTimerSec: NPC_WANDER.idleMinSec + rng.next() * (NPC_WANDER.idleMaxSec - NPC_WANDER.idleMinSec),
          walkMs: 0,
        })),
      );
    },
    update(dtMs, heroSpeedPerSec) {
      const speed = heroSpeedPerSec * NPC_WANDER.speedFactor;
      for (const npc of npcs) {
        if (npc.state === 'idle') {
          npc.wanderTimerSec -= dtMs / 1000;
          if (npc.wanderTimerSec <= 0) {
            // 选点 → walk（目标恒在走廊内，pickWanderTarget 已 clamp）
            const t = pickWanderTarget(npc.x, npc.y, NPC_WANDER.radius, rngFor(npc));
            npc.targetX = t.x;
            npc.targetY = t.y;
            npc.direction = facingTowardShared(npc.direction, npc.x, t.x);
            npc.moving = true;
            npc.state = 'walk';
            npc.walkMs = 0;
          }
        } else {
          Object.assign(npc, stepNpc(npc, speed, dtMs / 1000));
          npc.walkMs += dtMs;
          if (!npc.moving) {
            npc.walkMs = 0;
            npc.wanderTimerSec =
              NPC_WANDER.idleMinSec + rngFor(npc).next() * (NPC_WANDER.idleMaxSec - NPC_WANDER.idleMinSec);
          }
        }
      }
    },
    view(_framesByNpcId?) {
      return npcs
        .slice() // 按 y 排序 z-order（远→近遮挡，与主角同规则由渲染层统一排序）
        .sort((a, b) => a.y - b.y)
        .map((npc) => ({
          avatar: npc,
          frameIdx: npc.state === 'walk' ? npcWalkFrame(npc.walkMs) : NPC_FRAME.idle,
        }));
    },
  };
}

// ---- 内部辅助：每 NPC 实例独立 RNG 流（对象引用隔离，respawn 重置） ----
// 种子 = configId 哈希 × 实例序号（respawn 后按创建顺序分配）——遍历序固定，同 seed 确定性保持；
// 同类型多只各自持有独立流，互不吞随机数（归档返工修复：旧实现按 configId 共享，注释与行为不符）。
const npcRngs = new Map<object, Rng>();
function rngFor(npc: NpcAvatar): Rng {
  let r = npcRngs.get(npc);
  if (!r) {
    const seq = npcRngs.size; // 实例序号（respawn 清空后从 0 递增）
    r = makeNpcRng((hashString(npc.configId) ^ Math.imul(seq + 1, 0x9e3779b1)) >>> 0);
    npcRngs.set(npc, r);
  }
  return r;
}
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function facingTowardShared(cur: Facing, fromX: number, toX: number): Facing {
  if (toX < fromX - 1e-6) return 'left';
  if (toX > fromX + 1e-6) return 'right';
  return cur;
}
