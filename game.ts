// 入口：主循环 + 场景切换（场景切换随 T03 补全）
import { FPS_LOG_INTERVAL_MS } from './config/numbers';
import { render } from './ui/render';
import { loadSceneAssets } from './ui/assets';
import { battle } from './systems/battle';
import { growth } from './systems/growth';
import { map as mapSystem } from './systems/map';
import { bindTapInput, createSceneSystem, getStatusBarBottomPx } from './systems/scene';
import { createNpcSystem } from './systems/npc';
import { NPC_POOL } from './config/npcs';
import { loadNpcFrames } from './ui/assets';
import type { NpcFrameAssets } from './types';
import { callCloud } from './net/cloud';
import { EMPTY_SCENE_ASSETS, type SceneAssets } from './types';

// 触摸各模块（保证类型咬合被检查；玩法逻辑后续任务接入）
void battle;
void growth;
void mapSystem;
void callCloud;

function main(): void {
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');

  // T03 场景系统：预载资源（失败降级不阻塞），绑定点击（UI 浮层 > 地面）
  // Q3-R2：真机胶囊下沿（物理 px，一次性取值）；无胶囊环境返回 0 → 布局走 fallback 比例
  const scene = createSceneSystem();
  const statusBarBottom = getStatusBarBottomPx(canvas.width);
  let assets: SceneAssets = EMPTY_SCENE_ASSETS;
  void loadSceneAssets(scene.scene).then((a) => {
    assets = a;
  });
  bindTapInput(scene, () => ({
    width: canvas.width,
    height: canvas.height,
    statusBarBottomPx: statusBarBottom,
  }));

  // T04 NPC 氛围层：预载池帧表 + 首次散布（进场景重刷同口径：启动首帧即首次进入）
  const npcSystem = createNpcSystem(NPC_POOL);
  const npcFrames = new Map<string, NpcFrameAssets>();
  void loadNpcFrames().then((m) => {
    for (const [k, v] of m) npcFrames.set(k, v);
    npcSystem.respawn(scene.avatar.x, scene.avatar.y); // 帧就绪后首刷（时间熵种子）
  });

  // 主循环兼容层：真机=canvas.requestAnimationFrame；开发者工具=全局 RAF；兜底 setTimeout
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

    scene.update(dt); // T03 L环热修：主循环漏调 update → 点击只换方向不移动
    npcSystem.update(dt, scene.avatar.speed); // T04：NPC wander（速度=主角×0.6，系统内算）
    render(
      { ctx, width: canvas.width, height: canvas.height, dt },
      scene.view(assets),
      statusBarBottom,
      npcSystem.view(npcFrames),
      new Map(NPC_POOL.map((c) => [c.id, c])),
      npcFrames,
    );

    if (now - lastFpsLog >= FPS_LOG_INTERVAL_MS) {
      console.log(`[fps] ${(frames * 1000 / (now - lastFpsLog)).toFixed(1)}`);
      frames = 0;
      lastFpsLog = now;
    }
    raf(loop);
  }

  raf(loop);
}

main();
