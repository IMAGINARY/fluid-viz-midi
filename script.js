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

import * as dat from './dat.gui.module.js';
import TWEEN from './tween.esm.js';
import {Bezier} from './bezier.js';
import {Idler, PointerInterrupter, KeyboardInterrupter} from "./idler.modern.js";

'use strict';

// Simulation section

const canvas = document.getElementsByTagName('canvas')[0];
resizeCanvas();

let config = {
    RADIUS: 0.5,
    FADE_WIDTH: 0.025,
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    CAPTURE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 2.0,
    VELOCITY_DISSIPATION: 1.0,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 4,
    SPLAT_RADIUS: 0.15,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLORFUL: false,
    COLOR_UPDATE_SPEED: 10,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    TRANSPARENT: false,
    BLOOM: false,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS: true,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 1.0,
}

function pointerPrototype () {
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

let pointers = [];
let splatStack = [];
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

function getWebGLContext (canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2)
        gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2)
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    }
    else
    {
        formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
        gl,
        ext: {
            formatRGBA,
            formatRG,
            formatR,
            halfFloatTexType,
            supportLinearFiltering
        }
    };
}

function getSupportedFormat (gl, internalFormat, format, type)
{
    if (!supportRenderTextureFormat(gl, internalFormat, format, type))
    {
        switch (internalFormat)
        {
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
        format
    }
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status == gl.FRAMEBUFFER_COMPLETE;
}

function startGUI () {
    var gui = new dat.GUI({ width: 300, hideable: true });
    gui.add(config, 'DYE_RESOLUTION', { 'high': 1024, 'medium': 512, 'low': 256, 'very low': 128 }).name('quality').onFinishChange(initFramebuffers);
    gui.add(config, 'SIM_RESOLUTION', { '32': 32, '64': 64, '128': 128, '256': 256 }).name('sim resolution').onFinishChange(initFramebuffers);
    gui.add(config, 'RADIUS', 0.0, Math.sqrt(2.0) / 2.0).name('radius');
    gui.add(config, 'FADE_WIDTH', 0.0, Math.sqrt(2.0) / 2.0).name('fade width');
    gui.add(config, 'DENSITY_DISSIPATION', 0, 4.0).name('density diffusion');
    gui.add(config, 'VELOCITY_DISSIPATION', 0, 4.0).name('velocity diffusion');
    gui.add(config, 'PRESSURE', 0.0, 1.0).name('pressure');
    gui.add(config, 'CURL', 0, 50).name('vorticity').step(1);
    gui.add(config, 'SPLAT_RADIUS', 0.01, 0.4).name('splat radius');
    gui.add(config, 'SHADING').name('shading').onFinishChange(updateKeywords);
    gui.add(config, 'COLORFUL').name('colorful');
    gui.add(config, 'PAUSED').name('paused').listen();

    gui.add({ fun: () => {
        splatStack.push(parseInt(Math.random() * 20) + 5);
    } }, 'fun').name('Random splats');

    let bloomFolder = gui.addFolder('Bloom');
    bloomFolder.add(config, 'BLOOM').name('enabled').onFinishChange(updateKeywords);
    bloomFolder.add(config, 'BLOOM_INTENSITY', 0.1, 2.0).name('intensity');
    bloomFolder.add(config, 'BLOOM_THRESHOLD', 0.0, 1.0).name('threshold');

    let sunraysFolder = gui.addFolder('Sunrays');
    sunraysFolder.add(config, 'SUNRAYS').name('enabled').onFinishChange(updateKeywords);
    sunraysFolder.add(config, 'SUNRAYS_WEIGHT', 0.3, 1.0).name('weight');

    let captureFolder = gui.addFolder('Capture');
    captureFolder.addColor(config, 'BACK_COLOR').name('background color');
    captureFolder.add(config, 'TRANSPARENT').name('transparent');
    captureFolder.add({ fun: captureScreenshot }, 'fun').name('take screenshot');

    if (isMobile()) {
        gui.close();
    } else {
        dat.GUI.toggleHide();
    }

    window.addEventListener('keydown', ({code}) => code === 'KeyM' ? dat.GUI.toggleHide() : undefined);
}

function isMobile () {
    return /Mobi|Android/i.test(navigator.userAgent);
}

function captureScreenshot () {
    let res = getResolution(config.CAPTURE_RESOLUTION);
    let target = createFBO(res.width, res.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, ext.halfFloatTexType, gl.NEAREST);
    render(target);

    let texture = framebufferToTexture(target);
    texture = normalizeTexture(texture, target.width, target.height);

    let captureCanvas = textureToCanvas(texture, target.width, target.height);
    let datauri = captureCanvas.toDataURL();
    downloadURI('fluid.png', datauri);
    URL.revokeObjectURL(datauri);
}

function framebufferToTexture (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    let length = target.width * target.height * 4;
    let texture = new Float32Array(length);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, texture);
    return texture;
}

function normalizeTexture (texture, width, height) {
    let result = new Uint8Array(texture.length);
    let id = 0;
    for (let i = height - 1; i >= 0; i--) {
        for (let j = 0; j < width; j++) {
            let nid = i * width * 4 + j * 4;
            result[nid + 0] = clamp01(texture[id + 0]) * 255;
            result[nid + 1] = clamp01(texture[id + 1]) * 255;
            result[nid + 2] = clamp01(texture[id + 2]) * 255;
            result[nid + 3] = clamp01(texture[id + 3]) * 255;
            id += 4;
        }
    }
    return result;
}

function clamp01 (input) {
    return Math.min(Math.max(input, 0), 1);
}

function textureToCanvas (texture, width, height) {
    let captureCanvas = document.createElement('canvas');
    let ctx = captureCanvas.getContext('2d');
    captureCanvas.width = width;
    captureCanvas.height = height;

    let imageData = ctx.createImageData(width, height);
    imageData.data.set(texture);
    ctx.putImageData(imageData, 0, 0);

    return captureCanvas;
}

function downloadURI (filename, uri) {
    let link = document.createElement('a');
    link.download = filename;
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

class Material {
    constructor (vertexShader, fragmentShaderSource) {
        this.vertexShader = vertexShader;
        this.fragmentShaderSource = fragmentShaderSource;
        this.programs = [];
        this.activeProgram = null;
        this.uniforms = [];
    }

    setKeywords (keywords) {
        let hash = 0;
        for (let i = 0; i < keywords.length; i++)
            hash += hashCode(keywords[i]);

        let program = this.programs[hash];
        if (program == null)
        {
            let fragmentShader = compileShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
            program = createProgram(this.vertexShader, fragmentShader);
            this.programs[hash] = program;
        }

        if (program == this.activeProgram) return;

        this.uniforms = getUniforms(program);
        this.activeProgram = program;
    }

    bind () {
        gl.useProgram(this.activeProgram);
    }
}

class Program {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = createProgram(vertexShader, fragmentShader);
        this.uniforms = getUniforms(this.program);
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function createProgram (vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        console.trace(gl.getProgramInfoLog(program));

    return program;
}

function getUniforms (program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function compileShader (type, source, keywords) {
    source = addKeywords(source, keywords);

    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        console.trace(gl.getShaderInfoLog(shader));

    return shader;
};

function addKeywords (source, keywords) {
    if (keywords == null) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
        keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
}

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        float offset = 1.33333333;
        vL = vUv - texelSize * offset;
        vR = vUv + texelSize * offset;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const blurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
        sum += texture2D(uTexture, vL) * 0.35294117;
        sum += texture2D(uTexture, vR) * 0.35294117;
        gl_FragColor = sum;
    }
`);

const copyShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

const clearShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
`);

const colorShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
`);

const checkerboardShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float aspectRatio;

    #define SCALE 25.0

    void main () {
        vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
        float v = mod(uv.x + uv.y, 2.0);
        v = v * 0.1 + 0.8;
        gl_FragColor = vec4(vec3(v), 1.0);
    }
`);

const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform float radius;
    uniform float fadeWidth;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

    #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;
    #endif
               
        vec2 center = vec2(0.5, 0.5);
        float dist = length(center - vUv);
        vec3 black = vec3(0.0, 0.0, 0.0);
        float t = clamp((dist - (radius - fadeWidth)) / fadeWidth, 0.0, 1.0);
        t = t * t * t; // cubic ramp for smooth transition between fade and non-fade region
        c = mix(c, black, t);

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
`;

const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 curve;
    uniform float threshold;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - curve.x, 0.0, curve.y);
        rq = curve.z * rq * rq;
        c *= max(rq, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
`);

const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum;
    }
`);

const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform float intensity;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum * intensity;
    }
`);

const sunraysMaskShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        vec4 c = texture2D(uTexture, vUv);
        float br = max(c.r, max(c.g, c.b));
        c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
        gl_FragColor = c;
    }
`);

const sunraysShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float weight;

    #define ITERATIONS 16

    void main () {
        float Density = 0.3;
        float Decay = 0.95;
        float Exposure = 0.7;

        vec2 coord = vUv;
        vec2 dir = vUv - 0.5;

        dir *= 1.0 / float(ITERATIONS) * Density;
        float illuminationDecay = 1.0;

        float color = texture2D(uTexture, vUv).a;

        for (int i = 0; i < ITERATIONS; i++)
        {
            coord -= dir;
            float col = texture2D(uTexture, coord).a;
            color += col * illuminationDecay * weight;
            illuminationDecay *= Decay;
        }

        gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
    }
`);

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    uniform float attenuation;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color / attenuation;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    uniform float radius;
    uniform float fadeWidth;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;

        vec2 iuv = floor(st);
        vec2 fuv = fract(st);

        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
        vec2 center = vec2(0.5, 0.5);
        float dist = length(center - vUv);
        float t = clamp((dist - (radius - fadeWidth)) / fadeWidth, 0.0, 1.0);
        t = t * t * t;
        float fadedDissipation = dissipation * (1.0 - t) + 10.0 * t;
    
    #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
    #endif
        float decay = 1.0 + fadedDissipation * dt;
        gl_FragColor = result / decay;
    }`,
    ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;

        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }
        
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform float radius;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    float myPow(float x) {
        float e = 20.0;
        return pow(2.0, e * x - e);
    }
    
    float easeIn(float x) {
        float atZero = myPow(0.0);
        float atOne = myPow(1.0);
        float r = (myPow(x) - atZero) / (atOne - atZero);
        return clamp(r , 0.0, 1.0);
    }

    void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        
        vec2 center = vec2(0.5, 0.5);
        float dist = length(vUv - center);
        velocity = mix(velocity, center - vUv, easeIn(dist / radius));
        
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (target, clear = false) => {
        if (target == null)
        {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else
        {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clear)
        {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        // CHECK_FRAMEBUFFER_STATUS();
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function CHECK_FRAMEBUFFER_STATUS () {
    let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status != gl.FRAMEBUFFER_COMPLETE)
        console.trace("Framebuffer error: " + status);
}

let dye;
let velocity;
let divergence;
let curl;
let pressure;
let bloom;
let bloomFramebuffers = [];
let sunrays;
let sunraysTemp;

let ditheringTexture = createTextureAsync('LDR_LLL1_0.png');

const blurProgram            = new Program(blurVertexShader, blurShader);
const copyProgram            = new Program(baseVertexShader, copyShader);
const clearProgram           = new Program(baseVertexShader, clearShader);
const colorProgram           = new Program(baseVertexShader, colorShader);
const checkerboardProgram    = new Program(baseVertexShader, checkerboardShader);
const bloomPrefilterProgram  = new Program(baseVertexShader, bloomPrefilterShader);
const bloomBlurProgram       = new Program(baseVertexShader, bloomBlurShader);
const bloomFinalProgram      = new Program(baseVertexShader, bloomFinalShader);
const sunraysMaskProgram     = new Program(baseVertexShader, sunraysMaskShader);
const sunraysProgram         = new Program(baseVertexShader, sunraysShader);
const splatProgram           = new Program(baseVertexShader, splatShader);
const advectionProgram       = new Program(baseVertexShader, advectionShader);
const divergenceProgram      = new Program(baseVertexShader, divergenceShader);
const curlProgram            = new Program(baseVertexShader, curlShader);
const vorticityProgram       = new Program(baseVertexShader, vorticityShader);
const pressureProgram        = new Program(baseVertexShader, pressureShader);
const gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);

const displayMaterial = new Material(baseVertexShader, displayShaderSource);

function initFramebuffers () {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba    = ext.formatRGBA;
    const rg      = ext.formatRG;
    const r       = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (dye == null)
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
        dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (velocity == null)
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
        velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);

    divergence = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    curl       = createFBO      (simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

    initBloomFramebuffers();
    initSunraysFramebuffers();
}

function initBloomFramebuffers () {
    let res = getResolution(config.BLOOM_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++)
    {
        let width = res.width >> (i + 1);
        let height = res.height >> (i + 1);

        if (width < 2 || height < 2) break;

        let fbo = createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering);
        bloomFramebuffers.push(fbo);
    }
}

function initSunraysFramebuffers () {
    let res = getResolution(config.SUNRAYS_RESOLUTION);

    const texType = ext.halfFloatTexType;
    const r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    sunrays     = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
    sunraysTemp = createFBO(res.width, res.height, r.internalFormat, r.format, texType, filtering);
}

function createFBO (w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;

    return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO (w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);

    return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read () {
            return fbo1;
        },
        set read (value) {
            fbo1 = value;
        },
        get write () {
            return fbo2;
        },
        set write (value) {
            fbo2 = value;
        },
        swap () {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function resizeFBO (target, w, h, internalFormat, format, type, param) {
    let newFBO = createFBO(w, h, internalFormat, format, type, param);
    copyProgram.bind();
    gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
    blit(newFBO);
    return newFBO;
}

function resizeDoubleFBO (target, w, h, internalFormat, format, type, param) {
    if (target.width == w && target.height == h)
        return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
}

function createTextureAsync (url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

    let obj = {
        texture,
        width: 1,
        height: 1,
        attach (id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };

    let image = new Image();
    image.onload = () => {
        obj.width = image.width;
        obj.height = image.height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    };
    image.src = url;

    return obj;
}

function updateKeywords () {
    let displayKeywords = [];
    if (config.SHADING) displayKeywords.push("SHADING");
    if (config.BLOOM) displayKeywords.push("BLOOM");
    if (config.SUNRAYS) displayKeywords.push("SUNRAYS");
    displayMaterial.setKeywords(displayKeywords);
}

updateKeywords();
initFramebuffers();
//multipleSplats(parseInt(Math.random() * 20) + 5);

let lastUpdateTime = Date.now();
let colorUpdateTimer = 0.0;
update();

function update () {
    const dt = calcDeltaTime();
    if (resizeCanvas())
        initFramebuffers();
    updateColors(dt);
    applyInputs();
    if (!config.PAUSED)
        step(dt);
    render(null);
    requestAnimationFrame(update);
}

function calcDeltaTime () {
    let now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
}

function resizeCanvas () {
    let width = scaleByPixelRatio(canvas.clientWidth);
    let height = scaleByPixelRatio(canvas.clientHeight);
    const size = Math.min(width, height);
    if (canvas.width != size || canvas.height != size) {
        canvas.width = size;
        canvas.height = size;
        return true;
    }
    return false;
}

function updateColors (dt) {
    if (!config.COLORFUL) return;

    colorUpdateTimer += dt * config.COLOR_UPDATE_SPEED;
    if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1);
        pointers.forEach(p => {
            p.color = generateColor();
        });
    }
}

function applyInputs () {
    if (splatStack.length > 0)
        multipleSplats(splatStack.pop());

    pointers.forEach(p => {
        if (p.moved) {
            p.moved = false;
            splatPointer(p);
        }
    });
}

function step (dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1f(gradienSubtractProgram.uniforms.radius, config.RADIUS);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    let velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    gl.uniform1f(advectionProgram.uniforms.radius, config.RADIUS);
    gl.uniform1f(advectionProgram.uniforms.fadeWidth, config.FADE_WIDTH);

    blit(velocity.write);
    velocity.swap();

    if (!ext.supportLinearFiltering)
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
}

function render (target) {
    if (config.BLOOM)
        applyBloom(dye.read, bloom);
    if (config.SUNRAYS) {
        applySunrays(dye.read, dye.write, sunrays);
        blur(sunrays, sunraysTemp, 1);
    }

    if (target == null || !config.TRANSPARENT) {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
    }
    else {
        gl.disable(gl.BLEND);
    }

    if (!config.TRANSPARENT)
        drawColor(target, normalizeColor(config.BACK_COLOR));
    if (target == null && config.TRANSPARENT)
        drawCheckerboard(target);
    drawDisplay(target);
}

function drawColor (target, color) {
    colorProgram.bind();
    gl.uniform4f(colorProgram.uniforms.color, color.r, color.g, color.b, 1);
    blit(target);
}

function drawCheckerboard (target) {
    checkerboardProgram.bind();
    gl.uniform1f(checkerboardProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    blit(target);
}

function drawDisplay (target) {
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;

    displayMaterial.bind();
    gl.uniform1f(displayMaterial.uniforms.radius, config.RADIUS);
    gl.uniform1f(displayMaterial.uniforms.fadeWidth, config.FADE_WIDTH);
    if (config.SHADING)
        gl.uniform2f(displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    gl.uniform1i(displayMaterial.uniforms.uTexture, dye.read.attach(0));
    if (config.BLOOM) {
        gl.uniform1i(displayMaterial.uniforms.uBloom, bloom.attach(1));
        gl.uniform1i(displayMaterial.uniforms.uDithering, ditheringTexture.attach(2));
        let scale = getTextureScale(ditheringTexture, width, height);
        gl.uniform2f(displayMaterial.uniforms.ditherScale, scale.x, scale.y);
    }
    if (config.SUNRAYS)
        gl.uniform1i(displayMaterial.uniforms.uSunrays, sunrays.attach(3));
    blit(target);
}

function applyBloom (source, destination) {
    if (bloomFramebuffers.length < 2)
        return;

    let last = destination;

    gl.disable(gl.BLEND);
    bloomPrefilterProgram.bind();
    let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    let curve0 = config.BLOOM_THRESHOLD - knee;
    let curve1 = knee * 2;
    let curve2 = 0.25 / knee;
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD);
    gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
    blit(last);

    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        blit(dest);
        last = dest;
    }

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i];
        gl.uniform2f(bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
        gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0));
        gl.viewport(0, 0, baseTex.width, baseTex.height);
        blit(baseTex);
        last = baseTex;
    }

    gl.disable(gl.BLEND);
    bloomFinalProgram.bind();
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0));
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY);
    blit(destination);
}

function applySunrays (source, mask, destination) {
    gl.disable(gl.BLEND);
    sunraysMaskProgram.bind();
    gl.uniform1i(sunraysMaskProgram.uniforms.uTexture, source.attach(0));
    blit(mask);

    sunraysProgram.bind();
    gl.uniform1f(sunraysProgram.uniforms.weight, config.SUNRAYS_WEIGHT);
    gl.uniform1i(sunraysProgram.uniforms.uTexture, mask.attach(0));
    blit(destination);
}

function blur (target, temp, iterations) {
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

function splatPointer (pointer) {
    let dx = pointer.deltaX * config.SPLAT_FORCE;
    let dy = pointer.deltaY * config.SPLAT_FORCE;
    splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color, pointer.attenuation);
}

function multipleSplats (amount) {
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

function splat (x, y, dx, dy, color, attenuation = 1.0, radius = config.SPLAT_RADIUS) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(radius / 100.0));
    gl.uniform1f(splatProgram.uniforms.attenuation, attenuation);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
}

function correctRadius (radius) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1)
        radius *= aspectRatio;
    return radius;
}

canvas.addEventListener('mousedown', e => {
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    let pointer = pointers.find(p => p.id == -1);
    if (pointer == null)
        pointer = new pointerPrototype();
    updatePointerDownData(pointer, -1, posX, posY);
});

canvas.addEventListener('mousemove', e => {
    let pointer = pointers[0];
    if (!pointer.down) return;
    let posX = scaleByPixelRatio(e.offsetX);
    let posY = scaleByPixelRatio(e.offsetY);
    updatePointerMoveData(pointer, posX, posY);
});

window.addEventListener('mouseup', () => {
    updatePointerUpData(pointers[0]);
});

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    while (touches.length >= pointers.length)
        pointers.push(new pointerPrototype());
    for (let i = 0; i < touches.length; i++) {
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerDownData(pointers[i + 1], touches[i].identifier, posX, posY);
    }
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        let pointer = pointers[i + 1];
        if (!pointer.down) continue;
        let posX = scaleByPixelRatio(touches[i].pageX);
        let posY = scaleByPixelRatio(touches[i].pageY);
        updatePointerMoveData(pointer, posX, posY);
    }
}, false);

window.addEventListener('touchend', e => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
    {
        let pointer = pointers.find(p => p.id == touches[i].identifier);
        if (pointer == null) continue;
        updatePointerUpData(pointer);
    }
});

window.addEventListener('keydown', e => {
    if (e.code === 'KeyP')
        config.PAUSED = !config.PAUSED;
    if (e.key === ' ')
        splatStack.push(parseInt(Math.random() * 20) + 5);
});

function updatePointerDownData (pointer, id, posX, posY) {
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

function updatePointerMoveData (pointer, posX, posY) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / canvas.width;
    pointer.texcoordY = 1.0 - posY / canvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

function updatePointerUpData (pointer) {
    pointer.down = false;
}

function correctDeltaX (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
}

function correctDeltaY (delta) {
    let aspectRatio = canvas.width / canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
}

function generateColor () {
    let c = HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
}

function HSVtoRGB (h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return {
        r,
        g,
        b
    };
}

function normalizeColor (input) {
    let output = {
        r: input.r / 255,
        g: input.g / 255,
        b: input.b / 255
    };
    return output;
}

function wrap (value, min, max) {
    let range = max - min;
    if (range == 0) return min;
    return (value - min) % range + min;
}

function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1)
        aspectRatio = 1.0 / aspectRatio;

    let min = Math.round(resolution);
    let max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
        return { width: max, height: min };
    else
        return { width: min, height: max };
}

function getTextureScale (texture, width, height) {
    return {
        x: width / texture.width,
        y: height / texture.height
    };
}

function scaleByPixelRatio (input) {
    let pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
}

function hashCode (s) {
    if (s.length == 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function splatPointerIfMoved(pointer) {
    if (pointer.moved) {
        pointer.moved = false;
        splatPointer(pointer);
    }
}

function lerp(p0, p1, t) {
    const oneMinusT = 1 - t;
    return new Victor(
        p0.x * oneMinusT + p1.x * t,
        p0.y * oneMinusT + p1.y * t,
    );
}

function startLineSplash(line, t) {
    const {x, y} = lerp(line.p0, line.p1, t);
    let posX = scaleByPixelRatio(x);
    let posY = scaleByPixelRatio(y);

    const pointer = new pointerPrototype();
    pointer.attenuation = 4.0;
    updatePointerDownData(pointer, -2, posX, posY);
    splatPointerIfMoved(pointer);
    return {pointer};
}

function updateLineSplash(line, t, pointer) {
    const {x, y} = lerp(line.p0, line.p1, t);
    let posX = scaleByPixelRatio(x);
    let posY = scaleByPixelRatio(y);
    updatePointerMoveData(pointer, posX, posY);
    splatPointerIfMoved(pointer);
}

function completeOrStopLineSplash(pointer) {
    updatePointerUpData(pointer);
}

const lineSplashTweenGroup = new TWEEN.Group();

function addLineSplash(line, duration) {
    let pointer = new pointerPrototype();

    const tween = new TWEEN.Tween({t: 0}, lineSplashTweenGroup)
        .to({t: 1}, duration)
        .easing(TWEEN.Easing.Quadratic.In)
        .onStart(({t}) => {
            const result = startLineSplash(line, t);
            pointer = result.pointer;
        })
        .onUpdate(({t}) => {
            updateLineSplash(line, t, pointer)
        })
        .onComplete(() => completeOrStopLineSplash(pointer))
        .onStop(() => completeOrStopLineSplash(pointer));
    tween.start();

    return {line, tween};
}

class ADSREnvelope {
    static CURVE = {
        LINEAR: "linear",
        EXPONENTIAL: "expoential",
    }

    static curveLinear(value, inMin, inMax, outMin, outMax) {
        return (value - inMin) / (inMax - inMin) * (outMax - outMin) + outMin
    }

    static curveExponential(value, inMin, inMax, outMin, outMax) {
        return Math.pow(outMax / outMin, (value - inMin) / (inMax - inMin)) * outMin;
    }

    static DEFAULTS = {
        attackDuration: 0.1,
        attackCurve: ADSREnvelope.CURVE.LINEAR,
        peakLevel: 1.0,
        decayDuration: 1.0,
        decayCurve: ADSREnvelope.CURVE.LINEAR,
        sustainDuration: Infinity,
        sustainLevel: 0.5,
        releaseDuration: 0.1,
        releaseCurve: ADSREnvelope.CURVE.LINEAR,
    }

    static getCurveByName(name) {
        switch (name) {
            case ADSREnvelope.CURVE.LINEAR:
                return ADSREnvelope.curveLinear;
            case ADSREnvelope.CURVE.EXPONENTIAL:
                return ADSREnvelope.curveExponential;
            default:
                throw new Error(`Unknown curve "${name}"`);
        }
    }

    constructor(options) {
        this.options = {...ADSREnvelope.DEFAULTS, ...options};
        const {
            attackDuration,
            attackCurve,
            peakLevel,
            decayDuration,
            decayCurve,
            sustainDuration,
            sustainLevel,
            releaseDuration,
            releaseCurve,
        } = this.options;
        this.attack = {
            duration: attackDuration,
            targetLevel: peakLevel,
            curve: ADSREnvelope.getCurveByName(attackCurve)
        };
        this.decay = {
            duration: decayDuration,
            targetLevel: sustainLevel,
            curve: ADSREnvelope.getCurveByName(decayCurve)
        };
        this.release = {duration: releaseDuration, targetLevel: 0, curve: ADSREnvelope.getCurveByName(releaseCurve)};
        this.gateDuration = attackDuration + decayDuration + sustainDuration;
    }

    _valueAtADS(elapsedTime) {
        if (elapsedTime <= 0.0) {
            // Note did not yet start
            return 0.0;
        }

        // Determine the volume level at releaseTime
        let timeInSection = elapsedTime;
        let sourceLevel = 0.0;
        for (let {duration, targetLevel, curve} of [this.attack, this.decay]) {
            if (timeInSection <= duration) {
                // The current section is the one we have to apply the curve to
                return curve(timeInSection, 0, duration, sourceLevel, targetLevel);
            }
            timeInSection -= duration;
            sourceLevel = targetLevel;
        }
        return this.options.sustainLevel;
    }

    _valueAtR(elapsedTimeSinceRelease, levelAtReleaseTime) {
        const {duration, targetLevel, curve} = this.release;
        if (elapsedTimeSinceRelease < duration) {
            return curve(elapsedTimeSinceRelease, 0, duration, levelAtReleaseTime, targetLevel);
        }
        return targetLevel;
    }

    _minReleaseTime(releaseTime = Infinity) {
        return Math.min(releaseTime, this.gateDuration);
    }

    valueAt(elapsedTime, releaseTime = Infinity) {
        if (elapsedTime <= 0.0) {
            // Note did not yet start
            return 0.0;
        }

        releaseTime = this._minReleaseTime(releaseTime);

        if (elapsedTime < releaseTime) {
            // Note has not yet been released
            return this._valueAtADS(elapsedTime);
        }

        const timeInReleaseSection = elapsedTime - releaseTime;
        const levelAtReleaseTime = this._valueAtADS(releaseTime);
        return this._valueAtR(timeInReleaseSection, levelAtReleaseTime);
    }

    isOver(elapsedTime, releaseTime = Infinity) {
        releaseTime = this._minReleaseTime(releaseTime);
        const timeInReleaseSection = elapsedTime - releaseTime;
        const {duration} = this.release;
        return timeInReleaseSection > duration;
    }
}

class Note {
    constructor(midiNote, midiVelocity, envelope) {
        this.midiNote = midiNote;
        this.midiVelocity = midiVelocity;
        this.envelope = envelope;
        this.startTime = performance.now() / 1000.0;
        this.releaseTime = Infinity;
        this.holdState = false;
        this.sustainState = false;
        this.shouldRelease = false;
    }

    elapsedTime() {
        return performance.now() / 1000.0 - this.startTime;
    }

    sustain(enable) {
        if (!enable && this.sustainState && this.shouldRelease && !this.isHeld() && !this.isOff()) {
            this.forceOff();
        }
        this.holdState = enable;
    }

    isSustained() {
        return this.sustainState;
    }

    hold(enable) {
        if (!enable && this.holdState && this.shouldRelease && !this.isSustained() && !this.isOff()) {
            this.forceOff();
        }
        this.holdState = enable;
    }

    isHeld() {
        return this.holdState;
    }

    isOff() {
        return this.releaseTime !== Infinity;
    }

    off() {
        this.shouldRelease = true;
        if (!this.isSustained() && !this.isHeld() && !this.isOff()) {
            this.forceOff();
        }
    }

    forceOff() {
        this.releaseTime = this.elapsedTime();
    }

    getVolume() {
        return (this.midiVelocity / 127.0) * this.envelope.valueAt(this.elapsedTime());
    }

    isOver() {
        return this.envelope.isOver(this.elapsedTime(), this.releaseTime);
    }
}

const adsr = new ADSREnvelope({
    "attackTime": 0.01,
    "decayTime": 2,
    "sustainDuration": 0,
    "sustainLevel": 0.4,
    "releaseTime": 0.7,
    "attackCurve": ADSREnvelope.CURVE.LINEAR,
    "decayCurve": ADSREnvelope.CURVE.EXPONENTIAL,
    "releaseCurve": ADSREnvelope.CURVE.EXPONENTIAL,
});

const channelEnvelopes = Array(16).fill(adsr);

class NoteEnvelopeSplash {
    static secondsPerRotation = 10;

    constructor(midiNote, midiVelocity, envelope) {
        this.note = new Note(midiNote, midiVelocity, envelope);
        this.angleOffset = performance.now() * 0.001 * 2 * Math.PI / NoteEnvelopeSplash.secondsPerRotation;

        this.color = generateColor();
        this.color.r *= 10;
        this.color.g *= 10;
        this.color.b *= 10;

        this.lastCoords = this.getPointerCoordinates();
        this.update();
    }

    getInterpolationParameter() {
        const t = this.note.elapsedTime();
        const speed = this.note.midiVelocity / 127.0;
        return 1.0 / Math.pow(-1.0 - speed * t, 2.0) + 1.0;
    }

    getPointerCoordinates() {
        const radius = config.RADIUS;
        const splatRadius = Math.max(0.1, config.SPLAT_RADIUS) * 0.5;
        const center = new Victor(0.5, 0.5);

        const dir = new Victor(1, 0).rotate(this.angleOffset + 2 * Math.PI * this.note.midiNote / 12);
        const start = center.clone().add(dir.clone().multiplyScalar(radius - splatRadius));
        const end = center;

        const t = this.getInterpolationParameter();
        const p = start.clone().mix(end, t);
        return p;
    }

    update() {
        const volume = this.note.getVolume();
        const factor = 100000.0 * volume;
        const p = this.getPointerCoordinates();
        const d = p.clone().subtract(this.lastCoords).multiply(new Victor(factor, factor));
        const attenuation = 40.0;
        const radius = config.SPLAT_RADIUS * (1.0 - Math.pow(1.0 - volume, 8.0));
        splat(p.x, p.y, d.x, d.y, this.color, attenuation, radius);
        this.lastCoords = p;
    }
}

const channelNoteSplashLists = new Array(16).fill(null).map(() => []);
const channelHold = new Array(16).fill(false);

function setHold(midiChannel, midiControllerValue) {
    const hold = midiControllerValue >= 64;
    channelHold[midiChannel] = hold;
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.hold(hold));
}

function setSostenuto(midiChannel, midiControllerValue) {
    const sostenuto = midiControllerValue >= 64;
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.sustain(sostenuto));
}

function allSoundsOff(midiChannel) {
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.forceOff());
}

function allNotesOff(midiChannel) {
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.off());
}

function allControllersOff(midiChannel) {
    channelHold[midiChannel] = false;
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.hold(false));
    channelNoteSplashLists[midiChannel].forEach(ns => ns.note.sustain(false));
}

function releaseADSRNoteSplash(midiChannel, midiNote, force = false) {
    const noteSplashList = channelNoteSplashLists[midiChannel];
    const turnOff = force ? (note) => note.forceOff() : (note) => note.off();
    noteSplashList.map(({note}) => note).filter((note) => note.midiNote === midiNote).forEach(turnOff);
}

function addADSRNoteSplash(midiChannel, midiNote, midiVelocity) {
    releaseADSRNoteSplash(midiChannel, midiNote, true);

    const noteSplashList = channelNoteSplashLists[midiChannel];
    const adsr = channelEnvelopes[midiChannel];
    const noteSplash = new NoteEnvelopeSplash(midiNote, midiVelocity, adsr);
    noteSplash.note.hold(channelHold[midiChannel]);

    noteSplashList.push(noteSplash);
}

function updateADSRNoteSplashes() {
    channelNoteSplashLists.forEach((noteSplashList, channel) => {
        let i = noteSplashList.length;
        while (i--) {
            const noteSplash = noteSplashList[i];
            noteSplash.update();
            if (noteSplash.note.isOver()) {
                noteSplashList.splice(i, 1);
            }
        }
    });
}

function addNoteLineSplash(midiNote, midiVelocity) {
    const radius = config.RADIUS * Math.min(canvas.width, canvas.height);

    const secondsPerRotation = 10;
    const angleOffset = performance.now() * 0.001 * 2 * Math.PI / secondsPerRotation;

    const center = new Victor(canvas.width / 2, canvas.height / 2);
    const dir = new Victor(1, 0).rotate(angleOffset + 2 * Math.PI * midiNote / 12);
    const s = 1.0 - config.SPLAT_RADIUS;
    const start = center.clone().add(dir.clone().multiplyScalar(s * radius));
    const end = center.clone().add(dir.clone().multiplyScalar(s * 0.5 * radius));

    const line = {
        p0: start,
        p1: end,
    }

    const duration = 1000 * midiVelocity / 127;

    const lineSplash = addLineSplash(line, duration);
    return {lineSplash, duration};
}

function parseMidiChannelMask(mask) {
    if (!/^[01]{16}$/.test(mask)) {
        console.error(`MIDI channel mask "${mask}" has invalid format. It must be 16 characters being either '0' or '1'. Channel 1 corresponds to the rightmost bit.`);
    }
    return Number.parseInt(mask, 2);
}

const searchParams = new URLSearchParams(window.location.search);
const midiPortNames = searchParams.getAll('midiPort');
const midiChannelMask = parseMidiChannelMask(searchParams.get('midiChannelMask') ?? "1111111111111111");

function useChannel(midiChannel) {
    const midiChannelBit = 0b1 << midiChannel;
    return midiChannelMask & midiChannelBit !== 0b0;
}

async function connectMidi() {
    const midiAccess = await navigator.requestMIDIAccess();
    const midiPortFilterPredicate = ({name}) => midiPortNames.indexOf(name) !== -1;
    const midiPorts = [...midiAccess.inputs.values()].filter(midiPortFilterPredicate);
    await Promise.all(midiPorts.map(m => m.open()));
    midiPorts.forEach(m => m.onmidimessage = handleMidiMessage);
}

connectMidi().then();

const controllerFuncMap = {
    64: setHold,
    66: setSostenuto,
    120: allSoundsOff,
    123: allNotesOff,
    127: allControllersOff,
};

function handleMidiControlChangeMessage(midiChannel, midiController, midiControllerValue) {
    const controllerFunc = controllerFuncMap[midiController] ?? (() => undefined);
    controllerFunc(midiChannel, midiControllerValue);
}

function noteOff(channel, note) {
    releaseADSRNoteSplash(channel, note);
}

function noteOn(channel, note, velocity) {
    addADSRNoteSplash(channel, note, velocity);
}

function controlChange(channel, controller, value) {
    handleMidiControlChangeMessage(channel, controller, value);
}

const channelMessageFuncMap = {
    0b000: noteOff,
    0b001: noteOn,
    0b011: controlChange,
}

function handleMidiChannelMessage(subtype, channel, ...data) {
    if(!useChannel(channel))
        return;

    const func = channelMessageFuncMap[subtype] ?? (() => undefined);
    func(channel, ...data);
}

function reset() {
    for (let channel = 0; channel < 16; channel += 1) {
        allControllersOff(channel);
        allSoundsOff(channel);
    }
}

const systemMessageFuncMap = {
    0b1111: reset,
}

function handleMidiSystemMessage(subtype, ...data) {
    const func = systemMessageFuncMap[subtype] ?? (() => undefined);
    func(...data);
}

function handleMidiMessage(event) {
    const status = event.data[0];
    const type = status >> 4;
    if (0b1000 <= type && type <= 0b1110) {
        // MIDI channel message
        const subtype = type & 0b0111;
        const channel = status & 0b00001111;
        handleMidiChannelMessage(subtype, channel, ...event.data.subarray(1));
    } else {
        // MIDI system message
        const subtype = status & 0b00001111;
        handleMidiSystemMessage(subtype, ...event.data.subarray(1))
    }
}

function animateSplashes(timeMs) {
    lineSplashTweenGroup.update(timeMs);
    requestAnimationFrame(animateSplashes);
    updateADSRNoteSplashes();
}
animateSplashes();
