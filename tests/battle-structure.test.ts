// T18 · 结构收敛断言（DoD 硬项 3：规格 §八 五大病灶各 ≥1 条）
// 「源码形状测试」：fs 读取 battle-session.ts 源码，断言多点公式已收敛到规格指定唯一产生点——
// 防止未来补丁回潮（§八机制总结：补丁只在症状点加守卫，决策点数量不减则漂移恒高）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// 相对路径基于 vitest 运行时 cwd（= 项目根，npm scripts 统一从根执行）
const SRC = readFileSync('systems/battle-session.ts', 'utf8');

/** 提取函数体源码（从 `function <name>` 起到下一个顶层 `  }` 闭 braces——粗粒度切片，仅形状断言用） */
function fnBody(name: string): string {
  const start = SRC.indexOf(`function ${name}`);
  expect(start, `function ${name} 应存在`).toBeGreaterThanOrEqual(0);
  const braceStart = SRC.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') {
      depth--;
      if (depth === 0) return SRC.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} 未闭合`);
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('结构收敛断言（规格 §八 五大病灶）', () => {
  it('【病灶①】bar 职责拆分：消耗=commitTurn 显式清零（BAR-3/D3）；选中清除不读 bar', () => {
    const commit = fnBody('commitTurn');
    expect(commit).toContain('c.bar = 0'); // D3 显式清零（非 clamp+减法隐式）
    expect(commit).not.toContain('bar -='); // 不再依赖减法隐式配合
    // 选中生命周期不读 bar（门控归 selection 状态机，不再 bar<BAR.max 推导）
    const clear = fnBody('clearSelection');
    expect(clear).not.toContain('bar');
    expect(clear).toContain('selection = null');
  });

  it('【病灶②】isJump 单点：赋值仅 doMove 一处（AI/玩家路径同一来源）', () => {
    // 赋值点（排除 interface 声明与注释）：全文件 `isJump = ` 恰 1 处 = doMove 意图派生
    const assignments = SRC.split('\n').filter((l) => /isJump\s*=\s*/.test(l) && !l.includes('//') && !l.includes('isJump:'));
    expect(assignments.length).toBe(1);
    expect(fnBody('doMove')).toContain('isJump'); // 且位于 doMove 内
  });

  it('【病灶③】moveCells 同源：legalMoveCells 唯一产生点，snapshot 与 submit 校验同一来源链', () => {
    expect(SRC).toContain('function legalMoveCells');
    // 显示：snapshot 消费 legalMoveCells()（无选中=walkCells / qing=selection.legalCells）
    const snapBody = fnBody('snapshot');
    expect(snapBody).toContain('legalMoveCells()');
    // 校验：submit 轻功态消费 selection.legalCells（= activate 快取的同一集合，与快照零分叉）；
    // 无选中态消费 walkCells（= legalMoveCells 的 walk 分支同函数）
    const submitBody = fnBody('submit');
    expect(submitBody).toContain('selection.legalCells');
    expect(submitBody).toContain('walkCells(player)');
    // 同源链闭合：legalMoveCells 的 qing 分支返回 selection.legalCells
    const legalBody = fnBody('legalMoveCells');
    expect(legalBody).toContain('selection.legalCells');
  });

  it('【病灶④】selectedSkill 写点收敛：selection 赋值仅 activate/clearSelection 两函数内', () => {
    // `selection =` 赋值行（排除声明/读取）
    const lines = SRC.split('\n').filter((l) => /(^|\s)selection\s*=\s*/.test(l) && !l.includes('let selection'));
    expect(lines.length).toBeLessThanOrEqual(4); // activate(attack/qing/toggle-null 三分支)+clearSelection(null)——写点动作收敛两函数
    // 每个赋值行都必须落在 activate 或 clearSelection 函数体内
    const activateBody = fnBody('activate');
    const clearBody = fnBody('clearSelection');
    for (const line of lines) {
      expect(activateBody.includes(line.trim()) || clearBody.includes(line.trim())).toBe(true);
    }
    // 裸字符串不再散落：selectedSkill 读取仅经 selection 对象
    expect(SRC).not.toContain('selectedSkill ='); // 旧裸串写点归零
  });

  it('【病灶⑤】pos 派生视图：无双写坐标、无 swap-hack、core 兼容=单例常量', () => {
    expect(count(SRC, 'pos: POS_NEUTRAL')).toBe(1); // mk 唯一挂载点（单例共享引用）
    const posLiterals = SRC.split('\n').filter((l) => l.includes('pos: { x:') && !l.includes('readonly pos'));
    expect(posLiterals.length).toBe(0); // 无独立坐标字面量（interface 注解除外，消灭手工双写）
    expect(SRC).not.toContain('savedA'); // Q1 swap-hack 残留归零
    const codeLines = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.includes('║'));
    expect(codeLines.some((l) => l.includes('coreView'))).toBe(false); // Proxy 视图残留归零（单例常量方案；注释中的对照表文字除外）
  });
});
