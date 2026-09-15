// T31-FE-A · 红线扫描用例（方案 §9.1 红线条 + 任务卡硬边界）
//
// 全部为**源码扫描**（零运行时依赖），锁住结构约束，防止后续卡片把它们悄悄放开：
//   · ui/character3d/** 禁 import battle-core / battle-session / 结算配置（UI 只展示）；
//   · 生产模块禁 import proto/**（probe 是证据工程，不得成为生产依赖）；
//   · 无 third-party runtime（three / Cocos / 任何 node_modules 运行时依赖）；
//   · 资源 URL 只在 config（业务模块只持相对 urlPath，禁拼完整 URL）；
//   · 平台差异止于 adapter（renderer / loader 内不得出现 wx.* / fetch / DOM）。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const PRODUCTION_FILES = [
  'ui/character3d/math.ts',
  'ui/character3d/glb.ts',
  'ui/character3d/animation.ts',
  'ui/character3d/renderer.ts',
  'ui/character3d/pass.ts',
  'ui/character3d/platform.ts',
  'ui/character3d/platform-browser.ts',
  'ui/character3d/platform-wx.ts',
  'ui/character3d/weapon.ts', // 【T32】武器挂载（方案 v1.0 §8 文件清单）
  'net/character-asset-loader.ts',
  'config/character-3d.ts',
];

/** 平台差异**允许**出现 wx/DOM/fetch 的两个 adapter（方案 §3 末段：差异必须止于 adapter）。 */
const ADAPTER_FILES = ['ui/character3d/platform-browser.ts', 'ui/character3d/platform-wx.ts'];

/** 去掉注释：扫描「是否出现某 API/字面量」时只看真代码，注释里的说明文字不算命中。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 生产源码（已去注释）。 */
function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

/** 只读取 import/require 语句行（避免把注释里的示例误判成依赖）。 */
function importLines(source: string): string[] {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('import ') || l.startsWith('import{') || /\brequire\(/.test(l));
}

describe('文件面', () => {
  it('本卡声明的生产模块全部存在（白名单即契约）', () => {
    for (const f of PRODUCTION_FILES) {
      expect(existsSync(f), f).toBe(true);
    }
  });

  it('types.ts 的 3D 契约区块齐全（§3 冻结接口不被改名/拆散）', () => {
    const types = readFileSync('types.ts', 'utf8');
    for (const name of [
      'Character3DClipKey',
      'Character3DAssetRef',
      'CharacterAttachmentProfile',
      'Character3DProfile',
      'CharacterRenderCommand',
      'Character3DPassResult',
    ]) {
      const declared = types.includes(`export type ${name}`) || types.includes(`export interface ${name}`);
      expect(declared, name).toBe(true);
    }
    expect(types).toContain('T31-FE-A · 2.5D 角色运行时契约');
  });

  it('ui/character3d 目录内容就是声明的那些文件（没有未申报的模块）', () => {
    const files = readdirSync('ui/character3d').filter((f) => f.endsWith('.ts')).sort();
    expect(files).toEqual([
      'animation.ts', 'glb.ts', 'math.ts', 'pass.ts',
      'platform-browser.ts', 'platform-wx.ts', 'platform.ts', 'renderer.ts',
      'weapon.ts', // 【T32】3D 武器挂载（方案 v1.0 §8 明确列出的新文件；非未申报模块）
    ]);
  });
});

describe('红线：UI 只展示（方案 §2 / §9.1）', () => {
  it('character3d 与 loader 禁 import battle-core / battle-session / 结算配置 / 云函数', () => {
    const forbidden = ['battle-core', 'battle-session', 'cloudfunctions', 'settle', 'config/numbers'];
    for (const file of PRODUCTION_FILES) {
      const lines = importLines(readFileSync(file, 'utf8'));
      for (const bad of forbidden) {
        const hit = lines.filter((l) => l.includes(bad));
        expect(hit, `${file} 不得 import ${bad}: ${hit.join(' | ')}`).toEqual([]);
      }
    }
  });

  it('character3d 只读渲染命令，不引任何结算/系统模块（systems/**）', () => {
    for (const file of PRODUCTION_FILES) {
      const lines = importLines(readFileSync(file, 'utf8'));
      expect(lines.filter((l) => /from '.*systems\//.test(l)), file).toEqual([]);
    }
  });

  it('动作时长/画质常量集中在 config/character-3d.ts（渲染文件不重复定义）', () => {
    const config = readFileSync('config/character-3d.ts', 'utf8');
    expect(config).toContain('CHARACTER_3D_CROSS_FADE_SEC');
    expect(config).toContain('CHARACTER_3D_JUMP_TO_IDLE_BLEND_SEC');
    // animation.ts 不得自带时长字面量：只从注入的装配配置取
    const anim = readFileSync('ui/character3d/animation.ts', 'utf8');
    expect(anim).not.toMatch(/=\s*0\.1\s*;/);
    expect(anim).not.toMatch(/\b0\.18\b/);
    expect(anim).not.toContain('jumpToIdleBlendSec =');
  });
});

describe('红线：无 third-party runtime / 不依赖 proto（任务卡硬边界）', () => {
  it('生产模块禁 import proto/**（probe 是证据工程，不是生产依赖）', () => {
    for (const file of PRODUCTION_FILES) {
      const lines = importLines(readFileSync(file, 'utf8'));
      expect(lines.filter((l) => l.includes('proto/')), file).toEqual([]);
    }
  });

  it('无 three.js / Cocos 等第三方渲染运行时（方案 §0/§12 明令）', () => {
    const banned = ['three', 'cocos', '@cocos', 'babylon', 'gl-matrix', 'pixi'];
    for (const file of PRODUCTION_FILES) {
      const lines = importLines(readFileSync(file, 'utf8'));
      for (const bad of banned) {
        const hit = lines.filter((l) => new RegExp(`from ['"][^'"]*${bad}`).test(l));
        expect(hit, `${file} 不得引 ${bad}`).toEqual([]);
      }
    }
  });

  it('渲染与 loader 不引任何非相对路径的运行时依赖（只允许 node 内置做类型声明）', () => {
    for (const file of PRODUCTION_FILES) {
      for (const line of importLines(readFileSync(file, 'utf8'))) {
        const m = /from\s+'([^']+)'/.exec(line);
        if (!m) continue;
        const spec = m[1];
        const isRelative = spec.startsWith('./') || spec.startsWith('../');
        expect(isRelative, `${file} 出现非相对 import: ${spec}`).toBe(true);
      }
    }
  });

  it('package.json 未新增运行时依赖（卡内硬边界：不引 three/Cocos、不加 npm script）', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(Object.keys(pkg.scripts).sort()).toEqual(
      ['build', 'lint', 'test:battle', 'test:behavior', 'typecheck', 'watch'].sort(),
    );
  });
});

describe('红线：资源 URL 只在 config（方案 §6.1）', () => {
  it('urlPath / sha256 只在 config/character-3d.ts 出现（业务模块不持资产地址）', () => {
    const shaPattern = /['"][0-9a-f]{64}['"]/;
    const cdnPattern = /https?:\/\//;
    for (const file of PRODUCTION_FILES) {
      if (file === 'config/character-3d.ts') continue;
      const src = code(file);
      expect(shaPattern.test(src), `${file} 不应出现 sha256 字面量`).toBe(false);
      expect(cdnPattern.test(src), `${file} 不应出现完整 URL`).toBe(false);
      expect(/urlPath:\s*['"]/.test(src), `${file} 不应自己构造 urlPath 字面量`).toBe(false);
      expect(/characters\//.test(src), `${file} 不应出现资产目录字面量`).toBe(false);
    }
    const config = readFileSync('config/character-3d.ts', 'utf8');
    expect(config).toContain('characters/hero/');
    expect(config).not.toContain('http://');
  });

  it('cdnBaseUrl 由外部注入：loader 只接受注入值，不内置默认域名', () => {
    const loader = readFileSync('net/character-asset-loader.ts', 'utf8');
    expect(loader).toContain('cdnBaseUrl: string');
    expect(loader).toContain('options.cdnBaseUrl');
    expect(loader).not.toMatch(/cdnBaseUrl\s*=\s*['"]/);
  });
});

describe('红线：平台差异止于 adapter（易错点 11）', () => {
  it('renderer / animation / glb / pass / math 内不出现 wx.* / fetch / DOM API', () => {
    const banned = [/wx\./, /\bfetch\(/, /\bdocument\./, /\bwindow\./, /localStorage/, /requestAnimationFrame/];
    for (const file of PRODUCTION_FILES) {
      if (ADAPTER_FILES.indexOf(file) >= 0) continue;
      const src = code(file);
      for (const re of banned) {
        expect(re.test(src), `${file} 命中平台 API 白名单外调用: ${re}`).toBe(false);
      }
    }
  });

  it('只有两个 adapter 触平台 API（wx.* 只在 platform-wx，fetch/DOM 只在 platform-browser）', () => {
    // 去掉注释后：wx 适配器里应有真实调用，浏览器适配器里应有真实 fetch，其余生产文件都不得有
    expect(/host\.|wx\./.test(code('ui/character3d/platform-wx.ts'))).toBe(true);
    expect(/fetch\(/.test(code('ui/character3d/platform-browser.ts'))).toBe(true);
    for (const file of PRODUCTION_FILES) {
      if (file === 'ui/character3d/platform-wx.ts') continue;
      expect(/wx\./.test(code(file)), `${file} 不应直呼 wx.*`).toBe(false);
    }
    const loader = code('net/character-asset-loader.ts');
    expect(/fetch\(/.test(loader)).toBe(false);
  });

  it('wx 全局只在本卡声明的 adapter 里做断言（不改 env.d.ts 的共享声明）', () => {
    const env = readFileSync('env.d.ts', 'utf8');
    // env.d.ts 不得被本卡扩写出 3D 专属内容（保持共享声明区干净）
    expect(env).not.toContain('character3d');
    expect(env).not.toContain('downloadFile');
    const wxAdapter = readFileSync('ui/character3d/platform-wx.ts', 'utf8');
    expect(wxAdapter).toContain('WxRuntime');
  });
});

describe('红线：渲染管线口径不被顺手优化（方案 §7）', () => {
  it('palette 上传只有一次/单位：renderer 里 uniformMatrix4fv(bones) 只出现一处', () => {
    const src = readFileSync('ui/character3d/renderer.ts', 'utf8');
    const hits = src.match(/uniformMatrix4fv\(s\.u\.bones/g) ?? [];
    expect(hits).toHaveLength(1);
    // 禁 UBO / 骨骼纹理 / 实例化
    expect(/createBuffer|bufferData/.test(src)).toBe(true);
    for (const banned of ['uniformBlockBinding', 'TEXTURE_2D_ARRAY', 'drawElementsInstanced', 'vertexAttribDivisor']) {
      expect(src.includes(banned), `不得出现 ${banned}`).toBe(false);
    }
  });

  it('抗锯齿必须读有效上下文属性（禁把请求值当启用值，易错点 7）', () => {
    const src = readFileSync('ui/character3d/renderer.ts', 'utf8');
    expect(src).toContain('getContextAttributes()');
    expect(src).toContain('contextAttributes.antialias === true');
  });

  it('depthKey 只透传不排序（排序属 2D 层，方案 §4.3）', () => {
    const src = readFileSync('ui/character3d/pass.ts', 'utf8');
    expect(src).not.toContain('.sort(');
  });
});

describe('红线：arch 打回整改项的回归锁（seq=414）', () => {
  it('B1 · 契约里有 isJump，且动画层不再用 hopPx 猜轻功', () => {
    const types = readFileSync('types.ts', 'utf8'); // 含注释：契约的**说明文字**也是要锁的面
    expect(types).toContain('isJump: boolean;');
    expect(types).toContain('禁用 hopPx/坐标/时钟猜轻功');
    const anim = code('ui/character3d/animation.ts');
    // 判据只认 isJump；hopPx 不得再出现在状态机里（连注释外的代码都不许有）
    expect(anim).toContain('input.isJump');
    expect(anim).not.toContain('hopPx');
    expect(anim).not.toContain('jumpLatched');
    expect(code('ui/character3d/pass.ts')).toContain('isJump: cmd.isJump');
  });

  it('B2 · 采样点按 t=0→i0 传权重（k = 1 − a），不得回退为 k = a', () => {
    const anim = code('ui/character3d/animation.ts');
    expect(anim).toContain('nlerp(q4, tr[i0], 0, tr[i1], 0, 1 - a)');
    expect(anim).toContain('nlerp(q, values, o0, values, i1 * ncomp, 1 - a)');
    expect(anim).not.toContain('tr[i1], 0, a)');
    // 金标显式标注 intentional correction
    const golden = JSON.parse(readFileSync('tests/character3d-parity-golden/probe-golden.json', 'utf8')) as {
      meta: { corrections: Record<string, string> };
    };
    expect(golden.meta.corrections['nlerp-time-polarity']).toContain('seq=414');
  });

  it('B3 · loader 登记失败删临时文件；wx 索引落盘失败回滚并抛出', () => {
    const loaderRaw = readFileSync('net/character-asset-loader.ts', 'utf8');
    const loader = code('net/character-asset-loader.ts');
    expect(loaderRaw).toContain('原子性收口'); // 标记在注释里，按原文查
    expect(/cacheWriteFailures\+\+[\s\S]{0,400}removeTemp\(tempPath/.test(loader)).toBe(true);
    const wx = code('ui/character3d/platform-wx.ts');
    expect(wx).toContain('persistIndex(true)');
    expect(/persistIndex\(true\)[\s\S]{0,600}fs\.unlinkSync\(dest\)/.test(wx)).toBe(true);
  });

  it('B4 · FXAA 中间目标必须检查完整性（非 COMPLETE 即失败关闭）', () => {
    const renderer = code('ui/character3d/renderer.ts');
    expect(renderer).toContain('checkFramebufferStatus');
    expect(renderer).toContain('FRAMEBUFFER_COMPLETE');
    expect(renderer).toContain('framebuffer incomplete');
  });

  it('B5 · 方向光随 facing 旋进模型空间，且渲染层不再是「模型空间固定光」', () => {
    const renderer = code('ui/character3d/renderer.ts');
    expect(renderer).toContain('rotateYInto');
    expect(renderer).toContain('uniform3fv(s.u.lightDir, lightDirModel)');
    // beginFrame 不得再上传恒定光向
    const begin = renderer.slice(renderer.indexOf('beginFrame(): void {'), renderer.indexOf('drawUnit(palette'));
    expect(begin).not.toContain('uniform3fv(s.u.lightDir');
    // 旧错误注释必须已被替换
    expect(renderer).not.toContain('uModel 含 y 翻转 + 六向 yaw，法线跟着蒙皮走');
    expect(code('ui/character3d/pass.ts')).toMatch(/drawUnit\(palette, matrix, clampAlpha\(cmd\.alpha\), yawDeg\)/);
  });
});

describe('对拍工装入库（任务卡 §5「对拍脚本与结果入库」）', () => {
  it('金标文件与生成脚本都在仓库内，并记录了 probe 修订号', () => {
    expect(existsSync('tests/character3d-parity-golden/probe-golden.json')).toBe(true);
    expect(existsSync('tests/character3d-probe-parity-generate.mjs')).toBe(true);
    const golden = JSON.parse(readFileSync('tests/character3d-parity-golden/probe-golden.json', 'utf8')) as {
      meta: { probeRev: string; modelSha256: string; probeRef: string };
    };
    expect(golden.meta.probeRev).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.meta.modelSha256).toBe('ff9202b48470c92ccdad0333108e77e193a4135f873ce68e7e3498e979f816f0');
    expect(golden.meta.probeRef).toContain('t31-webgl2-probe');
  });

  it('对拍测试确实在比对（不是空壳用例）', () => {
    const src = readFileSync('tests/character3d-probe-parity.test.ts', 'utf8');
    expect(src).toContain('expectSameFloats');
    expect(src).toContain('paletteDigest');
    expect(src).toContain('vertexInterleave');
  });
});
