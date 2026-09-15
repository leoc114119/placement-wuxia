// T31-FE-A · 假 WebGL2 上下文（仅测试用；不进生产构建）
//
// 目的：在没有 GPU 的环境里验证**分支决策与提交次数**（方案 §7）：
//   · native-MSAA / FXAA 两个分支走哪条（判据是 getContextAttributes().antialias，**不是**请求值）；
//   · 每单位一次 palette 上传 + 一次 draw；
//   · FXAA 分支的中间 FBO 与全屏 pass；
//   · context lost / restore 的重建次数。
//
// 只实现 renderer 真正调用的 API 面；未实现的方法一律不提供（调用即 TypeError，便于暴露「偷偷多调了」）。

export interface FakeGlState {
  calls: Map<string, unknown[][]>;
  boundFramebuffer: unknown;
  currentProgram: unknown;
  viewport: [number, number, number, number] | null;
  clearColor: [number, number, number, number] | null;
  depthTest: boolean;
  blend: boolean;
  cullFace: boolean;
  createdPrograms: number;
  deletedPrograms: number;
  createdTextures: number;
  createdBuffers: number;
  createdVertexArrays: number;
  createdFramebuffers: number;
  createdRenderbuffers: number;
  framebufferStatusChecks: number;
  lastUniform3fv: [unknown, Float32Array | null];
  texImage2DCalls: unknown[][];
  uniformMatrix4fvCalls: unknown[][];
  drawElementsCalls: unknown[][];
  drawArraysCalls: unknown[][];
  /** 纹理上传时是否翻转 Y（glTF 必须 false —— probe 实测标定，勿改） */
  lastUnpackFlipY: boolean | null;
  pixelStoreiCalls: [number, number][];
}

export interface FakeGlOptions {
  /** checkFramebufferStatus 的返回值（默认 COMPLETE） */
  framebufferStatus?: number;
  /** getContextAttributes().antialias 的**有效值**（模拟实机返回 false 的场景） */
  antialias?: boolean;
  /** null = 宿主不返回该常量（probe 真机踩坑场景） */
  maxVertexUniformVectors?: number | null;
  /** 让指定 uniform 名定位为 null（如 'uBones[0]' 用来验硬失败路径） */
  nullUniforms?: string[];
  /** 让着色器编译失败 */
  failShaderCompile?: boolean;
  /** 【T32 审核必修 1】只让**指定 shader** 编译失败（注入用；例：仅武器 program）。
   * 收到 shaderSource 时按源码判定，命中则该次 compile 失败——用于复现「角色 shader 成功、武器 shader 失败」。 */
  failShaderCompileWhen?: (source: string) => boolean;
  /** getContextAttributes 返回 null（context lost 后的宿主行为） */
  nullContextAttributes?: boolean;
}

export interface FakeGl {
  gl: WebGL2RenderingContext;
  state: FakeGlState;
}

export function createFakeWebGL2(options: FakeGlOptions = {}): FakeGl {
  const calls = new Map<string, unknown[][]>();
  /** 【T32 审核必修 1】最近一次 shaderSource 的源码（供 failShaderCompileWhen 定向判定） */
  let lastShaderSource: string | null = null;
  const state: FakeGlState = {
    calls,
    boundFramebuffer: null,
    currentProgram: null,
    viewport: null,
    clearColor: null,
    depthTest: false,
    blend: false,
    cullFace: false,
    createdPrograms: 0,
    deletedPrograms: 0,
    createdTextures: 0,
    createdBuffers: 0,
    createdVertexArrays: 0,
    createdFramebuffers: 0,
    createdRenderbuffers: 0,
    framebufferStatusChecks: 0,
    lastUniform3fv: [null, null],
    texImage2DCalls: [],
    uniformMatrix4fvCalls: [],
    drawElementsCalls: [],
    drawArraysCalls: [],
    lastUnpackFlipY: null,
    pixelStoreiCalls: [],
  };

  function rec(name: string, args: unknown[]): void {
    const list = calls.get(name);
    if (list) list.push(args);
    else calls.set(name, [args]);
  }

  const constants: Record<string, number> = {
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
    FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: 0x8cd7,
    FRAMEBUFFER_UNSUPPORTED: 0x8cdd,
    DEPTH_TEST: 0x0b71,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    LEQUAL: 0x0203,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH_ATTACHMENT: 0x8d00,
    RENDERBUFFER: 0x8d41,
    DEPTH_COMPONENT16: 0x81a5,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    NO_ERROR: 0,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8869,
  };

  const gl = {
    ...constants,

    getContextAttributes(): WebGLContextAttributes | null {
      rec('getContextAttributes', []);
      if (options.nullContextAttributes) return null;
      return {
        alpha: true,
        antialias: options.antialias ?? false,
        depth: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      };
    },

    getParameter(name: number): unknown {
      rec('getParameter', [name]);
      if (name === constants.MAX_VERTEX_UNIFORM_VECTORS) {
        return options.maxVertexUniformVectors === undefined ? 1024 : options.maxVertexUniformVectors;
      }
      return null;
    },

    getError(): number {
      return 0;
    },

    createShader(type: number): unknown {
      rec('createShader', [type]);
      return { kind: 'shader', type };
    },
    shaderSource(_shader: unknown, source: string): void {
      rec('shaderSource', [source]);
      lastShaderSource = source;
    },
    compileShader(): void { rec('compileShader', []); },
    getShaderParameter(): boolean {
      rec('getShaderParameter', []);
      if (options.failShaderCompile) return false;
      if (options.failShaderCompileWhen && lastShaderSource !== null) {
        return !options.failShaderCompileWhen(lastShaderSource);
      }
      return true;
    },
    getShaderInfoLog(): string {
      const targeted = options.failShaderCompileWhen && lastShaderSource !== null && options.failShaderCompileWhen(lastShaderSource);
      return options.failShaderCompile || targeted ? 'synthetic compile failure' : '';
    },
    deleteShader(): void { rec('deleteShader', []); },

    createProgram(): unknown {
      state.createdPrograms++;
      rec('createProgram', []);
      return { kind: 'program', id: state.createdPrograms };
    },
    attachShader(): void { rec('attachShader', []); },
    linkProgram(): void { rec('linkProgram', []); },
    getProgramParameter(): boolean {
      rec('getProgramParameter', []);
      return true;
    },
    getProgramInfoLog(): string { return ''; },
    deleteProgram(): void {
      state.deletedPrograms++;
      rec('deleteProgram', []);
    },
    useProgram(program: unknown): void {
      state.currentProgram = program;
      rec('useProgram', [program]);
    },

    getUniformLocation(_program: unknown, name: string): unknown {
      rec('getUniformLocation', [name]);
      if (options.nullUniforms && options.nullUniforms.indexOf(name) >= 0) return null;
      return { kind: 'uniform', name };
    },
    uniformMatrix4fv(location: unknown, transpose: boolean, value: Float32Array): void {
      state.uniformMatrix4fvCalls.push([location, transpose, value]);
      rec('uniformMatrix4fv', [location, transpose, value]);
    },
    uniform1i(): void { rec('uniform1i', []); },
    uniform1f(): void { rec('uniform1f', []); },
    uniform2f(): void { rec('uniform2f', []); },
    uniform3f(): void { rec('uniform3f', []); },
    uniform3fv(location: unknown, value: Float32Array): void {
      state.lastUniform3fv = [location, Float32Array.from(value)];
      rec('uniform3fv', [location, value]);
    },
    uniform4f(): void { rec('uniform4f', []); },

    createVertexArray(): unknown {
      state.createdVertexArrays++;
      rec('createVertexArray', []);
      return { kind: 'vao', id: state.createdVertexArrays };
    },
    bindVertexArray(vao: unknown): void { rec('bindVertexArray', [vao]); },
    deleteVertexArray(): void { rec('deleteVertexArray', []); },

    createBuffer(): unknown {
      state.createdBuffers++;
      rec('createBuffer', []);
      return { kind: 'buffer', id: state.createdBuffers };
    },
    bindBuffer(target: number, buffer: unknown): void { rec('bindBuffer', [target, buffer]); },
    bufferData(target: number, data: unknown, usage: number): void { rec('bufferData', [target, data, usage]); },
    deleteBuffer(): void { rec('deleteBuffer', []); },

    enableVertexAttribArray(): void { rec('enableVertexAttribArray', []); },
    vertexAttribPointer(): void { rec('vertexAttribPointer', []); },

    createTexture(): unknown {
      state.createdTextures++;
      rec('createTexture', []);
      return { kind: 'texture', id: state.createdTextures };
    },
    bindTexture(target: number, texture: unknown): void { rec('bindTexture', [target, texture]); },
    deleteTexture(): void { rec('deleteTexture', []); },
    activeTexture(unit: number): void { rec('activeTexture', [unit]); },
    pixelStorei(pname: number, value: number): void {
      state.pixelStoreiCalls.push([pname, value]);
      if (pname === constants.UNPACK_FLIP_Y_WEBGL) state.lastUnpackFlipY = Number(value) !== 0;
      rec('pixelStorei', [pname, value]);
    },
    texImage2D(...args: unknown[]): void {
      state.texImage2DCalls.push(args);
      rec('texImage2D', args);
    },
    generateMipmap(): void { rec('generateMipmap', []); },
    texParameteri(): void { rec('texParameteri', []); },

    createFramebuffer(): unknown {
      state.createdFramebuffers++;
      rec('createFramebuffer', []);
      return { kind: 'fbo', id: state.createdFramebuffers };
    },
    bindFramebuffer(target: number, framebuffer: unknown): void {
      state.boundFramebuffer = framebuffer;
      rec('bindFramebuffer', [target, framebuffer]);
    },
    deleteFramebuffer(): void { rec('deleteFramebuffer', []); },
    framebufferTexture2D(): void { rec('framebufferTexture2D', []); },
    createRenderbuffer(): unknown {
      state.createdRenderbuffers++;
      rec('createRenderbuffer', []);
      return { kind: 'rbo', id: state.createdRenderbuffers };
    },
    bindRenderbuffer(): void { rec('bindRenderbuffer', []); },
    deleteRenderbuffer(): void { rec('deleteRenderbuffer', []); },
    renderbufferStorage(): void { rec('renderbufferStorage', []); },
    framebufferRenderbuffer(): void { rec('framebufferRenderbuffer', []); },
    checkFramebufferStatus(): number {
      state.framebufferStatusChecks++;
      rec('checkFramebufferStatus', []);
      return options.framebufferStatus === undefined ? constants.FRAMEBUFFER_COMPLETE : options.framebufferStatus;
    },

    viewport(x: number, y: number, w: number, h: number): void {
      state.viewport = [x, y, w, h];
      rec('viewport', [x, y, w, h]);
    },
    clearColor(r: number, g: number, b: number, a: number): void {
      state.clearColor = [r, g, b, a];
      rec('clearColor', [r, g, b, a]);
    },
    clearDepth(): void { rec('clearDepth', []); },
    clear(mask: number): void { rec('clear', [mask]); },
    enable(cap: number): void {
      if (cap === constants.DEPTH_TEST) state.depthTest = true;
      if (cap === constants.BLEND) state.blend = true;
      if (cap === constants.CULL_FACE) state.cullFace = true;
      rec('enable', [cap]);
    },
    disable(cap: number): void {
      if (cap === constants.DEPTH_TEST) state.depthTest = false;
      if (cap === constants.BLEND) state.blend = false;
      if (cap === constants.CULL_FACE) state.cullFace = false;
      rec('disable', [cap]);
    },
    depthFunc(): void { rec('depthFunc', []); },
    blendFunc(): void { rec('blendFunc', []); },

    drawElements(mode: number, count: number, type: number, offset: number): void {
      state.drawElementsCalls.push([mode, count, type, offset]);
      rec('drawElements', [mode, count, type, offset]);
    },
    drawArrays(mode: number, first: number, count: number): void {
      state.drawArraysCalls.push([mode, first, count]);
      rec('drawArrays', [mode, first, count]);
    },
  };

  return { gl: gl as unknown as WebGL2RenderingContext, state };
}

/** 假离屏画布：只保留 width/height 与 getContext 派发。 */
export function createFakeCanvas(gl: WebGL2RenderingContext, width = 375, height = 667) {
  const canvas = {
    width,
    height,
    getContext(type: string) {
      if (type === 'webgl2') return gl;
      throw new Error('假画布不支持 2d 上下文');
    },
  };
  return canvas as unknown as import('../ui/character3d/platform').PlatformOffscreenCanvas;
}
