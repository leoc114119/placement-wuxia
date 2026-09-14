// ═══ T31-FE-B · 宿主运行状态（R5 = 主架构 seq=419 第二条 blocker）═══
//
// 病灶：`main.ts` 的 webglcontextrestored 回调只 `showCharacter3DGate`，主循环仍无条件 session.tick 并
//   续排 RAF，重试又 `bootstrap()` 起第二条 RAF 链——即「人物不画了但战斗照跑」的隐形战斗 + 双循环。
//
// 本模块把宿主的**运行状态机 + 唯一 RAF 排程 + 资源释放链**收成一处（DOM 无关、依赖注入，可失败注入断言）：
//   · 唯一循环：`schedule()` 只在 `status==='running'` 且当前无待排 RAF 时排一次 ⇒ 任何重复 start/retry
//     都不可能产生第二条循环（`pendingFrames` 恒 0/1，>1 即缺陷信号）。
//   · 暂停：重建终失败 → `pause()` 取消待排 RAF 且 `step` 不再被调（tick/输入推进同时由主模块按
//     status 门控）；短暂 context-lost 不走本路径（方案 §6.2 允许 renderer 自持 context-lost 继续）。
//   · 时钟：`start/resume` 均把 last 置空 ⇒ 恢复后首帧 dt=0，不补算暂停期间的停留时间。
//   · 释放：`dispose()` 取消 RAF 并**逆序**执行注册的 disposer（旧 renderer.dispose / 摘 canvas 监听），
//     重试前必调 ⇒ 旧运行时与监听不跨重试常驻。

export type HostRuntimeStatus = 'idle' | 'running' | 'paused' | 'disposed';

export interface HostRuntimeOptions {
  /** 每帧回调（**仅** running 时调用）。dtSec = 距上一帧秒（首帧/恢复首帧恒 0），已钳到 ≤0.05s。 */
  step(dtSec: number): void;
  /** 排一帧（生产 = requestAnimationFrame）；返回句柄供 cancelRaf 取消。 */
  raf(cb: (tMs: number) => void): number;
  cancelRaf(id: number): void;
}

export interface HostRuntime {
  readonly status: HostRuntimeStatus;
  /** 待排 RAF 数（恒 0/1；>1 = 出现第二循环的缺陷信号，用例断言面） */
  readonly pendingFrames: number;
  /** 已执行帧数（证据/断言用；暂停后不再增长） */
  readonly frames: number;
  /** 启动唯一循环；已 running = 幂等（不重复排 RAF）。 */
  start(): void;
  /** 暂停：取消待排 RAF + 停 tick（终失败/需要冻结对局时调）。 */
  pause(reason?: string): void;
  /** 恢复：重置时钟（首帧 dt=0，不补算停留时间）+ 保证唯一循环。 */
  resume(): void;
  /** 上下文恢复通告（方案 §6.2）：ok=false=重建终失败 ⇒ 立即 pause 停 tick/输入推进并上报；
   * ok=true=短暂 lost 已恢复 ⇒ 无副作用（不打断正在跑的循环）。 */
  notifyContextRestored(ok: boolean, onFinalFailure?: () => void): void;
  /** 注册释放动作（逆序执行；重试/替换旧运行时前必注册旧 renderer 与监听）。 */
  addDisposer(fn: () => void): void;
  /** 释放：取消 RAF + 逆序执行 disposer；此后一切方法为 no-op（旧运行时不可复活）。 */
  dispose(): void;
  /** 暂停原因（诊断/证据；未暂停=null） */
  readonly pauseReason: string | null;
}

/** 单帧最大补算量（与既有主循环口径一致：切后台回来的长帧不推进超过 50ms 逻辑时间）。 */
const MAX_FRAME_SEC = 0.05;

export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  let status: HostRuntimeStatus = 'idle';
  let rafId: number | null = null;
  let lastMs: number | null = null;
  let frames = 0;
  let pauseReason: string | null = null;
  const disposers: Array<() => void> = [];

  function schedule(): void {
    if (status !== 'running' || rafId !== null) return; // 唯一 RAF（重复调用幂等）
    rafId = options.raf(onFrame);
  }

  function onFrame(tMs: number): void {
    rafId = null;
    if (status !== 'running') return; // 暂停/释放后迟到的回调直接丢弃，且不续排
    const dtSec = lastMs === null ? 0 : Math.min(MAX_FRAME_SEC, Math.max(0, (tMs - lastMs) / 1000));
    lastMs = tMs;
    frames++;
    options.step(dtSec);
    schedule(); // 续排（暂停后的帧不会再走到这里）
  }

  function start(): void {
    if (status === 'disposed' || status === 'running') return;
    status = 'running';
    pauseReason = null;
    lastMs = null; // 起播/恢复：首帧 dt=0
    schedule();
  }

  function pause(reason: string): void {
    if (status === 'disposed' || status === 'paused') return;
    status = 'paused';
    pauseReason = reason;
    if (rafId !== null) {
      options.cancelRaf(rafId);
      rafId = null;
    }
    lastMs = null; // 冻结时钟：恢复首帧不补算停留时间
  }

  return {
    get status() {
      return status;
    },
    get pendingFrames() {
      return rafId === null ? 0 : 1;
    },
    get frames() {
      return frames;
    },
    get pauseReason() {
      return pauseReason;
    },
    start,
    pause: (reason = 'paused'): void => pause(reason),
    resume(): void {
      if (status === 'disposed') return;
      lastMs = null; // 恢复（无论此前 paused 还是 running）：重置时钟，禁补算停留时间
      if (status === 'running') return;
      start();
    },
    notifyContextRestored(ok: boolean, onFinalFailure?: () => void): void {
      if (ok) return; // 短暂 lost 已恢复：沿方案继续（不打断循环）
      // 重建终失败：先停 tick/输入推进，再上报（上报抛错也不回到「隐形战斗」）
      pause('context-restore-failed');
      onFinalFailure?.();
    },
    addDisposer(fn: () => void): void {
      if (status === 'disposed') return;
      disposers.push(fn);
    },
    dispose(): void {
      if (status === 'disposed') return;
      status = 'disposed';
      if (rafId !== null) {
        options.cancelRaf(rafId);
        rafId = null;
      }
      lastMs = null;
      // 逆序释放（后注册的先释放：监听摘除先于 renderer.dispose 无强序，但逆序=栈语义更可预测）
      while (disposers.length > 0) {
        const fn = disposers.pop();
        try {
          fn?.();
        } catch {
          // 释放失败不阻断后续释放（重试路径不能因单条释放异常卡死）
        }
      }
    },
  };
}
