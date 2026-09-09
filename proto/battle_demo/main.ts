// battle_demo preview 主入口（复用 home_demo 工程模式四件套）：
// ① 帧预解码（全部 decode 完才开播，防换帧闪烁）② 整数像素定位（渲染模块内 Math.round）
// ③ height 定尺（渲染高=格高×定尺系数，素材画布尺寸不参与）④ 资源版本号防缓存
// 数据源=真 battle-session（联调工单：mock→真 session 单点替换；reset=重建对局）。
import type { CombatantInput } from '../../types';
import { SPEED_FACTOR } from '../../config/battle';
import { BATTLE_HEX_RES, DMG, FACINGS, PIECE, REJECT_HINTS, TRIAL_FX_01, TRIAL_FX_FALLBACK_DURATION_MS, hexToWorld, type BattleClip } from '../../config/battle-hex';
import { WEAPON_LAYER_PROFILES, WEAPON_MODELS } from '../../config/hero-weapon-layer'; // 【T29】武器层只读配置 v2（runtime 路径，零候选引用）
import { FxCastGate, FxPlayer, findCastSnapshot, loadFxFramePack, type FxFramePack } from '../../ui/fx-player';
import { WfBannerPlayer, bannerTierOf } from '../../ui/wf-banner';
import { createBattleInput, createPointerTracker } from '../../ui/battle-input';
import {
  composeWeaponModelLayer,
  createView,
  drawFrame,
  enqueueHit,
  frameKeyOf,
  pieceHop,
  spawnNoteFx,
  updateView,
  weaponMissingTag,
  type BattleHexAssets,
  type DirectionalFrameStore,
  type ImgLike,
  type LegacyFrameStrip,
  type OffscreenCanvasFactory,
  type WeaponLayerDiag,
  type WeaponLayerImages,
} from '../../ui/battle-hex-render';
import { createHexBattle } from '../../systems/battle-session';

// ===== 画布（逻辑分辨率自适应窗口实际比例，L 环反馈④；dpr 放大保真） =====
// W/H 初值 = 0（未测量哨兵，09-06 补卡）：舞台 #cvWrap 为 9:16，375×667 视口下 rect 恰为
// 旧默认初值 375/667 → resize() 首调 `w===W && h===H` 早退 → canvas 缓冲滞留 HTML 默认
// 300×150（画面左上裁区非均匀拉伸）。初值归 0 后首调必不早退（钳制下限 280×420 > 0），
// 缓冲与 dpr transform 必在首帧前落设（缺陷锁 = tests/battle-demo-resize.test.ts）。
let W = 0;
let H = 0;
const canvas = document.getElementById('cv') as HTMLCanvasElement;
const dpr = Math.min(3, window.devicePixelRatio || 1);
function resize(): void {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(280, Math.round(r.width));
  const h = Math.max(420, Math.round(r.height));
  if (w === W && h === H) return;
  W = w;
  H = h;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
resize();
window.addEventListener('resize', resize);

// ===== toast =====
const toastEl = document.getElementById('toast') as HTMLElement;
let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.style.opacity = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.style.opacity = '0'), 1400);
}

// ===== 资源加载（版本号防缓存 + 帧预解码，失败降级 null 不崩） =====
// config 路径=小游戏包根相对（生产唯一真值）；file:// 预览页位于 proto/battle_demo/，需回退到仓库根
const FILE_PREFIX = location.protocol === 'file:' ? '../../' : '';
function loadImg(url: string): Promise<HTMLImageElement | null> {
  const im = new Image();
  im.src = FILE_PREFIX + url;
  return im.decode().then(() => im).catch(() => null);
}

/** 【T27 第二段 · 方案 §9.2.2】directional 资源完整性门状态（预载期一次性写入，整局固定；
 * e2e/shot 经 __demo.assetGate 读取断言——不进 types.ts、零契约新增）。 */
let assetGateState: { ok: boolean; failures: string[] } = { ok: true, failures: [] };
/** 完整性门开发面报红：#assetGate 红条（index.html 静态占位，默认隐藏）+ console.error 逐条路径；
 * 通过时保持隐藏。红条文案含显式回退指引（URL ?enemy=legacy），禁静默回退。 */
function paintAssetGate(): void {
  const el = document.getElementById('assetGate');
  if (!assetGateState.ok) {
    for (const f of assetGateState.failures) console.error(`[battle_demo][assetGate FAIL] ${f}`);
    if (el) {
      el.textContent =
        `帧资源完整性门 FAIL ×${assetGateState.failures.length}（首条：${assetGateState.failures[0]}）` +
        ' · 渲染走安全占位；回滚诊断请显式加 URL ?enemy=legacy（非正式通过）';
      el.style.display = 'block';
    }
    return;
  }
  if (el) el.style.display = 'none';
}

async function loadAssets(): Promise<BattleHexAssets> {
  const q = (p: string): string => `${p}?v=${BATTLE_HEX_RES.ver}`;
  const frameJobs: Array<Promise<unknown>> = [];
  const frames = new Map<string, LegacyFrameStrip | DirectionalFrameStore>();
  // 【T29 武器层 R2】directional 身体帧 路径→位图 旁路表（武器合成需按标定行 bodyFrame 取身体帧；
  // 与 frames 库同一次 loadImg Promise 产出，零二次解码）
  const bodyByPath = new Map<string, ImgLike | null>();
  // 【六向帧接线 §3.1】loader 按 profile 预解码：legacy=帧号条；directional=clip×facing×ordinal
  // 网格（sharedSrc 共用帧按 clip 键只解码一次——die_common 六向共用）
  for (const [kind, profile] of Object.entries(BATTLE_HEX_RES.profiles)) {
    if (profile.mode === 'legacy') {
      const jobs: Array<Promise<ImgLike | null>> = [];
      for (let i = 0; i < profile.frameCount; i++) jobs.push(loadImg(q(profile.frameSrc(i))));
      frameJobs.push(
        Promise.all(jobs).then((arr) => {
          frames.set(kind, arr);
        }),
      );
    } else {
      const jobs: Array<Promise<readonly [string, ImgLike | null]>> = [];
      for (const clip of Object.keys(profile.clipCounts) as BattleClip[]) {
        const shared = profile.sharedSrc[clip];
        if (shared !== undefined) {
          jobs.push(
            // 共用帧：键=clip 名
            loadImg(q(shared)).then((im) => {
              bodyByPath.set(shared, im);
              return [clip, im] as const;
            }),
          );
          continue;
        }
        const count = profile.clipCounts[clip];
        for (const facing of FACINGS) {
          for (let o = 1; o <= count; o++) {
            const key = frameKeyOf(clip, facing, o);
            const src = profile.frameSrc(clip, facing, o);
            jobs.push(
              loadImg(q(src)).then((im) => {
                bodyByPath.set(src, im);
                return [key, im] as const;
              }),
            );
          }
        }
      }
      frameJobs.push(
        Promise.all(jobs).then((pairs) => {
          frames.set(kind, { mode: 'directional', frames: new Map(pairs) });
        }),
      );
    }
  }
  // T23：ctrl 三钮独立脸 + 状态图标三枚（key 词表 poison/blood/skull = config BATTLE_HEX_RES.statusIcons）
  const faceEntries = Object.entries(BATTLE_HEX_RES.ctrlFaces) as Array<[string, string]>;
  const faceJobs = faceEntries.map(async ([key, path]) => [key, await loadImg(q(path))] as const);
  const iconEntries = Object.entries(BATTLE_HEX_RES.statusIcons) as Array<[string, string]>;
  const iconJobs = iconEntries.map(async ([key, path]) => [key, await loadImg(q(path))] as const);
  // 【T25 · trial_fx_01】三层光影帧进场并行预载（方案 §4.2）：loadFxFramePack 永不 reject
  //（缺帧 warn 记路径+null 槽，draw 跳帧）；join 进同一 Promise.all——全部 settle 后主循环才启动，
  // 首个特功演出必然晚于预载完成。missing 非空仅告警（DoD 口径：素材 40/40 必须全在，缺=FAIL）。
  const fxJobs = loadFxFramePack(TRIAL_FX_01, (url) => loadImg(q(url)));
  // 【T29 武器层 R2】方案 v2.1 §4：两张剑模+全部消费 mask 与帧预解码并行；合成在主 Promise.all
  // 之后做（composeWeaponModelLayer 需身体帧位图）。每行产出「身体+旋转剑模+挖拳」一体离屏层
  //（weaponLayerRectOf 动态尺寸，剑可越出身体 240×320——§4.2）；模型/蒙版/身体任一缺失或合成
  // 不可用=该行空手降级 + `hero-weapon-missing:<bodyFrame>` 写 preview asset gate（格式沿 T28
  // 已验收：bodyFrame 即该帧唯一键）。蒙版=导入期机械转换的 alpha 蒙版（alpha=候选灰度 luma），
  // 全链零 getImageData（file:// 污染 canvas/wx 逐像素开销——T24 红线禁用）。
  const weaponLayers: WeaponLayerImages = new Map();
  const weaponDiag: WeaponLayerDiag = { missing: new Set(), gaps: new Set() };
  const offscreen: OffscreenCanvasFactory = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');
    return cctx ? { canvas: c, ctx: cctx } : null;
  };
  const modelJobs = Object.entries(WEAPON_MODELS).map(
    async ([key, meta]) => [key, await loadImg(q(meta.src))] as const,
  );
  const maskPathSet = new Set<string>();
  for (const framesMap of Object.values(WEAPON_LAYER_PROFILES)) {
    for (const row of framesMap.values()) {
      if (row.maskPath) maskPathSet.add(row.maskPath);
    }
  }
  const maskJobs = [...maskPathSet].map(async (p) => [p, await loadImg(q(p))] as const);
  const [env, topbar, plaque, facePairs, iconPairs, fxResult, modelPairs, maskPairs] = await Promise.all([
    loadImg(q(BATTLE_HEX_RES.env)),
    loadImg(q(BATTLE_HEX_RES.topbar)),
    loadImg(q(BATTLE_HEX_RES.plaque)),
    Promise.all(faceJobs),
    Promise.all(iconJobs),
    fxJobs,
    Promise.all(modelJobs), // 【T29】两张剑模
    Promise.all(maskJobs), // 【T29】消费 mask 全集
    ...frameJobs,
  ]);
  // 【T29 武器层 R2】帧/模/蒙版全部就绪 → 逐行离屏合成（每行一次性，非逐帧开销；§4.2/§4.3）：
  // ① source-over 旋转剑模（绕模型握点，§4.1）→ ② destination-out 挖拳 → ③ 身体入层
  //（weapon_front=destination-over 垫剑下 / body_front=source-over 盖剑上）。任一输入缺失=该行
  // 空手降级（禁画无孔整剑盖拳），missing 汇入 asset gate；任何单行异常不拖垮启动（防御）。
  const modelImgOf = new Map(modelPairs as Array<readonly [string, ImgLike | null]>);
  const maskImgOf = new Map(maskPairs as Array<readonly [string, ImgLike | null]>);
  for (const [spriteKey, framesMap] of Object.entries(WEAPON_LAYER_PROFILES)) {
    const store = new Map<string, ImgLike | null>();
    weaponLayers.set(spriteKey, store);
    for (const [bodySrc, row] of framesMap) {
      try {
        const meta = WEAPON_MODELS[row.weaponModelKey];
        const body = bodyByPath.get(bodySrc) ?? null;
        const model = modelImgOf.get(meta.src) ?? null;
        const mask = row.maskPath ? maskImgOf.get(row.maskPath) ?? null : null;
        if (!body || !model || (row.maskPath && !mask)) {
          store.set(bodySrc, null);
          weaponDiag.missing.add(bodySrc); // 禁画无孔整剑盖拳——缺任一输入即空手
          continue;
        }
        const composed = composeWeaponModelLayer(body, model, meta, mask, row, offscreen);
        if (!composed) {
          store.set(bodySrc, null);
          weaponDiag.missing.add(bodySrc);
          continue;
        }
        store.set(bodySrc, composed);
      } catch (e) {
        store.set(bodySrc, null);
        weaponDiag.missing.add(bodySrc);
        console.warn(`[battle_demo][weaponLayer] ${bodySrc} 装配失败空手降级`, e);
      }
    }
  }
  fxPack = fxResult.pack; // 【T25】预载完成的帧包带出（.then 里重建播放器实例）
  const ctrlFaces: BattleHexAssets['ctrlFaces'] = { tuoguan: null, jiasu: null, flee: null };
  for (const [key, img] of facePairs) {
    if (key === 'tuoguan' || key === 'jiasu' || key === 'flee') ctrlFaces[key] = img;
  }
  const statusIcons = new Map<string, ImgLike | null>(iconPairs);
  const ok = (i: HTMLImageElement | null): string => (i ? 'ok' : 'MISS');
  const frameStat = (v: LegacyFrameStrip | DirectionalFrameStore): string =>
    Array.isArray(v)
      ? `${v.filter(Boolean).length}/${v.length}`
      : `${[...v.frames.values()].filter(Boolean).length}/${v.frames.size}`;
  // 【T27 第二段 · 方案 §9.2.2①/§9.5】directional 预载完整性门（预载期逐向逐 clip 校验：
  // 帧在+解码尺寸 240×320）。FAIL=页面红条+console.error 逐键可定位，渲染仍走安全占位（剪影），
  // 禁以「能显示」代替资源通过。CI 全量口径（manifest/文件名/RGBA/SHA/die_common 三处一致）
  // 走 node 预检脚本 proto/battle_demo/tools/preflight_enemy_sixdir.mjs（62 张逐张，非零退出=报红）。
  assetGateState = { ok: true, failures: [] };
  for (const [kind, profile] of Object.entries(BATTLE_HEX_RES.profiles)) {
    if (profile.mode !== 'directional') continue;
    const store = frames.get(kind);
    if (!store || Array.isArray(store)) continue;
    for (const [key, img] of store.frames) {
      if (!img) {
        assetGateState.ok = false;
        assetGateState.failures.push(`${kind} 帧缺失 key=${key}`);
        continue;
      }
      if (img.width !== 240 || img.height !== 320) {
        assetGateState.ok = false;
        assetGateState.failures.push(`${kind} 尺寸不符 key=${key} 实际 ${img.width}x${img.height}≠240x320`);
      }
    }
  }
  // 【T29 武器层 R2】已配置 48 行缺模型/蒙版/身体/合成失败 → 固定格式写 gate（48 行覆盖下应为
  // 恒空=资源全量在位；未配置状态帧不算资源债，仅 console 开发诊断，见主循环 gap 汇报）。
  for (const bodySrc of weaponDiag.missing) {
    assetGateState.ok = false;
    assetGateState.failures.push(weaponMissingTag(bodySrc));
  }
  paintAssetGate();
  console.log(
    `[battle_demo] 资源：env=${ok(env)} topbar=${ok(topbar)} plaque=${ok(plaque)} ` +
      `ctrlFaces=[${facePairs.map(([k2, v]) => `${k2}:${ok(v)}`).join(' ')}] ` +
      `statusIcons=[${iconPairs.map(([k2, v]) => `${k2}:${ok(v)}`).join(' ')}] ` +
      `帧=[${[...frames.entries()].map(([k2, v]) => `${k2}:${frameStat(v)}`).join(' ')}] ` +
      `FX=${TRIAL_FX_01.id}:${fxResult.loadedCount}/${fxResult.expectedCount}` +
      (fxResult.missing.length > 0 ? `（缺失！${fxResult.missing.join(',')}）` : ''),
  );
  return { env, topbar, plaque, ctrlFaces, statusIcons, frames, weaponLayers, weaponDiag };
}

// ===== 对局构造（联调：真 session；演示阵容=主角四技 vs 山贼双敌（Leo 09-04 裁定摘狼：设计无狼 NPC），R-07 档位语义占位） =====
/** 演示技能表（id 与 ui ARC_BTNS.ids 对齐；数值走 SkillDef 结构由 core 结算，此处非真值来源） */
const DEMO_SKILLS = [
  { id: 'te', name: '特', kind: 'special' as const, weapon: 'fist' as const, grade: 1.3 as const, growth: 1, level: 20, cooldownTurns: 2, neiliCost: 20 },
  { id: 'jue', name: '绝', kind: 'ultimate' as const, weapon: 'fist' as const, grade: 1.7 as const, growth: 1, level: 20, cooldownTurns: 5, neiliCost: 35 },
  { id: 'qing', name: '轻', kind: 'qingGong' as const, weapon: null, grade: 1.0 as const, growth: 1, level: 20, cooldownTurns: 3, neiliCost: 15 },
  { id: 'du', name: '毒', kind: 'hiddenWeapon' as const, weapon: 'hidden' as const, grade: 1.0 as const, growth: 1, level: 20, cooldownTurns: 1, neiliCost: 10 },
];
/** 【T26-R1 缺口】敌方自有技能（真实敌方 AI 施法 E2E）：planSkill 品阶降序——ejue(1.3) 优先，
 * 冷却轮换后 ete 可观测；weapon=fist 与 npc-shanzei 装备匹配。名条/光影色按 tier 不按阵营。 */
const DEMO_ENEMY_SKILLS = [
  { id: 'ete', name: '贼特', kind: 'special' as const, weapon: 'fist' as const, grade: 1.0 as const, growth: 1, level: 20, cooldownTurns: 2, neiliCost: 10 },
  { id: 'ejue', name: '贼绝', kind: 'ultimate' as const, weapon: 'fist' as const, grade: 1.3 as const, growth: 1, level: 20, cooldownTurns: 3, neiliCost: 20 },
];
/** 敌技白名单快查（fan-out/门共用；渲染层不查配置，方案 §3.1） */
const DEMO_SKILL_BY_ID = new Map([...DEMO_SKILLS, ...DEMO_ENEMY_SKILLS].map((s) => [s.id, s]));

function demoUnit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side' | 'name'>): CombatantInput {
  return {
    hp: 100,
    maxHp: 100,
    neili: 60,
    maxNeili: 100,
    atk: 12,
    def: 3,
    neigongLevel: 5,
    jimin: 8,
    danshi: 0,
    shizhan: 60, // 演示高命中（保普攻可观测；命中率真值在 core F-04）
    pos: { x: 0, y: 0 }, // 出生位由 session 按 O3 随机覆盖
    weapon: 'fist',
    skills: [],
    ...over,
  };
}

/** 【T27 第二段 · 方案 §9.2.2③】显式回退诊断开关：URL `?enemy=legacy` → 敌编成全部改指
 * `npc-shanzei-legacy`（旧 8 帧条整套目录，不与 battle45 逐帧混用）。仅供回滚诊断，默认关；
 * 开启时控制台明示「诊断回退，非正式通过」——禁静默回退、禁把回退宣称为通过。
 * （声明须先于下方 `let session = makeSession()`：makeSession 为提升函数，本常量为 TDZ 绑定） */
const ENEMY_LEGACY_DIAG = new URLSearchParams(location.search).get('enemy') === 'legacy';
if (ENEMY_LEGACY_DIAG) console.warn('[battle_demo] 诊断回退：敌编成显式指 npc-shanzei-legacy（?enemy=legacy），非正式通过口径');
/** 敌方稳定 spriteKey（§9.2.1：定义阶段写死甲/乙变体键，快照 spriteKey=configId 原样导出；
 * 禁按数组序/显示名/side 猜）；诊断开关开启时整体切显式 legacy 键。 */
function enemyKey(variant: 'a' | 'b'): string {
  return ENEMY_LEGACY_DIAG ? 'npc-shanzei-legacy' : `npc-shanzei-${variant}`;
}

let session = makeSession();
let speedOn = false;
let evCursor = 0; // session.events 消费游标（累积数组）
function makeSession() {
  // 敌方 name=configId（F3 约定：spriteKey=configId → 帧表键；名字牌暂显模板名，美化留后续）
  // 【T26-R1 缺口】敌方编成挂自有特/绝技（DEMO_ENEMY_SKILLS）：真实驱动敌方 AI 施法
  // （planSkill 品阶降序），名条/光影敌方同规则——色按 tier 不按阵营。
  // 【T27 第二段 · §9.2.1】e1=甲 npc-shanzei-a / e2=乙 npc-shanzei-b：稳定键在此定义点写死
  return createHexBattle({
    player: demoUnit({ id: 'hero', side: 'player', name: '小虾米', skills: DEMO_SKILLS }),
    enemies: [
      demoUnit({ id: 'e1', side: 'enemy', name: enemyKey('a'), hp: 70, maxHp: 70, atk: 8, jimin: 5, skills: DEMO_ENEMY_SKILLS }),
      demoUnit({ id: 'e2', side: 'enemy', name: enemyKey('b'), hp: 60, maxHp: 60, atk: 9, jimin: 6, skills: DEMO_ENEMY_SKILLS }),
    ],
    mode: 'manual',
    seed: 42,
  });
}

const view = createView();
// 【T25 · trial_fx_01】光影播放器（世界层）：稳定实例——进场预载全部 settle 后经 setPack
// 注入帧包（首个特功演出必然晚于预载完成，方案 §4.2），view.fxWorld 绑定一次。
// 启动/清空语义见 ui/fx-player（死亡/终局不回滚不截断，§5.2）。
let fxPack: FxFramePack = new Map();
const fxPlayer = new FxPlayer(fxPack);
view.fxWorld = fxPlayer; // 渲染 hook：drawFrame 在棋子后/血条前调用（方案 §3.2）
// 【T26 · WF-2】武功名条播放器（屏幕空间层）：稳定实例——drawFrame 在世界 restore 后/
// drawComponents 前调用（《武功名条方案-v0.1》§3.3）；启动/清空语义见 ui/wf-banner（§4.2）。
const wfBanner = new WfBannerPlayer();
view.wfBanner = wfBanner;
/** 演出技能 id 集（主角+敌方 SkillDef kind ∈ {special, ultimate}）：accepted cast t0 统一走
 * 演出 fan-out（T25 光影挂特技、T26 名条挂特/绝——一次施放一次 fan-out，共用门去重）；
 * 敌方技（ete/ejue）同集——敌方 AI 施法走同一 fan-out（色按 tier 不按阵营）。 */
const CAST_SKILL_IDS = new Set([...DEMO_SKILLS, ...DEMO_ENEMY_SKILLS].filter((s) => s.kind === 'special' || s.kind === 'ultimate').map((s) => s.id));
/** accepted cast 触发门（T26-R1 身份制）：宿主先经 findCastSnapshot 配出 cast 身份再过门——
 * 事件双源 skill/miss + (actorId|startedAtSec) 身份去重；段 2 结算事件身份不符必拦（T25-R2
 * 语义强化）；新 cast 在旧 t1 同刻凭自身快照身份正常启动（seq=169 P1 修复）。 */
const castGate = new FxCastGate(CAST_SKILL_IDS);
let assets: BattleHexAssets = {
  env: null,
  topbar: null,
  plaque: null,
  ctrlFaces: { tuoguan: null, jiasu: null, flee: null },
  statusIcons: new Map(),
  frames: new Map(),
};

let assetsReady = false; // 【T28】资源装配完成标记（shot/e2e 时序锚；调试挂载只读）
const input = createBattleInput({
  dispatch: (req) => {
    const ok = session.submit(req);
    if (ok && req.type === 'toggleSpeed') speedOn = !speedOn; // 演出态：加速中可视反馈
  },
  onBlocked: (msg) => toast(msg),
  // T23 开放点③默认：onPlaque 回调移除——牌面点击由 input 层静默吞掉（不穿透、无提示，纯占位）
  mode: () => session._debug.mode(),
});

/** 【T26 · WF-2 方案 §3.2 / T26-R1 身份制】accepted cast t0 演出 fan-out（T25 光影 + T26 名条
 * 同刻一层调度）：
 * - 只挂 accepted：rejected 走 rejected 事件（不进本函数）；事件双源 skill+miss——段 1
 *   命中发 skill、闪避发 miss、空放发 skill，任一源首条即 fan-out（去重已由 castGate 身份键
 *   完成），命中/闪避/空放/致死终局均不影响时间轴（非伤害事件监听）。
 * - T=该次 castDurationMs：cast 快照由事件循环 find-first 配出并透传（core 唯一真值 session
 *   已算好——宿主只读快照，不重算公式、不经手 battle-core，R10 红线）；cast=null 仅段 1 致胜
 *   终局（AS-9 cast 未及入队，gate 已放行）——演出走表现域兜底常量并告警留痕，禁当结算真值。
 *   该 T 只喂 T25 光影与门登记；名条时长恒 WF_BANNER.durationSec=1.000s 演出钟，禁随 T 缩放
 *  （名条方案 §4.2）。
 * - 锚=施法者中心格（WF-8）：hexToWorld(renderPos) 世界坐标 t0 定格，光影与名条共用同一
 *   锚快照；施法期间不可移动（session R1），死亡消散不移动锚——两层演出照常播完。
 * - 白名单：kind=special → 光影+名条（金色）；kind=ultimate → 仅名条（金红渐变）；
 *   qingGong/暗器/外功不进 CAST_SKILL_IDS 天然不触达；敌方 AI 施放走同一 fan-out
 *  （色按 tier 不按阵营，ete/ejue 同规则）。 */
function startCastPresentation(actorId: string, skillId: string, evT: number, cast: ReturnType<typeof findCastSnapshot>): void {
  let durMs: number;
  if (cast) {
    durMs = Math.round((cast.finishAtSec - cast.startedAtSec) * 1000);
  } else {
    // 段 1 致胜终局（AS-9）：scheduleSkillCast 段 1 循环中途 return，cast 未及入队——
    // 演出走表现域兜底常量（TRIAL_FX_FALLBACK_DURATION_MS）并告警留痕，禁当结算真值。
    durMs = TRIAL_FX_FALLBACK_DURATION_MS;
    console.warn(`[battle_demo] 演出无 cast 快照（段 1 致胜终局口径），光影时长走兜底 ${durMs}ms：actor=${actorId} skill=${skillId} t=${evT}`);
  }
  const actor = session.snapshot().actors.find((a) => a.id === actorId);
  if (!actor) return;
  const anchor = hexToWorld(actor.renderPos.q, actor.renderPos.r);
  const def = DEMO_SKILL_BY_ID.get(skillId);
  const tier = bannerTierOf(def?.kind);
  if (def && tier) {
    wfBanner.start({ text: def.name, tier, anchorWorld: anchor, startedAtSec: view.time }); // WF-2：固定 1.000s
  }
  if (tier === 'special') {
    fxPlayer.start(TRIAL_FX_01, anchor, view.time, durMs); // T25：三层光影只挂特技（时长 T=castDurationMs）
  }
  castGate.commitStart(actorId, cast ? cast.startedAtSec : evT, durMs, skillId); // 登记身份（段 2/去重判别）
}

function resetDemo(): void {
  input.reset(); // A07：重开清输入拖动态（结算瞬间按住/拖镜不跨局残留）
  session = makeSession();
  evCursor = 0;
  speedOn = false;
  fxPlayer.clearAll(); // 【T25】session 重建按实例清空未完成 FX（方案 §5.2：不跨局残留）
  wfBanner.clearAll(); // 【T26 · WF-2】名条跨局清空（reset/逃跑/session 重建，名条方案 §4.2）
  castGate.reset(); // 触发门跨局清空（去重键不跨局残留）
  view.anim.clear();
  view.moveAnims.clear();
  view.camInit = false; // 重开重新定位镜头
  view.fx.length = 0;
  view.pendingHits.length = 0; // T21/E4：重开残留清理（旧对局挂起/震动/错位序号不跨局冒出）
  view.shakes.clear();
  view.dmgStagger.clear();
  view.basicHolds.clear(); // 【AS · TASK-AS-FE】普攻保持窗跨局清理（旧局 1s 窗不拖进新局）
  view.selectedCell = null;
  view.hoverCell = null; // 【GSG-1 · TASK-AS-v04】悬停红态跨局清理
  view.skillPop = 0;
  view.camDrag.x = 0;
  view.camDrag.y = 0;
}

function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

// ===== 指针生命周期（A07）：同指针配对 + pointercancel/失焦重置 =====
const ptr = createPointerTracker();
canvas.addEventListener('pointerdown', (e) => {
  if (!ptr.down(e.pointerId)) return; // 多指交叉：非活动指忽略（同 id 重复 down=丢失 up 的自愈重锚）
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') return; // 结算遮罩期点击=重开（抬起触发）
  input.down(view, snap, p.x, p.y, W, H);
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr.owns(e.pointerId) || !input.pointer.down) return; // 配对：非活动指的 move 忽略
  const p = toLogical(e);
  input.move(view, p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  // 【GSG-1 · TASK-AS-v04】自由悬停（无按压）：译格写 view.hoverCell 表现态（触屏无自由
  // hover=不触发即自然退化）；活动指（拖镜/按压中）不产 hover，保持拖镜语义纯净。
  if (ptr.activeId !== null) return;
  const p = toLogical(e);
  input.hover(view, session.snapshot(), p.x, p.y, W, H);
});
canvas.addEventListener('pointerup', (e) => {
  if (!ptr.release(e.pointerId)) return; // 配对：id 不匹配/无活动指的 up 忽略（非配对释放不产生点击）
  const p = toLogical(e);
  const snap = session.snapshot();
  if (snap.phase !== 'fighting') {
    resetDemo();
    return;
  }
  input.up(view, snap, p.x, p.y, W, H);
});
canvas.addEventListener('pointercancel', (e) => {
  if (!ptr.release(e.pointerId)) return; // 非活动指的 cancel 忽略
  input.reset(); // A07：cancel=系统接管异常终止——视作未发生的按下：清拖动态，不产生点击
});
window.addEventListener('blur', () => {
  ptr.reset(); // A07：失焦清指针归属
  input.reset(); // 清拖动态（拖镜中失焦不残留 dragging）
});
document.addEventListener('dragstart', (e) => e.preventDefault());

// ===== 调试挂载（preview 目验/自动化驱动用；正式接入不含此段） =====
interface CssPoint {
  x: number;
  y: number;
}
function logicalToCss(x: number, y: number): CssPoint {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height };
}
function sampleHeroDrawPos(): { q: number; r: number; hop: number } {
  const hero = session.snapshot().actors.find((a) => a.id === 'hero');
  if (!hero) return { q: 0, r: 0, hop: 0 };
  const ma = view.moveAnims.get(hero.id);
  const mp = ma ? Math.min(1, ma.t / ma.duration) : 1;
  const q = ma ? ma.from.q + (ma.pos.q - ma.from.q) * mp : hero.renderPos.q;
  const r = ma ? ma.from.r + (ma.pos.r - ma.from.r) * mp : hero.renderPos.r;
  return { q: +q.toFixed(3), r: +r.toFixed(3), hop: +pieceHop(view, hero).toFixed(1) };
}

(window as unknown as Record<string, unknown>).__demo = {
  get session() {
    return session;
  },
  getView: () => view,
  /** 【T27 第二段】directional 资源完整性门只读状态（shot/e2e 断言用；调试挂载不进正式接入） */
  get assetGate() {
    return assetGateState;
  },
  /** 【T28】资源装配完成（loadAssets resolve 且主循环将启）；shot 脚本时序锚 */
  get assetsReady() {
    return assetsReady;
  },
  get W() {
    return W;
  },
  get H() {
    return H;
  },
  /** 格 → 页面坐标（自动化点击用） */
  cellCss(q: number, r: number): CssPoint {
    const w = hexToWorld(q, r);
    return logicalToCss(w.x - view.camera.x + W / 2, w.y - view.camera.y + H / 2);
  },
  /** 主角演出绘制位置采样（终验：移动帧序列单调性断言用） */
  sampleHeroDraw(): { q: number; r: number; hop: number } {
    return sampleHeroDrawPos();
  },
  /** 真实 rAF 逐帧位置录制（终验闪烁实证：Performance.now 时间轴） */
  startFrameLog(): void {
    frameLog = [];
    frameLogOn = true;
  },
  stopFrameLog(): Array<{ t: number; q: number; r: number; hop: number }> {
    frameLogOn = false;
    return frameLog;
  },
  /** 逻辑坐标 → 页面坐标（ctrl 等布局热区换算用） */
  cssOf(lx: number, ly: number): CssPoint {
    return logicalToCss(lx, ly);
  },
  /** 弧形技能钮 → 页面坐标 */
  btnCss(id: string): CssPoint | null {
    const b = view.layout.skillBtns.find((x) => x.id === id);
    return b ? logicalToCss(b.x, b.y) : null;
  },
  /** 渲染常量组只读引用（L 环二轮居中校准专用：shot_calib.mjs 白盒覆写 PIECE.feetOffsetPx
   * 逐档截图——渲染每帧属性读值，覆写即时生效；选档后常量落 config，本挂载不进正式接入） */
  get PIECE() {
    return PIECE;
  },
  /** 【T26 · WF-2】名条播放器只读引用（截图驱动/目验断言：activeCount 生命周期时序采样；
   * 惯例同 getView/PIECE——调试挂载不进正式接入） */
  get wfBanner() {
    return wfBanner;
  },
};

// ===== 主循环 =====
let last = performance.now();
let frameLog: Array<{ t: number; q: number; r: number; hop: number }> = [];
let frameLogOn = false;
const weaponGapReported = new Set<string>(); // 【T28】缺口诊断去重（每 bodySrc 只报一次）
function loop(t: number): void {
  const realDt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  // 【AS · TASK-AS-FE · 方案 §4.4】宿主逻辑 dt 唯一真源：session.tick 内部按 SPEED_FACTOR 缩放
  //（battle-session speed 段），view 演出钟必须吃同一逻辑 dt——x2 时 cast 帧循环、血条、行动条、
  // 移动演出同倍率推进，禁止只加速其一（speedOn=宿主镜像，与 session speedFast 经 toggleSpeed
  // 受理同步翻转；SPEED_FACTOR 同源常量，两路恒同值）。
  const dt = realDt * (speedOn ? SPEED_FACTOR.fast : SPEED_FACTOR.normal);
  resize(); // 每帧检测窗口尺寸变化（resize 事件不可靠场景兜底）
  if (frameLogOn) frameLog.push({ t: Math.round(performance.now()), ...sampleHeroDrawPos() });
  session.tick(realDt);
  const snap = session.snapshot();
  view.uiState = { mode: session._debug.mode(), speed: speedOn };
  // 事件消费（rejected 冒字 T15 R3 + T21 受击反馈白名单入队，方案 §2.2——其余一切不入队）
  const evs = session.events;
  for (; evCursor < evs.length; evCursor++) {
    const e = evs[evCursor];
    if (e.type === 'rejected') {
      if (!e.actorId) continue;
      const actor = snap.actors.find((a) => a.id === e.actorId);
      if (!actor) continue;
      const w = hexToWorld(actor.renderPos.q, actor.renderPos.r);
      spawnNoteFx(view, w.x, w.y, REJECT_HINTS[e.reason ?? 'invalid'] ?? '无法执行');
      continue;
    }
    // 【T26 · WF-2 方案 §3.2 / T26-R1 身份制】accepted cast t0 演出 fan-out：事件双源 skill+miss
    // ——命中发 skill / 闪避发 miss / 空放发 skill。先 findCastSnapshot 配身份（core 快照唯一
    // 真值），再过 gate：段 2/异物身份不符必拦，新 cast 在旧 t1 同刻凭自身身份启动（seq=169
    // P1 修复）。与出招 04→05（charge 入相）同帧；rejected 不进此路（上分支 continue）。
    // fan-out 内分流：特技=光影+名条、绝学=仅名条（qingGong/暗器不进白名单天然不触达）。
    if ((e.type === 'skill' || e.type === 'miss') && e.actorId && e.skillId && CAST_SKILL_IDS.has(e.skillId)) {
      const casts = [...session._debug.pendingCasts(), ...session._debug.presentationCasts()];
      const cast = findCastSnapshot(casts, e.actorId, e.skillId, e.t);
      if (castGate.shouldStart(e, cast)) {
        startCastPresentation(e.actorId, e.skillId, e.t, cast);
      }
    }
    // T21 白名单（§2.2）：basic/skill 且有 targetId 且 damage>0 → 冒数字+震动；
    // miss 且有 targetId → 冒「闪避」不震（闪避=未受击）。fallback/blocked damage=0、
    // 空放 skill（无 targetId 无 damage，session:768）、death/move/win/lose 等天然不入队。
    // 数值铁律：text=String(e.damage) 直读事件字段禁任何换算（真值在 core，UI 只展示）。
    if ((e.type === 'basic' || e.type === 'skill') && e.targetId && typeof e.damage === 'number' && e.damage > 0) {
      enqueueHit(view, e.actorId ?? '', e.targetId, String(e.damage), true);
    } else if (e.type === 'miss' && e.targetId) {
      enqueueHit(view, e.actorId ?? '', e.targetId, DMG.missText, false);
    }
  }
  // 【T29 武器层】未配置状态帧缺口开发诊断（渲染侧 weaponLayerOf 记录 → 此处逐条 console 一次；
  // 48 行覆盖 idle/walk/atk/cast 后恒空=防御性诊断；显式空手禁借邻帧/镜像，不算资源债不进 asset gate）
  for (const gap of assets.weaponDiag?.gaps ?? []) {
    if (!weaponGapReported.has(gap)) {
      weaponGapReported.add(gap);
      console.warn(`[battle_demo][weaponLayer 缺口] ${gap} 48 行未覆盖（防御诊断）：显式空手`);
    }
  }
  updateView(view, snap, dt, W, H);
  // 【T25】光影播放器与演出钟同源推进（x1/x2 只改逻辑 dt 速率=只改播放速度，配方时长不变）
  fxPlayer.update(view.time);
  wfBanner.update(view.time); // 【T26 · WF-2】名条相位推进（固定 1.000s 演出钟，到点即收）
  drawFrame({ ctx, width: W, height: H, dt }, snap, assets, view);
  requestAnimationFrame(loop);
}

void loadAssets().then((a) => {
  assets = a;
  fxPlayer.setPack(fxPack); // 【T25】预载完成的帧包注入（稳定实例；主循环此刻才启动）
  assetsReady = true;
  requestAnimationFrame((t) => {
    last = t;
    loop(t);
  });
});
