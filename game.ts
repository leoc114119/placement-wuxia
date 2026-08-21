// 入口：主循环 + 场景切换（场景切换随 T03 补全）
import { FPS_LOG_INTERVAL_MS } from './config/numbers';
import { render } from './ui/render';
import { loadSceneAssets } from './ui/assets';
import { battle } from './systems/battle';
import { growth } from './systems/growth';
import { map as mapSystem } from './systems/map';
import { bindTapInput, createSceneSystem } from './systems/scene';
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
  const scene = createSceneSystem();
  let assets: SceneAssets = EMPTY_SCENE_ASSETS;
  void loadSceneAssets(scene.scene).then((a) => {
    assets = a;
  });
  bindTapInput(scene, () => ({ width: canvas.width, height: canvas.height }));

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

    render({ ctx, width: canvas.width, height: canvas.height, dt }, scene.view(assets));

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
