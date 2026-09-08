// WF-2 武功名条播放器（T26 ·《武功名条方案-v0.1》§2/§3/§4）。
// 屏幕空间演出层：t0 定格施法者头顶世界锚（宿主经 hexToWorld 换算后传入——本模块禁第二套格心
// 公式），每帧只做 world − camera + 屏心投影；固定 1.000s 演出钟（view.time 同源），不随
// castDurationMs 缩放（快招/慢招不二次变速），死亡/终局播完不截断——clearAll 仅 reset/逃跑/
// session 重建调用（§4.2）。绘制三道顺序锁死：投影 → 墨描边 → tier 填充（§4.1），屏幕层禁
// globalCompositeOperation='lighter'（防 T25 加色态泄漏到组件层）。
// 铁律：禁 import battle-core/battle-session（渲染层红线，用例锁）；UI 只展示——不查技能配置、
// 不改名、不截字：文字=宿主原样传入的 SkillDef.name，tier=宿主按 kind 已判定（bannerTierOf）。
import { DMG, FONT_STACK, WF_BANNER } from '../config/battle-hex';
import type { SkillKind } from '../types';

/** 名条档位（宿主判定传入；渲染层不做 kind→色以外的任何配置反查） */
export type WfBannerTier = 'special' | 'ultimate';

/** 相机/视口（渲染层 drawFrame 同款语义：屏幕坐标 = 世界 − cam + 尺寸/2） */
export interface WfBannerCamera {
  x: number;
  y: number;
}

/** 启动请求（方案 §3.1 最小展示包，无契约新增）：text=SkillDef.name 原样字符串；
 * tier=宿主按 SkillDef.kind 判定；anchorWorld=t0 施法者格心世界坐标（宿主 hexToWorld 产物，
 * 定格后不复算不跟随 renderPos）；startedAtSec=演出钟（view.time 同源逻辑时钟） */
export interface WfBannerRequest {
  text: string;
  tier: WfBannerTier;
  anchorWorld: { x: number; y: number };
  startedAtSec: number;
}

/** 播放实例（一次 accepted 施放对应一条；ID 自增不复用） */
export interface WfBannerInstance {
  id: number;
  text: string;
  tier: WfBannerTier;
  anchor: { x: number; y: number };
  startedAtSec: number;
  p: number; // update(nowSec) 写入的缓存相位 [0,1]（draw 只读，纯净双段——fx-player 同款）
}

// ============ 纯函数曲线（方案 §4；draw 消费与单测同源，node 可测） ============

/** easeOutCubic：1−(1−t)³（t 钳制 [0,1]） */
export function easeOutCubic(p: number): number {
  const t = Math.min(1, Math.max(0, p));
  const u = 1 - t;
  return 1 - u * u * u;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 相位：p = clamp((now − startedAt) / durationSec, 0, 1)——时长唯一真值 WF_BANNER.durationSec，
 * 不出现第二个时长常量（禁随 castDurationMs/x2 二次缩放，§4.2） */
export function bannerProgress(nowSec: number, startedAtSec: number): number {
  return Math.min(1, Math.max(0, (nowSec - startedAtSec) / WF_BANNER.durationSec));
}

/** 透明度（§4.2）：淡入 [0, fadeInEnd) smoothstep 0→1 / 中段保持 1 / 淡出 [fadeOutStart, 1] smoothstep 1→0 */
export function bannerAlpha(p: number): number {
  if (p < WF_BANNER.fadeInEnd) return smoothstep(p / WF_BANNER.fadeInEnd);
  if (p < WF_BANNER.fadeOutStart) return 1;
  return 1 - smoothstep((p - WF_BANNER.fadeOutStart) / (1 - WF_BANNER.fadeOutStart));
}

/** 上浮位移：risePx × easeOutCubic(p)（§4.2 y = baseY − risePx × easeOutCubic(p)） */
export function bannerRisePx(p: number): number {
  return WF_BANNER.risePx * easeOutCubic(p);
}

/** 屏高定尺字号（§4.1）：round(round(H×DMG.fontPerH) × fontMul)——基准沿用伤害数字同一系数
 *（DMG.fontPerH 运行时引参，禁第二套屏高系数），倍率恒 1.5 不随 T/等级/镜头/伤害数值改变 */
export function bannerFontPx(height: number): number {
  return Math.round(Math.round(height * DMG.fontPerH) * WF_BANNER.fontMul);
}

/** 墨描边线宽（§4.1）：max(strokeMinPx, round(fontPx × strokeWidthRatio)) */
export function bannerStrokeWidth(fontPx: number): number {
  return Math.max(WF_BANNER.strokeMinPx, Math.round(fontPx * WF_BANNER.strokeWidthRatio));
}

/** 压缩宽约束（§4.1）：min(maxWidthRatio×W, W − 2×safePx)——超宽仅 scaleX≤1 压缩，禁截字 */
export function bannerMaxWidth(width: number): number {
  return Math.min(width * WF_BANNER.maxWidthRatio, width - 2 * WF_BANNER.safePx);
}

/** 技能白名单（方案 §2 裁决表）：special→'special' / ultimate→'ultimate'；
 * qingGong、普攻（无技能事件）、暗器（hiddenWeapon）、外功（waiGong）、门派（sect）一律 null 不弹。
 * 宿主据此起名条——按 SkillDef.kind 判定，不用按钮标签/grade 猜品阶。 */
export function bannerTierOf(kind: SkillKind | undefined | null): WfBannerTier | null {
  if (kind === 'special') return 'special';
  if (kind === 'ultimate') return 'ultimate';
  return null;
}

// ============ 播放器（start/update/draw/clearAll——fx-player 同构最小职责面） ============

export class WfBannerPlayer {
  private seq = 0; // 实例 ID 发生器（单调递增，不复用）
  private instances: WfBannerInstance[] = [];

  /** t0 启动一条名条，返回实例 ID。text 空/缺或 tier 缺 → 告警一次并跳过（§3.1：不显示假名字、
   * 不回退成「特/绝」）；去重不在本层——(actorId,t0) 去重由宿主 accepted-cast 门保证一次一条。 */
  start(req: WfBannerRequest): number | null {
    if (!req || typeof req.text !== 'string' || req.text.length === 0 || (req.tier !== 'special' && req.tier !== 'ultimate')) {
      console.warn('[wf-banner] 名条启动跳过：text/tier 缺失（不显示假名字）', req && req.text);
      return null;
    }
    const id = ++this.seq;
    this.instances.push({
      id,
      text: req.text,
      tier: req.tier,
      anchor: { x: req.anchorWorld.x, y: req.anchorWorld.y },
      startedAtSec: req.startedAtSec,
      p: 0,
    });
    return id;
  }

  /** 推进相位并移除 p≥1 实例（固定 1.000s 播完即收；死亡/终局不截断——实例无回滚路径）。 */
  update(nowSec: number): void {
    this.instances = this.instances.filter((inst) => {
      inst.p = bannerProgress(nowSec, inst.startedAtSec);
      return inst.p < 1;
    });
  }

  /** 屏幕空间绘制（§3.3：世界 clip restore 后由 drawFrame 调用，drawComponents 前）。
   * 投影唯一换算式 = world − cam + 尺寸/2（禁第二套几何）；每实例 save/restore 自包围，
   * globalAlpha/变换/投影不泄漏到组件层；全程不用 lighter（屏幕层铁律）。 */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, cam: WfBannerCamera): void {
    if (this.instances.length === 0) return;
    const fontPx = bannerFontPx(height);
    const lineWidth = bannerStrokeWidth(fontPx);
    const maxWidth = bannerMaxWidth(width);
    ctx.save();
    ctx.font = `bold ${fontPx}px ${FONT_STACK}`; // 宋体族 700 加粗（§5：wx.loadFontFace 未来可选首选，失败回退本栈不阻塞）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const inst of this.instances) {
      const alpha = bannerAlpha(inst.p);
      if (alpha <= 0) continue;
      // 屏幕投影（§3.3）：世界锚 − cam + 屏心，再上浮头顶偏移与曲线位移（定格 t0 锚，不跟随 renderPos）
      const sx = Math.round(inst.anchor.x - cam.x + width / 2);
      const sy = Math.round(inst.anchor.y - cam.y + height / 2 - WF_BANNER.headOffsetPx - bannerRisePx(inst.p));
      // 超宽压缩（§4.1）：垂直字号不变，仅 scaleX≤1，居中绘制——禁静默截字/省略号
      const tw = ctx.measureText(inst.text).width;
      const scaleX = tw > maxWidth ? maxWidth / tw : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, 0);
      if (scaleX < 1) ctx.scale(scaleX, 1);
      // 三道绘制（§4.1 顺序锁死）：① 投影（携带 shadow 的墨色垫底）② 墨描边 ③ tier 填充
      ctx.shadowColor = WF_BANNER.shadowColor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = WF_BANNER.shadowOffsetY;
      ctx.shadowBlur = WF_BANNER.shadowBlurPx;
      ctx.fillStyle = WF_BANNER.strokeColor;
      ctx.fillText(inst.text, 0, sy);
      ctx.shadowColor = 'transparent'; // 投影仅第一道：描边/填充不再产影
      ctx.strokeStyle = WF_BANNER.strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeText(inst.text, 0, sy);
      ctx.fillStyle = this.fillStyleFor(ctx, inst.tier, sy, fontPx);
      ctx.fillText(inst.text, 0, sy);
      ctx.restore();
    }
    ctx.restore();
  }

  /** tier 填充（§4.1）：special=特技金纯色；ultimate=金红纵向渐变（字顶→字底；渐变只改视觉不表数值）。 */
  private fillStyleFor(
    ctx: CanvasRenderingContext2D,
    tier: WfBannerTier,
    sy: number,
    fontPx: number,
  ): string | CanvasGradient {
    if (tier === 'ultimate') {
      const g = ctx.createLinearGradient(0, sy - fontPx / 2, 0, sy + fontPx / 2);
      g.addColorStop(0, WF_BANNER.ultimateGradTop);
      g.addColorStop(1, WF_BANNER.ultimateGradBottom);
      return g;
    }
    return WF_BANNER.specialColor;
  }

  /** 全量清空（§4.2：对局重置/逃跑/session 重建；死亡与终局不清——已接受名条播完 1s）。 */
  clearAll(): void {
    this.instances = [];
  }

  get activeCount(): number {
    return this.instances.length;
  }
}
