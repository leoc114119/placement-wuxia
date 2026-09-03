// T15 hex 数学单测（DoD：hex 6 例——换算往返/邻接/距离/可达/跳跃/三形态射程）
// T19 增补：movePathCells 回退轨合法路径 5 例（领单第一交付 C 组，PM 裁定落点本文件）
// 运行：npm run test:battle（vitest）
import { describe, expect, it } from 'vitest';
import {
  HEX_DIRS,
  axialToOffset,
  cubeDistance,
  hexEq,
  hexNeighbors,
  inCone,
  jumpReachable,
  movePathCells,
  movePower,
  offsetToAxial,
  rangeCells,
  reachable,
} from '../systems/hex';
import type { HexPos, SkillDef } from '../types';

const eq = (a: HexPos, b: HexPos) => hexEq(a, b);
const has = (cells: HexPos[], p: HexPos) => cells.some((c) => eq(c, p));

function skill(over: Partial<SkillDef>): SkillDef {
  return {
    id: 's',
    name: 's',
    kind: 'waiGong',
    weapon: 'sword',
    grade: 1.0,
    growth: 1,
    level: 10,
    cooldownTurns: 0,
    neiliCost: 0,
    ...over,
  };
}

// ---------- 例 1：axial ↔ offset 换算往返（odd-r 定式） ----------
describe('hex 换算', () => {
  it('offset→axial→offset 往返恒等；odd-r 奇数行左移一位（q = col - ⌊row/2⌋）', () => {
    // 定式抽检：奇数行 q 左移
    expect(offsetToAxial(4, 10)).toEqual({ q: -1, r: 10 }); // 4 - ⌊10/2⌋
    expect(offsetToAxial(5, 3)).toEqual({ q: 4, r: 3 }); // 5 - ⌊3/2⌋
    expect(offsetToAxial(0, 1)).toEqual({ q: 0, r: 1 }); // ⌊1/2⌋=0 不移
    // 16×16 全图往返恒等
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const axial = offsetToAxial(col, row);
        expect(axialToOffset(axial)).toEqual({ col, row });
      }
    }
  });
});

// ---------- 例 2：六邻接 ----------
describe('hex 邻接', () => {
  it('任意格恰有 6 邻居，与中心 cube 距离全为 1，方向互不重合', () => {
    const centers: HexPos[] = [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -1, r: 10 },
    ];
    for (const c of centers) {
      const ns = hexNeighbors(c);
      expect(ns.length).toBe(6);
      for (const n of ns) {
        expect(cubeDistance(c, n)).toBe(1);
        expect(eq(n, c)).toBe(false);
      }
      expect(new Set(ns.map((n) => `${n.q},${n.r}`)).size).toBe(6);
    }
    expect(HEX_DIRS.length).toBe(6);
  });
});

// ---------- 例 3：cube 距离 ----------
describe('cube 距离', () => {
  it('手算值/对称性/同点为零（R-05 换轨后的战斗度量）', () => {
    const o: HexPos = { q: 0, r: 0 };
    expect(cubeDistance(o, { q: 1, r: 0 })).toBe(1); // 东 1 步
    expect(cubeDistance(o, { q: 1, r: -1 })).toBe(1); // 斜邻（offset 曼哈顿会误判 2 的格子）
    expect(cubeDistance(o, { q: 2, r: -2 })).toBe(2);
    expect(cubeDistance(o, { q: 2, r: 1 })).toBe(3); // dx=2,dz=1,dy=-3 → 3
    expect(cubeDistance(o, { q: 4, r: -4 })).toBe(4);
    const a = offsetToAxial(4, 10);
    const b = offsetToAxial(0, 1);
    expect(cubeDistance(a, b)).toBe(cubeDistance(b, a)); // 对称
    expect(cubeDistance(a, a)).toBe(0);
  });
});

// ---------- 例 4：BFS 可达（移动力预算 + 阻挡不可穿） ----------
describe('reachable（F-06 普通移动）', () => {
  it('power=2 空场可达 18 格；被占格不可落脚不可借道；墙后绕不过去', () => {
    const o: HexPos = { q: 0, r: 0 };
    // 空场：距离 1 有 6 格 + 距离 2 有 12 格，不含起点
    const open = reachable(o, 2, []);
    expect(open.length).toBe(18);
    expect(has(open, o)).toBe(false);
    // 单格阻挡：占格被剔除；仅存的 2 步内路径全经该格的远处格同步失达（绕路超预算）
    const oneBlock = reachable(o, 2, [{ q: 1, r: 0 }]);
    expect(oneBlock.length).toBe(16); // 18 - 占格(1,0) - 失达格(2,0)
    expect(has(oneBlock, { q: 1, r: 0 })).toBe(false);
    expect(has(oneBlock, { q: 2, r: 0 })).toBe(false); // 两步内必经 (1,0)，绕行 3 步 > power
    expect(has(oneBlock, { q: 2, r: -1 })).toBe(true); // 对照：经 (1,-1) 的路径不受影响
    // 整墙（q=1 列 5 连格）：q≥2 全部不可达（普通移动不可穿越任何单位）
    const wall = [
      { q: 1, r: -2 },
      { q: 1, r: -1 },
      { q: 1, r: 0 },
      { q: 1, r: 1 },
      { q: 1, r: 2 },
    ];
    const cut = reachable(o, 2, wall);
    expect(cut.length).toBe(11); // 18 - 墙内 5 格 - 墙后失达 3 格((2,0),(2,-1),(2,-2) 两步内前驱全被堵)
    for (const c of cut) expect(c.q).toBeLessThanOrEqual(1);
  });

  it('F-06 移动力：无轻功=基础 2；一阶/二阶加成与 ⌊等级/5⌋ 按公式叠加', () => {
    expect(movePower([])).toBe(2); // MVP 全员（玩家/敌方均无轻功）
    expect(movePower([skill({ kind: 'qingGong', grade: 1.0, level: 7 })])).toBe(4); // 2+1+⌊7/5⌋
    expect(movePower([skill({ kind: 'qingGong', grade: 1.3, level: 10 })])).toBe(6); // 2+2+2
    expect(
      movePower([
        skill({ kind: 'qingGong', grade: 1.0, level: 4 }),
        skill({ kind: 'qingGong', grade: 1.3, level: 10 }),
      ]),
    ).toBe(6); // 多轻功取最高档
    expect(movePower([skill({ kind: 'waiGong', grade: 1.0, level: 60 })])).toBe(2); // 非轻功不计
  });
});

// ---------- 例 5：二阶轻功跳跃（范围/2 可穿越） ----------
describe('jumpReachable（F-06 跳跃）', () => {
  it('范围=⌊power/2⌋；被围死时跳跃仍可穿出；落点占用剔除；power≤1 无跳跃', () => {
    const o: HexPos = { q: 0, r: 0 };
    expect(jumpReachable(o, 1, []).length).toBe(0); // ⌊1/2⌋=0
    expect(jumpReachable(o, 4, []).length).toBe(18); // ⌊4/2⌋=2 → 半径 2 全集
    // 六邻格全被占（普通移动可达 0 格）→ 跳跃无视阻挡直达距离 2 的 12 格
    const ring = hexNeighbors(o);
    expect(reachable(o, 4, ring).length).toBe(0);
    const jump = jumpReachable(o, 4, ring);
    expect(jump.length).toBe(12);
    for (const c of jump) expect(cubeDistance(o, c)).toBe(2);
    // 落点仍不可与其他单位重叠
    const landing = jumpReachable(o, 4, [...ring, { q: 2, r: 0 }]);
    expect(landing.length).toBe(11);
    expect(has(landing, { q: 2, r: 0 })).toBe(false);
  });

  it('【F1 姊妹锁死】跨越单位直达：中间格被占，跳跃直达其后目标格（普通移动则被切割）', () => {
    // C 案 A3：普通移动不可穿任何单位；跳跃=可穿越（纯距离半径，无连通性要求）。
    // 场景：玩家 O(0,0)、挡路单位 X(1,0)、目标 Y(2,0)（O-X-Y 直线，cube(Y)=2）。
    const o = { q: 0, r: 0 };
    const blocker = { q: 1, r: 0 };
    const target = { q: 2, r: 0 };
    // 普通移动：2 步内到 Y 必经 X → 被切割失达
    expect(has(reachable(o, 2, [blocker]), target)).toBe(false);
    // 跳跃（power 4 → 半径 2）：无视中间单位直达 Y，落点为空格
    expect(has(jumpReachable(o, 4, [blocker]), target)).toBe(true);
    // 落点占用仍排除：blocker 本身不可作为跳跃落点
    expect(has(jumpReachable(o, 4, [blocker]), blocker)).toBe(false);
  });
});

// ---------- 例 6：射程三形态（O2 定版几何） ----------
describe('rangeCells 三形态（O2）', () => {
  const o: HexPos = { q: 0, r: 0 };

  it('circle：cube 半径 N 全集（剑/拳/暗器）', () => {
    expect(rangeCells(o, 'circle', 1, undefined).length).toBe(6);
    expect(rangeCells(o, 'circle', 2, undefined).length).toBe(18);
    expect(has(rangeCells(o, 'circle', 2, undefined), o)).toBe(false);
  });

  it('ray：六向射线各 N 格，格间空隙不可选（棍棒）', () => {
    const cells = rangeCells(o, 'ray', 2, undefined);
    expect(cells.length).toBe(12); // 6 向 × 2 格，射线互不重叠
    expect(has(cells, { q: 2, r: 0 })).toBe(true); // 东向第 2 格
    expect(has(cells, { q: 1, r: -1 })).toBe(true); // 东北向第 1 格
    expect(has(cells, { q: 2, r: -1 })).toBe(false); // 两向之间的空隙
    expect(has(cells, o)).toBe(false);
  });

  it('cone：轴 ±1 方向步（120° 扇区）内距离 ≤ N（鞭/刀）；inCone 与全格集合同几何', () => {
    const east: HexPos = { q: 1, r: 0 };
    const cone = rangeCells(o, 'cone', 2, east);
    expect(cone.length).toBe(9); // 距离 1 三格 + 距离 2 六格
    expect(has(cone, { q: 2, r: 0 })).toBe(true); // 正轴
    expect(has(cone, { q: 1, r: -1 })).toBe(true); // 轴 +60°
    expect(has(cone, { q: 0, r: 2 })).toBe(true); // 轴 -60°
    expect(has(cone, { q: 0, r: -1 })).toBe(false); // 背后方向（环距 2）
    expect(has(cone, { q: -1, r: 0 })).toBe(false); // 正后方（环距 3）
    // inCone 逐格一致（session 出招校验与高亮零分叉）
    const all = rangeCells(o, 'circle', 3, undefined);
    for (const c of all) {
      expect(inCone(o, east, c, 2)).toBe(has(cone, c));
      expect(inCone(o, east, c, 3)).toBe(has(rangeCells(o, 'cone', 3, east), c));
    }
    expect(inCone(o, east, o, 9)).toBe(false); // 原点不是目标
  });
});

// ---------- T19/N1 防御（方案 §3.3）：movePathCells——普通移动回退轨合法路径 ----------
// 用例口径 = 领单第一交付 C 组（先红后修）：6 邻 BFS 最短路、起点格不作阻挡、
// occupied/inBounds 不可进入与借道、BFS 失败防御回退 [from,to]、HEX_DIRS 方向序固定→确定性。
describe('movePathCells（T19/N1 防御 · 回退轨 6 邻 BFS）', () => {
  // 同排直线：offset col 5，row 5..8 → axial (3,5) (2,6) (2,7) (1,8)，直距 3
  const F = offsetToAxial(5, 5);
  const M = offsetToAxial(5, 6); // 直线中格
  const T = offsetToAxial(5, 8);

  const adjacentChain = (path: HexPos[]): boolean => {
    for (let i = 1; i < path.length; i++) {
      if (cubeDistance(path[i - 1], path[i]) !== 1) return false;
    }
    return true;
  };

  it('C-1 直连：空占格直线=距离+1 格、首尾正确、逐段六邻相邻、同输入两次全等（方向序固定→确定性）', () => {
    const p1 = movePathCells(F, T, []);
    const p2 = movePathCells(F, T, []);
    expect(p1[0]).toEqual(F);
    expect(p1[p1.length - 1]).toEqual(T);
    expect(p1).toHaveLength(cubeDistance(F, T) + 1);
    expect(adjacentChain(p1)).toBe(true);
    expect(p1).toEqual(p2);
  });

  it('C-2 绕行：直线中格被占 → 路径不含占格、首尾正确、逐段相邻、保持最短路（非回退非加长甩尾）', () => {
    const path = movePathCells(F, T, [M]);
    expect(has(path, M)).toBe(false);
    expect(path[0]).toEqual(F);
    expect(path[path.length - 1]).toEqual(T);
    expect(adjacentChain(path)).toBe(true);
    // 存在等距绕行地线（经 (3,6)/(1,7) 侧），BFS 最短路仍=直距+1；且必非 [F,T] 长度 2 的回退
    expect(path.length).toBe(cubeDistance(F, T) + 1);
  });

  it('C-3 不可达回退：a) 终点被占 b) 界内狭廊无路（BFS 耗尽）→ 均恰返回 [from,to]（=现直线几何，不劣化）', () => {
    // a) 终点被占：legalMoveCells 校验后 session 不会出现，纯函数健壮态——防御回退（免无界展开）
    const onFoe = movePathCells(F, T, [T]);
    expect(onFoe).toHaveLength(2);
    expect(onFoe[0]).toEqual(F);
    expect(onFoe[1]).toEqual(T);
    // b) 界内狭廊（col==5 且 row 4..8 共 5 格）+ 中格 M 被占：廊内连通体不含 T → BFS 耗尽回退
    const corridor = (p: HexPos): boolean => {
      const off = axialToOffset(p);
      return off.col === 5 && off.row >= 4 && off.row <= 8;
    };
    const walled = movePathCells(F, T, [M], corridor);
    expect(walled).toHaveLength(2);
    expect(walled[0]).toEqual(F);
    expect(walled[1]).toEqual(T);
  });

  it('C-4 起点自身格：occupied 含 from 不构成阻挡（session occupied() 天然含移动者旧格）→ 照常找到 BFS 路径', () => {
    const path = movePathCells(F, T, [F, offsetToAxial(9, 9)]);
    expect(path[0]).toEqual(F);
    expect(path[path.length - 1]).toEqual(T);
    // 长度=距离+1 证明走的是 BFS 直连而非 [from,to] 回退（回退长度恒 2）
    expect(path).toHaveLength(cubeDistance(F, T) + 1);
    expect(adjacentChain(path)).toBe(true);
  });

  it('C-5 inBounds 约束：禁东侧（col≥6）绕行 → 从西侧界内绕到，全程不出界、严格长于直线（真绕行非回退）', () => {
    const westOnly = (p: HexPos): boolean => axialToOffset(p).col <= 5;
    const path = movePathCells(F, T, [M], westOnly);
    expect(path[0]).toEqual(F);
    expect(path[path.length - 1]).toEqual(T);
    expect(adjacentChain(path)).toBe(true);
    for (const c of path) expect(axialToOffset(c).col).toBeLessThanOrEqual(5);
    // 地理事实：col≤5 下等距绕行全被封死（SW 侧=M、S 侧=col6），最短界内路=5 格；
    // 断言 > 直距+1 可同时排除「回退 [F,T]（长 2）」与「未受 inBounds 约束的等距路（长 4）」
    expect(path.length).toBeGreaterThan(cubeDistance(F, T) + 1);
  });
});
