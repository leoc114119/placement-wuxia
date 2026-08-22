// 场景系统：移动状态机 + 布局/命中纯函数 + 触摸接入（渲染无关，node 可单测）
// 依据：modules/02-场景系统.md §1.1/§2.2/§3（T03 需求表 #3/#4/#5/#6/#8）
import {
  ARRIVE_EPS,
  BUTTON_ROW_GAP_RATIO,
  HERO_FRAME,
  HERO_START,
  HERO_WALK_SPEED,
  MENU_BOTTOM_MARGIN_PX,
  SCENE_BUTTONS,
  SCENE_BUTTON_DEFS,
  SCENE_LABEL_OFFSET_RATIO,
  STATUS_FALLBACK_RATIO,
  TAB_BAR_H_RATIO,
  WALK_ZONE,
} from '../config/numbers';
import { START_SCENE } from '../config/scenes';
import type {
  Facing,
  PlayerAvatar,
  SceneAssets,
  SceneButton,
  SceneConfig,
  SceneView,
  TouchPoint,
} from '../types';

/** 画布尺寸（逻辑 px 与 0~1 坐标换算用；statusBarBottomPx>0 = 真机胶囊下沿已换算值） */
export interface ViewSize {
  width: number;
  height: number;
  statusBarBottomPx?: number;
}

// ---------- 三段式锚定布局（Q3-T03-R2：渲染与命中共用同一布局来源） ----------

/** 三段式布局产物（全部 canvas 物理px；状态栏锚顶 / Tab 栏锚底 / 场景窗口居中） */
export interface SceneLayout {
  statusBarBottom: number; // 状态栏区下沿
  tabBarTop: number; // Tab 栏区上沿（贴屏幕底）
  sceneRect: { x: number; y: number; width: number; height: number }; // 场景窗口（背景 cover 裁切区）
  labelCy: number; // 地图标签胶囊中心 y
  buttonCy: number; // 三按钮行中心 y
  buttonR: number; // 按钮半径
}

/** 布局唯一真源：胶囊下沿优先（传入值已含余量），否则 fallback 比例；胶囊异常大防御性夹到半屏 */
export function computeSceneLayout(size: ViewSize): SceneLayout {
  const w = size.width;
  const h = size.height;
  const provided = size.statusBarBottomPx ?? 0;
  const statusBarBottom =
    provided > 0 ? Math.min(provided, h / 2) : STATUS_FALLBACK_RATIO * h;
  const tabBarTop = h - TAB_BAR_H_RATIO * h;
  const buttonR = SCENE_BUTTONS.radiusRatio * w;
  return {
    statusBarBottom,
    tabBarTop,
    sceneRect: { x: 0, y: statusBarBottom, width: w, height: tabBarTop - statusBarBottom },
    labelCy: statusBarBottom + SCENE_LABEL_OFFSET_RATIO * h,
    buttonCy: tabBarTop - buttonR - BUTTON_ROW_GAP_RATIO * h,
    buttonR,
  };
}

/** 真机状态栏下沿（canvas 物理 px）：胶囊 bottom + 余量，按 dpr 换算；无胶囊环境返回 0（布局走 fallback） */
export function getStatusBarBottomPx(canvasWidth: number): number {
  try {
    const mb = wx.getMenuButtonBoundingClientRect();
    const si = wx.getSystemInfoSync();
    if (mb && mb.bottom > 0 && si.windowWidth > 0) {
      return Math.round((mb.bottom + MENU_BOTTOM_MARGIN_PX) * (canvasWidth / si.windowWidth));
    }
  } catch (err) {
    console.warn('[scene] 胶囊矩形不可用，状态栏走 fallback 比例', err);
  }
  return 0;
}

// ---------- 纯函数（node 可测，需求表 #10） ----------

/** 点击目标拉回中央走廊最近点（Q2-T03：区外点击不拒绝，走到最近走廊边界点；矩形投影 = 逐轴 clamp） */
export function clampTarget(x: number, y: number): TouchPoint {
  const c = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return { x: c(x, WALK_ZONE.xMin, WALK_ZONE.xMax), y: c(y, WALK_ZONE.yMin, WALK_ZONE.yMax) };
}

/** 朝向判定：目标在左→left，在右→right，几乎无横移→保持原朝向（模块 02 §2.2） */
export function facingToward(cur: Facing, fromX: number, toX: number): Facing {
  if (toX < fromX - 1e-6) return 'left';
  if (toX > fromX + 1e-6) return 'right';
  return cur;
}

/** 单步移动：朝目标直线走 dtSec 秒，到达即停回 idle（纯函数，返回新化身） */
export function stepAvatar(a: PlayerAvatar, dtSec: number): PlayerAvatar {
  if (!a.moving) return a;
  const dx = a.targetX - a.x;
  const dy = a.targetY - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE_EPS || dist <= a.speed * dtSec) {
    return { ...a, x: a.targetX, y: a.targetY, moving: false, state: a.state === 'walk' ? 'idle' : a.state };
  }
  return { ...a, x: a.x + (dx / dist) * a.speed * dtSec, y: a.y + (dy / dist) * a.speed * dtSec };
}

/** walk 帧号：按累计行走时间在 01~04 四帧循环（77 §0.1） */
export function walkFrame(elapsedMs: number): number {
  const span = HERO_FRAME.walkEnd - HERO_FRAME.walkStart + 1; // 4 帧循环
  const idx = Math.floor(elapsedMs / HERO_FRAME.walkFrameMs) % span;
  return HERO_FRAME.walkStart + idx;
}

/** 按钮布局（渲染与命中共用同一布局来源，需求表 #5/#8） */
export interface ButtonLayout {
  button: SceneButton;
  cx: number; // 画布 px
  cy: number;
  r: number;
}

export function layoutSceneButtons(size: ViewSize): ButtonLayout[] {
  const layout = computeSceneLayout(size);
  return SCENE_BUTTON_DEFS.map((b, i) => ({
    button: b,
    cx: (0.5 + (i - 1) * SCENE_BUTTONS.gap) * size.width,
    cy: layout.buttonCy,
    r: layout.buttonR,
  }));
}

/** 按钮命中：逻辑坐标点是否落在任一按钮圆内 */
export function hitSceneButton(p: TouchPoint, size: ViewSize): SceneButton | null {
  for (const b of layoutSceneButtons(size)) {
    const dx = p.x * size.width - b.cx;
    const dy = p.y * size.height - b.cy;
    if (dx * dx + dy * dy <= b.r * b.r) return b.button;
  }
  return null;
}

// ---------- 场景系统（有状态） ----------

/** tap 派发结果（供日志/单测断言） */
export type TapResult =
  | { type: 'button'; id: SceneButton['id'] } // 命中 UI 浮层（占位，不移动）
  | { type: 'move'; to: TouchPoint } // 命中地面 → 移动指令
  | { type: 'none' }; // 非 idle/walk 状态（fight/hangup 归属模块 03/04/08，本模块不驱动）

export interface SceneSystem {
  readonly scene: SceneConfig;
  readonly avatar: PlayerAvatar;
  /** 点击派发：UI 浮层 > 地面（NPC 层由模块 03 插入，模块 02 §2.2） */
  tap(p: TouchPoint, size: ViewSize): TapResult;
  /** 主循环步进：移动 + walk 动画计时 */
  update(dtMs: number): void;
  /** 渲染视图（渲染层只读） */
  view(assets: SceneAssets): SceneView;
}

export function createSceneSystem(scene: SceneConfig = START_SCENE): SceneSystem {
  const avatar: PlayerAvatar = {
    x: HERO_START.x,
    y: HERO_START.y,
    speed: HERO_WALK_SPEED,
    moving: false,
    targetX: HERO_START.x,
    targetY: HERO_START.y,
    state: 'idle',
    direction: 'left', // 素材默认面左（idle 正面帧无朝向，walk 帧面左）
  };
  let walkMs = 0; // walk 动画累计（停止清零，保证起步总是第 1 帧）
  let bobMs = 0; // 降级颠簸相位累计

  return {
    scene,
    avatar,
    tap(p, size) {
      const btn = hitSceneButton(p, size);
      if (btn) return { type: 'button', id: btn.id };
      if (avatar.state === 'fight' || avatar.state === 'hangup') return { type: 'none' };
      const to = clampTarget(p.x, p.y);
      avatar.targetX = to.x;
      avatar.targetY = to.y;
      avatar.direction = facingToward(avatar.direction, avatar.x, to.x);
      avatar.moving = true;
      avatar.state = 'walk';
      walkMs = 0;
      return { type: 'move', to };
    },
    update(dtMs) {
      if (avatar.moving) {
        Object.assign(avatar, stepAvatar(avatar, dtMs / 1000)); // 纯函数算新值，回写共享引用
        walkMs += dtMs;
        if (!avatar.moving) walkMs = 0; // 到达停止，下次起步重置动画
      }
      bobMs += dtMs;
    },
    view(assets) {
      return {
        scene,
        avatar,
        heroFrameIdx: avatar.state === 'walk' ? walkFrame(walkMs) : HERO_FRAME.idle,
        assets,
        bobMs,
      };
    },
  };
}

// ---------- 触摸接入（wx 事件 → 逻辑坐标 → tap 派发） ----------

/** 触摸钩子（缺省用 wx 真实实现；单测可注入 mock） */
export interface TouchHooks {
  onTouchEnd(callback: (e: WxTouchEvent) => void): void;
  getSystemInfo(): WxSystemInfo;
}

const wxTouchHooks: TouchHooks = {
  onTouchEnd: (cb) => wx.onTouchEnd(cb),
  getSystemInfo: () => wx.getSystemInfoSync(),
};

/**
 * 绑定点击：用 touchend 触发（抬起才算点，避免滑动误触）。
 * 坐标换算：client 逻辑 px × (canvas 物理px / window 逻辑px) → canvas px → 0~1。
 */
export function bindTapInput(
  system: SceneSystem,
  size: () => ViewSize,
  hooks: TouchHooks = wxTouchHooks,
): void {
  hooks.onTouchEnd((e) => {
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const { width, height } = size();
    let px = t.clientX;
    let py = t.clientY;
    try {
      const si = hooks.getSystemInfo();
      if (si.windowWidth > 0 && si.windowHeight > 0) {
        px = (t.clientX / si.windowWidth) * width;
        py = (t.clientY / si.windowHeight) * height;
      }
    } catch (err) {
      console.warn('[scene] getSystemInfoSync 失败，按 1:1 换算', err);
    }
    const res = system.tap({ x: px / width, y: py / height }, { width, height });
    if (res.type === 'button') console.log(`[scene] 按钮点击占位：${res.id}`);
  });
}
