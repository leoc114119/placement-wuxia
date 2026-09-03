// 战斗输入翻译层（T16 frontend）：指针事件 → ActionRequest（会话侧校验合法性，非法静默拒绝）。
// 红线：禁止 import battle-core（DoD 自动化扫描）；本层不算数值——只做命中判定与请求翻译。
// 镜头拖动 >8px 判定沿用旧 T06 已验口径（config CAMERA.dragThresholdPx）。
import type { ActionRequest, BattleSnapshot, HexPos } from '../types';
import { CAMERA, CTRL_ART, CTRL_BUTTONS, HIT_TOL, PLAQUE_ART, PLAQUE_BUTTONS, hexToWorld } from '../config/battle-hex';
import { axialToOffset, worldToHex, type BattleHexView } from './battle-hex-render';

export interface BattleInputHooks {
  /** 提交行动请求（mock/T15 session 的 submit 入口） */
  dispatch(req: ActionRequest): void;
  /** 非法操作反馈（置灰钮/无法行注等；toast 口径） */
  onBlocked?(msg: string): void;
  /** 左侧木牌按钮（装备/武功——本卡占位反馈） */
  onPlaque?(label: string): void;
  /** 当前托管模式（ctrl 托管钮切换用；宿主从 session 读） */
  mode?(): 'auto' | 'manual';
}

export interface PointerState {
  down: boolean;
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  dragging: boolean;
}

export interface BattleInput {
  readonly pointer: PointerState;
  /** 按下（逻辑坐标） */
  down(view: BattleHexView, snapshot: BattleSnapshot, x: number, y: number, width: number, height: number): void;
  /** 移动（逻辑坐标；拖动超阈值平移镜头） */
  move(view: BattleHexView, x: number, y: number): void;
  /** 抬起（逻辑坐标；拖动结束不触发点选） */
  up(view: BattleHexView, snapshot: BattleSnapshot, x: number, y: number, width: number, height: number): void;
}

const sameCell = (a: HexPos, b: HexPos): boolean => a.q === b.q && a.r === b.r;

/** 命中弧形技能钮（纯函数，导出供用例）：返回命中的 skillId 或 null */
export function pickSkillButton(
  view: BattleHexView,
  x: number,
  y: number,
): { id: string; disabled: boolean } | null {
  for (const b of view.layout.skillBtns) {
    const rr = b.r * 1.3; // 命中容差（圆钮略放大热区）
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= rr * rr) return { id: b.id, disabled: b.disabled };
  }
  return null;
}

/**
 * 命中 ctrl 钮标定矩形（T20-FE D-13 / HIT-1 纯函数，导出供用例）：返回 action 或 null。
 * 热区=每钮标定矩形（art 坐标）+容差（短边×HIT_TOL.ctrl，Leo/PM 裁决 ctrl=0）——外接矩形/行带口径
 * 废弃；图形外（钮间带间隙 art y 130..163/289..319、左右边缘 x<5/>218）返回 null → fall-through
 * 棋盘格（HIT-1：图形内优先、图形外不吞格）。多钮矩形若因容差重叠，沿 CTRL_BUTTONS 数组序首个命中。
 */
export function pickCtrlButton(view: BattleHexView, x: number, y: number): 'mode' | 'speed' | 'flee' | null {
  const rect = view.layout.ctrlRect;
  if (!rect) return null;
  const ax = ((x - rect.x) / rect.w) * CTRL_ART.w;
  const ay = ((y - rect.y) / rect.h) * CTRL_ART.h;
  for (const b of CTRL_BUTTONS) {
    const tol = Math.min(b.w, b.h) * HIT_TOL.ctrl;
    if (ax >= b.x - tol && ax <= b.x + b.w + tol && ay >= b.y - tol && ay <= b.y + b.h + tol) return b.action;
  }
  return null;
}

/**
 * 命中 plaque 木牌标定矩形（T20-FE D-13 / HIT-1 纯函数，导出供用例）：返回 label 或 null。
 * 热区=两牌可点主体标定矩形（xRatio/wRatio）+容差——装饰件（横杆/挂绳/流苏）不设热区，
 * 左右透明边 fall-through 棋盘格（HIT-1）。
 */
export function pickPlaqueButton(view: BattleHexView, x: number, y: number): string | null {
  const rect = view.layout.plaqueRect;
  if (!rect) return null;
  const ax = ((x - rect.x) / rect.w) * PLAQUE_ART.w;
  const ay = ((y - rect.y) / rect.h) * PLAQUE_ART.h;
  for (const b of PLAQUE_BUTTONS) {
    const bx = b.xRatio * PLAQUE_ART.w;
    const bw = b.wRatio * PLAQUE_ART.w;
    const by = b.yRatio * PLAQUE_ART.h;
    const bh = b.hRatio * PLAQUE_ART.h;
    const tol = Math.min(bw, bh) * HIT_TOL.plaque;
    if (ax >= bx - tol && ax <= bx + bw + tol && ay >= by - tol && ay <= by + bh + tol) return b.label;
  }
  return null;
}

export function createBattleInput(hooks: BattleInputHooks): BattleInput {
  const pointer: PointerState = { down: false, sx: 0, sy: 0, lx: 0, ly: 0, dragging: false };

  function down(_view: BattleHexView, _snapshot: BattleSnapshot, x: number, y: number): void {
    pointer.down = true;
    pointer.sx = pointer.lx = x;
    pointer.sy = pointer.ly = y;
    pointer.dragging = false;
  }

  function move(view: BattleHexView, x: number, y: number): void {
    if (!pointer.down) return;
    const dxTotal = x - pointer.sx;
    const dyTotal = y - pointer.sy;
    if (!pointer.dragging && Math.hypot(dxTotal, dyTotal) > CAMERA.dragThresholdPx) pointer.dragging = true;
    if (pointer.dragging) {
      // 拖镜头：画面跟手（手指右拖=内容右移 → 相机反向平移，L 环反馈⑤方向修正）；clamp 在 computeCamera 统一处理
      view.camDrag.x -= x - pointer.lx;
      view.camDrag.y -= y - pointer.ly;
    }
    pointer.lx = x;
    pointer.ly = y;
  }

  function up(view: BattleHexView, snapshot: BattleSnapshot, x: number, y: number, width: number, height: number): void {
    const wasDragging = pointer.dragging;
    pointer.down = false;
    pointer.dragging = false;
    if (wasDragging) return; // 拖动结束不触发点选（旧 T06 口径）

    // ① 主角弧形特绝轻毒钮（UI > 格子；弹出中才可命中）
    if (view.skillPop > 0.5) {
      const hitBtn = pickSkillButton(view, x, y);
      if (hitBtn) {
        if (hitBtn.disabled) {
          hooks.onBlocked?.('内力不足或冷却中');
          return;
        }
        if (snapshot.selectedSkill === hitBtn.id) hooks.dispatch({ type: 'cancelSkill' });
        else hooks.dispatch({ type: 'selectSkill', skillId: hitBtn.id });
        return;
      }
    }
    // ② 右下 ctrl 三钮（托管/加速/逃跑）——D-13/HIT-1：逐钮标定矩形+容差，图形外 fall-through 棋盘
    const ctrlAction = pickCtrlButton(view, x, y);
    if (ctrlAction) {
      if (ctrlAction === 'mode') hooks.dispatch({ type: 'setMode', mode: hooks.mode?.() === 'auto' ? 'manual' : 'auto' });
      else if (ctrlAction === 'speed') hooks.dispatch({ type: 'toggleSpeed' });
      else hooks.dispatch({ type: 'flee' });
      return;
    }
    // ③ 左侧木牌（装备/武功——占位反馈）——D-13/HIT-1：两牌标定矩形+容差，装饰件不设热区
    const plaque = pickPlaqueButton(view, x, y);
    if (plaque) {
      hooks.onPlaque?.(plaque);
      return;
    }
    // ④ 棋盘格点选（仅主角行动回合等待输入时）
    if (snapshot.phase !== 'fighting' || !snapshot.pendingInput) return;
    const cam = view.camera;
    const cell = worldToHex(x - width / 2 + cam.x, y - height / 2 + cam.y);
    if (!axialToOffset(cell)) {
      if (snapshot.selectedSkill) hooks.dispatch({ type: 'cancelSkill' }); // 点棋盘外=取消施放
      return;
    }
    // 敌棋子命中按逻辑 hex（快照 pos，结算真值）——与 renderPos 动画位解耦（L 环终验根因 A：
    // 敌移动动画中 renderPos≠pos，按动画位匹配点击落空→误走 cancelSkill）
    const target = snapshot.actors.find(
      (a) => a.side === 'enemy' && a.animState !== 'dead' && a.pos.q === cell.q && a.pos.r === cell.r,
    );
    const inMove = snapshot.moveCells.some((c) => sameCell(c, cell));
    const inAttack = snapshot.attackCells.some((c) => sameCell(c, cell));
    const skill = snapshot.selectedSkill;
    if (target) {
      if (skill === 'qing') return; // 【ATK-4 / T18-D4 · 主架构授权例外】轻功态点敌=无操作（不派发任何请求）
      if (skill) {
        // 【T20-FE · 方案 B / ATK-2 v2.0】特/绝选中点敌逻辑格统一派 cast（格上有敌=对敌结算，session 侧
        // 与 attack 同源四查）。单一决策点收敛：弃「敌格 attack(按逻辑位)/空格 cast(按 legalCells)」双轨——
        // 敌移动中两口径可分叉（方案 §3.3）。tests/battle-hex-render.test.ts :330 断言随卡改写
        //（方案 :339 锚实指 :330，行号为写作时快照）。
        hooks.dispatch({ type: 'cast', to: cell, skillId: skill });
        return;
      }
      // 点敌人：未激活=普攻（ATK-1，零改动）
      hooks.dispatch({ type: 'attack', targetId: target.id, skillId: null });
      return;
    }
    if (skill === 'qing' && inMove) {
      // 轻功：点可移动格=跳跃位移
      view.selectedCell = cell;
      hooks.dispatch({ type: 'move', to: cell });
      return;
    }
    if (!skill && inMove) {
      // 点可移动格=移动
      view.selectedCell = cell;
      hooks.dispatch({ type: 'move', to: cell });
      return;
    }
    // 【T19/N2 机制② · 方案 §4】普攻态（无技能选中）点中移动中敌的「演出位」（可见位≠逻辑格）
    // 且该格非合法移动格 → 不派发任何请求（零 dispatch）、onBlocked 可观测反馈。
    // 分支序：pos 命中/轻功金格/无选中绿格之后、cancelSkill 之前——
    // 逻辑格可点（D-06 绿锁）与移动意图优先（绿/金格）不受影响；skill 态（特/绝/轻/毒）零改动。
    // 「移动中」= 双通道：session 位移窗（renderPos≠pos，300ms）∪ FE 演出窗（view.moveAnims.has，
    // 长演出尾段）；可视位量化与绘制/点击同链 worldToHex(hexToWorld(renderPos))，禁自造取整。
    if (!skill) {
      const movingFoe = snapshot.actors.find((a) => {
        if (a.side !== 'enemy' || a.animState === 'dead') return false; // 排除 dead 与我方单位
        const moving = a.renderPos.q !== a.pos.q || a.renderPos.r !== a.pos.r || view.moveAnims.has(a.id);
        if (!moving) return false;
        const w = hexToWorld(a.renderPos.q, a.renderPos.r);
        const vis = worldToHex(w.x, w.y);
        return vis.q === cell.q && vis.r === cell.r;
      });
      if (movingFoe) {
        hooks.onBlocked?.('目标移动中');
        return;
      }
    }
    // 【T20-FE · 方案 B / ATK-2 v2.0】攻击技选中（skill && skill!=='qing'，§七-12）点非敌格分流
    //（N2-① 修复本体）：原「skill && !inAttack → cancelSkill」只覆盖射程外，红格空格（inAttack=true）
    // 落此零派发=空红格零反馈缺陷。现 castable = 射程内格 ∪ 自己格（Q2 特判并联、不入 legalCells/高亮）
    // → cast 空放受理（ATK-6/ATK-7）；否则 cancelSkill（SEL-5②）。
    // qing 态零改动（§七-13）：不进 castable 分流，保持既有 cancelSkill 取消路径（T16 已验收行为）。
    if (skill) {
      if (skill === 'qing') {
        hooks.dispatch({ type: 'cancelSkill' });
      } else {
        const me = snapshot.actors.find((a) => a.side === 'player'); // MVP 单人假设：唯一我方单位（快照真值）
        const castable = inAttack || (me !== undefined && sameCell(cell, me.pos));
        hooks.dispatch(castable ? { type: 'cast', to: cell, skillId: skill } : { type: 'cancelSkill' });
      }
    }
  }

  return { pointer, down, move, up };
}
