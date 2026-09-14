// T31-FE-A · ui/character3d/renderer.ts —— raw WebGL2 蒙皮渲染器（GLSL ES 3.00，零引擎依赖）
//
// 算法来源：`proto/webgl2_probe/src/skinning-renderer.js`（S0 已验）收编为有类型版本 + S1 必需的
// 色彩管线与抗锯齿分支。**禁 three.js / Cocos**（方案 §0/§12）。
//
// 方案 §7 关键口径（不可「顺手优化」）：
//   · 每单位每帧 **一次** uniformMatrix4fv 上传整块 41×16 palette + **一次** drawElements。
//     20 单位 = 20 次 palette 上传 + 20 draw call。**禁止** 41 次逐骨上传、UBO、骨骼纹理、实例化。
//   · 材质首版 = 纹理底色 + 环境光 2.15 + 方向光 1.15（方向 (-0.4,0.85,1) 归一），
//     正交、无实时阴影、透明背景；色彩 **sRGB 采样 → 线性光照 → sRGB 输出**。
//   · 抗锯齿按**能力分支**：读 gl.getContextAttributes().antialias（**不是**创建设置的请求值，
//     易错点 7），true = native MSAA；false = RGBA8+depth FBO + 一遍 **alpha-aware FXAA**。
//   · FXAA 禁采透明区 RGB 造成黑边；所有采样与混合保持 **premultiplied alpha**（易错点 6）。
//   · 不做 1.25× 超采样（会把 S0 的 20 单位性能基线口径改掉，方案 §7 末段）。
//
// 本文件不触 wx/DOM/fetch（平台差异止于 platform.ts）；不做任何数值结算（UI 只展示）。

import type { Character3DModel } from './glb';
import { buildVertexInterleave } from './glb';
import { orthoPixel } from './math';
import type {
  Character3DRenderPlatform,
  PlatformDecodedImage,
  PlatformImageSource,
  PlatformOffscreenCanvas,
} from './platform';

/** 顶点布局：16 float/顶点 = pos3 + nrm3 + uv2 + joints4 + weights4（与 probe 同序）。 */
const FLOATS_PER_VERTEX = 16;
const STRIDE = FLOATS_PER_VERTEX * 4;
const LOC = { pos: 0, normal: 1, uv: 2, joints: 3, weights: 4 } as const;

export type Character3DEdgeMode = 'native-msaa' | 'fxaa';
export type Character3DRenderStatus = 'ready' | 'context-lost' | 'failed' | 'disposed';

export interface Character3DLightOptions {
  ambientIntensity: number;
  directionalIntensity: number;
  direction: readonly [number, number, number];
  /** 漫反射归一（1/π，见 config/character-3d 的观感台口径注释） */
  diffuseNormalization: number;
}

export interface Character3DFxaaOptions {
  edgeThreshold: number;
  edgeThresholdMin: number;
  searchSteps: number;
  subpixelQuality: number;
  subpixelTrim: number;
  alphaThreshold: number;
}

export interface Character3DRendererOptions {
  canvas: PlatformOffscreenCanvas;
  model: Character3DModel;
  /** 底色贴图（已解码）。S1 材质是**漫反射单色**（方案 §7），法线/金属粗糙度贴图不参与着色，
   * 因此**不上传**——上传 2× 4096² 未使用贴图是纯浪费 GPU 显存与首帧带宽（架构决策，见交付说明）。 */
  baseColor: PlatformDecodedImage;
  platform: Character3DRenderPlatform;
  light: Character3DLightOptions;
  orthoZHalf: number;
  renderScale: number;
  fxaa: Character3DFxaaOptions;
  /** 强制分支（仅测试注入；生产必须由 getContextAttributes 决定，易错点 7）。 */
  forceEdgeMode?: Character3DEdgeMode;
}

export interface Character3DRendererCounters {
  drawCalls: number;
  paletteUploads: number;
  frames: number;
}

export interface Character3DRenderer {
  /** 离屏画布本体（2D 世界层 drawImage 合成用；宿主形状不同，故类型留宽）。 */
  readonly canvas: PlatformImageSource;
  readonly status: Character3DRenderStatus;
  readonly edgeMode: Character3DEdgeMode;
  readonly jointCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly backbuffer: { width: number; height: number };
  readonly contextAttributes: WebGLContextAttributes | null;
  readonly maxVertexUniformVectors: number | null;
  readonly counters: Character3DRendererCounters;
  readonly diagnostics: readonly string[];
  beginFrame(): void;
  drawUnit(palette: Float32Array, modelMatrix: Float32Array, alpha: number): void;
  endFrame(): void;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** 宿主 webglcontextlost 事件的唯一入口（平台适配器负责订阅）。 */
  notifyContextLost(): void;
  /** 宿主 webglcontextrestored 事件的唯一入口。**只尝试重建一次**：再失败即 failed
   *（方案 §6.2：重建失败则暂停对局并显示错误，不让「隐形人物战斗」继续）。 */
  handleContextRestored(): boolean;
  dispose(): void;
}

// ===== 着色器源码 =====

/** sRGB ↔ 线性传输函数（着色器内实现，与 math.ts 的 CPU 同源实现逐式一致）。
 * 不用硬件 sRGB 纹理/FBO 是刻意的：微信与浏览器对 SRGB8_ALPHA8 渲染目标的支持面不一致，
 * 手工转换在两个宿主上像素级同结果。 */
const COLOR_SPACE_GLSL = [
  'vec3 srgbToLinear(vec3 c) {',
  '  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));',
  '}',
  'vec3 linearToSrgb(vec3 c) {',
  '  vec3 lo = c * 12.92;',
  '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;',
  '  return mix(lo, hi, step(vec3(0.0031308), c));',
  '}',
].join('\n');

function skinVertexSrc(jointCount: number): string {
  return [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec3 aPos;',
    'layout(location = 1) in vec3 aNormal;',
    'layout(location = 2) in vec2 aUv;',
    'layout(location = 3) in vec4 aJoints;',
    'layout(location = 4) in vec4 aWeights;',
    'uniform mat4 uProjection;',
    'uniform mat4 uModel;',
    `uniform mat4 uBones[${jointCount}];`,
    'out vec2 vUv;',
    'out vec3 vNormal;',
    'void main() {',
    '  int j0 = int(aJoints.x + 0.5);',
    '  int j1 = int(aJoints.y + 0.5);',
    '  int j2 = int(aJoints.z + 0.5);',
    '  int j3 = int(aJoints.w + 0.5);',
    '  mat4 skin = uBones[j0] * aWeights.x + uBones[j1] * aWeights.y',
    '            + uBones[j2] * aWeights.z + uBones[j3] * aWeights.w;',
    '  vec3 deformed = (skin * vec4(aPos, 1.0)).xyz;',
    // 光照在**模型空间**算（uModel 含 y 翻转 + 六向 yaw，法线跟着蒙皮走，避免被翻反）
    '  vNormal = mat3(skin) * aNormal;',
    '  vUv = aUv;',
    '  gl_Position = uProjection * uModel * vec4(deformed, 1.0);',
    '}',
  ].join('\n');
}

const SKIN_FRAGMENT_SRC = [
  '#version 300 es',
  'precision mediump float;',
  'in vec2 vUv;',
  'in vec3 vNormal;',
  'uniform sampler2D uBaseColor;',
  'uniform vec3 uLightDir;',
  'uniform float uAmbient;',
  'uniform float uDirIntensity;',
  'uniform float uDiffuseNorm;',
  'uniform float uAlpha;',
  'uniform float uUseTexture;',
  'out vec4 fragColor;',
  COLOR_SPACE_GLSL,
  'void main() {',
  // 观感台口径（config/character-3d 的 CHARACTER_3D_LIGHT 注释）：sRGB 采样 → 线性 → 光照 → sRGB
  '  vec3 base = uUseTexture > 0.5 ? srgbToLinear(texture(uBaseColor, vUv).rgb) : vec3(0.82, 0.78, 0.72);',
  '  vec3 n = normalize(vNormal);',
  '  float ndl = max(dot(n, normalize(uLightDir)), 0.0);',
  '  vec3 lit = base * (uAmbient + uDirIntensity * ndl) * uDiffuseNorm;',
  // 预乘 alpha 输出：Canvas 2D 的 drawImage 合成在 sRGB 空间做 source-over，
  // 故存「sRGB 编码 × alpha」。死亡淡出与 FXAA 边缘都吃这条口径。
  '  fragColor = vec4(linearToSrgb(lit) * uAlpha, uAlpha);',
  '}',
].join('\n');

/** FS 全屏三角形（无需 VBO）：3 顶点铺满视口。 */
const FULLSCREEN_VERTEX_SRC = [
  '#version 300 es',
  'precision highp float;',
  'out vec2 vUv;',
  'void main() {',
  '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
  '  vUv = p;',
  '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
  '}',
].join('\n');

/**
 * alpha-aware FXAA（方案 §7 第 2 条）。
 * 与教科书 FXAA 的唯一实质差异：**亮度按未预乘颜色算**（`rgb / max(a, eps)`），
 * 并对邻居做 alpha 门限 —— 否则透明区（预乘后 rgb=0）会被当成极暗，沿人物轮廓糊出一圈黑边
 * （易错点 6）。混合全程在预乘空间做，alpha 与 rgb 一起插值。
 */
const FXAA_FRAGMENT_SRC = [
  '#version 300 es',
  'precision mediump float;',
  'in vec2 vUv;',
  'uniform sampler2D uTex;',
  'uniform vec2 uTexel;',
  'uniform float uEdgeThreshold;',
  'uniform float uEdgeThresholdMin;',
  'uniform float uSubpixelQuality;',
  'uniform float uSubpixelTrim;',
  'uniform float uAlphaThreshold;',
  'out vec4 fragColor;',
  'const int MAX_SEARCH_STEPS = 16;',
  'const float MAX_SPAN = 8.0;',
  'uniform int uSearchSteps;',
  // 未预乘亮度：透明像素不得被算成黑
  'float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)) / max(c.a, 1e-4); }',
  'bool inside(vec4 c) { return c.a > uAlphaThreshold; }',
  'void main() {',
  '  vec2 t = uTexel;',
  '  vec4 cM = texture(uTex, vUv);',
  '  if (!inside(cM)) {',
  // 中心是「外」：只在预乘空间做 3×3 均值 —— 等价于对 alpha 与颜色同时做柔边，
  // 绝不引入透明区 RGB（预乘空间里 rgb=0 的邻居对颜色的贡献自然为 0）
  '    vec4 acc = vec4(0.0);',
  '    for (int i = -1; i <= 1; i++) {',
  '      for (int j = -1; j <= 1; j++) {',
  '        acc += texture(uTex, vUv + vec2(float(i), float(j)) * t);',
  '      }',
  '    }',
  '    fragColor = acc / 9.0;',
  '    return;',
  '  }',
  '  vec4 nNW = texture(uTex, vUv + vec2(-1.0, -1.0) * t);',
  '  vec4 nNE = texture(uTex, vUv + vec2( 1.0, -1.0) * t);',
  '  vec4 nSW = texture(uTex, vUv + vec2(-1.0,  1.0) * t);',
  '  vec4 nSE = texture(uTex, vUv + vec2( 1.0,  1.0) * t);',
  // 边缘外的邻居不参与方向估计（否则透明背景会把方向拉向画面外）
  '  float lM = luma(cM);',
  '  float lNW = inside(nNW) ? luma(nNW) : lM;',
  '  float lNE = inside(nNE) ? luma(nNE) : lM;',
  '  float lSW = inside(nSW) ? luma(nSW) : lM;',
  '  float lSE = inside(nSE) ? luma(nSE) : lM;',
  '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));',
  '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
  '  float contrast = lMax - lMin;',
  '  if (contrast < max(uEdgeThresholdMin, lMax * uEdgeThreshold)) { fragColor = cM; return; }',
  '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));',
  '  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * uSubpixelTrim, 1.0 / 128.0);',
  '  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);',
  '  dir = clamp(dir * rcpDirMin, -MAX_SPAN, MAX_SPAN) * t;',
  // 沿边缘方向搜索两端：命中「越出对比带」即停，最多 uSearchSteps 步
  '  float band = max(uEdgeThresholdMin, lMax * uEdgeThreshold);',
  '  float dNeg = 1.0;',
  '  float dPos = 1.0;',
  '  vec2 posNeg = vUv - dir;',
  '  vec2 posPos = vUv + dir;',
  '  for (int i = 0; i < MAX_SEARCH_STEPS; i++) {',
  '    if (i >= uSearchSteps) { break; }',
  '    vec4 sNeg = texture(uTex, posNeg);',
  '    vec4 sPos = texture(uTex, posPos);',
  '    bool outNeg = !inside(sNeg) || abs(luma(sNeg) - lM) > band;',
  '    bool outPos = !inside(sPos) || abs(luma(sPos) - lM) > band;',
  '    if (outNeg && outPos) { break; }',
  '    if (!outNeg) { posNeg -= dir; dNeg += 1.0; }',
  '    if (!outPos) { posPos += dir; dPos += 1.0; }',
  '  }',
  '  float blend = clamp(0.5 - min(dNeg, dPos) / (dNeg + dPos), 0.0, 1.0);',
  '  vec4 avg = 0.5 * (texture(uTex, vUv + dir * 0.5) + texture(uTex, vUv - dir * 0.5));',
  '  float subpixel = clamp(abs(lMin - lMax) / max(lMax, 1e-4) * uSubpixelTrim * 4.0, 0.0, 1.0);',
  '  float w = blend * mix(1.0, uSubpixelQuality, subpixel);',
  // 预乘空间插值：rgb 与 a 同权重，边缘 alpha 平滑、颜色不被透明区拉黑
  '  fragColor = mix(cM, avg, w);',
  '  fragColor.a = max(fragColor.a, cM.a * (1.0 - w));',
  '}',
].join('\n');

// ===== 实现 =====

interface SkinProgram {
  program: WebGLProgram;
  u: {
    projection: WebGLUniformLocation | null;
    model: WebGLUniformLocation | null;
    bones: WebGLUniformLocation | null;
    baseColor: WebGLUniformLocation | null;
    lightDir: WebGLUniformLocation | null;
    ambient: WebGLUniformLocation | null;
    dirIntensity: WebGLUniformLocation | null;
    diffuseNorm: WebGLUniformLocation | null;
    alpha: WebGLUniformLocation | null;
    useTexture: WebGLUniformLocation | null;
  };
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  texture: WebGLTexture;
}

interface FxaaProgram {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  u: {
    tex: WebGLUniformLocation | null;
    texel: WebGLUniformLocation | null;
    edgeThreshold: WebGLUniformLocation | null;
    edgeThresholdMin: WebGLUniformLocation | null;
    searchSteps: WebGLUniformLocation | null;
    subpixelQuality: WebGLUniformLocation | null;
    subpixelTrim: WebGLUniformLocation | null;
    alphaThreshold: WebGLUniformLocation | null;
  };
}

export function createCharacter3DRenderer(options: Character3DRendererOptions): Character3DRenderer {
  const { canvas, model, baseColor, platform, light, fxaa } = options;
  const jointCount = model.jointNodes.length;
  const diags: string[] = [];
  const counters: Character3DRendererCounters = { drawCalls: 0, paletteUploads: 0, frames: 0 };
  const vertexData = buildVertexInterleave(model);
  const projection = new Float32Array(16);
  const lightDir = new Float32Array(3);
  const lightDirNorm = Math.hypot(light.direction[0], light.direction[1], light.direction[2]) || 1;
  lightDir[0] = light.direction[0] / lightDirNorm;
  lightDir[1] = light.direction[1] / lightDirNorm;
  lightDir[2] = light.direction[2] / lightDirNorm;

  let status: Character3DRenderStatus = 'ready';
  let restoreAttempted = false;
  let backbufferW = canvas.width;
  let backbufferH = canvas.height;
  let edgeMode: Character3DEdgeMode = options.forceEdgeMode ?? 'fxaa';
  let contextAttributes: WebGLContextAttributes | null = null;
  let maxVertexUniformVectors: number | null = null;
  let skin: SkinProgram | null = null;
  let fxaaProgram: FxaaProgram | null = null;
  let fbo: WebGLFramebuffer | null = null;
  let fboTexture: WebGLTexture | null = null;
  let depthBuffer: WebGLRenderbuffer | null = null;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true, // 请求值；**有效值**必须读 getContextAttributes（易错点 7）
    depth: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  });
  if (!gl) {
    status = 'failed';
    diags.push('webgl2-context-unavailable');
  }

  function note(msg: string): void {
    if (diags.indexOf(msg) < 0) diags.push(msg);
  }

  function fail(msg: string): never {
    throw new Error('[character3d/renderer] ' + msg);
  }

  function compile(type: number, src: string, label: string): WebGLShader {
    const g = gl as WebGL2RenderingContext;
    const sh = g.createShader(type);
    if (!sh) fail(label + ': createShader 返回空');
    g.shaderSource(sh, src);
    g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
      const log = g.getShaderInfoLog(sh) || '';
      g.deleteShader(sh);
      fail(label + ' 着色器编译失败: ' + log);
    }
    return sh;
  }

  function link(vsSrc: string, fsSrc: string, label: string): WebGLProgram {
    const g = gl as WebGL2RenderingContext;
    const vs = compile(g.VERTEX_SHADER, vsSrc, label + '.vs');
    const fs = compile(g.FRAGMENT_SHADER, fsSrc, label + '.fs');
    const p = g.createProgram();
    if (!p) fail(label + ': createProgram 返回空');
    g.attachShader(p, vs);
    g.attachShader(p, fs);
    g.linkProgram(p);
    g.deleteShader(vs);
    g.deleteShader(fs);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) {
      const log = g.getProgramInfoLog(p) || '';
      g.deleteProgram(p);
      fail(label + ' link 失败: ' + log);
    }
    return p;
  }

  function buildSkinProgram(): SkinProgram {
    const g = gl as WebGL2RenderingContext;
    const program = link(skinVertexSrc(jointCount), SKIN_FRAGMENT_SRC, 'skin');
    const u = {
      projection: g.getUniformLocation(program, 'uProjection'),
      model: g.getUniformLocation(program, 'uModel'),
      bones: g.getUniformLocation(program, 'uBones[0]'),
      baseColor: g.getUniformLocation(program, 'uBaseColor'),
      lightDir: g.getUniformLocation(program, 'uLightDir'),
      ambient: g.getUniformLocation(program, 'uAmbient'),
      dirIntensity: g.getUniformLocation(program, 'uDirIntensity'),
      diffuseNorm: g.getUniformLocation(program, 'uDiffuseNorm'),
      alpha: g.getUniformLocation(program, 'uAlpha'),
      useTexture: g.getUniformLocation(program, 'uUseTexture'),
    };
    // uBones[0] 被优化掉说明 shader 没走「mat4 数组 uniform」这条通路 —— 硬失败，不静默降级
    if (!u.bones) fail('uBones[0] uniform 定位失败（被优化掉 ⇒ 整条蒙皮通路无效）');

    const vao = g.createVertexArray();
    if (!vao) fail('createVertexArray 返回空');
    g.bindVertexArray(vao);
    const vbo = g.createBuffer();
    if (!vbo) fail('createBuffer 返回空');
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, vertexData, g.STATIC_DRAW);
    g.enableVertexAttribArray(LOC.pos);
    g.vertexAttribPointer(LOC.pos, 3, g.FLOAT, false, STRIDE, 0);
    g.enableVertexAttribArray(LOC.normal);
    g.vertexAttribPointer(LOC.normal, 3, g.FLOAT, false, STRIDE, 12);
    g.enableVertexAttribArray(LOC.uv);
    g.vertexAttribPointer(LOC.uv, 2, g.FLOAT, false, STRIDE, 24);
    g.enableVertexAttribArray(LOC.joints);
    g.vertexAttribPointer(LOC.joints, 4, g.FLOAT, false, STRIDE, 32);
    g.enableVertexAttribArray(LOC.weights);
    g.vertexAttribPointer(LOC.weights, 4, g.FLOAT, false, STRIDE, 48);
    const ibo = g.createBuffer();
    if (!ibo) fail('createBuffer(ibo) 返回空');
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo);
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, model.mesh.indices, g.STATIC_DRAW);
    g.bindVertexArray(null);

    const texture = g.createTexture();
    if (!texture) fail('createTexture 返回空');
    g.bindTexture(g.TEXTURE_2D, texture);
    // ★ UV 朝向（probe 实测标定，勿「顺手改正」）：glTF 的 UV 原点在图片左上，WebGL 上传
    //   不翻转正是这个语义（数据首行 → t=0）。翻转会把整幅 UV 岛群镜像 ⇒ 人物碎成色块。
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, baseColor.image as TexImageSource);
    g.generateMipmap(g.TEXTURE_2D);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.bindTexture(g.TEXTURE_2D, null);
    return { program, u, vao, vbo, ibo, texture };
  }

  function buildFxaaProgram(): FxaaProgram {
    const g = gl as WebGL2RenderingContext;
    const program = link(FULLSCREEN_VERTEX_SRC, FXAA_FRAGMENT_SRC, 'fxaa');
    const vao = g.createVertexArray();
    if (!vao) fail('createVertexArray(fxaa) 返回空');
    return {
      program,
      vao,
      u: {
        tex: g.getUniformLocation(program, 'uTex'),
        texel: g.getUniformLocation(program, 'uTexel'),
        edgeThreshold: g.getUniformLocation(program, 'uEdgeThreshold'),
        edgeThresholdMin: g.getUniformLocation(program, 'uEdgeThresholdMin'),
        searchSteps: g.getUniformLocation(program, 'uSearchSteps'),
        subpixelQuality: g.getUniformLocation(program, 'uSubpixelQuality'),
        subpixelTrim: g.getUniformLocation(program, 'uSubpixelTrim'),
        alphaThreshold: g.getUniformLocation(program, 'uAlphaThreshold'),
      },
    };
  }

  /** FXAA 分支的中间目标：RGBA8 + depth renderbuffer（贴图 LINEAR，FXAA 依赖双线性采样）。 */
  function buildTargets(): void {
    const g = gl as WebGL2RenderingContext;
    if (edgeMode !== 'fxaa') return;
    fboTexture = g.createTexture();
    if (!fboTexture) fail('createTexture(fbo) 返回空');
    g.bindTexture(g.TEXTURE_2D, fboTexture);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, backbufferW, backbufferH, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    depthBuffer = g.createRenderbuffer();
    g.bindRenderbuffer(g.RENDERBUFFER, depthBuffer);
    g.renderbufferStorage(g.RENDERBUFFER, g.DEPTH_COMPONENT16, backbufferW, backbufferH);
    fbo = g.createFramebuffer();
    if (!fbo) fail('createFramebuffer 返回空');
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, fboTexture, 0);
    g.framebufferRenderbuffer(g.FRAMEBUFFER, g.DEPTH_ATTACHMENT, g.RENDERBUFFER, depthBuffer);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.bindTexture(g.TEXTURE_2D, null);
    g.bindRenderbuffer(g.RENDERBUFFER, null);
  }

  function disposeTargets(): void {
    const g = gl as WebGL2RenderingContext;
    if (fbo) g.deleteFramebuffer(fbo);
    if (fboTexture) g.deleteTexture(fboTexture);
    if (depthBuffer) g.deleteRenderbuffer(depthBuffer);
    fbo = null;
    fboTexture = null;
    depthBuffer = null;
  }

  /** 首建 / context restore 后重建（同一份 CPU 侧数据：顶点、索引、贴图字节都还在）。 */
  function buildAll(): void {
    const g = gl as WebGL2RenderingContext;
    // 有效 context attributes（**不是**请求值，易错点 7）
    contextAttributes = g.getContextAttributes();
    const requestedMsaa = contextAttributes ? contextAttributes.antialias === true : false;
    edgeMode = options.forceEdgeMode ?? (requestedMsaa ? 'native-msaa' : 'fxaa');
    const raw = g.getParameter(g.MAX_VERTEX_UNIFORM_VECTORS);
    // 宿主不返回该常量（null）时**不判死**：硬判据是 shader compile/link 成功
    //（probe 真机踩坑：null 被 `>` 当 0 用 ⇒ 误报「装不下 41 骨」把资产装载打挂）
    maxVertexUniformVectors = typeof raw === 'number' && raw > 0 ? raw : null;
    if (maxVertexUniformVectors !== null && jointCount * 4 + 8 > maxVertexUniformVectors) {
      fail('MAX_VERTEX_UNIFORM_VECTORS=' + maxVertexUniformVectors + ' 装不下 ' + jointCount + ' 骨');
    }
    skin = buildSkinProgram();
    if (edgeMode === 'fxaa') {
      fxaaProgram = buildFxaaProgram();
      buildTargets();
    }
    g.enable(g.DEPTH_TEST);
    g.depthFunc(g.LEQUAL);   // 近者胜
    g.disable(g.CULL_FACE);  // placement 含 y 翻转，winding 已反 ⇒ 不剔除
    g.disable(g.BLEND);      // 角色自身不透明；透明背景靠 clear
    g.viewport(0, 0, backbufferW, backbufferH);
    note('edgeMode=' + edgeMode);
    if (contextAttributes && contextAttributes.antialias === false) note('antialias=false（实机有效值）');
  }

  function disposeAll(): void {
    const g = gl as WebGL2RenderingContext;
    if (skin) {
      g.deleteProgram(skin.program);
      g.deleteBuffer(skin.vbo);
      g.deleteBuffer(skin.ibo);
      g.deleteVertexArray(skin.vao);
      g.deleteTexture(skin.texture);
      skin = null;
    }
    if (fxaaProgram) {
      g.deleteProgram(fxaaProgram.program);
      g.deleteVertexArray(fxaaProgram.vao);
      fxaaProgram = null;
    }
    disposeTargets();
  }

  if (status === 'ready') {
    try {
      buildAll();
    } catch (error) {
      status = 'failed';
      note('init-failed:' + (error instanceof Error ? error.message : String(error)));
      platform.log('error', '[character3d/renderer] 初始化失败', { message: String(error) });
    }
  }

  const indexGlType = model.mesh.indexComponentType === 5125
    ? 0x1405 // UNSIGNED_INT
    : model.mesh.indexComponentType === 5123
      ? 0x1403 // UNSIGNED_SHORT
      : ((): never => fail('未识别 index componentType=' + model.mesh.indexComponentType))();

  return {
    canvas: canvas as PlatformImageSource,
    get status() { return status; },
    get edgeMode() { return edgeMode; },
    jointCount,
    vertexCount: model.mesh.vertexCount,
    indexCount: model.mesh.indexCount,
    get backbuffer() { return { width: backbufferW, height: backbufferH }; },
    get contextAttributes() { return contextAttributes; },
    get maxVertexUniformVectors() { return maxVertexUniformVectors; },
    counters,
    diagnostics: diags,

    beginFrame(): void {
      if (status !== 'ready') return;
      const g = gl as WebGL2RenderingContext;
      // FXAA 分支先渲进 FBO；native MSAA 分支直接渲进画布背衬（MSAA 只作用于默认帧缓冲）
      g.bindFramebuffer(g.FRAMEBUFFER, edgeMode === 'fxaa' ? fbo : null);
      g.viewport(0, 0, backbufferW, backbufferH);
      g.clearColor(0, 0, 0, 0);   // 全视口**透明**人物层：不得盖住 2D 背景
      g.clearDepth(1);
      g.enable(g.DEPTH_TEST);
      g.depthFunc(g.LEQUAL);
      g.disable(g.CULL_FACE);
      g.disable(g.BLEND);
      g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);
      orthoPixel(projection, backbufferW, backbufferH, options.orthoZHalf);
      const s = skin;
      if (!s) return;
      g.useProgram(s.program);
      g.bindVertexArray(s.vao);
      g.uniformMatrix4fv(s.u.projection, false, projection);
      g.uniform3fv(s.u.lightDir, lightDir);
      g.uniform1f(s.u.ambient, light.ambientIntensity);
      g.uniform1f(s.u.dirIntensity, light.directionalIntensity);
      g.uniform1f(s.u.diffuseNorm, light.diffuseNormalization);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, s.texture);
      g.uniform1i(s.u.baseColor, 0);
      g.uniform1f(s.u.useTexture, 1);
    },

    drawUnit(palette: Float32Array, modelMatrix: Float32Array, alpha: number): void {
      if (status !== 'ready') return;
      const g = gl as WebGL2RenderingContext;
      const s = skin;
      if (!s) return;
      // ★ 计量点：1 次 uniformMatrix4fv（整块 41×16）+ 1 次 drawElements。
      //   禁改成 41 次逐骨上传（方案 §7、易错点 1：会把 20 单位变成 820 次调用）。
      g.uniformMatrix4fv(s.u.bones, false, palette);
      counters.paletteUploads++;
      g.uniformMatrix4fv(s.u.model, false, modelMatrix);
      g.uniform1f(s.u.alpha, alpha);
      g.drawElements(g.TRIANGLES, model.mesh.indexCount, indexGlType, 0);
      counters.drawCalls++;
    },

    endFrame(): void {
      if (status !== 'ready') return;
      const g = gl as WebGL2RenderingContext;
      if (edgeMode === 'fxaa') {
        const f = fxaaProgram;
        if (!f || !fboTexture) return;
        g.bindFramebuffer(g.FRAMEBUFFER, null);
        g.viewport(0, 0, backbufferW, backbufferH);
        g.disable(g.DEPTH_TEST);
        g.disable(g.BLEND);
        g.useProgram(f.program);
        g.bindVertexArray(f.vao);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, fboTexture);
        g.uniform1i(f.u.tex, 0);
        g.uniform2f(f.u.texel, 1 / backbufferW, 1 / backbufferH);
        g.uniform1f(f.u.edgeThreshold, fxaa.edgeThreshold);
        g.uniform1f(f.u.edgeThresholdMin, fxaa.edgeThresholdMin);
        g.uniform1i(f.u.searchSteps, Math.max(1, Math.min(16, Math.round(fxaa.searchSteps))));
        g.uniform1f(f.u.subpixelQuality, fxaa.subpixelQuality);
        g.uniform1f(f.u.subpixelTrim, fxaa.subpixelTrim);
        g.uniform1f(f.u.alphaThreshold, fxaa.alphaThreshold);
        // 全屏三角形：无 VBO，3 顶点覆盖整屏
        g.drawArrays(g.TRIANGLES, 0, 3);
        g.bindVertexArray(null);
      }
      counters.frames++;
    },

    resize(cssWidth: number, cssHeight: number, dpr: number): void {
      if (status === 'disposed') return;
      const scale = options.renderScale > 0 ? options.renderScale : 1;
      const ratio = dpr > 0 ? dpr : 1;
      const w = Math.max(1, Math.round(cssWidth * ratio * scale));
      const h = Math.max(1, Math.round(cssHeight * ratio * scale));
      if (w === backbufferW && h === backbufferH) return;
      backbufferW = w;
      backbufferH = h;
      canvas.width = w;
      canvas.height = h;
      if (status !== 'ready') return;
      const g = gl as WebGL2RenderingContext;
      g.viewport(0, 0, w, h);
      if (edgeMode === 'fxaa') {
        // FBO 尺寸必须跟随背衬，否则人物被拉伸
        disposeTargets();
        buildTargets();
      }
      orthoPixel(projection, w, h, options.orthoZHalf);
    },

    notifyContextLost(): void {
      if (status === 'disposed') return;
      status = 'context-lost';
      skin = null;
      fxaaProgram = null;
      fbo = null;
      fboTexture = null;
      depthBuffer = null;
      note('context-lost');
      platform.log('warn', '[character3d/renderer] context lost（暂停人物提交，session 继续）');
    },

    handleContextRestored(): boolean {
      if (status === 'disposed') return false;
      if (restoreAttempted) {
        // 方案 §6.2：**只尝试重建一次**；再失败即暂停对局并报错，不让「隐形人物战斗」继续
        status = 'failed';
        note('restore-failed');
        platform.log('error', '[character3d/renderer] 重建失败（已尝试过一次）');
        return false;
      }
      restoreAttempted = true;
      try {
        disposeAll();
        buildAll();
        status = 'ready';
        note('context-restored');
        return true;
      } catch (error) {
        status = 'failed';
        note('restore-threw:' + (error instanceof Error ? error.message : String(error)));
        return false;
      }
    },

    dispose(): void {
      if (status === 'disposed') return;
      disposeAll();
      status = 'disposed';
    },
  };
}

/** 供测试/诊断读取的着色器源码（生产不导出源码，避免被误当 API 依赖）。 */
export const CHARACTER3D_SHADER_SOURCES = {
  skinVertex: skinVertexSrc,
  skinFragment: SKIN_FRAGMENT_SRC,
  fxaaFragment: FXAA_FRAGMENT_SRC,
  fullscreenVertex: FULLSCREEN_VERTEX_SRC,
} as const;
