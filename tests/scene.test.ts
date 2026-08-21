// T03 场景系统单测（需求表 #3/#4/#5/#10；DoD：纯函数 ≥4 用例 + node wx mock 状态机模拟）
// 运行：npm run test:battle（vitest 全量，含 T05 既有 14 用例不回归）
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HERO_WALK_SPEED,
  HERO_FRAME,
  SCENE_BUTTONS,
  SCENE_LABEL,
  WALK_ZONE,
} from '../config/numbers';
import {
  bindTapInput,
  clampTarget,
  createSceneSystem,
  facingToward,
  hitSceneButton,
  layoutSceneButtons,
  stepAvatar,
  walkFrame,
} from '../systems/scene';
import { START_SCENE } from '../config/scenes';
import type { PlayerAvatar } from '../types';

const SIZE = { width: 375, height: 667 }; // 逻辑屏尺寸（iPhone 基准）

// ---------- 用例组 1：目标拉回中央走廊（Q2-T03：WALK_ZONE x[0.24,0.76] y[0.46,0.84]，区外不拒绝） ----------
describe('clampTarget', () => {
  it('走廊内点击原样通过', () => {
    expect(clampTarget(0.5, 0.72)).toEqual({ x: 0.5, y: 0.72 });
    expect(clampTarget(0.24, 0.46)).toEqual({ x: 0.24, y: 0.46 }); // 左上角内点
    expect(clampTarget(0.76, 0.84)).toEqual({ x: 0.76, y: 0.84 }); // 右下角内点
  });

  it('四边区外点击拉回最近走廊边界（逐轴 clamp）', () => {
    expect(clampTarget(0.05, 0.6)).toEqual({ x: 0.24, y: 0.6 }); // 左
    expect(clampTarget(0.95, 0.6)).toEqual({ x: 0.76, y: 0.6 }); // 右
    expect(clampTarget(0.5, 0.1)).toEqual({ x: 0.5, y: 0.46 }); // 上
    expect(clampTarget(0.5, 0.95)).toEqual({ x: 0.5, y: 0.84 }); // 下
  });

  it('角外/整屏外点击拉到最近角点', () => {
    expect(clampTarget(0.05, 0.1)).toEqual({ x: 0.24, y: 0.46 }); // Q2 DoD：左上角区外
    expect(clampTarget(1.2, -0.5)).toEqual({ x: 0.76, y: 0.46 }); // 右上角外
    expect(clampTarget(-1, 2)).toEqual({ x: 0.24, y: 0.84 }); // 左下角外
    expect(clampTarget(0, 0)).toEqual({ x: 0.24, y: 0.46 }); // 全屏左上
  });

  it('半出界（一轴在内一轴在外）只拉出界轴', () => {
    expect(clampTarget(0.2, 0.6)).toEqual({ x: 0.24, y: 0.6 });
    expect(clampTarget(0.5, 0.9)).toEqual({ x: 0.5, y: 0.84 });
  });
});

// ---------- 用例组 2：朝向判定（需求表 #4：点左半屏角色面左） ----------
describe('facingToward', () => {
  it('目标在左→left，在右→right，横向几乎不动→保持', () => {
    expect(facingToward('right', 0.5, 0.2)).toBe('left');
    expect(facingToward('left', 0.5, 0.8)).toBe('right');
    expect(facingToward('left', 0.5, 0.5)).toBe('left');
    expect(facingToward('right', 0.5, 0.500000001)).toBe('right'); // 1e-9 内视为未变
  });
});

// ---------- 用例组 3：单步移动与到达（需求表 #3） ----------
describe('stepAvatar', () => {
  const base: PlayerAvatar = {
    x: 0.5, y: 0.5, speed: HERO_WALK_SPEED, moving: true,
    targetX: 0.9, targetY: 0.5, state: 'walk', direction: 'right',
  };

  it('按速度直线推进，不越目标', () => {
    const s1 = stepAvatar(base, 0.5); // 半秒 → 0.5 + 0.4×0.5 = 0.7
    expect(s1.x).toBeCloseTo(0.7);
    expect(s1.moving).toBe(true);
    expect(s1.state).toBe('walk');
  });

  it('单帧跨过目标 → 精确落在目标点并停回 idle（不过冲）', () => {
    const s = stepAvatar(base, 2); // 距离 0.4 < 0.4×2
    expect(s.x).toBe(0.9);
    expect(s.moving).toBe(false);
    expect(s.state).toBe('idle');
  });

  it('斜线移动按向量方向推进', () => {
    const s = stepAvatar({ ...base, targetY: 0.9 }, 0.25); // 对角距离 0.5657，走 0.1
    expect(s.x).toBeCloseTo(0.5 + 0.1 * (0.4 / Math.hypot(0.4, 0.4)));
    expect(s.y).toBeCloseTo(0.5 + 0.1 * (0.4 / Math.hypot(0.4, 0.4)));
  });
});

// ---------- 用例组 4：walk 帧循环（素材 v3：01~03 左→右→收拢三帧小步循环，播报硬规则） ----------
describe('walkFrame', () => {
  it('帧号在 01~03 循环，起步总是 01，不出现 04+', () => {
    expect(walkFrame(0)).toBe(HERO_FRAME.walkStart);
    expect(walkFrame(HERO_FRAME.walkFrameMs)).toBe(2);
    expect(walkFrame(HERO_FRAME.walkFrameMs * 2)).toBe(3);
    expect(walkFrame(HERO_FRAME.walkFrameMs * 3)).toBe(1); // 回卷
    for (let t = 0; t < 5000; t += 37) {
      const f = walkFrame(t);
      expect(f).toBeGreaterThanOrEqual(HERO_FRAME.walkStart);
      expect(f).toBeLessThanOrEqual(HERO_FRAME.walkEnd); // 04 出招帧永不进 walk（防抬剑帧回归）
    }
  });
});

// ---------- 用例组 5：按钮布局与命中优先级（需求表 #5/#8） ----------
describe('按钮命中', () => {
  it('三按钮等距布局，行中心 y≈0.82（Q3：Tab 栏 0.92 之上）', () => {
    const layout = layoutSceneButtons(SIZE);
    expect(layout).toHaveLength(3);
    expect(layout[0].cy / SIZE.height).toBeCloseTo(0.82, 2); // Q3 DoD：0.82±0.01
    const cy = SCENE_BUTTONS.yRatio * SIZE.height;
    for (const b of layout) expect(b.cy).toBeCloseTo(cy);
    const gapPx = layout[1].cx - layout[0].cx;
    expect(layout[2].cx - layout[1].cx).toBeCloseTo(gapPx); // 等距
    expect(layout[1].cx).toBeCloseTo(SIZE.width / 2); // 居中
    expect(SCENE_LABEL.y).toBeGreaterThan(0.105); // Q3 DoD：标签中心 0.115±0.01
    expect(SCENE_LABEL.y).toBeLessThan(0.125);
  });

  it('点按钮圈内命中、圈外不命中；点按钮不触发移动（UI > 地面）', () => {
    const layout = layoutSceneButtons(SIZE);
    const mid = layout[1]; // 挂机
    const hit = hitSceneButton({ x: mid.cx / SIZE.width, y: mid.cy / SIZE.height }, SIZE);
    expect(hit?.id).toBe('guaji');
    // 圈外 1px
    const miss = hitSceneButton({ x: (mid.cx + mid.r + 1) / SIZE.width, y: mid.cy / SIZE.height }, SIZE);
    expect(miss).toBeNull();

    const sys = createSceneSystem();
    const btnRes = sys.tap({ x: mid.cx / SIZE.width, y: mid.cy / SIZE.height }, SIZE);
    expect(btnRes).toEqual({ type: 'button', id: 'guaji' });
    expect(sys.avatar.moving).toBe(false); // 关键：不触发移动
  });

  it('点地面触发移动且目标已拉回走廊，点左半屏朝向 left', () => {
    const sys = createSceneSystem();
    const res = sys.tap({ x: -0.2, y: 0.7 }, SIZE);
    expect(res).toEqual({ type: 'move', to: { x: 0.24, y: 0.7 } }); // 走廊左缘
    expect(sys.avatar.moving).toBe(true);
    expect(sys.avatar.state).toBe('walk');
    expect(sys.avatar.direction).toBe('left');
    expect(sys.avatar.targetX).toBe(0.24);
  });
});

// ---------- 用例组 6：node 模拟（wx mock）：点击 → 移动状态机转移（DoD C 环自测） ----------
describe('wx mock 状态机模拟', () => {
  afterEach(() => vi.restoreAllMocks());

  it('touchend 点击地面 → walk → 到达回 idle；再点按钮不动', () => {
    const handlers: Array<(e: WxTouchEvent) => void> = [];
    const hooks = {
      onTouchEnd: (cb: (e: WxTouchEvent) => void) => {
        handlers.push(cb);
      },
      getSystemInfo: () => ({ windowWidth: SIZE.width, windowHeight: SIZE.height, pixelRatio: 2 }),
    };
    const sys = createSceneSystem(START_SCENE);
    bindTapInput(sys, () => SIZE, hooks);
    expect(handlers).toHaveLength(1);
    const fire = (x: number, y: number) => handlers[0]({ touches: [], changedTouches: [{ identifier: 0, clientX: x, clientY: y }] });

    // ① 点击右侧走廊外 (0.9, 0.72)：目标拉回走廊右缘 0.76，方向 right（Q2）
    fire(0.9 * SIZE.width, 0.72 * SIZE.height);
    expect(sys.avatar.state).toBe('walk');
    expect(sys.avatar.moving).toBe(true);
    expect(sys.avatar.direction).toBe('right');
    expect(sys.avatar.targetX).toBeCloseTo(0.76, 3);

    // ② 以 60fps 步进，帧号只在 01~03 间循环（素材 v3 播报硬规则；窗 0.42s < 到达 0.65s，避免采到待机帧）
    sys.update(1000 / 60);
    const frames = new Set<number>();
    for (let i = 0; i < 24; i++) {
      sys.update(1000 / 60);
      frames.add(sys.view({ bg: null, heroFrames: [] }).heroFrameIdx);
    }
    expect(Math.max(...frames)).toBeLessThanOrEqual(HERO_FRAME.walkEnd);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(HERO_FRAME.walkStart);

    // ③ 持续步进直到到达（0.5→0.76 距离 0.26 / 0.4 每秒 ≈ 0.65s + 冗余）→ 回 idle 停在走廊右缘
    for (let i = 0; i < 120; i++) sys.update(1000 / 60);
    expect(sys.avatar.state).toBe('idle');
    expect(sys.avatar.moving).toBe(false);
    expect(sys.avatar.x).toBeCloseTo(0.76, 3);
    expect(sys.view({ bg: null, heroFrames: [] }).heroFrameIdx).toBe(HERO_FRAME.idle); // 待机用 00 帧

    // ④ 到达后点中间按钮：不移动，占位 log 被打出
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const layout = layoutSceneButtons(SIZE);
    fire(layout[1].cx, layout[1].cy);
    expect(sys.avatar.moving).toBe(false);
    expect(sys.avatar.state).toBe('idle');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('guaji'));

    // ⑤ Q2 DoD：点左上角区外 (0.05, 0.1) → 目标拉回走廊最近点 (0.24, 0.46)
    fire(0.05 * SIZE.width, 0.1 * SIZE.height);
    expect(sys.avatar.targetX).toBeCloseTo(WALK_ZONE.xMin, 3);
    expect(sys.avatar.targetY).toBeCloseTo(WALK_ZONE.yMin, 3);
    expect(sys.avatar.state).toBe('walk');
    expect(sys.avatar.direction).toBe('left');
  });
});
