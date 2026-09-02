// T15 六边形数学纯函数层（T-B1 需求表 #1/#2）
// 依据：《战场布局规格-六边形战棋》v0.9（96 号，odd-r 换算/flat-top/地图 16×16）
//      + 《战斗规则C案》A3（F-06 移动力/不可穿单位/二阶跳跃）+ O2 裁决（射程三形态几何）
// 架构：纯函数、零渲染依赖、零 import battle-core（引擎零改动红线）；数值真值仍归
//      battle-core（skillRange/basicRange）与公式总览（F-06），本文件只做几何换算。
// 确定性：全部输入→输出纯映射，无随机、无时钟，node 直接可测。

import type { HexPos, SkillDef, WeaponType } from '../types';

// ---------- 坐标换算（存储 = axial(q,r)，地图 = offset odd-r 行×列，96 号 §2.1） ----------

/** offset(列,行) → axial。odd-r 左移奇数行：q = col - ⌊row/2⌋，r = row（方案 §2.1 定式） */
export function offsetToAxial(col: number, row: number): HexPos {
  return { q: col - Math.floor(row / 2), r: row };
}

/** axial → offset(列,行)（换算唯一逆，往返恒等） */
export function axialToOffset(p: HexPos): { col: number; row: number } {
  return { col: p.q + Math.floor(p.r / 2), row: p.r };
}

// ---------- 邻接与距离 ----------

/** 六方向（axial 单位向量，索引即方向序；0=东，逆时针）。锥形/射线/朝向共用此序。 */
export const HEX_DIRS: readonly HexPos[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

/** 六邻接（cube 距离全为 1） */
export function hexNeighbors(p: HexPos): HexPos[] {
  return HEX_DIRS.map((d) => ({ q: p.q + d.q, r: p.r + d.r }));
}

/** cube 距离（R-05 换轨后的战斗度量：axial→cube(x=q, z=r, y=-x-z)，距离=(|dx|+|dy|+|dz|)/2）。
 * session 一律用本函数与 skillRange/basicRange 的数字半径比较——core 内部曼哈顿不再参与
 * 射程判定（见 battle-session.ts 调 resolveAction 处的注释）。 */
export function cubeDistance(a: HexPos, b: HexPos): number {
  const dx = a.q - b.q;
  const dz = a.r - b.r;
  const dy = -dx - dz;
  return (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) / 2;
}

/** 位置等价（HexPos 为普通对象，集中一处比较） */
export function hexEq(a: HexPos, b: HexPos): boolean {
  return a.q === b.q && a.r === b.r;
}

// ---------- F-06 移动力（公式总览：基础 2 + 装配轻功加成 + ⌊轻功等级/5⌋） ----------

/** F-06 基础移动力（公式总览定值；T15/Q7 批复：几何常量本地导出，config/battle-hex.ts 归 FE 卡） */
export const MOVE_BASE = 2;

/** F-06 移动力：基础 2 + 装配轻功加成（一阶 grade 1.0 → +1 / 二阶 1.3 → +2）+ ⌊最高轻功等级/5⌋。
 * 轻功数据来源 = 单位 skills 里 kind='qingGong' 的武功（T06 moveRange 已验证的通路，
 * CombatantInput 无需新增字段）；无轻功 → 基础 2。 */
export function movePower(skills: SkillDef[]): number {
  let bonus = 0;
  let qinggongLevel = 0;
  for (const s of skills) {
    if (s.kind !== 'qingGong') continue;
    qinggongLevel = Math.max(qinggongLevel, s.level);
    bonus = Math.max(bonus, s.grade === 1.0 ? 1 : s.grade === 1.3 ? 2 : 0);
  }
  return MOVE_BASE + bonus + Math.floor(qinggongLevel / 5);
}

// ---------- 可达搜索（BFS，需求表 #1） ----------

/** 场界谓词类型（axial 输入；session 传入「offset 落在可移动区 8×8」的判定） */
export type BoundsFn = (p: HexPos) => boolean;

/** 普通移动可达格：从 from 起 BFS 步数 ≤ power 的格子（F-06 移动力即步数预算）。
 * 阻挡规则（C 案 A3，Leo 08-31 定）：普通移动不可穿过任何单位（友/敌）——occupied 格
 * 既不能落脚也不能借道；inBounds 给定时界外格同样不可进入/借道（棋盘外不存在绕行）。
 * 返回不含起点。 */
export function reachable(from: HexPos, power: number, occupied: HexPos[], inBounds?: BoundsFn): HexPos[] {
  const blocked = (p: HexPos) => occupied.some((o) => hexEq(o, p)) || (inBounds !== undefined && !inBounds(p));
  const seen = new Set<string>([`${from.q},${from.r}`]);
  let frontier = [from];
  const out: HexPos[] = [];
  for (let step = 0; step < power; step++) {
    const next: HexPos[] = [];
    for (const cur of frontier) {
      for (const n of hexNeighbors(cur)) {
        const key = `${n.q},${n.r}`;
        if (seen.has(key) || blocked(n)) continue;
        seen.add(key);
        next.push(n);
        out.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** 二阶轻功跳跃可达格（F-06，Leo 08-31 定）：跳跃范围 = ⌊移动范围/2⌋，跳跃可穿越单位。
 * 语义：无视阻挡（不需连通路径，穿越单位与界外借道均允许），落点仍须在界内且不与其他
 * 单位重叠、不含起点；⌊power/2⌋=0（power≤1）时无跳跃格。 */
export function jumpReachable(from: HexPos, power: number, occupied: HexPos[], inBounds?: BoundsFn): HexPos[] {
  const range = Math.floor(power / 2);
  if (range <= 0) return [];
  const out: HexPos[] = [];
  // 范围极小（≤ 数格），直接半径扫描即可，无需 BFS
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      const p = { q: from.q + dq, r: from.r + dr };
      if ((dq === 0 && dr === 0) || occupied.some((o) => hexEq(o, p))) continue;
      if (inBounds && !inBounds(p)) continue;
      out.push(p);
    }
  }
  return out;
}

// ---------- 射程格三形态（O2 裁决定版，需求表 #2） ----------

export type RangeShape = 'circle' | 'ray' | 'cone';

/** 武器形态 → 射程几何（O2 定版/96 号 R-05 换轨：剑拳暗器圆形，棍棒直线，鞭刀锥形） */
export function rangeShapeOf(weapon: WeaponType): RangeShape {
  if (weapon === 'staff' || weapon === 'club') return 'ray';
  if (weapon === 'whip' || weapon === 'blade') return 'cone';
  return 'circle'; // sword / fist / hidden
}

/** 方向向量 → 方向索引（六方向最近匹配；输入应是 HEX_DIRS 之一或其负）。
 * 用 cube 点积取最大：v 在某方向的扇区内即匹配（浮点零参与，整数运算）。 */
function dirIndexOf(v: HexPos): number {
  const vx = v.q;
  const vz = v.r;
  const vy = -vx - vz;
  let best = 0;
  let bestDot = -Infinity;
  for (let k = 0; k < HEX_DIRS.length; k++) {
    const dx = HEX_DIRS[k].q;
    const dz = HEX_DIRS[k].r;
    const dy = -dx - dz;
    const dot = vx * dx + vy * dy + vz * dz;
    if (dot > bestDot) {
      bestDot = dot;
      best = k;
    }
  }
  return best;
}

/** 方向环距（0~3；六方向首尾相接） */
function dirRingDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 6;
  return Math.min(d, 6 - d);
}

/** 射程格集合（目标可选格，不含原点；R-05 半径 N 直接来自 core 的 skillRange/basicRange）：
 * - circle（剑/拳/暗器）：cube 距离 ≤ N 的全部格
 * - ray（棍棒，O2）：出发格起六方向射线各 N 格
 * - cone（鞭/刀，O2）：以 axis 方向为轴的 120° 扇区（轴 ±1 个方向步）内 cube 距离 ≤ N；
 *   axis 缺省视为东向（调用方必须传战斗语义轴——session 用单位六向 facing）。
 * 视线遮挡不做（Q5 批复）：射程形态只定义"哪些格可选目标"，射线/扇区不被中间单位截断；
 * 阻挡仅作用于移动（reachable 的 BFS），两者语义分离。 */
export function rangeCells(
  origin: HexPos,
  shape: RangeShape,
  n: number,
  axis?: HexPos,
  inBounds?: BoundsFn,
): HexPos[] {
  const ok = (p: HexPos) => !inBounds || inBounds(p);
  const out: HexPos[] = [];
  if (shape === 'circle') {
    for (let dq = -n; dq <= n; dq++) {
      for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
        if (dq === 0 && dr === 0) continue;
        const p = { q: origin.q + dq, r: origin.r + dr };
        if (ok(p)) out.push(p);
      }
    }
    return out;
  }
  if (shape === 'ray') {
    for (const d of HEX_DIRS) {
      for (let i = 1; i <= n; i++) {
        const p = { q: origin.q + d.q * i, r: origin.r + d.r * i };
        if (ok(p)) out.push(p);
      }
    }
    return out;
  }
  // cone：轴 ±1 方向步（120° 扇区）
  const axisIdx = axis ? dirIndexOf(axis) : 0;
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
      if (dq === 0 && dr === 0) continue;
      const p = { q: origin.q + dq, r: origin.r + dr };
      if (!ok(p)) continue;
      if (dirRingDist(dirIndexOf({ q: dq, r: dr }), axisIdx) <= 1) out.push(p);
    }
  }
  return out;
}

/** 目标格是否在锥形射程内（出招校验用，与 rangeCells('cone') 同几何、免建全格集合）。
 * 轴 = 出招者指向目标的方位不成立（那样恒真）——语义是"以出招者六向 facing 为轴"（Q4 批复）。 */
export function inCone(origin: HexPos, axis: HexPos, target: HexPos, n: number): boolean {
  const dist = cubeDistance(origin, target);
  if (dist === 0 || dist > n) return false;
  const vx = target.q - origin.q;
  const vr = target.r - origin.r;
  return dirRingDist(dirIndexOf({ q: vx, r: vr }), dirIndexOf(axis)) <= 1;
}
