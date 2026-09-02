// 战斗输入翻译层（T16 frontend）：指针事件 → ActionRequest（会话侧校验合法性，非法静默拒绝）。
// 红线：禁止 import battle-core（DoD 自动化扫描）；本层不算数值——只做命中判定与请求翻译。
// 镜头拖动 >8px 判定沿用旧 T06 已验口径（config CAMERA.dragThresholdPx）。
import type { ActionRequest, BattleSnapshot, HexPos } from '../types';
import { CAMERA, CTRL_BUTTONS, PLAQUE_BUTTONS } from '../config/battle-hex';
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
    // ② 右下 ctrl 三钮（托管/加速/逃跑）
    const ctrl = view.layout.ctrlRect;
    if (ctrl && x >= ctrl.x && x <= ctrl.x + ctrl.w && y >= ctrl.y && y <= ctrl.y + ctrl.h) {
      const artH = 448; // ctrl_r_alpha.png 像素高（config CTRL_BUTTONS 标定坐标系）
      const ay = ((y - ctrl.y) / ctrl.h) * artH;
      const row = CTRL_BUTTONS.find((b) => ay >= b.y && ay <= b.y + b.h);
      if (row) {
        if (row.action === 'mode') hooks.dispatch({ type: 'setMode', mode: hooks.mode?.() === 'auto' ? 'manual' : 'auto' });
        else if (row.action === 'speed') hooks.dispatch({ type: 'toggleSpeed' });
        else hooks.dispatch({ type: 'flee' });
        return;
      }
    }
    // ③ 左侧木牌（装备/武功——占位反馈）
    const plq = view.layout.plaqueRect;
    if (plq && x >= plq.x && x <= plq.x + plq.w && y >= plq.y && y <= plq.y + plq.h) {
      const relY = (y - plq.y) / plq.h;
      const btn = PLAQUE_BUTTONS.find((b) => relY >= b.yRatio && relY <= b.yRatio + b.hRatio);
      if (btn) {
        hooks.onPlaque?.(btn.label);
        return;
      }
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
      // 点敌人：未激活=普攻；激活特/绝/毒=施放（轻功不是攻击技）
      const skillId = skill && skill !== 'qing' ? skill : null;
      hooks.dispatch({ type: 'attack', targetId: target.id, skillId });
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
    if (skill && !inAttack) {
      // 激活技能后点无效格=取消施放
      hooks.dispatch({ type: 'cancelSkill' });
    }
  }

  return { pointer, down, move, up };
}
