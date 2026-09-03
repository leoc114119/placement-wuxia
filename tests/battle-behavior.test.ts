// ═══ 战斗行为面测试（行为套件 · 独立通道 · 2026-09-02 复盘任务交付）═══
// 运行：npm run test:behavior（= BEHAVIOR=1 vitest run tests/battle-behavior.test.ts）
// 隔离：主套件（npm run test:battle）中本文件全部 skip——主套件保持绿；
//       行为套件的红 = 活的缺陷登记簿（red = known defect, not regression）。
// 真源：《战斗交互行为规格》v1.0（docs/design/03-战斗系统/战斗交互行为规格.md，commit 15dde99）
//       规则真源：战斗规则C案；断言方向只由规格推导——实现变更不得改写断言（规格 §五）。
//
// ─── 红名单（红 ↔ 缺陷号对照；修复后转绿并在此登记修复 commit）───
// | 用例（describe 内标题）                | 缺陷号 | 根因层     | 登记日    | 修复 commit |
// |---------------------------------------|--------|-----------|----------|-------------|
// | N1🟢 移动演出·路径演出必须启动          | N1     | session ATK-3 覆写 walk 演出（§3.2） | 09-02 | T19 批一 09-03（本卡交付提交，hash 见 git log） |
// | N1🟢 移动演出·绘制路径不得穿占格        | N1     | session 直线回退轨穿占格（§3.3） | 09-02 | T19 批一 09-03（本卡交付提交，hash 见 git log） |
// | N2🟢 空红格点击必须有可观测反馈         | N2     | input+规格 | 09-02    | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-2/ATK-6 v2.0 格子目标化重写=cast 空放受理断言）；T22 09-03 按 v2.2 改布点（e1 出射程=真空放），断言体零改 |
// | N2🟢 敌演出位点击不得静默取消选中       | N2     | input 命中  | 09-02    | T20-FE 09-03（本卡交付提交，hash 见 git log；按 ATK-7/SEL-5② v2.0 拆双变体重写：射程内 cast 受理/射程外规范取消）；T22 09-03 按 ATK-7 v2.2 翻转变体(a)=施放全范围生效（命中只看射程成员） |
// 其余用例 = 绿锁（规格矩阵对号；红即回归，不是登记簿）。
// T19 批一（09-03）终态：4 红 → 2 红（N2-①/N2-②）；N1×2 转绿见上表。
// T20-FE（09-03）终态：2 红 → 0 红（N2-①②按规格 v2.0 重写转绿；规格依据=《战斗交互行为规格》v2.1
// ATK-2/ATK-6/ATK-7/SEL-5② + 《战斗格子施放与热区修复方案》§五新旧断言对照表，PM 裁决放行）。
// T22（09-03）终态：N2-①②随规格 v2.2 AOE 五点配套改写（①改布点敌出射程=真空放、②(a)断言翻转=
// 施放全范围生效；②(b)取消路径零改）；规格依据=《战斗交互行为规格》v2.2 + 《特绝范围AOE修正方案-v0.1》
// §二.2，PM 裁决放行（Q-T22-A/B 采建议案）。其余 12 例零改。
//
// 测试基建说明：place() 通过 session 公开的 _debug 白盒布点（绕过随机出生求确定性场景），
// 断言只针对公共 API（snapshot/submit/events）与渲染公共函数（updateView/moveAnimDrawPosPx）。
import { describe, expect, it } from 'vitest';
import { createHexBattle } from '../systems/battle-session';
import { cubeDistance, offsetToAxial } from '../systems/hex';
import {
  createView,
  moveAnimDrawPosPx,
  updateView,
  worldToHex,
} from '../ui/battle-hex-render';
import { createBattleInput } from '../ui/battle-input';
import { hexToWorld } from '../config/battle-hex';
import type { ActionRequest, CombatantInput, SkillDef } from '../types';

// 最小 ambient 声明（同 env.d.ts 口径：tests 不引 @types/node）
declare const process: { env: Record<string, string | undefined> };

const W = 375;
const H = 667;

// 主套件隔离门（见文件头）
const RUN = process.env.BEHAVIOR === '1';
const d = RUN ? describe : describe.skip;

// ---------- 场景基建（demo 阵容与 proto/battle_demo/main.ts 同构） ----------

const DEMO_SKILLS: SkillDef[] = [
  { id: 'te', name: '特', kind: 'special', weapon: 'fist', grade: 1.3, growth: 1, level: 20, cooldownTurns: 2, neiliCost: 20 },
  { id: 'jue', name: '绝', kind: 'ultimate', weapon: 'fist', grade: 1.7, growth: 1, level: 20, cooldownTurns: 5, neiliCost: 35 },
  { id: 'qing', name: '轻', kind: 'qingGong', weapon: null, grade: 1.0, growth: 1, level: 20, cooldownTurns: 3, neiliCost: 15 },
  { id: 'du', name: '毒', kind: 'hiddenWeapon', weapon: 'hidden', grade: 1.0, growth: 1, level: 20, cooldownTurns: 1, neiliCost: 10 },
];

function unit(over: Partial<CombatantInput> & Pick<CombatantInput, 'id' | 'side'>): CombatantInput {
  return {
    name: over.id,
    hp: 100, maxHp: 100, neili: 60, maxNeili: 100,
    atk: 12, def: 3, neigongLevel: 5, jimin: 8, danshi: 0, shizhan: 60,
    pos: { x: 0, y: 0 }, weapon: 'fist', skills: [],
    ...over,
  };
}

type Session = ReturnType<typeof createHexBattle>;

function mkSession(playerSkills: SkillDef[] = DEMO_SKILLS): Session {
  return createHexBattle({
    player: unit({ id: 'hero', side: 'player', skills: playerSkills }),
    enemies: [unit({ id: 'e1', side: 'enemy' }), unit({ id: 'e2', side: 'enemy' })],
    mode: 'manual',
    seed: 42,
  });
}

function place(s: Session, id: string, col: number, row: number): void {
  const u = s._debug.units.find((x) => x.id === id)!;
  const hex = offsetToAxial(col, row);
  u.hex = { ...hex };
  u.renderQ = hex.q; u.renderR = hex.r; u.moveFromQ = hex.q; u.moveFromR = hex.r;
  u.moveT = 1; u.isJump = false; u.animState = 'idle'; u.animLeftMs = 0;
  u.pendingAnim = null; u.movePath = []; // 【T19 · 方案 §九-3】Runner 新增字段同步重置，防用例间状态泄漏
  u.bar = 0; u.barWasMax = false; u.dead = false;
  if (u.hp <= 0) u.hp = 50;
}

function ready(s: Session): void {
  const hero = s._debug.units.find((x) => x.id === 'hero')!;
  hero.bar = 100;
  hero.hp = Math.max(hero.hp, 60);
  s.tick(0.001);
}

const heroOf = (s: Session) => s.snapshot().actors.find((a) => a.id === 'hero')!;
const evTypes = (s: Session) => s.events.map((e) => e.type);

/** 逐帧驱动 session×updateView（真实页面同序：tick→snapshot→updateView），采样主角绘制位置 */
function sampleHeroWalk(s: Session, frames: number) {
  const view = createView();
  let animEverStarted = false;
  const cells: Array<{ q: number; r: number }> = [];
  for (let i = 0; i < frames; i++) {
    s.tick(0.016);
    const snap = s.snapshot();
    updateView(view, snap, 0.016, W, H);
    if (view.moveAnims.has('hero')) animEverStarted = true;
    const hero = snap.actors.find((a) => a.id === 'hero')!;
    const ma = view.moveAnims.get('hero');
    const draw = ma ? moveAnimDrawPosPx(ma) : hexToWorld(hero.renderPos.q, hero.renderPos.r);
    cells.push(worldToHex(draw.x, draw.y));
  }
  return { animEverStarted, cells, view };
}

// ═══ 绿锁：规格 §五 矩阵对号（红=回归，非登记簿） ═══

d('MV-0/MV-1 普通移动语义（结算层绿锁）', () => {
  it('不可穿单位：隔单位对侧格（绕行超预算）∉ 绿格，提交无位移无事件（ATK-5）', () => {
    const s = mkSession([]); // 无轻功 → 移动力 = 基础 2（绕行需 3 步）
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8); // 正右相邻挡路
    place(s, 'e2', 11, 3);
    ready(s);
    const snap = s.snapshot();
    const straightBehind = offsetToAxial(7, 8); // 直线对侧格：绕行 3 步 > 移动力 2
    expect(snap.moveCells.some((c) => c.q === straightBehind.q && c.r === straightBehind.r)).toBe(false);
    expect(snap.moveCells.some((c) => c.q === 2 && c.r === 8)).toBe(false); // 敌占格 ∉ 落点
    const n0 = s.events.length;
    const ok = s.submit({ type: 'move', to: straightBehind });
    expect(ok).toBe(false);
    expect(s.events.length).toBe(n0); // ATK-5：可动区内空格=无操作（无事件）
    expect(heroOf(s).pos).toEqual(offsetToAxial(5, 8)); // 无位移
  });

  it('绿格全在可动区内（12 高 × 8 宽，row 2..13 × col 4..11）', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 11, 3);
    place(s, 'e2', 4, 12);
    ready(s);
    for (const c of s.snapshot().moveCells) {
      const col = c.q + Math.floor(c.r / 2);
      expect(col >= 4 && col <= 11 && c.r >= 2 && c.r <= 13).toBe(true);
    }
  });
});

d('MV-2 轻功跳跃语义（结算层绿锁）', () => {
  it('金格=跳跃半径空格可穿越；提交 isJump 位移+bar 清零+选中清除（SEL-3）', () => {
    const s = mkSession();
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8); // 中间单位：跳跃可穿越
    place(s, 'e2', 11, 3);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'qing' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.moveKind).toBe('jump');
    const over = offsetToAxial(7, 8); // 隔单位对侧：cube 距离 2 ≤ ⌊7/2⌋
    expect(snap.moveCells.some((c) => c.q === over.q && c.r === over.r)).toBe(true);
    expect(snap.attackCells).toHaveLength(0); // 金绿互斥（MV-2）
    const ok = s.submit({ type: 'move', to: over });
    expect(ok).toBe(true);
    expect(s._debug.player().isJump).toBe(true); // 病灶②：doMove 唯一产生点
    expect(heroOf(s).pos).toEqual(over);
    expect(heroOf(s).actionBar).toBe(0); // BAR-3
    expect(s.snapshot().selectedSkill).toBe(null); // SEL-3
  });
});

d('SEL-1/BAR-1 行动条（绿锁）', () => {
  it('clamp 100 封顶：等待期持续 tick 不累计溢出；bar-max 恰发一次', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 11, 3);
    place(s, 'e2', 4, 12);
    ready(s);
    for (let i = 0; i < 300; i++) s.tick(0.016); // 等待 4.8s
    const snap = s.snapshot();
    expect(snap.actors.find((a) => a.id === 'hero')!.actionBar).toBeLessThanOrEqual(100);
    expect(snap.actors.find((a) => a.id === 'hero')!.actionBar).toBe(100);
    const heroBarMax = s.events.filter((e) => e.type === 'bar-max' && e.actorId === 'hero').length;
    expect(heroBarMax).toBe(1); // SEL-1：等待期不重复发
  });
});

d('SEL-2/SEL-6 选中互斥与置灰真值（绿锁）', () => {
  it('选特→选绝（互斥切换）→再点绝（toggle 取消）', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 11, 3);
    place(s, 'e2', 4, 12);
    ready(s);
    s.submit({ type: 'selectSkill', skillId: 'te' });
    expect(s.snapshot().selectedSkill).toBe('te');
    s.submit({ type: 'selectSkill', skillId: 'jue' });
    expect(s.snapshot().selectedSkill).toBe('jue'); // BASE-5 互斥
    s.submit({ type: 'selectSkill', skillId: 'jue' });
    expect(s.snapshot().selectedSkill).toBe(null); // SEL-5①
  });

  it('置灰真值：毒（武器不匹配）恒灰；施放特后冷却中灰（SEL-6/R-08）', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 9, 8); // 距 2 = 特射程内
    place(s, 'e2', 4, 12);
    ready(s);
    const before = s.snapshot().heroSkills;
    expect(before.find((b) => b.id === 'du')!.disabled).toBe(true); // D6：毒恒灰
    expect(before.find((b) => b.id === 'te')!.disabled).toBe(false);
    s.submit({ type: 'selectSkill', skillId: 'te' });
    s.submit({ type: 'attack', targetId: 'e1', skillId: 'te' });
    const after = s.snapshot().heroSkills;
    expect(after.find((b) => b.id === 'te')!.disabled).toBe(true); // 冷却中
  });
});

d('ATK-2 技能施放链（结算层绿锁 · N2 受理/结算层无病的证据锁）', () => {
  it('选特→红格高亮（含敌格）→点敌格 submit → skill 事件+扣内力+清选中+bar 清零', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 9, 8); // 正东 2 格 = 特（拳 tier1）射程内
    place(s, 'e2', 4, 12);
    ready(s);
    expect(s.submit({ type: 'selectSkill', skillId: 'te' })).toBe(true);
    const snap = s.snapshot();
    expect(snap.selectedSkill).toBe('te');
    expect(snap.attackCells.length).toBeGreaterThan(0);
    const e1 = snap.actors.find((a) => a.id === 'e1')!;
    expect(snap.attackCells.some((c) => c.q === e1.pos.q && c.r === e1.pos.r)).toBe(true);
    const hp0 = e1.hp;
    const neuli0 = snap.actors.find((a) => a.id === 'hero')!.neili;
    expect(s.submit({ type: 'attack', targetId: 'e1', skillId: 'te' })).toBe(true);
    const after = s.snapshot();
    // 命中/闪避走 core 骰子（F-04），行为锁只锁链路：出手事件（skill 或 miss）+资源+状态
    const tail = evTypes(s).slice(-3);
    expect(tail).toEqual(expect.arrayContaining([expect.stringMatching(/^(skill|miss)$/)]));
    expect(after.actors.find((a) => a.id === 'e1')!.hp).toBeLessThanOrEqual(hp0);
    expect(after.actors.find((a) => a.id === 'hero')!.neili).toBe(neuli0 - 1); // Q2 内力 1（骰前扣，确定）
    expect(after.selectedSkill).toBe(null);
    expect(after.actors.find((a) => a.id === 'hero')!.actionBar).toBe(0);
  });
});

d('ATK-3/ATK-4 移动附带普攻与轻功态点敌（绿锁）', () => {
  it('移动落点与敌相邻 → move 事件后跟 basic 事件（不另耗回合）', () => {
    const s = mkSession();
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8);
    place(s, 'e2', 11, 3);
    ready(s);
    const n0 = s.events.length;
    expect(s.submit({ type: 'move', to: offsetToAxial(6, 9) })).toBe(true); // 落点与 e1 相邻
    const tail = evTypes(s).slice(n0);
    const iMove = tail.indexOf('move');
    expect(iMove).toBeGreaterThanOrEqual(0);
    expect(tail.slice(iMove)).toContain('basic'); // ATK-3
    expect(heroOf(s).actionBar).toBe(0); // 只耗一次行动
  });

  it('轻功态点敌=无操作：false、无事件、选中保持（ATK-4/Q4）', () => {
    const s = mkSession();
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8);
    place(s, 'e2', 11, 3);
    ready(s);
    s.submit({ type: 'selectSkill', skillId: 'qing' });
    const n0 = s.events.length;
    expect(s.submit({ type: 'attack', targetId: 'e1', skillId: null })).toBe(false);
    expect(s.events.length).toBe(n0);
    expect(s.snapshot().selectedSkill).toBe('qing');
  });
});

d('SP-1 出生锚点（绿锁）', () => {
  it('4 seed 全员出生格距各自锚 ≤3，我敌带不相交', () => {
    const anchors = { player: offsetToAxial(4, 13), enemy: offsetToAxial(11, 2) };
    for (const seed of [1, 7, 42, 2026]) {
      const s2 = createHexBattle({
        player: unit({ id: 'hero', side: 'player', skills: DEMO_SKILLS }),
        enemies: [unit({ id: 'e1', side: 'enemy' }), unit({ id: 'e2', side: 'enemy' })],
        mode: 'manual',
        seed,
      });
      for (const u of s2._debug.units) {
        const anchor = u.side === 'player' ? anchors.player : anchors.enemy;
        expect(cubeDistance(anchor, u.hex)).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ═══ 红名单：活缺陷登记簿（红 = 已登记未修，修复后转绿并更新文件头登记表） ═══

d('N1🔴 移动演出（FE 演出层）', () => {
  it('路径演出必须启动：落点与敌相邻（ATK-3 自动普攻）的普通移动，moveAnims 必须出现 hero', () => {
    const s = mkSession();
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8); // 同排相邻挡路
    place(s, 'e2', 11, 3);
    ready(s);
    expect(s.submit({ type: 'move', to: offsetToAxial(7, 8) })).toBe(true); // 落点在 e1 后、与其相邻
    const { animEverStarted } = sampleHeroWalk(s, 60);
    // 根因：session doMove('walk') 后 basicIfAdjacent 同步覆写 animState='basic'（battle-session.ts
    // setAnim 时序），updateView walkRise 条件含 animState==='walk'（battle-hex-render.ts:415）→ 永不触发。
    expect(animEverStarted).toBe(true);
  });

  it('绘制路径不得穿占格：同排绕行场景，演出期间画位不得进入存活敌占格', () => {
    const s = mkSession();
    place(s, 'hero', 5, 8);
    place(s, 'e1', 6, 8);
    place(s, 'e2', 11, 3);
    ready(s);
    expect(s.submit({ type: 'move', to: offsetToAxial(7, 8) })).toBe(true);
    const { cells } = sampleHeroWalk(s, 60);
    const e1cell = offsetToAxial(6, 8);
    const breaches = cells
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => i > 2 && i < 45 && c.q === e1cell.q && c.r === e1cell.r);
    // 现象证据（09-02 取证）：直线回退插值连续 10 帧穿 e1 格，距敌中心最小 4px
    expect(breaches).toEqual([]);
  });
});

d('N2🟢 技能施放交互（T20-FE 按规格 v2.0 重写转绿 · input 命中层）', () => {
  it('空红格点击=cast 空放受理：input 恰派 1 条 cast、资源全扣无伤害（N2-① · ATK-2/ATK-6 v2.2 布点修正）', () => {
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 11, 8); // 【T22 v2.2】空放=射程内无存活敌（五点③）：e1 挪出射程（cube 4 > 特射程 2）
    place(s, 'e2', 4, 12);
    ready(s);
    s.submit({ type: 'selectSkill', skillId: 'te' });
    const view = createView();
    for (let i = 0; i < 30; i++) {
      s.tick(0.016);
      updateView(view, s.snapshot(), 0.016, W, H);
    }
    const snap = s.snapshot();
    const empty = snap.attackCells.find((c) => {
      const e1 = snap.actors.find((a) => a.id === 'e1')!;
      const e2 = snap.actors.find((a) => a.id === 'e2')!;
      return !(c.q === e1.pos.q && c.r === e1.pos.r) && !(c.q === e2.pos.q && c.r === e2.pos.r);
    })!;
    const neili0 = snap.actors.find((a) => a.id === 'hero')!.neili;
    const hp01 = snap.actors.find((a) => a.id === 'e1')!.hp;
    const hp02 = snap.actors.find((a) => a.id === 'e2')!.hp;
    const dispatches: ActionRequest[] = [];
    const input = createBattleInput({
      dispatch: (req) => {
        dispatches.push(req);
        s.submit(req); // input 派发直连提交（session 终态断言前提：派发 ≠ 受理，须真实走 session）
      },
    });
    const w = hexToWorld(empty.q, empty.r);
    input.up(view, s.snapshot(), w.x - view.camera.x + W / 2, w.y - view.camera.y + H / 2, W, H);
    // 新断言（方案 §五 N2-① 行）：恰 1 条 cast（非 cancelSkill）——v2.0 下点射程内空格=合法施放
    expect(dispatches).toEqual([{ type: 'cast', to: { q: empty.q, r: empty.r }, skillId: 'te' }]);
    const after = s.snapshot();
    expect(after.selectedSkill).toBe(null); // 施放受理 → 选中清除
    expect(after.actors.find((a) => a.id === 'hero')!.actionBar).toBe(0); // BAR-3 行动条清零
    expect(after.actors.find((a) => a.id === 'hero')!.neili).toBe(neili0 - 1); // R-09 镜像（视图口径 1）
    expect(after.heroSkills.find((b) => b.id === 'te')!.disabled).toBe(true); // R-08 冷却写入（neili 60−1=59 ≫ 内力阈值，置灰唯冷却因）
    expect(after.actors.find((a) => a.id === 'e1')!.hp).toBe(hp01); // 空放：格上无敌=无伤害结算
    expect(after.actors.find((a) => a.id === 'e2')!.hp).toBe(hp02);
    const skillEv = s.events.filter((e) => e.type === 'skill').pop();
    expect(skillEv).toBeDefined(); // 事件尾=skill（可观测反馈本体，ATK-6 契约）
    expect((skillEv as { targetId?: unknown }).targetId).toBeUndefined(); // 空放事件无 targetId
    expect((skillEv as { damage?: unknown }).damage).toBeUndefined(); // 且无 damage
  });

  it('敌演出位点击双变体：射程内=施放全范围生效 / 射程外=规范取消（N2-② · ATK-7 v2.2 简化/SEL-5②）', () => {
    // ── 变体 (a)：renderPos 偏移至射程内格（≠ 敌逻辑格）→ 施放全范围生效（T22 v2.2 断言翻转）──
    const s = mkSession();
    place(s, 'hero', 7, 8);
    place(s, 'e1', 9, 8); // pos axial(5,8)
    place(s, 'e2', 4, 12); // cube 5 ∉ 射程（e1 为唯一射程内敌 → 恰 1 条结算事件）
    ready(s);
    s.submit({ type: 'selectSkill', skillId: 'te' });
    const view = createView();
    for (let i = 0; i < 30; i++) {
      s.tick(0.016);
      updateView(view, s.snapshot(), 0.016, W, H);
    }
    const e1u = s._debug.units.find((x) => x.id === 'e1')!;
    // 可见位 axial(4,9)（offset(8,9)）：cube(hero(3,8)→(4,9))=2 ≤ 特射程 2，且 ≠ 敌逻辑格（ATK-7 v2.2 生效臂）
    e1u.renderQ = 4;
    e1u.renderR = 9;
    const snapA = s.snapshot();
    expect(snapA.attackCells.some((c) => c.q === 4 && c.r === 9)).toBe(true); // 前置：演出位格 ∈ 射程红格
    const neiliA = snapA.actors.find((a) => a.id === 'hero')!.neili;
    const hpA = snapA.actors.find((a) => a.id === 'e1')!.hp;
    const evA0 = s.events.length; // 结算事件基线
    const dispatches: ActionRequest[] = [];
    const input = createBattleInput({
      dispatch: (req) => {
        dispatches.push(req);
        s.submit(req);
      },
    });
    const wA = hexToWorld(e1u.renderQ, e1u.renderR); // 玩家点的是“看到的位置”
    input.up(view, s.snapshot(), wA.x - view.camera.x + W / 2, wA.y - view.camera.y + H / 2, W, H);
    expect(dispatches).toEqual([{ type: 'cast', to: { q: 4, r: 9 }, skillId: 'te' }]); // 演出位∈射程=受理
    const afterA = s.snapshot();
    expect(afterA.selectedSkill).toBe(null); // 施放受理选中清
    // v2.2 断言翻转（ATK-7 简化/五点④）：命中只看射程成员——e1 逻辑位 (9,8) ∈ 射程被 AOE 命中
    const settleA = s.events.slice(evA0).filter((e) => e.type === 'skill' || e.type === 'miss');
    expect(settleA).toHaveLength(1); // 恰 1 条结算事件（e1 唯一射程内敌）
    expect((settleA[0] as { targetId?: string }).targetId).toBe('e1');
    expect(afterA.actors.find((a) => a.id === 'e1')!.hp).toBeLessThanOrEqual(hpA); // 施放全范围生效（miss 偶发容错 ≤）
    expect(e1u.hex).toEqual(offsetToAxial(9, 8)); // 逻辑位不动（命中不依赖点击格与逻辑位——保留证据）
    expect(afterA.actors.find((a) => a.id === 'hero')!.neili).toBe(neiliA - 1); // 资源照扣（首目标真值）

    // ── 变体 (b)：renderPos 偏移至射程外格（原取证布点 r+2，cube 距离 4 > 2）→ cancelSkill=规范取消 ──
    // 新 session 防跨变体泄漏（place() 基建不重置 cooldowns/资源，方案 §七-9）
    const s2 = mkSession();
    place(s2, 'hero', 7, 8);
    place(s2, 'e1', 9, 8);
    place(s2, 'e2', 4, 12);
    ready(s2);
    s2.submit({ type: 'selectSkill', skillId: 'te' });
    const view2 = createView();
    for (let i = 0; i < 30; i++) {
      s2.tick(0.016);
      updateView(view2, s2.snapshot(), 0.016, W, H);
    }
    const e1v = s2._debug.units.find((x) => x.id === 'e1')!;
    e1v.renderQ = e1v.hex.q;
    e1v.renderR = e1v.hex.r + 2; // 可见位在射程圆外、逻辑位在射程内红格上（原 N2-② 取证布点）
    const neiliB = s2.snapshot().actors.find((a) => a.id === 'hero')!.neili;
    const dispatches2: ActionRequest[] = [];
    const input2 = createBattleInput({
      dispatch: (req) => {
        dispatches2.push(req);
        s2.submit(req); // 派发直连提交（取消生效断言前提）
      },
    });
    const wB = hexToWorld(e1v.renderQ, e1v.renderR);
    input2.up(view2, s2.snapshot(), wB.x - view2.camera.x + W / 2, wB.y - view2.camera.y + H / 2, W, H);
    expect(dispatches2).toEqual([{ type: 'cancelSkill' }]); // 射程外=取消（SEL-5② 规范行为，派发可见非静默）
    expect(s2.events.filter((e) => e.type === 'skill')).toHaveLength(0); // 无 skill 事件（§七-17 防假绿）
    expect(s2.snapshot().selectedSkill).toBe(null); // 取消生效=选中清除
    expect(s2.snapshot().actors.find((a) => a.id === 'hero')!.neili).toBe(neiliB); // 取消零消耗（与空放受理的分界）
  });
});
