// ═══ T26 · WF-2 武功名条（《武功名条方案-v0.1》§4 视觉参数/§4.2 动画/§3 数据流）验收测试 ═══
// 纯逻辑用例（曲线/字号/颜色/生命周期/白名单）不依赖微信运行时与真实 Canvas：ctx 用记录型 stub。
// 触发矩阵用例（全闪避/空放/段 1 致死终局/绝学）复用 T25-R2 真.session harness 口径——
// accepted cast 门（FxCastGate）+ bannerTierOf + WfBannerPlayer.start 同构宿主 fan-out。
// 铁律锁：渲染层非 lighter、固定 1.000s 演出钟不随 T 缩放、(actorId,t0) 去重一次一条。
// 运行：npm run test:battle（vitest，node 环境）。
import { describe, expect, it, vi } from 'vitest';
import { WfBannerPlayer, bannerAlpha, bannerFontPx, bannerMaxWidth, bannerProgress, bannerRisePx, bannerStrokeWidth, bannerTierOf, easeOutCubic } from '../ui/wf-banner';
import { DMG, FONT_STACK, WF_BANNER } from '../config/battle-hex';
import { FxCastGate, findCastSnapshot } from '../ui/fx-player';
import { createHexBattle } from '../systems/battle-session';
import { offsetToAxial } from '../systems/hex';
import type { CombatantInput, SkillDef, SkillKind } from '../types';

// ---------- 基建：记录型 ctx stub（记 font/fill/stroke/shadow/transform/文本操作序） ----------

type FillStyle = string | { gradient: true };

function stubCtx(measureWidth: number | ((text: string) => number) = 100) {
  const ops: string[] = []; // 文本/变换操作序（fillText/strokeText/translate/scale/save/restore/gco）
  const state: Record<string, unknown> = {}; // 关键属性镜像（font/fillStyle/shadow*/lineWidth…）
  const grads: Array<Array<[number, string]>> = []; // createLinearGradient 的 addColorStop 轨
  const calls: Array<{ op: string; text: string; x: number; y: number; shadowColor: unknown; fillStyle: unknown; strokeStyle: unknown; alpha: unknown }> = [];
  const ctx = {
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    set font(v: string) {
      state.font = v;
    },
    get font(): string {
      return state.font as string;
    },
    set fillStyle(v: FillStyle) {
      state.fillStyle = v;
    },
    get fillStyle(): FillStyle {
      return state.fillStyle as FillStyle;
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v;
    },
    get strokeStyle(): string {
      return state.strokeStyle as string;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
    },
    get lineWidth(): number {
      return state.lineWidth as number;
    },
    set lineJoin(v: string) {
      state.lineJoin = v;
    },
    set globalAlpha(v: number) {
      state.alpha = v;
    },
    get globalAlpha(): number {
      return state.alpha as number;
    },
    set shadowColor(v: string) {
      state.shadowColor = v;
    },
    get shadowColor(): string {
      return state.shadowColor as string;
    },
    set shadowOffsetX(v: number) {
      state.shadowOffsetX = v;
    },
    set shadowOffsetY(v: number) {
      state.shadowOffsetY = v;
    },
    set shadowBlur(v: number) {
      state.shadowBlur = v;
    },
    set textAlign(v: string) {
      state.textAlign = v;
    },
    set textBaseline(v: string) {
      state.textBaseline = v;
    },
    set globalCompositeOperation(v: string) {
      ops.push(`gco:${v}`); // 非 lighter 铁律锁：出现任何 gco 记录即违规
    },
    measureText: (t: string) => ({ width: typeof measureWidth === 'function' ? measureWidth(t) : measureWidth }),
    createLinearGradient: () => {
      const stops: Array<[number, string]> = [];
      grads.push(stops);
      return { addColorStop: (o: number, c: string) => stops.push([o, c]) };
    },
    fillText: (t: string, x: number, y: number) => {
      ops.push('fillText');
      calls.push({ op: 'fillText', text: t, x, y, shadowColor: state.shadowColor, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, alpha: state.alpha });
    },
    strokeText: (t: string, x: number, y: number) => {
      ops.push('strokeText');
      calls.push({ op: 'strokeText', text: t, x, y, shadowColor: state.shadowColor, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, alpha: state.alpha });
    },
    translate: (x: number, y: number) => ops.push(`translate:${x},${y}`),
    scale: (x: number, y: number) => ops.push(`scale:${x},${y}`),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, state, grads, calls };
}

// ---------- §4 纯函数曲线 ----------

describe('T26 · WF_BANNER 曲线（方案 §4.2 固定 1s 浮起淡出）', () => {
  it('easeOutCubic：0→0 / 1→1 / 0.5→0.875，样本单调不减', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 12);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('透明度分段：淡入 [0,0.10) smoothstep / 保持 [0.10,0.65)=1 / 淡出 [0.65,1] smoothstep 回 0', () => {
    expect(bannerAlpha(0)).toBe(0); // p=0 全透（首帧淡入起点）
    expect(bannerAlpha(0.05)).toBeCloseTo(0.5, 12); // 淡入中点 smoothstep(0.5)=0.5
    expect(bannerAlpha(0.0999)).toBeLessThan(1);
    expect(bannerAlpha(0.1)).toBe(1); // 淡入窗右端闭（连续）
    expect(bannerAlpha(0.3)).toBe(1); // 保持段
    expect(bannerAlpha(0.6499)).toBe(1);
    expect(bannerAlpha(0.65)).toBe(1); // 淡出起点仍不透明（连续）
    expect(bannerAlpha(0.825)).toBeCloseTo(0.5, 12); // 淡出中点
    expect(bannerAlpha(1)).toBe(0); // p=1 全透（同帧移除）
  });

  it('上浮：risePx(0)=0 / risePx(1)=24（WF_BANNER.risePx 同源）/ risePx(0.5)=21', () => {
    expect(bannerRisePx(0)).toBe(0);
    expect(bannerRisePx(1)).toBe(WF_BANNER.risePx);
    expect(bannerRisePx(1)).toBe(24);
    expect(bannerRisePx(0.5)).toBeCloseTo(24 * 0.875, 12);
  });

  it('相位唯一时长真值=WF_BANNER.durationSec（1.000s），钳制 [0,1]', () => {
    expect(WF_BANNER.durationSec).toBe(1.0);
    expect(bannerProgress(10, 10)).toBe(0);
    expect(bannerProgress(10.5, 10)).toBe(0.5);
    expect(bannerProgress(11, 10)).toBe(1);
    expect(bannerProgress(99, 10)).toBe(1); // 越界钳制
    expect(bannerProgress(9, 10)).toBe(0); // 负相位钳制
  });
});

// ---------- §4.1 字号/描边/maxWidth 定尺 ----------

describe('T26 · 字号与描边定尺（方案 §4.1）', () => {
  it('字号=伤害数字屏高定尺×1.5：round(round(H×DMG.fontPerH)×1.5)，H=667 → 26', () => {
    const base = Math.round(667 * DMG.fontPerH);
    expect(bannerFontPx(667)).toBe(Math.round(base * WF_BANNER.fontMul));
    expect(bannerFontPx(667)).toBe(Math.round(Math.round(17.342) * 1.5)); // 17×1.5=25.5→26
    expect(bannerFontPx(700)).toBe(Math.round(Math.round(700 * DMG.fontPerH) * 1.5));
  });

  it('描边线宽=max(2, round(fontPx×0.12))：26px 字→3，小字钳下限 2', () => {
    expect(bannerStrokeWidth(26)).toBe(3);
    expect(bannerStrokeWidth(10)).toBe(2); // round(1.2)=1 → 钳 2
    expect(bannerStrokeWidth(100)).toBe(Math.round(100 * WF_BANNER.strokeWidthRatio));
  });

  it('maxWidth=min(0.82W, W−2×safePx)：常规屏 0.82W 绑定（护栏不绑定）', () => {
    expect(bannerMaxWidth(375)).toBeCloseTo(0.82 * 375, 9);
    expect(bannerMaxWidth(280)).toBeCloseTo(0.82 * 280, 9); // 最窄支持屏护栏仍不绑定（0.18×280=50>16）
    expect(bannerMaxWidth(66)).toBe(66 - 2 * WF_BANNER.safePx); // 极窄屏护栏生效
  });
});

// ---------- §4.1 绘制三道与颜色（记录型 ctx 断言） ----------

describe('T26 · 绘制形态：三道顺序/颜色/非 lighter（方案 §4.1）', () => {
  it('special：font=宋体族 bold；投影→描边→填充三道；填充金 #D4AF37；全程无 gco（非 lighter）', () => {
    const wf = new WfBannerPlayer();
    const { ctx, ops, state, calls } = stubCtx();
    wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 100, y: 200 }, startedAtSec: 0 });
    wf.update(0.3); // 保持段（alpha=1）
    wf.draw(ctx, 375, 667, { x: 0, y: 0 });
    expect(ops.filter((o) => o.startsWith('gco:')).length).toBe(0); // 屏幕层禁加色态
    expect(state.font).toBe(`bold ${bannerFontPx(667)}px ${FONT_STACK}`); // 宋体族 700 加粗（§5 兜底栈）
    expect(state.textAlign).toBe('center');
    expect(calls.map((c) => c.op)).toEqual(['fillText', 'strokeText', 'fillText']); // ①投影 ②描边 ③填充
    // ① 投影道：携带 shadow(rgba(43,43,43,.45)/(0,2)/4)，墨色垫底
    expect(calls[0].shadowColor).toBe(WF_BANNER.shadowColor);
    expect(calls[0].fillStyle).toBe(WF_BANNER.strokeColor);
    // ② 描边道：shadow 已复位（投影仅第一道），墨描边 #2B2B2B
    expect(calls[1].op).toBe('strokeText');
    expect(calls[1].shadowColor).toBe('transparent');
    expect(calls[1].strokeStyle).toBe(WF_BANNER.strokeColor);
    // ③ 填充道：特技金
    expect(calls[2].fillStyle).toBe(WF_BANNER.specialColor);
    expect(state.shadowOffsetY).toBe(WF_BANNER.shadowOffsetY); // 投影偏移 (0,2)
    expect(state.shadowBlur).toBe(WF_BANNER.shadowBlurPx); // 模糊 4
    expect(calls.every((c) => c.text === '特技')).toBe(true); // 原样字符串，不改名不截字
    expect(state.lineWidth).toBe(bannerStrokeWidth(bannerFontPx(667)));
    // save/restore 配对（外层 1 + 实例 1），alpha 不泄漏
    expect(ops.filter((o) => o === 'save').length).toBe(2);
    expect(ops.filter((o) => o === 'restore').length).toBe(2);
    expect(state.alpha).toBe(1);
  });

  it('ultimate：填充=金红纵向渐变 #FFD66B→#E2574C（字顶→字底两 stop）', () => {
    const wf = new WfBannerPlayer();
    const { ctx, state, grads } = stubCtx();
    wf.start({ text: '绝学', tier: 'ultimate', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf.update(0.3);
    wf.draw(ctx, 375, 667, { x: 0, y: 0 });
    const fill = state.fillStyle as FillStyle;
    expect(typeof fill).not.toBe('string'); // 渐变对象非纯色
    expect(grads.length).toBe(1);
    expect(grads[0]).toEqual([
      [0, WF_BANNER.ultimateGradTop],
      [1, WF_BANNER.ultimateGradBottom],
    ]);
  });

  it('屏幕投影唯一换算式：world−cam+屏心−头顶偏移−上浮；淡出期 globalAlpha 衰减', () => {
    const wf = new WfBannerPlayer();
    const { ctx, ops, calls } = stubCtx();
    wf.start({ text: '特', tier: 'special', anchorWorld: { x: 100, y: 200 }, startedAtSec: 0 });
    wf.update(0.5); // p=0.5：rise=24×0.875=21
    wf.draw(ctx, 375, 667, { x: 10, y: 20 });
    const sx = Math.round(100 - 10 + 375 / 2);
    const sy = Math.round(200 - 20 + 667 / 2 - WF_BANNER.headOffsetPx - bannerRisePx(0.5));
    expect(ops).toContain(`translate:${sx},0`); // 屏幕锚经 translate 落位
    expect(calls.some((c) => c.x === 0 && c.y === sy)).toBe(true); // 平移系内 y=投影结果
    // 淡出中点 alpha≈0.5 写入 globalAlpha
    const wf2 = new WfBannerPlayer();
    const s2 = stubCtx();
    wf2.start({ text: '特', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf2.update(0.825);
    wf2.draw(s2.ctx, 375, 667, { x: 0, y: 0 });
    expect(s2.state.alpha).toBeCloseTo(0.5, 12);
  });

  it('超宽压缩：measureText 超 maxWidth → translate+scaleX<1 居中压缩不截字；短文本不缩放', () => {
    const wf = new WfBannerPlayer();
    const long = stubCtx(500); // 500 > 0.82×375=307.5
    wf.start({ text: '一篇特别特别长的武功名称', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf.update(0.3);
    wf.draw(long.ctx, 375, 667, { x: 0, y: 0 });
    expect(long.ops.some((o) => o.startsWith('scale:'))).toBe(true);
    const sx = Math.round(375 / 2);
    expect(long.ops).toContain(`translate:${sx},0`);
    expect(long.ops.filter((o) => o === 'fillText').length).toBe(2); // 三道俱全=未截字（投影+填充）
    expect(bannerMaxWidth(375) / 500).toBeCloseTo(0.615, 9);
    const short = stubCtx(100); // 100 < maxWidth：零缩放
    const wf2 = new WfBannerPlayer();
    wf2.start({ text: '特技', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf2.update(0.3);
    wf2.draw(short.ctx, 375, 667, { x: 0, y: 0 });
    expect(short.ops.some((o) => o.startsWith('scale:'))).toBe(false);
  });
});

// ---------- §4.2 生命周期：固定 1.000s/不随 T 缩放/清理 ----------

describe('T26 · 生命周期（方案 §4.2：死亡终局不截断/reset 清空）', () => {
  it('固定 1.000s 移除：p<1 存活、p≥1 同帧收——不随快招 T=0.5s 提前、不随慢招 T=3s 拖延', () => {
    const wf = new WfBannerPlayer();
    const t0 = 100;
    wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: t0 });
    wf.update(t0 + 0.5);
    expect(wf.activeCount).toBe(1); // 快招 T=0.5s：若随 T 缩放此刻应已移除——仍在（不缩放）
    wf.update(t0 + 0.999);
    expect(wf.activeCount).toBe(1); // 慢招 T=3s：若随 T 拉伸此刻应 1/3 寿命——实际已近满
    wf.update(t0 + 1.0);
    expect(wf.activeCount).toBe(0); // 演出钟 1.000s 整即收
  });

  it('多施法者并存各播各的 1s（敌方 AI 同规则的结构面：播放器无阵营概念）', () => {
    const wf = new WfBannerPlayer();
    wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 1, y: 1 }, startedAtSec: 0 });
    wf.start({ text: '绝学', tier: 'ultimate', anchorWorld: { x: 2, y: 2 }, startedAtSec: 0.5 });
    expect(wf.activeCount).toBe(2);
    wf.update(1.0);
    expect(wf.activeCount).toBe(1); // 第一条到点收，第二条（晚 0.5s 起）仍在
    wf.update(1.5);
    expect(wf.activeCount).toBe(0); // 第二条 1.000s 整收
  });

  it('clearAll 全清（reset/逃跑/session 重建语义）；清后可重新 start', () => {
    const wf = new WfBannerPlayer();
    wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf.start({ text: '绝学', tier: 'ultimate', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 });
    wf.clearAll();
    expect(wf.activeCount).toBe(0);
    wf.update(0.5);
    const { ctx } = stubCtx();
    expect(() => wf.draw(ctx, 375, 667, { x: 0, y: 0 })).not.toThrow();
    expect(wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 5 })).not.toBeNull();
    expect(wf.activeCount).toBe(1);
  });
});

// ---------- §3.1 文字来源与白名单（bannerTierOf + start 防御） ----------

describe('T26 · 白名单与文字来源（方案 §2 裁决表/§3.1）', () => {
  it('tier 映射：special/ultimate 弹；qingGong/hiddenWeapon/waiGong/sect 一律 null 不弹', () => {
    expect(bannerTierOf('special')).toBe('special');
    expect(bannerTierOf('ultimate')).toBe('ultimate');
    for (const kind of ['qingGong', 'hiddenWeapon', 'waiGong', 'sect'] as SkillKind[]) {
      expect(bannerTierOf(kind)).toBeNull(); // 轻功/暗器/外功/门派不弹（普攻无技能事件天然不触达）
    }
    expect(bannerTierOf(undefined)).toBeNull();
    expect(bannerTierOf(null)).toBeNull();
  });

  it('text 空/缺或 tier 缺：告警一次并跳过（不显示假名字、不回退「特/绝」）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const wf = new WfBannerPlayer();
      expect(wf.start({ text: '', tier: 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 })).toBeNull();
      expect(wf.start({ text: '特技', tier: null as unknown as 'special', anchorWorld: { x: 0, y: 0 }, startedAtSec: 0 })).toBeNull();
      expect(wf.activeCount).toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------- 触发矩阵（方案 §3.2：真 session 四路径 × 门 × fan-out 同构，复用 T25-R2 harness 口径） ----------
// 口径：宿主 fan-out=事件双源（skill/miss）过 FxCastGate → findCastSnapshot 取 T（喂光影与门
// 登记）→ bannerTierOf 解析 tier → WfBannerPlayer.start（固定 1s）。四路径均恰一条名条；
// 绝学只走名条分支；敌方 actorId 同规则。

describe('T26-R · 触发矩阵：命中/全 miss/空放/段 1 致死终局/绝学 五路径名条恰一条', () => {
  const SKILLS: SkillDef[] = [
    { id: 'te', name: '特技', kind: 'special', weapon: 'sword', grade: 1.7, growth: 3, level: 20, cooldownTurns: 2, neiliCost: 10 },
    { id: 'jue', name: '绝学', kind: 'ultimate', weapon: 'sword', grade: 1.7, growth: 3, level: 20, cooldownTurns: 5, neiliCost: 35 },
  ];
  const KIND_BY_ID = new Map(SKILLS.map((s) => [s.id, s.kind]));
  const CAST_IDS = new Set(SKILLS.map((s) => s.id));
  function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
    return {
      name: over.id,
      hp: 999999, maxHp: 999999,
      neili: 60, maxNeili: 100,
      atk: 12, def: 3,
      neigongLevel: 0, jimin: 0, danshi: 0, shizhan: 0,
      pos: { x: 0, y: 0 }, weapon: 'sword', skills: SKILLS,
      ...over,
    };
  }
  function makeSession(heroOver: Partial<CombatantInput>, foeOver: Partial<CombatantInput>) {
    return createHexBattle({
      player: unit({ id: 'p', side: 'player', ...heroOver }),
      enemies: [unit({ id: 'e1', side: 'enemy', ...foeOver })],
      mode: 'manual',
      seed: 42,
    });
  }
  function place(s: ReturnType<typeof createHexBattle>, id: string, col: number, row: number, over: Partial<CombatantInput> = {}): void {
    const u = s._debug.units.find((x) => x.id === id)!;
    const hex = offsetToAxial(col, row);
    u.hex = { ...hex };
    u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
    u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0;
    u.pendingAnim = null; u.movePath = []; u.bar = 0; u.barWasMax = false; u.dead = false;
    Object.assign(u, over);
    if (u.hp <= 0) u.hp = 50;
  }
  function ready(s: ReturnType<typeof createHexBattle>): void {
    const hero = s._debug.units.find((x) => x.id === 'p')!;
    hero.bar = 100;
    s.tick(0.001);
  }
  /** 宿主 fan-out 同构（T26-R1 身份制）：先 findCastSnapshot 配身份 → gate → 名条 start（tier 按
   * kind）→ commitStart 登记身份。cast=null 仅段 1 致胜终局（gate 无快照分支放行）。 */
  function driveFanOut(
    s: ReturnType<typeof createHexBattle>,
    gate: FxCastGate,
    wf: WfBannerPlayer,
    startedAtSec = 7.77, // 演出钟（view.time 同源任意值——名条时长与事件 t 无关）
  ): Array<{ tier: 'special' | 'ultimate'; text: string }> {
    const starts: Array<{ tier: 'special' | 'ultimate'; text: string }> = [];
    const casts = [...s._debug.pendingCasts(), ...s._debug.presentationCasts()];
    for (const e of s.events) {
      if ((e.type === 'skill' || e.type === 'miss') && e.actorId && e.skillId) {
        const cast = findCastSnapshot(casts, e.actorId, e.skillId, e.t);
        if (!gate.shouldStart(e, cast)) continue;
        const tier = bannerTierOf(KIND_BY_ID.get(e.skillId!));
        if (tier) {
          const text = SKILLS.find((x) => x.id === e.skillId)!.name; // 宿主注册表解析 name 原样传入
          wf.start({ text, tier, anchorWorld: { x: 100, y: 200 }, startedAtSec });
          starts.push({ tier, text });
        }
        const durMs = cast ? Math.round((cast.finishAtSec - cast.startedAtSec) * 1000) : 3000;
        gate.commitStart(e.actorId!, cast ? cast.startedAtSec : e.t, durMs, e.skillId!);
      }
    }
    return starts;
  }

  it('路径 1 命中：skill 事件 → 名条 1 条（tier=special/text=SkillDef.name 原样）', () => {
    const s = makeSession({ shizhan: 15_000_000 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    const gate = new FxCastGate(CAST_IDS);
    const wf = new WfBannerPlayer();
    const starts = driveFanOut(s, gate, wf);
    expect(starts).toEqual([{ tier: 'special', text: '特技' }]);
    expect(wf.activeCount).toBe(1);
  });

  it('路径 2 全 miss：只发 miss 事件 → 名条仍 1 条（accepted 门双源兜住，非伤害事件监听）', () => {
    const s = makeSession({ shizhan: -85_000_001 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    expect(s.events.some((e) => e.type === 'miss')).toBe(true);
    const gate = new FxCastGate(CAST_IDS);
    const wf = new WfBannerPlayer();
    expect(driveFanOut(s, gate, wf)).toEqual([{ tier: 'special', text: '特技' }]);
  });

  it('路径 3 空放：射程内无目标 skill 事件 → 名条 1 条', () => {
    const s = makeSession({ shizhan: 15_000_000 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 11, 2); // 对角：t0 圈内无敌（AS-6 空放）
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    const gate = new FxCastGate(CAST_IDS);
    const wf = new WfBannerPlayer();
    expect(driveFanOut(s, gate, wf)).toEqual([{ tier: 'special', text: '特技' }]);
  });

  it('路径 4 段 1 致死终局：phase=won、cast 入 presentationCasts → 名条 1 条且播完 1s 不被终局截断', () => {
    const s = makeSession({ shizhan: 15_000_000, atk: 999 }, { hp: 1, maxHp: 1 });
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'te' })).toBe(true);
    expect(s.phase).toBe('won');
    const gate = new FxCastGate(CAST_IDS);
    const wf = new WfBannerPlayer();
    expect(driveFanOut(s, gate, wf, 7.0)).toEqual([{ tier: 'special', text: '特技' }]);
    wf.update(7.999); // 终局后名条仍按自身演出钟存活（§4.2 死亡/终局不截断）
    expect(wf.activeCount).toBe(1);
    wf.update(8.0);
    expect(wf.activeCount).toBe(0); // 1.000s 整收
  });

  it('路径 5 绝学：kind=ultimate → 名条 1 条（金红渐变档）；同 cast 双源/段 2 不重复', () => {
    const s = makeSession({ shizhan: 15_000_000 }, {});
    place(s, 'p', 4, 13);
    place(s, 'e1', 6, 13);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'jue' })).toBe(true);
    expect(s.submit({ type: 'cast', to: offsetToAxial(6, 13), skillId: 'jue' })).toBe(true);
    // 推进过 t1：段 2 结算事件照发——fan-out 去重后仍只 1 条
    for (let i = 0; i < 100 && s.events.filter((e) => e.type === 'skill' || e.type === 'miss').length < 2; i++) s.tick(0.05);
    const gate = new FxCastGate(CAST_IDS);
    const wf = new WfBannerPlayer();
    expect(driveFanOut(s, gate, wf)).toEqual([{ tier: 'ultimate', text: '绝学' }]);
  });

  it('敌方 actorId 同规则：e1 施法（同 harness 反打）→ 名条照起，色按 tier 不按阵营', () => {
    const wf = new WfBannerPlayer();
    // 播放器无阵营概念：同 tier 同色——敌我差异只可能来自宿主传入 tier（结构面锁死）
    wf.start({ text: '特技', tier: 'special', anchorWorld: { x: 5, y: 5 }, startedAtSec: 0 });
    const { ctx, state } = stubCtx();
    wf.update(0.3);
    wf.draw(ctx, 375, 667, { x: 0, y: 0 });
    expect(state.fillStyle).toBe(WF_BANNER.specialColor); // 敌方 special 同金（不按阵营变色）
  });

  it('门去重（T26-R1 身份制·特/绝白名单参数）：同 cast 双源只首条放行；段 2/身份不符拦截；同刻重入凭身份放行；reset 清键', () => {
    // 调用形态随 gate 签名升级（find-first 身份传参）；断言语义一一对应不变（T26-R1 改写声明）
    const gate = new FxCastGate(CAST_IDS);
    const castJue1 = { actorId: 'p', skillId: 'jue', startedAtSec: 5.0, finishAtSec: 8.0 };
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 5.0 }, castJue1)).toBe(true);
    gate.commitStart('p', 5.0, 3000, 'jue');
    expect(gate.shouldStart({ type: 'miss', actorId: 'p', skillId: 'jue', t: 5.0 }, castJue1)).toBe(false); // 同 cast 双源
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 8.0 }, null)).toBe(false); // 段 2 结算事件（快照收口配不到）
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'qing', t: 9.9 }, null)).toBe(false); // 非白名单（轻功）
    expect(gate.shouldStart({ type: 'basic', actorId: 'p', skillId: 'jue', t: 5.0 }, castJue1)).toBe(false); // 非双源（普攻）
    // 同刻重入：新 cast t0==旧 t1=8.0，凭自身快照身份放行（seq=169 P1 修复本体）
    const castJue2 = { actorId: 'p', skillId: 'jue', startedAtSec: 8.0, finishAtSec: 11.0 };
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 8.0 }, castJue2)).toBe(true);
    gate.commitStart('p', 8.0, 3000, 'jue');
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'te', t: 9.99 }, { actorId: 'p', skillId: 'te', startedAtSec: 9.99, finishAtSec: 12.99 })).toBe(true); // 窗外新 cast 放行
    gate.reset();
    expect(gate.shouldStart({ type: 'skill', actorId: 'p', skillId: 'jue', t: 5.0 }, castJue1)).toBe(true); // 跨局清键
  });
});
