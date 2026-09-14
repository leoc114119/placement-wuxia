// T31-FE-C · proto/character3d_runtime_demo/build.mjs —— 宿主构建 + 资产落地 + 静态导入门
//
// 零新依赖：复用项目 devDependency `typescript` 的 transpileModule，把 TS 转成 CommonJS 并注册进
// 微型模块注册表，拼成**单文件经典脚本** bundle.js（file:// / 微信小游戏 / 浏览器 sim 都能直跑）。
// 与 proto/battle_demo/build.mjs 同一路子（那套已验证），差别只有三处：
//   ① 入口 = proto/character3d_runtime_demo/main；
//   ② 额外把**资产副本**从 proto/battle_demo/cdn 落地到本目录的分包目录（微信分包需要真实文件）；
//   ③ 额外跑一遍**静态导入门**（微信开发者工具会做的那几条本地可核项 + 资产 SHA 核对）。
//
// 用法：
//   node proto/character3d_runtime_demo/build.mjs            # 构建 + 落地资产 + 静态自查
//   node proto/character3d_runtime_demo/build.mjs --check    # 只自查（不写任何文件）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
/**
 * ★【T31-FE-C P0-2】TS 发射目标 = **ES2017**（**不是** ES2020）。
 *
 * 为什么：微信预览/运行时的编译链**不接受 ES2020 语法**。实测（Leo 预览，ideVersion 2.02.2608040）：
 *   预览 Error: invalid file: bundle.js, 30:66 → `SyntaxError: Unexpected token ?`
 *   （`const handle = (0, host_1.startRuntimeDemo)(g.__CHAR3D_DEMO_OPTS ?? {});`）
 * 首轮用 ES2020 ⇒ 产物里 `??` 66 处 / `?.` 47 处 → 预览阶段直接语法报错。
 *
 * 选 ES2017 的理由（不是随手挑的）：
 *   · TS 对 target < ES2020 会把 `??`/`?.` **降级**成语义等价的 `!= null / !== void 0` 判断；
 *   · ES2017 保留**原生 async/await**（S0 probe 真机已验证 async/await 可用），不会引入 `__awaiter`/`__generator`
 *     这类额外状态机；也保留原生 `for...of`（不降级成索引循环 ⇒ Map/Set 迭代语义不变）；
 *   · 对象展开（ES2018 语法）由 TS 自动降级成 `__assign` 辅助函数，不留给运行时。
 * 若真机/预览上发现必须更低级别才过，再降一级并在此记录理由（禁静默下调）。
 *
 * ⚠ 该约束由 §7 的**ES2020 语法记号门**（scanLegacySyntax）与 tests/character3d-runtime-demo.test.ts 双锁。
 */
const TRANSPILE_TARGET = ts.ScriptTarget.ES2017;
const DEMO = path.join(ROOT, 'proto/character3d_runtime_demo');
const OUT = path.join(DEMO, 'bundle.js');
const CHECK_ONLY = process.argv.includes('--check');
const CDN_SOURCE_ROOT = path.join(ROOT, 'proto/battle_demo/cdn');
const SUBPACKAGE_ROOT = path.join(DEMO, 'subpackages/char3d-assets');
/** 包内载荷后缀（R2）：urlPath + 本后缀 ⇒ 分包里的原样字节文件。本地适配器按此顺序命中。 */
const PACKAGED_PAYLOAD_SUFFIX = '.bin';

/** 解析相对导入 → 仓库根相对无扩展名 key（与注册 key 同式）。 */
function resolveId(fromKey, spec) {
  if (!spec.startsWith('.')) return null; // 仅相对导入（本项目 host 无裸依赖）
  const dir = fromKey.split('/').slice(0, -1);
  const stack = [...dir];
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  const joined = stack.join('/');
  if (fs.existsSync(path.join(ROOT, joined + '.ts'))) return joined;
  if (fs.existsSync(path.join(ROOT, joined, 'index.ts'))) return joined + '/index';
  throw new Error(`[build] 无法解析导入：${spec}（来自 ${fromKey}）`);
}

function collect(entryKey) {
  const seen = new Map();
  const order = [];
  const visit = (key) => {
    if (seen.has(key)) return;
    const src = fs.readFileSync(path.join(ROOT, key + '.ts'), 'utf8');
    const out = ts.transpileModule(src, {
      compilerOptions: {
        target: TRANSPILE_TARGET, // ES2017：见文件头 P0-2 注释（微信预览不接受 ES2020 语法）
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        // 产物不带源码注释：① 体积；② 源码扫描口径统一（扫字面量只看真代码）
        removeComments: true,
      },
      fileName: key,
    });
    seen.set(key, out.outputText);
    order.push(key);
    const importRe = /(?:require\(|from\s*|import\()["'](\.[^"']+)["']/g;
    let m;
    while ((m = importRe.exec(src))) {
      const dep = resolveId(key, m[1]);
      if (dep) visit(dep);
    }
  };
  visit(entryKey);
  return { seen, order };
}

function gitHead() {
  try {
    return require('node:child_process').execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch { return 'unknown'; }
}

function buildBundle() {
  const { seen, order } = collect('proto/character3d_runtime_demo/main');
  const parts = [];
  parts.push('/* character3d_runtime_demo bundle —— 由 proto/character3d_runtime_demo/build.mjs 生成，勿手改 */');
  // ★【R2】把构建标识**编进产物**：真机结果里 `env.build` 即可回答「这份产物出自哪个 commit」
  //   （此前靠 devtools storage 手设 `char3d-commit-sha`，run10 为空 ⇒ 版本映射断链）
  parts.push('var __CHAR3D_BUILD__ = ' + JSON.stringify({
    commitSha: gitHead(),
    builtAt: new Date().toISOString(),
    payloadSuffix: PACKAGED_PAYLOAD_SUFFIX,
  }) + ';');
  parts.push('if (typeof globalThis !== "undefined") { globalThis.__CHAR3D_BUILD__ = __CHAR3D_BUILD__; }');
  parts.push('(function () {');
  parts.push('  var __mods = Object.create(null);');
  parts.push('  function __def(id, fn) { __mods[id] = { fn: fn, exp: null }; }');
  parts.push('  function __resolve(from, spec) {');
  parts.push('    var dir = from.split("/").slice(0, -1);');
  parts.push('    var parts = spec.split("/");');
  parts.push('    var stack = dir.slice();');
  parts.push('    for (var i = 0; i < parts.length; i++) {');
  parts.push('      var p = parts[i];');
  parts.push('      if (p === "." || p === "") continue;');
  parts.push('      if (p === "..") stack.pop();');
  parts.push('      else stack.push(p);');
  parts.push('    }');
  parts.push('    return stack.join("/");');
  parts.push('  }');
  parts.push('  function __req(from, spec) {');
  parts.push('    var id = __resolve(from, spec);');
  parts.push('    var m = __mods[id];');
  parts.push('    if (!m) throw new Error("module not found: " + spec + " (from " + from + ")");');
  parts.push('    if (m.exp === null) { m.exp = { exports: {} }; m.fn(function (s) { return __req(id, s); }, m.exp, m.exp.exports); }');
  parts.push('    return m.exp.exports;');
  parts.push('  }');
  // ★【T31-FE-C P0 修复】模块体**直接内联为函数字面量**（webpack / rollup 的常规形态）。
  //   禁 `new Function(源码字符串)`：微信小游戏运行时**禁用动态代码求值**——实测真机（macOS/mg，lib 3.17.2）
  //   下每处注册拿不到函数，入口第一次 __req 即抛 `TypeError: m.fn is not a function`（栈里只有入口帧）。
  //   旧写法是「源码字符串 + new Function」，Node/浏览器能跑（它们允许动态求值），真机一加载即崩。
  //   ⚠ 这条约束由本文件末尾的**防回退门**（scanDynamicEval）与 tests/character3d-runtime-demo.test.ts 双锁。
  for (const key of order) {
    const body = seen.get(key);
    // 安全自检：模块体若自身带动态求值，注册成函数字面量也救不了（同族限制，构建期就报出来）
    const inner = scanDynamicEval(body);
    if (inner.length > 0) {
      throw new Error(`[build] 模块 ${key} 内含动态代码求值（${inner.join(' / ')}）——微信运行时禁用，禁止入包`);
    }
    parts.push(`  // ---- ${key} ----`);
    // 函数字面量：模块体作为**函数体**（TS 编译出的 CommonJS 可直接作函数体），不做任何字符串求值
    parts.push(`  __def(${JSON.stringify(key)}, function (require, module, exports) {`);
    parts.push(body);
    parts.push('  });');
  }
  parts.push('  __req("proto/character3d_runtime_demo/main", "./main"); // 入口');
  parts.push('})();');
  const text = parts.join('\n');
  if (!CHECK_ONLY) fs.writeFileSync(OUT, text, 'utf8');
  return { modules: order, bytes: text.length };
}

// ===== 资产账真源：直接用 typescript 把 config/character-3d.ts 跑起来取 ref（不复制 sha/长度）=====

/**
 * 构建期在 **Node** 里执行一个 TS 配置模块（只为读出资产清单真值：sha256 / byteLength / urlPath）。
 * ★ 这里的 `new Function` 只发生在**构建机 Node**上，**不进任何产物**（产物扫描门只针对 bundle.js/game.js）；
 *   小程序运行时看不到它。若把这段搬进产物即触发 §7 的动态求值禁令。
 */
function loadTsModule(key, cache = new Map()) {
  if (cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(path.join(ROOT, key + '.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { target: TRANSPILE_TARGET, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: key,
  }).outputText;
  const mod = { exports: {} };
  cache.set(key, mod.exports);
  const req = (spec) => {
    if (spec === '../types') return {}; // type-only
    const dep = resolveId(key, spec);
    if (!dep) throw new Error(`[build] 配置模块出现非相对导入：${spec}（${key}）`);
    return loadTsModule(dep, cache);
  };
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports);
  return mod.exports;
}

/**
 * 动态代码求值扫描（微信小游戏运行时**禁用** `new Function` / `eval` 等动态求值）。
 * 返回命中的形态清单（空数组 = 干净）。三态理由：
 *   · `new Function(` —— P0 崩因本体（真机实测 m.fn is not a function）；
 *   · `eval(` —— 同族禁令，构建期就拦；
 *   · 裸 `Function(`（非 new 形态）—— Function 构造器的另一种调用写法。
 * 另附**报告项**（同族但不在本轮硬门内，命中只提示不失败）：字符串型 setTimeout/setInterval、动态 import()。
 */
function scanDynamicEval(text) {
  const hits = [];
  const newFn = text.match(/\bnew\s+Function\s*\(/g) || [];
  if (newFn.length) hits.push('new Function × ' + newFn.length);
  const evalCall = text.match(/(^|[^.\w$])eval\s*\(/g) || [];
  if (evalCall.length) hits.push('eval( × ' + evalCall.length);
  // 去掉 `new Function(` 之后再看裸 `Function(`（避免同一处重复计数）
  const bare = text.replace(/\bnew\s+Function\s*\(/g, '').match(/(^|[^.\w$])Function\s*\(/g) || [];
  if (bare.length) hits.push('Function( × ' + bare.length);
  return hits;
}

/** 同族限制的报告项（不阻断，只提示；扫描口径见 README §7）。 */
function scanDynamicEvalFamily(text) {
  const notes = [];
  const strTimer = text.match(/\b(setTimeout|setInterval)\s*\(\s*["']/g) || [];
  if (strTimer.length) notes.push('字符串型定时器 × ' + strTimer.length);
  const dynImport = text.match(/[^.\w$]import\s*\(/g) || [];
  if (dynImport.length) notes.push('动态 import() × ' + dynImport.length);
  return notes;
}

/**
 * ES2020 语法记号扫描（微信预览/运行时**不接受**）—— T31-FE-C P0-2 崩因本体。
 * 硬门三项：`??`（空值合并，含 `??=`）、`?.`（可选链，含 `?.[` / `?.(`）。
 * 说明：这是**记号级**扫描（不解析 AST）。理论上字符串内容里出现 `??` / `?.` 也会命中；
 *   真遇到请改写该字符串字面量，**不要**放宽本门（门的价值就在于产物里一个都不许有）。
 */
function scanLegacySyntax(text) {
  const hits = [];
  const nullish = text.match(/\?\?/g) || [];
  if (nullish.length) hits.push('?? × ' + nullish.length);
  const optional = text.match(/\?\./g) || [];
  if (optional.length) hits.push('?. × ' + optional.length);
  return hits;
}

/** 其它「运行时接受度」类记号（同族，**只报告不阻断**）：ES2018+ 语法与运行库 API。 */
function scanRuntimeAcceptanceReport(text) {
  const notes = [];
  const checks = [
    ['可选捕获绑定 catch {（ES2019）', /catch\s*\{/g],
    ['逻辑赋值 ||= / &&=（ES2021）', /(\|\||&&)=/g],
    ['数字分隔符 1_000（ES2021）', /\b\d+_\d+/g],
    ['私有字段 #x（ES2022）', /[.\s{]#[a-z_$]/g],
    ['Array.prototype.at（ES2022）', /\.at\s*\(/g],
    ['Object.fromEntries（ES2019）', /Object\.fromEntries/g],
    ['Object.hasOwn（ES2022）', /Object\.hasOwn/g],
    ['String.replaceAll（ES2021）', /\.replaceAll\s*\(/g],
    ['Promise.allSettled/any', /Promise\.(allSettled|any)\b/g],
    ['BigInt 字面量/调用', /\bBigInt\b|\b\d+n\b/g],
    ['structuredClone', /structuredClone/g],
    ['ResizeObserver/IntersectionObserver', /(ResizeObserver|IntersectionObserver)/g],
    ['OffscreenCanvas 直接 new', /new\s+(OffscreenCanvas|ImageBitmap)\b/g],
  ];
  for (const [name, re] of checks) {
    const m = text.match(re);
    if (m && m.length) notes.push(name + ' × ' + m.length);
  }
  return notes;
}

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

// ===== 静态导入门（微信开发者工具会做的本地可核项 + 资产核对）=====

function staticGate() {
  const problems = [];
  const notes = [];
  // 1) 主包入口与配置
  if (!fs.existsSync(path.join(DEMO, 'game.js'))) problems.push('缺 game.js');
  const gameJsonPath = path.join(DEMO, 'game.json');
  if (!fs.existsSync(gameJsonPath)) problems.push('缺 game.json');
  const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
  if (gameJson.deviceOrientation !== 'portrait') problems.push('game.json deviceOrientation 非 portrait');
  const subpackages = gameJson.subpackages || [];
  if (subpackages.length !== 1) problems.push('game.json subpackages 数量异常');
  // 2) 每个分包根必须有 game.js（S0 实测的硬要求）
  for (const sp of subpackages) {
    const entry = path.join(DEMO, sp.root, 'game.js');
    if (!fs.existsSync(entry)) problems.push(`分包 ${sp.name} 缺 root 下的 game.js：${sp.root}/game.js`);
  }
  // 3) project.config.json
  const pc = JSON.parse(fs.readFileSync(path.join(DEMO, 'project.config.json'), 'utf8'));
  if (pc.compileType !== 'game') problems.push('project.config.json compileType 非 game');
  if (!pc.appid) problems.push('project.config.json 缺 appid');

  // 4) 资产副本账（真源 = config/character-3d.ts；此处只做核对，不复制 sha/长度字面量）
  const cfg = loadTsModule('config/character-3d');
  const refs = [cfg.HERO_3D_MODEL_REF, ...['idle', 'atk', 'cast', 'jump'].map((k) => cfg.HERO_3D_CLIP_REFS[k])];
  let copiedBytes = 0;
  for (const ref of refs) {
    const from = path.join(CDN_SOURCE_ROOT, ref.urlPath);
    // ★【T31-FE-C R2】包内载荷一律落 **原样 .bin**：真机实测微信打包/预览管线会改写包内 `.json`
    //   （见 evidence/SUMMARY.md §B.6 的字节指纹），而 `.bin` 形态与 GLB 一样按不透明资产处理。
    //   生产 CDN 清单里的 `.json` urlPath **保持不变**（CDN 不受包管线影响；arch 裁决：正式 CDN 严格 byteLength+SHA）。
    //   本地适配器按 `urlPath + '.bin'` 命中（见 adapter-local 的候选顺序）。
    const to = path.join(SUBPACKAGE_ROOT, ref.urlPath + PACKAGED_PAYLOAD_SUFFIX);
    if (!fs.existsSync(from)) {
      problems.push(`源资产缺失：proto/battle_demo/cdn/${ref.urlPath}`);
      continue;
    }
    if (!CHECK_ONLY) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const needCopy = !fs.existsSync(to) || fs.statSync(to).size !== ref.byteLength;
      if (needCopy) fs.copyFileSync(from, to);
    }
    if (!fs.existsSync(to)) { problems.push(`分包载荷未落地：subpackages/char3d-assets/${ref.urlPath}${PACKAGED_PAYLOAD_SUFFIX}`); continue; }
    const bytes = fs.readFileSync(to);
    copiedBytes += bytes.length;
    if (bytes.length !== ref.byteLength) problems.push(`${ref.id} byteLength ${bytes.length} != 清单 ${ref.byteLength}`);
    const sha = sha256Hex(bytes);
    if (sha !== ref.sha256) problems.push(`${ref.id} SHA-256 不符（分包载荷副本 ${sha.slice(0, 12)}… != 清单 ${ref.sha256.slice(0, 12)}…）`);
  }

  // ★ R2 门：分包里**不得**再有 `.json` 载荷（否则会被微信管线改写、又回到"字节不可比"的老路）
  const strayJson = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.json$/i.test(e.name)) strayJson.push(path.relative(SUBPACKAGE_ROOT, full));
    }
  };
  if (fs.existsSync(SUBPACKAGE_ROOT)) walk(SUBPACKAGE_ROOT);
  if (strayJson.length) problems.push('分包内出现 .json 载荷（会被微信管线改写，须以 .bin 落地）：' + strayJson.join(' / '));

  // 5) 入包文件命名 ASCII + 语法（node --check）——主包只有 game.js/bundle.js/game.json
  const mainFiles = fs.readdirSync(DEMO, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.(js|json)$/.test(d.name)).map((d) => d.name);
  for (const f of mainFiles) if (!/^[\x20-\x7e]+$/.test(f)) problems.push(`主包文件名非 ASCII：${f}`);
  if (!CHECK_ONLY) {
    // 语法自检走 TypeScript 解析器（**不用** new Function 求值：本文件自身也保持零动态求值形态）
    for (const f of ['game.js', 'bundle.js']) {
      const file = path.join(DEMO, f);
      if (!fs.existsSync(file)) continue;
      const diags = ts.createSourceFile(f, fs.readFileSync(file, 'utf8'), TRANSPILE_TARGET, false).parseDiagnostics;
      if (diags.length) problems.push(`${f} 语法非法：${diags[0].messageText}`);
    }
  }

  // 6) 红线：新宿主不得 import proto/webgl2_probe（扫**真代码**：注释里的说明文字不算命中，
  //    与 tests/character3d-structure.test.ts 的 stripComments 同口径）
  const srcFiles = collectSources(DEMO);
  for (const f of srcFiles) {
    if (f.endsWith('build.mjs')) continue;
    const code = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/webgl2_probe/.test(code)) problems.push(`宿主源码引用了 proto/webgl2_probe：${path.relative(ROOT, f)}`);
  }
  if (fs.existsSync(OUT)) {
    const bundleCode = fs.readFileSync(OUT, 'utf8');
    if (/webgl2_probe/.test(bundleCode)) problems.push('bundle.js 内出现 proto/webgl2_probe 引用');
    if (/systems\/battle-core|battle-session/.test(bundleCode)) problems.push('bundle.js 内出现 battle-core/battle-session（宿主不引结算）');
  }

  // 7) 入包 JS **禁动态代码求值**（微信小游戏运行时禁令；T31-FE-C P0-1 防回退门）
  // 8) 入包 JS **禁 ES2020 语法记号**（微信预览/运行时编译链不接受；T31-FE-C P0-2 防回退门）
  for (const f of ['bundle.js', 'game.js']) {
    const file = path.join(DEMO, f);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = scanDynamicEval(text);
    if (hits.length) problems.push(`${f} 含动态代码求值（微信运行时禁用）：${hits.join(' / ')}`);
    const family = scanDynamicEvalFamily(text);
    if (family.length) notes.push(`${f} 动态求值同族报告（未阻断）：${family.join(' / ')}`);
    const syntax = scanLegacySyntax(text);
    if (syntax.length) {
      problems.push(`${f} 含 ES2020 语法记号（微信预览不接受；发射目标须为 ES2017）：${syntax.join(' / ')}`);
    }
    const acceptance = scanRuntimeAcceptanceReport(text);
    if (acceptance.length) notes.push(`${f} 运行时接受度报告（未阻断，需人工判断）：${acceptance.join(' / ')}`);
  }
  notes.push(`资产副本 ${refs.length} 个 / ${(copiedBytes / 1048576).toFixed(2)} MB（源 = proto/battle_demo/cdn）`);
  notes.push(`主包 bundle ${(fs.existsSync(OUT) ? fs.statSync(OUT).size / 1024 : 0).toFixed(0)} KB（微信主包上限 4MB）`);
  return { problems, notes, assetBytes: copiedBytes, refs };
}

function collectSources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'subpackages' || entry.name === 'evidence') continue;
      out.push(...collectSources(p));
    } else if (/\.(ts|mjs|js|json)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// ===== 执行 =====

const { modules, bytes } = buildBundle();
const gate = staticGate();
console.log(`[build] bundle.js ${CHECK_ONLY ? '(check only，未写)' : '生成'}：${modules.length} 个模块 / ${(bytes / 1024).toFixed(0)} KB`);
console.log('[build] 模块清单：\n  ' + modules.join('\n  '));
for (const n of gate.notes) console.log('[build] ' + n);
if (gate.problems.length > 0) {
  console.error('[build] ❌ 静态导入门失败：');
  for (const p of gate.problems) console.error('  · ' + p);
  process.exit(1);
}
console.log('[build] ✅ 静态导入门通过（主包入口 / game.json / 分包 game.js 占位 / 资产 SHA / 命名 / 语法 / 无 probe 依赖）');
