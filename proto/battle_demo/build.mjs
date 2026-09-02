// battle_demo 打包器（零新依赖）：用项目 devDependency `typescript` 的 transpileModule
// 将 TS 以 CommonJS 产出并注册进微型模块注册表，拼成单文件经典脚本 bundle.js——
// file:// 直开可用（ESM 在 file:// 下被 CORS 拦截，故不走原生模块）。
// 用法：node proto/battle_demo/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'proto/battle_demo/bundle.js');

/** 解析相对导入 → 仓库根相对无扩展名 key（与注册 key 同式） */
function resolveId(fromKey, spec) {
  if (!spec.startsWith('.')) return null; // 仅支持相对导入（本项目 preview 无裸依赖）
  const dir = fromKey.split('/').slice(0, -1);
  const parts = spec.split('/');
  const stack = [...dir];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  const joined = stack.join('/');
  if (fs.existsSync(path.join(ROOT, joined + '.ts'))) return joined;
  if (fs.existsSync(path.join(ROOT, joined + '.tsx'))) return joined;
  if (fs.existsSync(path.join(ROOT, joined, 'index.ts'))) return joined + '/index';
  throw new Error(`[build] 无法解析导入：${spec}（来自 ${fromKey}）`);
}

function collect(entryKey) {
  const seen = new Map();
  const order = [];
  const visit = (key) => {
    if (seen.has(key)) return;
    const file = path.join(ROOT, key + '.ts');
    const src = fs.readFileSync(file, 'utf8');
    const out = ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: key,
    });
    seen.set(key, out.outputText);
    order.push(key);
    // 抓相对导入
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

const { seen, order } = collect('proto/battle_demo/main');
const parts = [];
parts.push('/* battle_demo bundle —— 由 proto/battle_demo/build.mjs 生成，勿手改 */');
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
parts.push('  __req("proto/battle_demo/main", "./main"); // 入口');
parts.push('})();');

fs.writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log(`[build] bundle.js 生成：${order.length} 个模块 → ${OUT}`);

// 自动 bump index.html 的 bundle 版本参数（防浏览器缓存旧包）
import fs from 'node:fs';
{
  const htmlPath = new URL('./index.html', import.meta.url).pathname;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const v = 'v' + Date.now();
  if (/bundle\.js\?v=/.test(html)) {
    html = html.replace(/bundle\.js\?v=[^"']+/, `bundle.js?v=${v}`);
  } else {
    html = html.replace('bundle.js', `bundle.js?v=${v}`);
  }
  fs.writeFileSync(htmlPath, html);
  console.log(`[build] index.html 版本参数 → ${v}`);
}
