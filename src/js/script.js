/*
MIT License

Copyright (c) 2017 Pavel Dobryakov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import * as dat from 'dat.gui';
import {
  Idler,
  PointerInterrupter,
  KeyboardInterrupter,
} from '@imaginary-maths/idler';

import config from '../ts/config.ts';
import options from '../ts/options.ts';
import shaderSources from '../ts/shader-sources.ts';
import Animator from '../ts/animator/animator.ts';
import { generateRandomColor } from '../ts/color.ts';
import parameterSets from '../ts/parameter-sets.ts';
import ParameterAnimator, {
  filterParameters,
} from '../ts/parameter-animator.ts';

const idler = new Idler(new PointerInterrupter(), new KeyboardInterrupter());

idler.addCallback({
  delay: options.idleTimeout * 1000,
  onBegin: () => animator.setPlaying(false),
  onEnd: () => animator.setPlaying(!config.PAUSED),
});

// Simulation section

const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

function pointerPrototype() {
  this.id = -1;
  this.texcoordX = 0;
  this.texcoordY = 0;
  this.prevTexcoordX = 0;
  this.prevTexcoordY = 0;
  this.deltaX = 0;
  this.deltaY = 0;
  this.down = false;
  this.moved = false;
  this.color = [30, 0, 300];
  this.attenuation = 1.0;
}

const pointers = [];
const splatStack = [];
pointers.push(new pointerPrototype());

const { gl, ext } = getWebGLContext(canvas);

if (isMobile()) {
  config.DYE_RESOLUTION = 512;
}
if (!ext.supportLinearFiltering) {
  config.DYE_RESOLUTION = 512;
  config.SHADING = false;
  config.BLOOM = false;
  config.SUNRAYS = false;
}

startGUI();

function getWebGLContext(canvas) {
  const params = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };

  const gl = canvas.getContext('webgl2', params);
  if (gl === null) throw new Error('This web browser does not support WebGL2');

  gl.getExtension('EXT_color_buffer_float');

  const supportLinearFiltering = gl.getExtension('OES_texture_float_linear');

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const halfFloatTexType = gl.HALF_FLOAT;

  const formatRGBA = getSupportedFormat(
    gl,
    gl.RGBA16F,
    gl.RGBA,
    halfFloatTexType,
  );
  const formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
  const formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering,
    },
  };
}

function getSupportedFormat(gl, internalFormat, format, type) {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
      default:
        return null;
    }
  }

  return {
    internalFormat,
    format,
  };
}

function supportRenderTextureFormat(gl, internalFormat, format, type) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  return status == gl.FRAMEBUFFER_COMPLETE;
}

function startGUI() {
  const gui = new dat.GUI({ width: 300, hideable: true });
  gui
    .add(config, 'DYE_RESOLUTION', {
      'high': 1024,
      'medium': 512,
      'low': 256,
      'very low': 128,
    })
    .name('quality')
    .onFinishChange(initFramebuffers);
  gui
    .add(config, 'SIM_RESOLUTION', { 32: 32, 64: 64, 128: 128, 256: 256 })
    .name('sim resolution')
    .onFinishChange(initFramebuffers);
  gui.add(config, 'RADIUS', 0.0, Math.sqrt(2.0) / 2.0).name('radius');
  gui.add(config, 'FADE_WIDTH', 0.0, Math.sqrt(2.0) / 2.0).name('fade width');
  gui
    .add(config, 'DENSITY_DISSIPATION', 0, 4.0)
    .name('density diffusion')
    .listen();
  gui
    .add(config, 'VELOCITY_DISSIPATION', 0, 4.0)
    .name('velocity diffusion')
    .listen();
  gui.add(config, 'PRESSURE', 0.0, 1.0).name('pressure').listen();
  gui.add(config, 'CURL', 0, 50).name('vorticity').step(1).listen();
  gui.add(config, 'SPLAT_RADIUS', 0.01, 0.4).name('splat radius').listen();
  gui.add(config, 'SHADING').name('shading').onFinishChange(updateKeywords);
  gui.add(config, 'COLORFUL').name('colorful');
  const paused = gui
    .add(config, 'PAUSED')
    .name('paused')
    .onFinishChange(() => animator.setPaused(config.PAUSED));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') paused.setValue(!config.PAUSED);
  });

  gui
    .add(
      {
        fun: () => {
          splatStack.push(parseInt(Math.random() * 20) + 5);
        },
      },
      'fun',
    )
    .name('Random splats');

  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder
    .add(config, 'BLOOM')
    .name('enabled')
    .onFinishChange(updateKeywords);
  bloomFolder.add(config, 'BLOOM_INTENSITY', 0.1, 2.0).name('intensity');
  bloomFolder.add(config, 'BLOOM_THRESHOLD', 0.0, 1.0).name('threshold');

  const sunraysFolder = gui.addFolder('Sunrays');
  sunraysFolder
    .add(config, 'SUNRAYS')
    .name('enabled')
    .onFinishChange(updateKeywords);
  sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.3, 1.0).name('weight');

  const captureFolder = gui.addFolder('Capture');
  captureFolder.addColor(config, 'BACK_COLOR').name('background color');
  captureFolder.add(config, 'TRANSPARENT').name('transparent');
  captureFolder.add({ fun: captureScreenshot }, 'fun').name('take screenshot');

  const parameterAnimationFolder = gui.addFolder('Parameter animation');
  parameterAnimationFolder
    .add(config, 'ANIMATE_PARAMETERS')
    .name('enabled')
    .onFinishChange(() =>
      parameterAnimator.setPlaying(config.ANIMATE_PARAMETERS),
    );
  parameterAnimationFolder
    // eslint-disable-next-line no-console
    .add({ fun: () => console.log(filterParameters(config)) }, 'fun')
    .name('log animatable parameters to console');

  gui
    .add(config, 'MIDI_VELOCITY_FACTOR', 0.0, 10.0)
    .name('MIDI velocity factor');
  gui
    .add(config, 'MIDI_VELOCITY_OFFSET', 0.0, 127.0)
    .name('MIDI velocity offset');

  if (isMobile()) {
    gui.close();
  } else {
    dat.GUI.toggleHide();
  }
}

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

function captureScreenshot() {
  const res = getResolution(config.CAPTURE_RESOLUTION);
  const target = createFBO(
    res.width,
    res.height,
    ext.formatRGBA.internalFormat,
    ext.formatRGBA.format,
    ext.halfFloatTexType,
    gl.NEAREST,
  );
  render(target);

  let texture = framebufferToTexture(target);
  texture = normalizeTexture(texture, target.width, target.height);

  const captureCanvas = textureToCanvas(texture, target.width, target.height);
  const datauri = captureCanvas.toDataURL();
  downloadURI('fluid.png', datauri);
  URL.revokeObjectURL(datauri);
}

function framebufferToTexture(target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  const length = target.width * target.height * 4;
  const texture = new Float32Array(length);
  gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
  return texture;
}

function normalizeTexture(texture, width, height) {
  const result = new Uint8Array(texture.length);
  let id = 0;
  for (let i = height - 1; i >= 0; i--) {
    for (let j = 0; j < width; j++) {
      const nid = i * width * 4 + j * 4;
      result[nid + 0] = clamp01(texture[id + 0]) * 255;
      result[nid + 1] = clamp01(texture[id + 1]) * 255;
      result[nid + 2] = clamp01(texture[id + 2]) * 255;
      result[nid + 3] = clamp01(texture[id + 3]) * 255;
      id += 4;
    }
  }
  return result;
}

function clamp01(input) {
  return Math.min(Math.max(input, 0), 1);
}

function textureToCanvas(texture, width, height) {
  const captureCanvas = document.createElement('canvas');
  const ctx = captureCanvas.getContext('2d');
  captureCanvas.width = width;
  captureCanvas.height = height;

  const imageData = ctx.createImageData(width, height);
  imageData.data.set(texture);
  ctx.putImageData(imageData, 0, 0);

  return captureCanvas;
}

function downloadURI(filename, uri) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

class Material {
  constructor(vertexShader, fragmentShaderSource) {
    this.vertexShader = vertexShader;
    this.fragmentShaderSource = fragmentShaderSource;
    this.programs = [];
    this.activeProgram = null;
    this.uniforms = [];
  }

  setKeywords(keywords) {
    let hash = 0;
    for (let i = 0; i < keywords.length; i++) hash += hashCode(keywords[i]);

    let program = this.programs[hash];
    if (program == null) {
      const fragmentShader = compileShader(
        gl.FRAGMENT_SHADER,
        this.fragmentShaderSource,
        keywords,
      );
      program = createProgram(this.vertexShader, fragmentShader);
      this.programs[hash] = program;
    }

    if (program == this.activeProgram) return;

    this.uniforms = getUniforms(program);
    this.activeProgram = program;
  }

  bind() {
    gl.useProgram(this.activeProgram);
  }
}

class Program {
  constructor(vertexShader, fragmentShader) {
    this.uniforms = {};
    this.program = createProgram(vertexShader, fragmentShader);
    this.uniforms = getUniforms(this.program);
  }

  bind() {
    gl.useProgram(this.program);
  }
}

function createProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.trace(gl.getProgramInfoLog(program));

  return program;
}

function getUniforms(program) {
  const uniforms = [];
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const uniformName = gl.getActiveUniform(program, i).name;
    uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
  }
  return uniforms;
}

function compileShader(type, source, keywords) {
  source = addKeywords(source, keywords);

  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    console.trace(gl.getShaderInfoLog(shader));

  return shader;
}

function addKeywords(source, keywords) {
  if (keywords == null) return source;
  let keywordsString = '';
  keywords.forEach((keyword) => {
    keywordsString += `#define ${keyword}\n`;
  });
  if (!/^\s*#version/.test(source)) {
    throw new Error(
      'First line of GLSL shader source must start with a #version string',
    );
  }
  const lines = source.split(/\r?\n/);
  const header = lines[0];
  const footer = lines.slice(1).join('\n');
  return `${header}\n${keywordsString}${footer}`;
}

const baseVertexShader = compileShader(
  gl.VERTEX_SHADER,
  shaderSources.vertex.base,
);
const blurVertexShader = compileShader(
  gl.VERTEX_SHADER,
  shaderSources.vertex.blur,
);

const blurShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.blur,
);
const copyShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.copy,
);
const clearShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.clear,
);
const colorShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.color,
);
const checkerboardShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.checkerboard,
);
const bloomPrefilterShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.bloomPrefilter,
);
const bloomBlurShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.bloomBlur,
);
const bloomFinalShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.bloomFinal,
);
const sunrayMaskShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.sunrayMask,
);
const sunrayShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.sunray,
);
const splatShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.splat,
  [`MAX_NUM_SPLATS (${options.splatGroupSize}u)`],
);
const advectionShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.advection,
  ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'],
);
const divergenceShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.divergence,
);
const curlShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.curl,
);
const vorticityShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.vorticity,
);
const pressureShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.pressure,
);
const gradientSubtractShader = compileShader(
  gl.FRAGMENT_SHADER,
  shaderSources.fragment.gradientSubtract,
);

const blit = (() => {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW,
  );
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW,
  );
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  return (target, clear = false) => {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    if (clear) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    // CHECK_FRAMEBUFFER_STATUS();
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };
})();

function CHECK_FRAMEBUFFER_STATUS() {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status != gl.FRAMEBUFFER_COMPLETE)
    console.trace(`Framebuffer error: ${status}`);
}

let dye;
let velocity;
let divergence;
let curl;
let pressure;
let bloom;
const bloomFramebuffers = [];
let sunrays;
let sunraysTemp;

const ditheringTextureUrl = new URL('../img/LDR_LLL1_0.png', import.meta.url);
const ditheringTexture = createTextureAsync(ditheringTextureUrl);

const blurProgram = new Program(blurVertexShader, blurShader);
const copyProgram = new Program(baseVertexShader, copyShader);
const clearProgram = new Program(baseVertexShader, clearShader);
const colorProgram = new Program(baseVertexShader, colorShader);
const checkerboardProgram = new Program(baseVertexShader, checkerboardShader);
const bloomPrefilterProgram = new Program(
  baseVertexShader,
  bloomPrefilterShader,
);
const bloomBlurProgram = new Program(baseVertexShader, bloomBlurShader);
const bloomFinalProgram = new Program(baseVertexShader, bloomFinalShader);
const sunraysMaskProgram = new Program(baseVertexShader, sunrayMaskShader);
const sunraysProgram = new Program(baseVertexShader, sunrayShader);
const splatProgram = new Program(baseVertexShader, splatShader);
const advectionProgram = new Program(baseVertexShader, advectionShader);
const divergenceProgram = new Program(baseVertexShader, divergenceShader);
const curlProgram = new Program(baseVertexShader, curlShader);
const vorticityProgram = new Program(baseVertexShader, vorticityShader);
const pressureProgram = new Program(baseVertexShader, pressureShader);
const gradienSubtractProgram = new Program(
  baseVertexShader,
  gradientSubtractShader,
);

const displayMaterial = new Material(
  baseVertexShader,
  shaderSources.fragment.display,
);

function initFramebuffers() {
  const simRes = getResolution(config.SIM_RESOLUTION);
  const dyeRes = getResolution(config.DYE_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const rg = ext.formatRG;
  const r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  gl.disable(gl.BLEND);

  if (dye == null)
    dye = createDoubleFBO(
      dyeRes.width,
      dyeRes.height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering,
    );
  else
    dye = resizeDoubleFBO(
      dye,
      dyeRes.width,
      dyeRes.height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering,
    );

  if (velocity == null)
    velocity = createDoubleFBO(
      simRes.width,
      simRes.height,
      rg.internalFormat,
      rg.format,
      texType,
      filtering,
    );
  else
    velocity = resizeDoubleFBO(
      velocity,
      simRes.width,
      simRes.height,
      rg.internalFormat,
      rg.format,
      texType,
      filtering,
    );

  divergence = createFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST,
  );
  curl = createFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST,
  );
  pressure = createDoubleFBO(
    simRes.width,
    simRes.height,
    r.internalFormat,
    r.format,
    texType,
    gl.NEAREST,
  );

  initBloomFramebuffers();
  initSunraysFramebuffers();
}

function initBloomFramebuffers() {
  const res = getResolution(config.BLOOM_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  bloom = createFBO(
    res.width,
    res.height,
    rgba.internalFormat,
    rgba.format,
    texType,
    filtering,
  );

  bloomFramebuffers.length = 0;
  for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
    const width = res.width >> (i + 1);
    const height = res.height >> (i + 1);

    if (width < 2 || height < 2) break;

    const fbo = createFBO(
      width,
      height,
      rgba.internalFormat,
      rgba.format,
      texType,
      filtering,
    );
    bloomFramebuffers.push(fbo);
  }
}

function initSunraysFramebuffers() {
  const res = getResolution(config.SUNRAYS_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

  sunrays = createFBO(
    res.width,
    res.height,
    r.internalFormat,
    r.format,
    texType,
    filtering,
  );
  sunraysTemp = createFBO(
    res.width,
    res.height,
    r.internalFormat,
    r.format,
    texType,
    filtering,
  );
}

function createFBO(w, h, internalFormat, format, type, param) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const texelSizeX = 1.0 / w;
  const texelSizeY = 1.0 / h;

  return {
    texture,
    fbo,
    width: w,
    height: h,
    texelSizeX,
    texelSizeY,
    attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };
}

function createDoubleFBO(w, h, internalFormat, format, type, param) {
  let fbo1 = createFBO(w, h, internalFormat, format, type, param);
  let fbo2 = createFBO(w, h, internalFormat, format, type, param);

  return {
    width: w,
    height: h,
    texelSizeX: fbo1.texelSizeX,
    texelSizeY: fbo1.texelSizeY,
    get read() {
      return fbo1;
    },
    set read(value) {
      fbo1 = value;
    },
    get write() {
      return fbo2;
    },
    set write(value) {
      fbo2 = value;
    },
    swap() {
      const temp = fbo1;
      fbo1 = fbo2;
      fbo2 = temp;
    },
  };
}

function resizeFBO(target, w, h, internalFormat, format, type, param) {
  const newFBO = createFBO(w, h, internalFormat, format, type, param);
  copyProgram.bind();
  gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
  blit(newFBO);
  return newFBO;
}

function resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
  if (target.width == w && target.height == h) return target;
  target.read = resizeFBO(
    target.read,
    w,
    h,
    internalFormat,
    format,
    type,
    param,
  );
  target.write = createFBO(w, h, internalFormat, format, type, param);
  target.width = w;
  target.height = h;
  target.texelSizeX = 1.0 / w;
  target.texelSizeY = 1.0 / h;
  return target;
}

function createTextureAsync(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    1,
    1,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255]),
  );

  const obj = {
    texture,
    width: 1,
    height: 1,
    attach(id) {
      gl.activeTexture(gl.TEXTURE0 + id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return id;
    },
  };

  const image = new Image();
  image.onload = () => {
    obj.width = image.width;
    obj.height = image.height;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  };
  image.src = url;

  return obj;
}

function updateKeywords() {
  const displayKeywords = [];
  if (config.SHADING) displayKeywords.push('SHADING');
  if (config.BLOOM) displayKeywords.push('BLOOM');
  if (config.SUNRAYS) displayKeywords.push('SUNRAYS');
  displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();
// multipleSplats(parseInt(Math.random() * 20) + 5);

function update(animator) {
  const dt = animator.delta() / 1000.0;
  if (resizeCanvas()) initFramebuffers();
  updateColors(dt);
  applyInputs();
  processSplatQueue();
  step(dt);
  render(null);
}
const animator = new Animator(() => update(animator));
animator.start();

const parameterAnimator = new ParameterAnimator(config, parameterSets);
parameterAnimator.start().setPlaying(config.ANIMATE_PARAMETERS);

function resizeCanvas() {
  const width = scaleByPixelRatio(canvas.clientWidth);
  const height = scaleByPixelRatio(canvas.clientHeight);
  const size = Math.min(width, height);
  if (canvas.width != size || canvas.height != size) {
    canvas.width = size;
    canvas.height = size;
    return true;
  }
  return false;
}

function updateColors(dt) {
  if (!config.COLORFUL) return;

  colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
  if (colorUpdateTimer >= 1) {
    colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
    pointers.forEach((p) => {
      p.color = generateColor();
    });
  }
}

function applyInputs() {
  if (splatStack.length > 0) multipleSplats(splatStack.pop());

  pointers.forEach((p) => {
    if (p.moved) {
      p.moved = false;
      splatPointer(p);
    }
  });
}

function step(dt) {
  gl.disable(gl.BLEND);

  curlProgram.bind();
  gl.uniform2f(
    curlProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
  blit(curl);

  vorticityProgram.bind();
  gl.uniform2f(
    vorticityProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
  gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
  gl.uniform1f(vorticityProgram.uniforms.dt, dt);
  blit(velocity.write);
  velocity.swap();

  divergenceProgram.bind();
  gl.uniform2f(
    divergenceProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
  blit(divergence);

  clearProgram.bind();
  gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
  gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
  blit(pressure.write);
  pressure.swap();

  pressureProgram.bind();
  gl.uniform2f(
    pressureProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
  for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
    gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
    blit(pressure.write);
    pressure.swap();
  }

  gradienSubtractProgram.bind();
  gl.uniform2f(
    gradienSubtractProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  gl.uniform1f(gradienSubtractProgram.uniforms.radius, config.RADIUS);
  gl.uniform1i(
    gradienSubtractProgram.uniforms.uPressure,
    pressure.read.attach(0),
  );
  gl.uniform1i(
    gradienSubtractProgram.uniforms.uVelocity,
    velocity.read.attach(1),
  );
  blit(velocity.write);
  velocity.swap();

  advectionProgram.bind();
  gl.uniform2f(
    advectionProgram.uniforms.texelSize,
    velocity.texelSizeX,
    velocity.texelSizeY,
  );
  if (!ext.supportLinearFiltering)
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      velocity.texelSizeX,
      velocity.texelSizeY,
    );
  const velocityId = velocity.read.attach(0);
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
  gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
  gl.uniform1f(advectionProgram.uniforms.dt, dt);
  gl.uniform1f(
    advectionProgram.uniforms.dissipation,
    config.VELOCITY_DISSIPATION,
  );
  gl.uniform1f(advectionProgram.uniforms.radius, config.RADIUS);
  gl.uniform1f(advectionProgram.uniforms.fadeWidth, config.FADE_WIDTH);

  blit(velocity.write);
  velocity.swap();

  if (!ext.supportLinearFiltering)
    gl.uniform2f(
      advectionProgram.uniforms.dyeTexelSize,
      dye.texelSizeX,
      dye.texelSizeY,
    );
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
  gl.uniform1f(
    advectionProgram.uniforms.dissipation,
    config.DENSITY_DISSIPATION,
  );
  blit(dye.write);
  dye.swap();
}

function render(target) {
  if (config.BLOOM) applyBloom(dye.read, bloom);
  if (config.SUNRAYS) {
    applySunrays(dye.read, dye.write, sunrays);
    blur(sunrays, sunraysTemp, 1);
  }

  if (target == null || !config.TRANSPARENT) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
  } else {
    gl.disable(gl.BLEND);
  }

  if (!config.TRANSPARENT) drawColor(target, normalizeColor(config.BACK_COLOR));
  if (target == null && config.TRANSPARENT) drawCheckerboard(target);
  drawDisplay(target);
}

function drawColor(target, color) {
  colorProgram.bind();
  gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
  blit(target);
}

function drawCheckerboard(target) {
  checkerboardProgram.bind();
  gl.uniform1f(
    checkerboardProgram.uniforms.aspectRatio,
    canvas.width / canvas.height,
  );
  blit(target);
}

function drawDisplay(target) {
  const width = target == null ? gl.drawingBufferWidth : target.width;
  const height = target == null ? gl.drawingBufferHeight : target.height;

  displayMaterial.bind();
  gl.uniform1f(displayMaterial.uniforms.radius, config.RADIUS);
  gl.uniform1f(displayMaterial.uniforms.fadeWidth, config.FADE_WIDTH);
  if (config.SHADING)
    gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
  gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
  if (config.BLOOM) {
    gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
    gl.uniform1i(
      displayMaterial.uniforms.uDithering,
      ditheringTexture.attach(2),
    );
    const scale = getTextureScale(ditheringTexture, width, height);
    gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
  }
  if (config.SUNRAYS)
    gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
  blit(target);
}

function applyBloom(source, destination) {
  if (bloomFramebuffers.length < 2) return;

  let last = destination;

  gl.disable(gl.BLEND);
  bloomPrefilterProgram.bind();
  const knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
  const curve0 = config.BLOOM_THRESHOLD - knee;
  const curve1 = knee * 2;
  const curve2 = 0.25 / knee;
  gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
  gl.uniform1f(
    bloomPrefilterProgram.uniforms.threshold,
    config.BLOOM_THRESHOLD,
  );
  gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
  blit(last);

  bloomBlurProgram.bind();
  for (let i = 0; i < bloomFramebuffers.length; i++) {
    const dest = bloomFramebuffers[i];
    gl.uniform2f(
      bloomBlurProgram.uniforms.texelSize,
      last.texelSizeX,
      last.texelSizeY,
    );
    gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
    blit(dest);
    last = dest;
  }

  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.BLEND);

  for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
    const baseTex = bloomFramebuffers[i];
    gl.uniform2f(
      bloomBlurProgram.uniforms.texelSize,
      last.texelSizeX,
      last.texelSizeY,
    );
    gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
    gl.viewport(0, 0, baseTex.width, baseTex.height);
    blit(baseTex);
    last = baseTex;
  }

  gl.disable(gl.BLEND);
  bloomFinalProgram.bind();
  gl.uniform2f(
    bloomFinalProgram.uniforms.texelSize,
    last.texelSizeX,
    last.texelSizeY,
  );
  gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
  gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
  blit(destination);
}

function applySunrays(source, mask, destination) {
  gl.disable(gl.BLEND);
  sunraysMaskProgram.bind();
  gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
  blit(mask);

  sunraysProgram.bind();
  gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
  gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
  blit(destination);
}

function blur(target, temp, iterations) {
  blurProgram.bind();
  for (let i = 0; i < iterations; i++) {
    gl.uniform2f(blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
    gl.uniform1i(blurProgram.uniforms.uTexture, target.attach(0));
    blit(temp);

    gl.uniform2f(blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
    gl.uniform1i(blurProgram.uniforms.uTexture, temp.attach(0));
    blit(target);
  }
}

function splatPointer(pointer) {
  const dx = pointer.deltaX * config.SPLAT_FORCE;
  const dy = pointer.deltaY * config.SPLAT_FORCE;
  splat(
    pointer.texcoordX,
    pointer.texcoordY,
    dx,
    dy,
    pointer.color,
    pointer.attenuation,
  );
}

function multipleSplats(amount) {
  for (let i = 0; i < amount; i++) {
    const color = generateColor();
    color.r *= 10.0;
    color.g *= 10.0;
    color.b *= 10.0;
    const x = Math.random();
    const y = Math.random();
    const dx = 1000 * (Math.random() - 0.5);
    const dy = 1000 * (Math.random() - 0.5);
    splat(x, y, dx, dy, color);
  }
}

const splatQueue = [];
function processSplatQueue() {
  if (splatQueue.length === 0) return;

  splatProgram.bind();
  gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
  const maxNumSplats = options.splatGroupSize;
  for (
    let chunkStart = 0;
    chunkStart < splatQueue.length;
    chunkStart += maxNumSplats
  ) {
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    const chunkSize = Math.min(splatQueue.length - chunkStart, maxNumSplats);
    gl.uniform1ui(splatProgram.uniforms.numSplats, chunkSize);
    for (let i = 0; i < chunkSize; i += 1) {
      const { x, y, dx, dy, attenuation, radius } = splatQueue[chunkStart + i];
      gl.uniform2f(splatProgram.uniforms[`splats[${i}].point`], x, y);
      gl.uniform3f(splatProgram.uniforms[`splats[${i}].color`], dx, dy, 0.0);
      gl.uniform1f(
        splatProgram.uniforms[`splats[${i}].radius`],
        correctRadius(radius / 100.0),
      );
      gl.uniform1f(
        splatProgram.uniforms[`splats[${i}].attenuation`],
        attenuation,
      );
    }
    blit(velocity.write);
    velocity.swap();
  }

  for (
    let chunkStart = 0;
    chunkStart < splatQueue.length;
    chunkStart += maxNumSplats
  ) {
    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    const chunkSize = Math.min(splatQueue.length - chunkStart, maxNumSplats);
    gl.uniform1ui(splatProgram.uniforms.numSplats, chunkSize);
    for (let i = 0; i < chunkSize; i += 1) {
      const { x, y, color, attenuation, radius } = splatQueue[chunkStart + i];
      gl.uniform2f(splatProgram.uniforms[`splats[${i}].point`], x, y);
      gl.uniform3f(
        splatProgram.uniforms[`splats[${i}].color`],
        color.r,
        color.g,
        color.b,
      );
      gl.uniform1f(
        splatProgram.uniforms[`splats[${i}].radius`],
        correctRadius(radius / 100.0),
      );
      gl.uniform1f(
        splatProgram.uniforms[`splats[${i}].attenuation`],
        attenuation,
      );
    }
    blit(dye.write);
    dye.swap();
  }

  splatQueue.splice(0);
}

function splat(
  x,
  y,
  dx,
  dy,
  color,
  attenuation = 1.0,
  radius = config.SPLAT_RADIUS,
) {
  idler.interrupt();
  splatQueue.push({ x, y, dx, dy, color, attenuation, radius });
}

function correctRadius(radius) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) radius *= aspectRatio;
  return radius;
}

canvas.addEventListener('mousedown', (e) => {
  const posX = scaleByPixelRatio(e.offsetX);
  const posY = scaleByPixelRatio(e.offsetY);
  let pointer = pointers.find((p) => p.id == -1);
  if (pointer == null) pointer = new pointerPrototype();
  updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', (e) => {
  const pointer = pointers[0];
  if (!pointer.down) return;
  const posX = scaleByPixelRatio(e.offsetX);
  const posY = scaleByPixelRatio(e.offsetY);
  updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
  updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touches = e.targetTouches;
  while (touches.length >= pointers.length)
    pointers.push(new pointerPrototype());
  for (let i = 0; i < touches.length; i++) {
    const posX = scaleByPixelRatio(touches[i].pageX);
    const posY = scaleByPixelRatio(touches[i].pageY);
    updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
  }
});

canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      const pointer = pointers[i + 1];
      if (!pointer.down) continue;
      const posX = scaleByPixelRatio(touches[i].pageX);
      const posY = scaleByPixelRatio(touches[i].pageY);
      updatePointerMoveData(pointer, posX, posY);
    }
  },
  false,
);

window.addEventListener('touchend', (e) => {
  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const pointer = pointers.find((p) => p.id == touches[i].identifier);
    if (pointer == null) continue;
    updatePointerUpData(pointer);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') splatStack.push(parseInt(Math.random() * 20) + 5);
});

function updatePointerDownData(pointer, id, posX, posY) {
  pointer.id = id;
  pointer.down = true;
  pointer.moved = false;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1.0 - posY / canvas.height;
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.deltaX = 0;
  pointer.deltaY = 0;
  pointer.color = generateColor();
}

function updatePointerMoveData(pointer, posX, posY) {
  pointer.prevTexcoordX = pointer.texcoordX;
  pointer.prevTexcoordY = pointer.texcoordY;
  pointer.texcoordX = posX / canvas.width;
  pointer.texcoordY = 1.0 - posY / canvas.height;
  pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
  pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
  pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData(pointer) {
  pointer.down = false;
}

function correctDeltaX(delta) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio < 1) delta *= aspectRatio;
  return delta;
}

function correctDeltaY(delta) {
  const aspectRatio = canvas.width / canvas.height;
  if (aspectRatio > 1) delta /= aspectRatio;
  return delta;
}

function generateColor() {
  const c = generateRandomColor();
  c.r *= 0.15;
  c.g *= 0.15;
  c.b *= 0.15;
  return c;
}
function normalizeColor(input) {
  const output = {
    r: input.r / 255,
    g: input.g / 255,
    b: input.b / 255,
  };
  return output;
}

function wrap(value, min, max) {
  const range = max - min;
  if (range == 0) return min;
  return ((value - min) % range) + min;
}

function getResolution(resolution) {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);

  if (gl.drawingBufferWidth > gl.drawingBufferHeight)
    return { width: max, height: min };
  return { width: min, height: max };
}

function getTextureScale(texture, width, height) {
  return {
    x: width / texture.width,
    y: height / texture.height,
  };
}

function scaleByPixelRatio(input) {
  const pixelRatio = window.devicePixelRatio || 1;
  return Math.floor(input * pixelRatio);
}

function hashCode(s) {
  if (s.length == 0) return 0;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export { splat };
