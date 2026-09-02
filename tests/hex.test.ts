// T15 hex 数学单测（DoD：hex 6 例——换算往返/邻接/距离/可达/跳跃/三形态射程）
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
