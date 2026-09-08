// 光影组合播放器（T25 · trial_fx_01，《光影组合试点方案-trial_fx_01-v0.1》§3.1）。
// 选择独立播放器：配方实例/局部时钟/帧选择/缺图降级全部内聚，战场渲染器只负责 L0~L6
// 顺序（经 drawFrame 尾参 hook 调 draw，见 battle-hex-render §T25 注）。
// 铁律：本模块禁 import battle-core/battle-session（渲染层红线，用例锁）；UI 只展示——
// 播放器不写 HP、不掷 RNG、不发战斗事件，只按配方时间轴做视觉叠加。
// 环境无关：图片由宿主预载后注入（wx.createImage / 浏览器 Image 均可），Canvas ctx
// 由调用方传入，无微信运行时依赖——纯帧选择/时窗/生命周期可在 node 单测。
import type { FxLayerRecipe, FxRecipe } from '../types';

/** 最小图片接口（WxImage / HTMLImageElement 结构均满足；drawImage 处统一收敛转型） */
export interface FxImg {
  width: number;
  height: number;
}

/** 帧资源包：key = `${frameDir}/${frames[i]}`；null = 该帧加载失败（draw 跳过，预载已告警） */
export type FxFramePack = Map<string, FxImg | null>;

/** 预载结果：missing=加载失败帧的完整路径清单（空数组=全就绪；非空 → DoD FAIL）；
 * expectedCount=配方声明帧总数、loadedCount=实际就绪数——数量不符的显式断言面（§4.2 DoD） */
export interface FxFramePackResult {
  pack: FxFramePack;
  missing: string[];
  expectedCount: number;
  loadedCount: number;
}

/** 世界锚点（Canvas 世界像素；hex 战场由宿主经 hexToWorld(actor.renderPos) 换算后传入——
 * 播放器内禁出现第二套格心换算，方案 §3.2） */
export interface FxAnchor {
  x: number;
  y: number;
}

/** 相机/视口（渲染层 drawFrame 同款语义：屏幕坐标 = 世界 − cam + 尺寸/2） */
export interface FxCamera {
  x: number;
  y: number;
}

/** 播放实例（一个施法实例对应一个实例；ID 自增不复用） */
export interface FxInstance {
  id: number;
  recipe: FxRecipe;
  anchor: FxAnchor;
  startedAtSec: number; // 宿主演出钟（view.time 同源逻辑时钟；x1/x2 只改该钟速率，配方不变速）
  durationMs: number; // T = 该次 castDurationMs
  elapsedMs: number; // update(nowSec) 写入的缓存相位（draw 只读，纯净双段）
}

/**
 * 配方约束校验（方案 §2）：windowStart/windowEnd 满足 0 ≤ start < end ≤ 1；frames 非空；
 * scale > 0；结构枚举合法。返回违规描述数组（空数组=合法）。
 */
export function validateRecipe(recipe: FxRecipe): string[] {
  const errs: string[] = [];
  if (!recipe || typeof recipe.id !== 'string' || recipe.id.length === 0) errs.push('id 非空');
  if (recipe.durationSource !== 'cast') errs.push(`durationSource 仅支持 'cast'，got ${String(recipe.durationSource)}`);
  if (recipe.anchor !== 'casterCellCenter') errs.push(`anchor 仅支持 'casterCellCenter'，got ${String(recipe.anchor)}`);
  if (!Array.isArray(recipe.layers) || recipe.layers.length === 0) errs.push('layers 非空数组');
  else {
    recipe.layers.forEach((layer, i) => {
      const tag = `layers[${i}](${String(layer?.id)})`;
      if (!layer || typeof layer.id !== 'string' || layer.id.length === 0) errs.push(`${tag} id 非空`);
      if (!layer || typeof layer.frameDir !== 'string' || layer.frameDir.length === 0) errs.push(`${tag} frameDir 非空`);
      if (!layer || !Array.isArray(layer.frames) || layer.frames.length === 0) errs.push(`${tag} frames 非空数组`);
      if (!layer || !(Number.isFinite(layer.windowStart) && Number.isFinite(layer.windowEnd))) errs.push(`${tag} 时窗必须为有限数`);
      else if (layer.windowStart < 0 || layer.windowStart >= layer.windowEnd || layer.windowEnd > 1) {
        errs.push(`${tag} 时窗须满足 0 ≤ start < end ≤ 1，got [${layer.windowStart}, ${layer.windowEnd}]`);
      }
      if (!layer || !(typeof layer.scale === 'number' && Number.isFinite(layer.scale) && layer.scale > 0)) {
        errs.push(`${tag} scale 须 > 0`);
      }
      if (!layer || !layer.anchorOffsetPx || typeof layer.anchorOffsetPx.x !== 'number' || typeof layer.anchorOffsetPx.y !== 'number') {
        errs.push(`${tag} anchorOffsetPx 须为 {x,y} 数值`);
      }
      if (!layer || layer.blendMode !== 'lighter') errs.push(`${tag} blendMode 试点固定 'lighter'`);
    });
  }
  return errs;
}

/**
 * 层帧选择（纯函数，方案 §2/§5.1 时窗口径）：
 * - t < windowStart：-1（未进窗，该层不画）；
 * - t ∈ [windowStart, windowEnd)：窗内等分帧序 floor(progress·n)，clamp 防浮点越界；
 * - t ≥ windowEnd：windowEnd=1 的末段层右端闭——夹取末帧播到 T（方案 §5.1 L3 [.78T, T] 闭）；
 *   其余层右开（t ≥ end 即停播，L1/L2 不定格残留）。
 */
export function pickLayerFrame(
  frameCount: number,
  windowStart: number,
  windowEnd: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (frameCount <= 0 || !(durationMs > 0)) return -1;
  const t = elapsedMs / durationMs;
  if (t < windowStart) return -1;
  if (windowEnd < 1 && t >= windowEnd) return -1; // 非末段层右开：t ≥ end 停播（L1/L2 不定格残留）
  // 窗内等分；末段层（windowEnd=1）t ≥ T 时 local ≥ span → idx ≥ n → clamp 夹取末帧（含浮点尾帧）
  const spanMs = (windowEnd - windowStart) * durationMs;
  const localMs = elapsedMs - windowStart * durationMs;
  const idx = Math.floor((localMs / spanMs) * frameCount);
  return Math.min(frameCount - 1, Math.max(0, idx));
}

/**
 * 注入式预载器（方案 §4.2）：loadImage 由宿主注入——小游戏生产传 wx.createImage 封装、
 * battle_demo 传浏览器 Image 封装、单测传 stub；播放器本体不在施法中途懒加载。
 * 注入 loader 的 reject 一律收敛（T25-R2 缺陷 2）：catch → null 槽 + warn 记路径，绝不向上
 * 传播打崩战斗入口预载；加载失败帧 draw 跳帧。数量不符经 missing/loadedCount 显式暴露
 * （DoD 断言 loadedCount===expectedCount 且 missing 空）。
 * 配方先过 validateRecipe，违规 throw（配方为开发期常量，进场阶段 fail-fast 暴露）。
 */
export async function loadFxFramePack(
  recipe: FxRecipe,
  loadImage: (url: string) => Promise<FxImg | null>,
): Promise<FxFramePackResult> {
  const errs = validateRecipe(recipe);
  if (errs.length > 0) throw new Error(`[fx-player] 配方 ${recipe?.id} 非法：${errs.join('；')}`);
  const pack: FxFramePack = new Map();
  const missing: string[] = [];
  let expectedCount = 0;
  await Promise.all(
    recipe.layers.map(async (layer: FxLayerRecipe) => {
      await Promise.all(
        layer.frames.map(async (name) => {
          expectedCount += 1;
          const key = `${layer.frameDir}/${name}`;
          let img: FxImg | null = null;
          try {
            img = await loadImage(key);
          } catch (err) {
            console.warn(`[fx-player] FX 帧加载器异常（收敛为缺帧）：${key}`, err);
            img = null;
          }
          pack.set(key, img);
          if (!img) {
            missing.push(key);
            console.warn(`[fx-player] FX 帧加载失败（演出跳帧）：${key}`);
          }
        }),
      );
    }),
  );
  return { pack, missing, expectedCount, loadedCount: expectedCount - missing.length };
}

// ============ 触发门（T25-R2 缺陷 1：accepted cast 事件双源） ============

/** cast 快照最小结构（session _debug pendingCasts/presentationCasts 条目同形） */
export interface FxCastSnapshotLike {
  actorId: string;
  skillId: string;
  startedAtSec: number;
  finishAtSec: number;
}

/** 触发矩阵事件最小结构（BattleUiEvent 子集同形） */
export interface FxTriggerEventLike {
  type: string;
  actorId?: string;
  skillId?: string;
  t: number;
}

/**
 * 特功 accepted cast 触发门（方案 §5.1「t0 必启动一次，非伤害事件监听」+ T26-R1 身份配对）：
 * 事件双源=skill 与 miss——非空 cast 段 1 逐目标发 skill（命中）/miss（闪避），全闪避时
 * 只有 miss 事件；空放只发 skill。
 *
 * 【T26-R1 · 身份制（seq=169 P1 修复）】自动模式下同一施法者新 cast 的 t0 可与旧 cast 的
 * t1 同刻（drainDueCasts 收口释放施法锁后，同 tick BAR-2 ready 轮转即受理新 cast）——旧
 * 时间窗启发式（|evT−(t0+T)|≤0.011）无法从事件四元组区分「旧 cast 段 2」与「新 cast 段 1」，
 * 曾把新 cast 段 1 误拦。修复=宿主先经 findCastSnapshot 从 session 快照队列（core 唯一真值）
 * 配出该事件的 cast 身份再过门：
 * - 身份分支（cast 非空）：事件 t 必须落在该 cast 自身 startedAtSec（段 1 特征），身份键
 *   `(actorId|startedAtSec)` 已启动则去重拦截（同 cast 段 1 双源/多目标），否则放行——
 *   新 cast 在旧 t1 同刻凭自身身份正常启动（恰一次）。
 * - 无快照分支（cast=null）：仅两类真实来源——(a) 段 1 致胜终局（AS-9：scheduleSkillCast
 *   段 1 循环中途 return，cast 未及入队，事件 t=t0，须放行否则 T25 路径 4 演出丢失）；
 *   (b) 段 2 结算事件（其 cast 早已启动收口，须拦=T25-R2 语义）。两类按已启动登记时窗+
 *   skillId 比对区分。已知极限（回执声明）：同 actor「前 cast 段 2 同刻 + 新 cast 亦段 1
 *   致胜无快照且同技」四元组全同不可区分，保守拦（段 2 优先）；AI 冷却机制使同技同刻连放
 *   实际不发生（cooldownTurns≥2 时必换技）。
 * 段 2 拦截较旧启发式只强不弱：凡身份不符（含全部段 2 形态）一律不放行。
 * 施法中无输入态+行动者串行 → 同 actor 的 cast startedAtSec 全局唯一，身份键无歧义。
 */
export class FxCastGate {
  private started = new Map<string, { t0: number; durMs: number; skillId: string }>(); // 键 `${actorId}|${t0Sec}`

  constructor(private readonly specialSkillIds: ReadonlySet<string>) {}

  /** 该事件是否应启动演出（true=候选放行，宿主 start 后必须 commitStart 登记身份）。
   * cast=宿主经 findCastSnapshot 配出的 cast 身份（查不到=null，非任意省略）。 */
  shouldStart(e: FxTriggerEventLike, cast: FxCastSnapshotLike | null): boolean {
    if (e.type !== 'skill' && e.type !== 'miss') return false;
    if (!e.actorId || !e.skillId || !this.specialSkillIds.has(e.skillId)) return false;
    if (cast) {
      // 身份分支：事件必须是该 cast 自身的段 1（t≈startedAtSec）；段 2 结算（t=finishAtSec≠t0，
      // T>0.5s≫容差）/陈旧事件身份不符即拦——段 2 拦截的强化形态
      if (Math.abs(e.t - cast.startedAtSec) > 0.011) return false;
      return !this.started.has(`${e.actorId}|${cast.startedAtSec}`); // 同 cast 段 1 双源/多目标去重
    }
    // 无快照分支（来源与区分见类注）
    const rec = this.lastRecFor(e.actorId);
    if (!rec) return true; // (a) 无任何登记 → 段 1 致胜终局首条（或首个 cast）——放行
    if (Math.abs(e.t - rec.t0) < 0.005) return false; // 已启动 cast 的段 1 重放（双源/多目标）
    if (e.skillId === rec.skillId && Math.abs(e.t - (rec.t0 + rec.durMs / 1000)) <= 0.011) return false; // (b) 段 2（同技才可能混淆）
    return true; // (a) 同刻撞前 cast t1 但换技（或窗外）→ 无快照新 cast 段 1——放行
  }

  /** 宿主启动演出后登记该次 cast 身份（t0=cast.startedAtSec、durMs=启动时长）。
   * 同 actor 串行：登记前清该 actor 旧键（旧 cast 段 1 批次已消费完，防记忆膨胀）。 */
  commitStart(actorId: string, t0Sec: number, durMs: number, skillId = ''): void {
    for (const k of this.started.keys()) {
      if (k.startsWith(`${actorId}|`)) this.started.delete(k);
    }
    this.started.set(`${actorId}|${t0Sec}`, { t0: t0Sec, durMs, skillId });
  }

  private lastRecFor(actorId: string): { t0: number; durMs: number; skillId: string } | null {
    let rec: { t0: number; durMs: number; skillId: string } | null = null;
    for (const [k, v] of this.started) {
      if (k.startsWith(`${actorId}|`)) rec = v;
    }
    return rec;
  }

  /** 跨局清空（session 重建时与 fxPlayer.clearAll 同调） */
  reset(): void {
    this.started.clear();
  }
}

/**
 * 从 cast 快照队列找该次 accepted cast（T=finishAtSec-startedAtSec，core 唯一真值 session 已
 * 算好——宿主只读快照禁重算）。evT 为事件 t（emitAt 取整 2 位，误差 <0.005，容差 0.011）。
 */
export function findCastSnapshot<T extends FxCastSnapshotLike>(
  casts: ReadonlyArray<T>,
  actorId: string,
  skillId: string,
  evT: number,
): T | null {
  return casts.find((c) => c.actorId === actorId && c.skillId === skillId && Math.abs(c.startedAtSec - evT) <= 0.011) ?? null;
}

/**
 * FxPlayer（方案 §3.1 最小职责）：start/update/draw/clear + clearAll。
 * 宿主顺序：每帧 update(演出钟) → drawFrame 内部 draw；session 重建/逃跑按实例清空（§5.2）。
 * 中断/死亡不回滚不截断：实例一旦 start 即按自身时间轴播完 t0+T，与施法者后续状态无关。
 */
export class FxPlayer {
  private seq = 0; // 实例 ID 发生器（单调递增，不复用）
  private instances: FxInstance[] = [];

  constructor(private pack: FxFramePack) {}

  /** 注入/替换帧包（T25 接线形态：宿主进场预载全部 settle 后调用一次；start 只发生在
   * 主循环内，注入时序天然早于任何演出，与方案 §4.2「全部 settle 才允许首个特功演出」闭合）。 */
  setPack(pack: FxFramePack): void {
    this.pack = pack;
  }

  /** 启动一个施法实例，返回实例 ID（宿主无需持有；clearAll 按遍历清）。 */
  start(recipe: FxRecipe, anchor: FxAnchor, startedAtSec: number, durationMs: number): number {
    const id = ++this.seq;
    this.instances.push({
      id,
      recipe,
      anchor: { x: anchor.x, y: anchor.y },
      startedAtSec,
      durationMs,
      elapsedMs: 0,
    });
    return id;
  }

  /** 推进相位并清理到期实例（elapsed ≥ T 即移除；不回滚不截断——T 前完整播放）。 */
  update(nowSec: number): void {
    const alive: FxInstance[] = [];
    for (const inst of this.instances) {
      inst.elapsedMs = (nowSec - inst.startedAtSec) * 1000;
      if (inst.elapsedMs < inst.durationMs) alive.push(inst);
    }
    this.instances = alive;
  }

  /** 世界层绘制（棋子后血条前由 drawFrame hook 调用）。每层独立 save/restore，
   * lighter 不泄漏到棋子/HUD/下一帧；图片按原始宽高 × scale 中心对齐，不拉伸到格子尺寸。 */
  draw(ctx: CanvasRenderingContext2D, cam: FxCamera, width: number, height: number): void {
    for (const inst of this.instances) {
      const cxBase = inst.anchor.x - cam.x + width / 2;
      const cyBase = inst.anchor.y - cam.y + height / 2;
      for (const layer of inst.recipe.layers) {
        const idx = pickLayerFrame(layer.frames.length, layer.windowStart, layer.windowEnd, inst.elapsedMs, inst.durationMs);
        if (idx < 0) continue; // 未进窗/已出窗
        const img = this.pack.get(`${layer.frameDir}/${layer.frames[idx]}`);
        if (!img) continue; // 缺图跳帧（预载阶段已告警记录路径）
        const w = img.width * layer.scale;
        const h = img.height * layer.scale;
        const cx = cxBase + layer.anchorOffsetPx.x;
        const cy = cyBase + layer.anchorOffsetPx.y;
        ctx.save();
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(img as unknown as CanvasImageSource, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
        ctx.restore();
      }
    }
  }

  /** 按实例 ID 清空（§5.2：session 重建按实例清，未完成 FX 不跨局残留）。 */
  clear(instanceId: number): void {
    this.instances = this.instances.filter((inst) => inst.id !== instanceId);
  }

  /** 全量清空（reset/重建 session：逐实例清空语义的批量入口）。 */
  clearAll(): void {
    this.instances = [];
  }

  get activeCount(): number {
    return this.instances.length;
  }
}
