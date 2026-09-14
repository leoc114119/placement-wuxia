// src/skinning-renderer.js —— raw WebGL2 最小蒙皮渲染器（GLSL ES 3.00，零引擎依赖）
//
// 关键口径（《T31 方案》§2.2）：
//   · 顶点着色器声明 uniform mat4 uBones[<jointCount>]；每单位**一次** uniformMatrix4fv
//     上传整块 41×16 float palette（不是 41 次调用！），每单位**一次** drawElements。
//     20 单位 ⇒ 每帧 20 次 palette 上传 + 20 次 draw call。
//   · UBO / 骨骼纹理 / 实例化 / 视锥裁剪 / 单位休眠 一律不进 S0 基线。
//   · 每单位只变 uModel（摆放矩阵）与 palette（骨骼 + 动画相位），共享同一 VBO/IBO/纹理/shader。
// 本文件只负责「把已经算好的东西画出去」，不含任何数值结算。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./math.js'));
  else { root.PWProbe = root.PWProbe || {}; root.PWProbe.skinningRenderer = factory(root.PWProbe.math); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (math) {
  'use strict';

  // 顶点布局：16 float/顶点 = pos3 + nrm3 + uv2 + joints4 + weights4
  const FLOATS_PER_VERTEX = 16;
  const STRIDE = FLOATS_PER_VERTEX * 4;
  const LOC = { pos: 0, normal: 1, uv: 2, joints: 3, weights: 4 };
  const ATTR_JOINT_SCALAR = 1;      // A1-03 最小 shader 里 location 1 = 骨索引（标量）

  function glslVertex(jointCount) {
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
      'uniform mat4 uBones[' + jointCount + '];',
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
      // 光照在**模型空间**算（uModel 含 y 翻转，避免法线被翻反）
      '  vNormal = mat3(skin) * aNormal;',
      '  vUv = aUv;',
      '  gl_Position = uProjection * uModel * vec4(deformed, 1.0);',
      '}',
    ].join('\n');
  }

  const FRAG_SRC = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUv;',
    'in vec3 vNormal;',
    'uniform sampler2D uBaseColor;',
    'uniform vec3 uLightDir;',
    'uniform float uAmbient;',
    'uniform float uUseTexture;',
    'out vec4 fragColor;',
    'void main() {',
    '  vec3 base = uUseTexture > 0.5 ? texture(uBaseColor, vUv).rgb : vec3(0.82, 0.78, 0.72);',
    '  vec3 n = normalize(vNormal);',
    '  float ndl = max(dot(n, normalize(uLightDir)), 0.0);',
    '  fragColor = vec4(base * (uAmbient + (1.0 - uAmbient) * ndl), 1.0);',
    '}',
  ].join('\n');

  const TRI_VERT_SRC = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec2 aPos;',
    'layout(location = 1) in float aJoint;',
    'uniform mat4 uBones[41];',
    'out vec3 vColor;',
    'void main() {',
    // ★ 用**动态索引**读 uBones：索引来自顶点属性 ⇒ 编译器无法把数组缩到 1 个元素，
    //   A1-03 才真的在验"41 个 mat4 装得下、一次调用传得进"这件事。
    '  int idx = int(aJoint + 0.5);',
    '  vec4 p = uBones[idx] * vec4(aPos, 0.0, 1.0);',
    '  vColor = aPos.x < 0.0 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
    '  gl_Position = vec4(p.xy, 0.0, 1.0);',
    '}',
  ].join('\n');

  const TRI_FRAG_SRC = [
    '#version 300 es',
    'precision mediump float;',
    'in vec3 vColor;',
    'out vec4 fragColor;',
    'void main() { fragColor = vec4(vColor, 1.0); }',
  ].join('\n');

  const BLOCK_VERT_SRC = [
    '#version 300 es',
    'precision highp float;',
    'layout(location = 0) in vec2 aLocal;',           // 单位方片 [-1,1]
    'uniform vec4 uRect;',                            // (x, y, w, h) 像素空间
    'uniform vec2 uViewport;',
    'void main() {',
    '  vec2 px = uRect.xy + (aLocal * 0.5 + 0.5) * uRect.zw;',
    '  vec2 clip = vec2(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0);',
    '  gl_Position = vec4(clip, 0.0, 1.0);',
    '}',
  ].join('\n');

  const BLOCK_FRAG_SRC = [
    '#version 300 es',
    'precision mediump float;',
    'uniform vec3 uColor;',
    'out vec4 fragColor;',
    'void main() { fragColor = vec4(uColor, 1.0); }',
  ].join('\n');

  function fail(gl, msg, label) {
    throw new Error('[skinning-renderer] ' + label + ': ' + msg + ' (gl.getError=' + gl.getError() + ')');
  }

  function compile(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      fail(gl, '着色器编译失败 ' + log, label);
    }
    return sh;
  }

  function link(gl, vsSrc, fsSrc, label) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + '.vs');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + '.fs');
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      fail(gl, '着色器 link 失败 ' + log, label);
    }
    return p;
  }

  /** A1-03 最小三角形程序：含 uBones[41]，用来验"mat4 数组 uniform 能编能传"。 */
  function createMinimalTriangleProgram(gl) {
    const program = link(gl, TRI_VERT_SRC, TRI_FRAG_SRC, 'a1-03');
    const uBones = gl.getUniformLocation(program, 'uBones[0]');
    if (!uBones) {
      // 显式报错：uniform 数组被优化掉说明 shader 没真正走这条通路，A1-03 就不能算过
      fail(gl, 'uBones[0] uniform 定位失败（被优化掉 ⇒ A1-03 无效）', 'a1-03');
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // 全屏大三角（确定性覆盖画布中心）；aJoint 取 0 / 20 / 40 ⇒ 覆盖数组首中尾
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0,
      3, -1, 20,
      -1, 3, 40,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.pos);
    gl.vertexAttribPointer(LOC.pos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(ATTR_JOINT_SCALAR);
    gl.vertexAttribPointer(ATTR_JOINT_SCALAR, 1, gl.FLOAT, false, 12, 8);
    gl.bindVertexArray(null);
    return { program: program, uBones: uBones, vao: vao, jointCount: 41 };
  }

  function drawMinimalTriangle(gl, tri) {
    const identity = new Float32Array(41 * 16);
    for (let j = 0; j < 41; j++) { identity[j * 16] = 1; identity[j * 16 + 5] = 1; identity[j * 16 + 10] = 1; identity[j * 16 + 15] = 1; }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(tri.program);
    gl.bindVertexArray(tri.vao);
    gl.uniformMatrix4fv(tri.uBones, false, identity);     // 1 次调用传 41 个矩阵
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // ---------- 实体色块（A1-05 合成校验用） ----------

  function createSolidBlockRenderer(gl) {
    const program = link(gl, BLOCK_VERT_SRC, BLOCK_FRAG_SRC, 'solid-block');
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.pos);
    gl.vertexAttribPointer(LOC.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return {
      program: program, vao: vao,
      uRect: gl.getUniformLocation(program, 'uRect'),
      uColor: gl.getUniformLocation(program, 'uColor'),
      uViewport: gl.getUniformLocation(program, 'uViewport'),
    };
  }

  /** 在像素空间 [x,y,w,h] 处画一个不透明色块（alpha=1 用于合成非透明校验）。 */
  function drawSolidBlock(gl, block, rect, color, viewportW, viewportH) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(block.program);
    gl.bindVertexArray(block.vao);
    gl.uniform4f(block.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform2f(block.uViewport, viewportW, viewportH);
    gl.uniform3f(block.uColor, color[0], color[1], color[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  // ---------- 蒙皮渲染器 ----------

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {object} model glb-loader 输出
   * @param {Array<{image:any,width:number,height:number,mimeType:string}>} decodedImages 已解码贴图
   * @param {{lightDir?:number[], ambient?:number, fakeGpuTimer?:boolean}} [opts]
   */
  function createSkinningRenderer(gl, model, decodedImages, opts) {
    opts = opts || {};
    const jointCount = model.jointNodes.length;
    const maxVecRaw = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
    const maxVecKnown = typeof maxVecRaw === 'number' && maxVecRaw > 0;
    // ★ 宿主不返回该常量（null）时**不判死**：方案 §4.2 原文"最终以 shader compile/link 成功为硬判据"。
    //   （踩过：null 会被 `>` 当 0 用 ⇒ 误报"装不下 41 骨"直接把资产装载打挂。）
    if (maxVecKnown && jointCount * 4 + 8 > maxVecRaw) {
      fail(gl, 'MAX_VERTEX_UNIFORM_VECTORS=' + maxVecRaw + ' 装不下 ' + jointCount + ' 骨（需 ≥' + (jointCount * 4 + 8) + '）', 'capability');
    }
    const maxVec = maxVecKnown ? maxVecRaw : null;
    const program = link(gl, glslVertex(jointCount), FRAG_SRC, 'skin');
    const u = {
      projection: gl.getUniformLocation(program, 'uProjection'),
      model: gl.getUniformLocation(program, 'uModel'),
      bones: gl.getUniformLocation(program, 'uBones[0]'),
      baseColor: gl.getUniformLocation(program, 'uBaseColor'),
      lightDir: gl.getUniformLocation(program, 'uLightDir'),
      ambient: gl.getUniformLocation(program, 'uAmbient'),
      useTexture: gl.getUniformLocation(program, 'uUseTexture'),
    };
    if (!u.bones) fail(gl, 'uBones[0] 未定位到', 'skin');

    const tUpload0 = now();
    // 交错 VBO（16 float/顶点）
    const vcount = model.account.vertexCount;
    const inter = new Float32Array(vcount * FLOATS_PER_VERTEX);
    for (let v = 0; v < vcount; v++) {
      const o = v * FLOATS_PER_VERTEX;
      inter[o] = model.positions[v * 3]; inter[o + 1] = model.positions[v * 3 + 1]; inter[o + 2] = model.positions[v * 3 + 2];
      inter[o + 3] = model.normals[v * 3]; inter[o + 4] = model.normals[v * 3 + 1]; inter[o + 5] = model.normals[v * 3 + 2];
      inter[o + 6] = model.uvs[v * 2]; inter[o + 7] = model.uvs[v * 2 + 1];
      inter[o + 8] = model.jointIndices[v * 4]; inter[o + 9] = model.jointIndices[v * 4 + 1];
      inter[o + 10] = model.jointIndices[v * 4 + 2]; inter[o + 11] = model.jointIndices[v * 4 + 3];
      inter[o + 12] = model.weights[v * 4]; inter[o + 13] = model.weights[v * 4 + 1];
      inter[o + 14] = model.weights[v * 4 + 2]; inter[o + 15] = model.weights[v * 4 + 3];
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(LOC.pos); gl.vertexAttribPointer(LOC.pos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(LOC.normal); gl.vertexAttribPointer(LOC.normal, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(LOC.uv); gl.vertexAttribPointer(LOC.uv, 2, gl.FLOAT, false, STRIDE, 24);
    gl.enableVertexAttribArray(LOC.joints); gl.vertexAttribPointer(LOC.joints, 4, gl.FLOAT, false, STRIDE, 32);
    gl.enableVertexAttribArray(LOC.weights); gl.vertexAttribPointer(LOC.weights, 4, gl.FLOAT, false, STRIDE, 48);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const meshUploadMs = now() - tUpload0;

    // 贴图（3 张全解码、全上传 —— 首传 GPU 口径要含真实资产量）
    //
    // ★ UV 朝向（T31 实测标定，勿"顺手改正"）：
    //   glTF 规定 UV 原点在图片**左上**（v=0 = 图片首行）；而 WebGL 上传时**不翻转**正是这个语义
    //   （数据首行 → t=0）。因此 glTF 贴图必须 **UNPACK_FLIP_Y_WEBGL = false**。
    //   实测四组对照（flip×mipmap）在同一模型上：翻转变体把整幅 UV 岛群镜像 ⇒ 人物碎成色块；
    //   不翻转变体才得到完整的脸与衣纹。tools/glb2d/render.mjs 的软件光栅器同口径（v 从图片首行取）。
    const tTex0 = now();
    const textures = [];
    decodedImages.forEach(function (img) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img.image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      textures.push({ texture: tex, width: img.width, height: img.height, mimeType: img.mimeType });
    });
    const textureUploadMs = now() - tTex0;

    const baseColorTex = model.textures.baseColor ? textures[model.textures.baseColor.index] : null;
    const indexGlType = model.indexType === 5125 ? gl.UNSIGNED_INT
      : model.indexType === 5123 ? gl.UNSIGNED_SHORT
      : (function () { throw new Error('[skinning-renderer] 未识别 index componentType=' + model.indexType); })();
    const projection = math.mat4();
    const counters = { drawCalls: 0, paletteUploads: 0, frames: 0 };
    const lightDir = opts.lightDir || [-0.35, 0.55, 0.75];

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);            // placement 含 y 翻转，winding 已反 ⇒ 不剔除
    gl.disable(gl.BLEND);                // 角色本身不透明；透明背景靠 clear
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    return {
      jointCount: jointCount,
      vertexCount: vcount,
      indexCount: model.indices.length,
      maxVertexUniformVectors: maxVec,
      maxVertexUniformVectorsKnown: maxVecKnown,
      meshUploadMs: meshUploadMs,
      textureUploadMs: textureUploadMs,
      textures: textures,
      counters: counters,
      gl: gl,
      u: u,
      vao: vao,

      /** 每帧开头：清成**透明**背景（合成到 2D 时不得盖住背景）。 */
      beginFrame: function () {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 0);
        gl.clearDepth(1);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        math.orthoPixel(projection, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.uniformMatrix4fv(u.projection, false, projection);
        gl.uniform3fv(u.lightDir, new Float32Array(lightDir));
        gl.uniform1f(u.ambient, opts.ambient === undefined ? 0.45 : opts.ambient);
        gl.activeTexture(gl.TEXTURE0);
        if (baseColorTex) {
          gl.bindTexture(gl.TEXTURE_2D, baseColorTex.texture);
          gl.uniform1i(u.baseColor, 0);
          gl.uniform1f(u.useTexture, 1);
        } else {
          gl.uniform1f(u.useTexture, 0);
        }
      },

      /**
       * 画一个单位。palette 是 41×16 float 扁平数组。
       * 这里是 A2 「每帧 API 次数」的唯一计量点：1 次 uniformMatrix4fv + 1 次 drawElements。
       */
      drawUnit: function (palette, modelMatrix) {
        gl.uniformMatrix4fv(u.bones, false, palette);
        counters.paletteUploads++;
        gl.uniformMatrix4fv(u.model, false, modelMatrix);
        gl.drawElements(gl.TRIANGLES, model.indices.length, indexGlType, 0);
        counters.drawCalls++;
      },

      endFrame: function () { counters.frames++; gl.bindVertexArray(null); },

      /**
       * 自证："41 个 mat4 一次 uniformMatrix4fv 真的落到 GPU" —— 上传一块带标记的 palette，
       * 再用 getUniform 逐点核回读值。只验上传通路，不做像素断言（像素断言在 A1-03/A1-04）。
       *
       * ★ 平台差异（安卓真机实测）：部分引擎（magicbrush）**不支持 getUniform**（console 报
       *   `getUniform not support`，可能抛异常）。这是**额外自证**，不是蒙皮正确性的硬判据 ——
       *   硬判据是方案 §4.2 的 A1-03/04/05 像素三件套（readPixels），它们不依赖 getUniform。
       *   因此这里**全程 try/catch、绝不抛出**，不支持时返回 `{ok:false, unsupported:true}`，
       *   由调用方按"平台不支持"如实记录，**不计入 errors、不影响 Device-PASS**。
       */
      verifyBoneUpload: function () {
        const samples = [];
        let err = null;
        let located = false;
        let gotValue = false;
        try {
          const probe = new Float32Array(jointCount * 16);
          for (let j = 0; j < jointCount; j++) {
            probe[j * 16] = 1 + j * 0.01; probe[j * 16 + 5] = 1; probe[j * 16 + 10] = 1; probe[j * 16 + 15] = 1;
            probe[j * 16 + 12] = j;
          }
          // getUniform 读的是"当前 program 的 uniform 状态"，先 useProgram 更稳（ANGLE 实测需要）
          gl.useProgram(program);
          gl.uniformMatrix4fv(u.bones, false, probe);
          err = gl.getError();
          const probeIdx = [0, 7, 20, jointCount - 1];
          for (let k = 0; k < probeIdx.length; k++) {
            const j = probeIdx[k];
            // 注意：WebGL 的 getUniform 只接受 WebGLUniformLocation（不是 GL 那种字符串名）
            const loc = gl.getUniformLocation(program, 'uBones[' + j + ']');
            if (loc) located = true;
            const v = loc ? gl.getUniform(program, loc) : null;
            // 只有拿到"够长的矩阵"才算**读回了值**；返回 null / 空数组一律算"没读回"
            const hasVal = !!v && typeof v.length === 'number' && v.length >= 16;
            if (hasVal) gotValue = true;
            samples.push({
              index: j, located: !!loc, hasValue: hasVal,
              tx: hasVal ? v[12] : null, m00: hasVal ? v[0] : null,
              ok: hasVal && Math.abs(v[12] - j) < 1e-6 && Math.abs(v[0] - (1 + j * 0.01)) < 1e-6,
            });
          }
        } catch (e) {
          // 引擎不支持 getUniform（magicbrush 实测）/ 任何回读异常 ⇒ 降级，不中断 A1
          return {
            ok: false, unsupported: true, platform: 'getUniform-not-support',
            error: (e && e.message) || String(e), located: located, jointCount: jointCount, samples: samples,
            note: '回读自证在部分安卓引擎不可用（硬判据 = A1-03/04/05 像素三件套，方案 §4.2）',
          };
        }
        // ★ 分类口径（真机 HONOR 实测：located=true 但 getUniform 读回 null ⇒ 曾误进 a1.errors，
        //   与同机的 DEVICE_PASS 自相矛盾）：**拿不到值 = 平台不回读 = unsupported**，不是上传失败。
        //   只有"确实读回了矩阵、值与上传的不符"才算真失败（那才是这条自证要抓的东西）。
        const readbackOk = located && samples.length > 0 && gotValue;
        if (!readbackOk) {
          return {
            ok: false, unsupported: true, platform: 'getUniform-not-support',
            located: located, gotValue: gotValue, jointCount: jointCount, samples: samples,
            note: 'getUniformLocation/getUniform 未返回可用矩阵（' + (located ? '已定位但读回空' : '未定位到') + '）'
              + ' ⇒ 视为平台不回读；硬判据 = A1-03/04/05 像素三件套（方案 §4.2）',
          };
        }
        return {
          ok: err === gl.NO_ERROR && samples.every(function (s) { return s.ok; }),
          unsupported: false, glError: err, located: located, gotValue: gotValue, jointCount: jointCount, samples: samples,
        };
      },
      resetCounters: function () { counters.drawCalls = 0; counters.paletteUploads = 0; counters.frames = 0; },
      dispose: function () {
        gl.deleteProgram(program); gl.deleteBuffer(vbo); gl.deleteBuffer(ibo); gl.deleteVertexArray(vao);
        textures.forEach(function (t) { gl.deleteTexture(t.texture); });
      },
    };
  }

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  return {
    createMinimalTriangleProgram: createMinimalTriangleProgram,
    drawMinimalTriangle: drawMinimalTriangle,
    createSolidBlockRenderer: createSolidBlockRenderer,
    drawSolidBlock: drawSolidBlock,
    createSkinningRenderer: createSkinningRenderer,
    FLOATS_PER_VERTEX: FLOATS_PER_VERTEX,
  };
});
