// 场景配置表（数据源：config/场景与NPC配置.md §2 · 单一数据源，新增场景=加配置不改代码）
// T03 只消费 id/name/bg/unlockPractice；npcs/boss/hangup 字段由模块 03/04/08 任务卡补
import type { SceneConfig } from '../types';

/** 青牛山下 · 野径（新手场景，MVP 唯一场景） */
export const SCENE_QINGNIU: SceneConfig = {
  id: 'scene-qingniu',
  name: '青牛山下 · 野径',
  bg: 'assets/ui/scene_jianghu.png',
  unlockPractice: 0,
};

/** 场景表（后续场景素材就绪后按需追加） */
export const SCENES: SceneConfig[] = [SCENE_QINGNIU];

/** 开局场景 */
export const START_SCENE: SceneConfig = SCENE_QINGNIU;
