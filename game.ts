// 入口：主循环 + 场景切换（场景切换随 T03 补全）
import { FPS_LOG_INTERVAL_MS } from './config/numbers';
import { render } from './ui/render';
import { battle } from './systems/battle';
import { growth } from './systems/growth';
import { map as mapSystem } from './systems/map';
import { callCloud } from './net/cloud';

// 触摸各模块（保证类型咬合被检查；玩法逻辑后续任务接入）
void battle;
void growth;
void mapSystem;
void callCloud;

function main(): void {
  const canvas = wx.createCanvas();
  const ctx = canvas.getContext('2d');
  let last = Date.now();
  let lastFpsLog = last;
  let frames = 0;

  function loop(): void {
    const now = Date.now();
    const dt = Math.min(now - last, 100);
    last = now;
    frames++;

    render({ ctx, width: canvas.width, height: canvas.height, dt });

    if (now - lastFpsLog >= FPS_LOG_INTERVAL_MS) {
      console.log(`[fps] ${(frames * 1000 / (now - lastFpsLog)).toFixed(1)}`);
      frames = 0;
      lastFpsLog = now;
    }
    canvas.requestAnimationFrame(loop);
  }

  canvas.requestAnimationFrame(loop);
}

main();
