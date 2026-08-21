// 图片资源加载：wx.createImage 预载，失败置 null + 日志（不崩，需求表 #9）
import { HERO_FRAME, heroFrameSrc } from '../config/numbers';
import type { SceneAssets, SceneConfig } from '../types';

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

/** 场景资源预载：背景 1 张 + hero 帧表 00~04（05+ 暂不用，需求表 #2） */
export async function loadSceneAssets(scene: SceneConfig): Promise<SceneAssets> {
  const frameJobs: Array<Promise<WxImage | null>> = [];
  for (let i = 0; i < HERO_FRAME.preloadCount; i++) frameJobs.push(loadImage(heroFrameSrc(i)));
  const [bg, heroFrames] = await Promise.all([loadImage(scene.bg), Promise.all(frameJobs)]);
  const loaded = heroFrames.filter((f): f is WxImage => f !== null).length;
  console.log(`[assets] 场景资源就绪：bg=${bg ? 'ok' : 'fail'} hero帧=${loaded}/${HERO_FRAME.preloadCount}`);
  return { bg, heroFrames };
}
