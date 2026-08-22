// 入口：主循环 + 场景切换（江湖 ⇄ 战斗，T06 接入调试入口进出）
import { FPS_LOG_INTERVAL_MS } from './config/numbers';
import { render } from './ui/render';
import { loadSceneAssets } from './ui/assets';
import { battle } from './systems/battle';
import { growth } from './systems/growth';
import { map as mapSystem } from './systems/map';
import { bindTapInput, createSceneSystem, getStatusBarBottomPx } from './systems/scene';
import { createNpcSystem } from './systems/npc';
import { createBattleSession, type BattleSession } from './systems/battle-ui';
import {
  createFxBook,
  renderBattle,
  screenToBattleGrid,
  spawnFx,
  computeCamera,
  type BattleAssets,
  type BattleLayoutInfo,
} from './ui/battle-render';
import { loadBattleAssets, loadNpcFrames } from './ui/assets';
import { NPC_POOL } from './config/npcs';
import { TILE_HALF_H, TILE_HALF_W } from './config/battle';
import { callCloud } from './net/cloud';
import { EMPTY_SCENE_ASSETS, type NpcFrameAssets, type SceneAssets } from './types';

// 触摸各模块（保证类型咬合被检查；玩法逻辑后续任务接入）
void battle;
void growth;
void mapSystem;
void callCloud;

type GameMode = 'jianghu' | 'battle';

function main(): void {
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');

  // ---------- 江湖场景（T03/T04） ----------
  const scene = createSceneSystem();
  const statusBarBottom = getStatusBarBottomPx(canvas.width);
  let assets: SceneAssets = EMPTY_SCENE_ASSETS;
  void loadSceneAssets(scene.scene).then((a) => {
    assets = a;
  });

  const npcSystem = createNpcSystem(NPC_POOL);
  const npcFrames = new Map<string, NpcFrameAssets>();
  void loadNpcFrames().then((m) => {
    for (const [k, v] of m) npcFrames.set(k, v);
    npcSystem.respawn(scene.avatar.x, scene.avatar.y); // 帧就绪后首刷（时间熵种子）
  });

  // ---------- 战斗界面（T06：调试入口进出，场景点怪接线是后续单） ----------
  let mode: GameMode = 'jianghu';
  let battleSession: BattleSession | null = null;
  let battleAssets: BattleAssets | null = null;
  let battleAssetsLoading = false;
  const fxBook = createFxBook();
  let battleLayout: BattleLayoutInfo = { btnHits: [], overlayText: null, panel: null };
  // 战斗镜头手动拖动偏移（L 环 08-22：画面可拖动；clamp 在 computeCamera 内统一处理）
  const camDrag = { x: 0, y: 0 };
  const jianghuTapSize = () => ({
    width: canvas.width,
    height: canvas.height,
    statusBarBottomPx: statusBarBottom,
  });
  let unbindJianghuTap: () => void = () => {};
  let unbindBattleTap: () => void = () => {};

  function rebindJianghuTap(): void {
    unbindJianghuTap();
    unbindJianghuTap = bindTapInput(scene, jianghuTapSize);
  }

  /** 调试入口进战斗（A1 Q12 双入口：preview 标记 / wx.__enterBattle(seed)） */
  function enterBattle(seed?: number): void {
    if (mode === 'battle') return;
    const s = seed ?? (Date.now() & 0x7fffffff);
    mode = 'battle';
    camDrag.x = 0;
    camDrag.y = 0;
    unbindJianghuTap();
    battleSession = createBattleSession(NPC_POOL, s, 'auto');
    console.log(`[battle] 进入战斗（调试入口）seed=${s} 敌方=${battleSession.actors.length - 1}`);
    if (!battleAssets && !battleAssetsLoading) {
      battleAssetsLoading = true;
      void loadBattleAssets().then((a) => {
        battleAssets = a;
      });
    }
    bindBattleTap();
  }

  function exitBattle(): void {
    if (mode !== 'battle') return;
    console.log('[battle] 退出战斗，返回江湖（session 状态保持口径）');
    mode = 'jianghu';
    battleSession = null;
    unbindBattleTap();
    rebindJianghuTap();
  }

  function bindBattleTap(): void {
    unbindBattleTap = () => {};
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    const toCanvasPx = (clientX: number, clientY: number): { x: number; y: number } => {
      let px = clientX;
      let py = clientY;
      try {
        const si = wx.getSystemInfoSync();
        if (si.windowWidth > 0 && si.windowHeight > 0) {
          px = (clientX / si.windowWidth) * canvas.width;
          py = (clientY / si.windowHeight) * canvas.height;
        }
      } catch {
        /* 1:1 兜底 */
      }
      return { x: px, y: py };
    };
    const onStart = (e: WxTouchEvent): void => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const p = toCanvasPx(t.clientX, t.clientY);
      startX = lastX = p.x;
      startY = lastY = p.y;
      dragging = false;
      moved = false;
    };
    const onMove = (e: WxTouchEvent): void => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      const p = toCanvasPx(t.clientX, t.clientY);
      const dxTotal = p.x - startX;
      const dyTotal = p.y - startY;
      if (!dragging && Math.hypot(dxTotal, dyTotal) > 8) dragging = true; // 超阈值=拖镜头非点按
      if (dragging) {
        camDrag.x += p.x - lastX;
        camDrag.y += p.y - lastY;
        moved = true;
      }
      lastX = p.x;
      lastY = p.y;
    };
    const onEnd = (e: WxTouchEvent): void => {
      const session = battleSession;
      if (!session) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const p = toCanvasPx(t.clientX, t.clientY);
      if (dragging) return; // 拖动结束不触发点按
      void moved;

      // 结束遮罩：点击任意处返回江湖（胜/负/逃跑后）
      if (session.phase !== 'fighting') {
        exitBattle();
        return;
      }
      // ① 圆钮/特轻绝命中优先（UI > 格子）
      for (const b of battleLayout.btnHits) {
        if ((p.x - b.cx) ** 2 + (p.y - b.cy) ** 2 <= b.r ** 2) {
          if (b.id === 'exit') {
            session.flee(); // 逃跑：无损失无结算直接回场景（§3/§6）
            return;
          }
          if (b.id === 'mode') {
            session.setMode(session.mode === 'auto' ? 'manual' : 'auto');
            return;
          }
          if (b.id === 'speed') {
            session.toggleSpeed();
            return;
          }
          if (b.id === 'attr' || b.id === 'equip') {
            battleLayout.panel = battleLayout.panel === b.id ? null : (b.id as 'attr' | 'equip');
            return;
          }
          if (b.id === 'te') {
            session.tapSkill('te');
            return;
          }
          if (b.id === 'qing') {
            session.tapQinggong();
            return;
          }
          if (b.id === 'jue') {
            session.tapSkill('jue');
            return;
          }
        }
      }
      // ② 格子（手动模式绿格/金格；朝向随机 + 相机（含拖动偏移）双还原）
      const cam = computeCamera(session, canvas.width, canvas.height, camDrag);
      const g = screenToBattleGrid(session, cam, p.x, p.y);
      session.tapCell(g.x, g.y);
    };
    wx.onTouchStart(onStart);
    wx.onTouchMove(onMove);
    wx.onTouchEnd(onEnd);
    unbindBattleTap = () => {
      wx.offTouchStart?.(onStart);
      wx.offTouchMove?.(onMove);
      wx.offTouchEnd?.(onEnd);
    };
  }

  // 调试入口（A1 Q12 + 工单 #8 隐藏按钮口径）
  // 隐藏长按：按住屏幕顶部状态栏预留区（y < 12% 屏高）约 1.2s → 进战斗（时间熵 seed）。
  // console 直呼实测不可用：开发者工具调试上下文与 game 运行上下文 realm 隔离，
  // wx/globalThis 挂载属性（node 冒烟验证成功）在工具 console 均取不到——UI 入口兜底。
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  wx.onTouchStart((e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    const si = (() => {
      try {
        return wx.getSystemInfoSync();
      } catch {
        return null;
      }
    })();
    const logicalY = si && si.windowHeight > 0 ? (t.clientY / si.windowHeight) : t.clientY / canvas.height;
    if (logicalY < 0.12) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        console.log('[battle] 长按调试入口触发');
        enterBattle();
      }, 1200);
    }
  });
  const cancelLongPress = (): void => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };
  wx.onTouchEnd(cancelLongPress);
  wx.onTouchCancel(cancelLongPress);
  // console 入口挂载保留（非工具环境/未来 realm 打通时可用）
  (globalThis as Record<string, unknown>).__enterBattle = enterBattle;
  type WxWithDebug = typeof wx & { __enterBattle?: (seed?: number) => void };
  try {
    (wx as WxWithDebug).__enterBattle = enterBattle;
  } catch (err) {
    console.warn('[battle] wx.__enterBattle 挂载失败（基础库限制），请用 __enterBattle(42)', err);
  }
  rebindJianghuTap(); // 初始绑定江湖触摸（进战斗时解绑、退出时重绑）
  const dbg = (globalThis as Record<string, unknown>).__BATTLE_DEBUG__;
  if (dbg && typeof dbg === 'object' && (dbg as { battle?: number }).battle) {
    enterBattle((dbg as { seed?: number }).seed);
  }

  // ---------- 主循环兼容层（真机=canvas.requestAnimationFrame；开发者工具=全局 RAF；兜底 setTimeout） ----------
  const raf: (cb: () => void) => void =
    typeof canvas.requestAnimationFrame === 'function'
      ? (cb) => canvas.requestAnimationFrame(cb)
      : typeof (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'function'
        ? (cb) =>
            (globalThis as unknown as { requestAnimationFrame: (cb: () => void) => void }).requestAnimationFrame(cb)
        : (cb) => setTimeout(cb, 1000 / 60);
  let last = Date.now();
  let lastFpsLog = last;
  let frames = 0;

  function loop(): void {
    const now = Date.now();
    const dt = Math.min(now - last, 100);
    last = now;
    frames++;

    if (mode === 'battle' && battleSession) {
      const session = battleSession;
      session.update(dt);
      // fx 队列跨层搬运（状态机 → 渲染簿）
      for (const fx of session.drainFx()) {
        const target = session.actors.find((a) => a.id === fx.targetId);
        if (target) {
          spawnFx(fxBook, {
            kind: fx.kind,
            worldX: worldXOf(session, target.renderX, target.renderY),
            worldY: worldYOf(session, target.renderX, target.renderY),
            radiusTiles: fx.radius,
            grade: fx.grade,
            hitFlash: fx.kind === 'skill',
          });
        }
      }
      battleLayout = { btnHits: [], overlayText: null, panel: battleLayout.panel };
      renderBattle(
        { ctx, width: canvas.width, height: canvas.height, dt },
        session,
        battleAssets ?? { bg: null, framesByKind: new Map() },
        fxBook,
        statusBarBottom,
        battleLayout,
        camDrag,
      );
    } else {
      scene.update(dt); // T03 L环热修：主循环漏调 update → 点击只换方向不移动
      npcSystem.update(dt, scene.avatar.speed); // T04：NPC wander
      render(
        { ctx, width: canvas.width, height: canvas.height, dt },
        scene.view(assets),
        statusBarBottom,
        npcSystem.view(npcFrames),
        new Map(NPC_POOL.map((c) => [c.id, c])),
        npcFrames,
      );
    }

    if (now - lastFpsLog >= FPS_LOG_INTERVAL_MS) {
      console.log(`[fps] ${(frames * 1000 / (now - lastFpsLog)).toFixed(1)}`);
      frames = 0;
      lastFpsLog = now;
    }
    raf(loop);
  }

  raf(loop);
}

// fx 世界坐标（朝向随机还原；与 battle-render 的 projectGrid 同式——TILE_HALF 常量同源 config/battle）
function worldXOf(session: BattleSession, gx: number, gy: number): number {
  const y = session.facingFlip ? 12 - 1 - gy : gy;
  return (gx - y) * TILE_HALF_W;
}
function worldYOf(session: BattleSession, gx: number, gy: number): number {
  const y = session.facingFlip ? 12 - 1 - gy : gy;
  return (gx + y) * TILE_HALF_H;
}

main();
