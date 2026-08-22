// 图片资源加载：wx.createImage 预载，失败置 null + 日志（不崩，需求表 #9）
import { HERO_FRAME, NPC_FRAME, SCENE_BUTTON_DEFS, heroFrameSrc } from '../config/numbers';
import { NPC_POOL } from '../config/npcs';
import type { NpcFrameAssets, SceneAssets, SceneConfig } from '../types';

/** 单图加载：resolve 图片或 null（永不 reject，调用方无需 try/catch） */
export function loadImage(src: string): Promise<WxImage | null> {
  return new Promise((resolve) => {
    try {
      const img = wx.createImage();
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.warn(`[assets] 图片加载失败，降级纯色渲染：${src}`, err);
        resolve(null);
      };
      img.src = src;
    } catch (err) {
      console.warn(`[assets] wx.createImage 不可用：${src}`, err);
      resolve(null);
    }
  });
}

/** 场景资源预载：背景 1 + hero 帧表 00~03 + 三按钮图标（NPC 池帧表走 loadNpcFrames） */
export async function loadSceneAssets(scene: SceneConfig): Promise<SceneAssets> {
  const frameJobs: Array<Promise<WxImage | null>> = [];
  for (let i = 0; i < HERO_FRAME.preloadCount; i++) frameJobs.push(loadImage(heroFrameSrc(i)));
  const iconJobs = SCENE_BUTTON_DEFS.map((d) => loadImage(d.iconSrc));
  const [bg, heroFrames, buttonIcons] = await Promise.all([
    loadImage(scene.bg),
    Promise.all(frameJobs),
    Promise.all(iconJobs),
  ]);
  const framesLoaded = heroFrames.filter((f): f is WxImage => f !== null).length;
  const iconsLoaded = buttonIcons.filter((f): f is WxImage => f !== null).length;
  console.log(
    `[assets] 场景资源就绪：bg=${bg ? 'ok' : 'fail'} hero帧=${framesLoaded}/${HERO_FRAME.preloadCount} 按钮图标=${iconsLoaded}/${SCENE_BUTTON_DEFS.length}`,
  );
  return { bg, heroFrames, buttonIcons };
}

/** NPC 池帧表预载（T04；与场景资源解耦，进场景前调用一次） */
export async function loadNpcFrames(): Promise<Map<string, NpcFrameAssets>> {
  const map = new Map<string, NpcFrameAssets>();
  await Promise.all(
    NPC_POOL.map(async (npc) => {
      const jobs: Array<Promise<WxImage | null>> = [];
      for (let i = 0; i < NPC_FRAME.preloadCount; i++) {
        jobs.push(loadImage(`${npc.appearance.sprite}_0${i}_transparent.png`));
      }
      map.set(npc.id, { frames: await Promise.all(jobs) });
    }),
  );
  for (const [id, fa] of map) {
    const ok = fa.frames.filter((f) => f !== null).length;
    console.log(`[assets] NPC帧表 ${id}: ${ok}/${NPC_FRAME.preloadCount}`);
  }
  return map;
}
