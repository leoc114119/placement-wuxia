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
const DEMO = path.join(ROOT, 'proto/character3d_runtime_demo');
const OUT = path.join(DEMO, 'bundle.js');
const CHECK_ONLY = process.argv.includes('--check');
const CDN_SOURCE_ROOT = path.join(ROOT, 'proto/battle_demo/cdn');
const SUBPACKAGE_ROOT = path.join(DEMO, 'subpackages/char3d-assets');

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
        target: ts.ScriptTarget.ES2020,
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

function buildBundle() {
  const { seen, order } = collect('proto/character3d_runtime_demo/main');
  const parts = [];
  parts.push('/* character3d_runtime_demo bundle —— 由 proto/character3d_runtime_demo/build.mjs 生成，勿手改 */');
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
  for (const key of order) {
    const varName = '__mod_' + key.replace(/[^a-z0-9]/gi, '_');
    parts.push(`  var ${varName} = ${JSON.stringify(seen.get(key))};`);
    parts.push(`  // ---- ${key} ----`);
    parts.push(`  __def(${JSON.stringify(key)}, new Function("require", "module", "exports", ${varName}));`);
  }
  parts.push('  __req("proto/character3d_runtime_demo/main", "./main");');
  parts.push('})();');
  const text = parts.join('\n');
  if (!CHECK_ONLY) fs.writeFileSync(OUT, text, 'utf8');
  return { modules: order, bytes: text.length };
}

// ===== 资产账真源：直接用 typescript 把 config/character-3d.ts 跑起来取 ref（不复制 sha/长度）=====

function loadTsModule(key, cache = new Map()) {
  if (cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(path.join(ROOT, key + '.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
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
    const to = path.join(SUBPACKAGE_ROOT, ref.urlPath);
    if (!fs.existsSync(from)) {
      problems.push(`源资产缺失：proto/battle_demo/cdn/${ref.urlPath}`);
      continue;
    }
    if (!CHECK_ONLY) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const needCopy = !fs.existsSync(to) || fs.statSync(to).size !== ref.byteLength;
      if (needCopy) fs.copyFileSync(from, to);
    }
    if (!fs.existsSync(to)) { problems.push(`分包资产未落地：subpackages/char3d-assets/${ref.urlPath}`); continue; }
    const bytes = fs.readFileSync(to);
    copiedBytes += bytes.length;
    if (bytes.length !== ref.byteLength) problems.push(`${ref.id} byteLength ${bytes.length} != 清单 ${ref.byteLength}`);
    const sha = sha256Hex(bytes);
    if (sha !== ref.sha256) problems.push(`${ref.id} SHA-256 不符（分包副本 ${sha.slice(0, 12)}… != 清单 ${ref.sha256.slice(0, 12)}…）`);
  }

  // 5) 入包文件命名 ASCII + 语法（node --check）——主包只有 game.js/bundle.js/game.json
  const mainFiles = fs.readdirSync(DEMO, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.(js|json)$/.test(d.name)).map((d) => d.name);
  for (const f of mainFiles) if (!/^[\x20-\x7e]+$/.test(f)) problems.push(`主包文件名非 ASCII：${f}`);
  if (!CHECK_ONLY) {
    try { new Function(fs.readFileSync(path.join(DEMO, 'game.js'), 'utf8')); } catch (e) { problems.push('game.js 语法非法：' + e.message); }
    try { new Function(fs.readFileSync(OUT, 'utf8')); } catch (e) { problems.push('bundle.js 语法非法：' + e.message); }
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
