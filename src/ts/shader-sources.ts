import baseVertexShaderSource from '../glsl/base.vert';
import blurVertexShaderSource from '../glsl/blur.vert';

import blurFragmentShaderSource from '../glsl/blur.frag';
import copyFragmentShaderSource from '../glsl/copy.frag';
import clearFragmentShaderSource from '../glsl/clear.frag';
import colorFragmentShaderSource from '../glsl/color.frag';
import checkerboardFragmentShaderSource from '../glsl/checkerboard.frag';
import displayFragmentShaderSource from '../glsl/display.frag';
import bloomPrefilterFragmentShaderSource from '../glsl/bloom-prefilter.frag';
import bloomBlurFragmentShaderSource from '../glsl/bloom-blur.frag';
import bloomFinalFragmentShaderSource from '../glsl/bloom-final.frag';
import sunrayMaskFragmentShaderSource from '../glsl/sunray-mask.frag';
import sunrayFragmentShaderSource from '../glsl/sunray.frag';
import splatFragmentShaderSource from '../glsl/splat.frag';
import advectionFragmentShaderSource from '../glsl/advection.frag';
import divergenceFragmentShaderSource from '../glsl/divergence.frag';
import curlFragmentShaderSource from '../glsl/curl.frag';
import vorticityFragmentShaderSource from '../glsl/vorticity.frag';
import pressureFragmentShaderSource from '../glsl/pressure.frag';
import gradientSubtractFragmentShaderSource from '../glsl/gradient-subtract.frag';

const sources = {
  vertex: { base: baseVertexShaderSource, blur: blurVertexShaderSource },
  fragment: {
    blur: blurFragmentShaderSource,
    copy: copyFragmentShaderSource,
    clear: clearFragmentShaderSource,
    color: colorFragmentShaderSource,
    checkerboard: checkerboardFragmentShaderSource,
    display: displayFragmentShaderSource,
    bloomPrefilter: bloomPrefilterFragmentShaderSource,
    bloomBlur: bloomBlurFragmentShaderSource,
    bloomFinal: bloomFinalFragmentShaderSource,
    sunrayMask: sunrayMaskFragmentShaderSource,
    sunray: sunrayFragmentShaderSource,
    splat: splatFragmentShaderSource,
    advection: advectionFragmentShaderSource,
    divergence: divergenceFragmentShaderSource,
    curl: curlFragmentShaderSource,
    vorticity: vorticityFragmentShaderSource,
    pressure: pressureFragmentShaderSource,
    gradientSubtract: gradientSubtractFragmentShaderSource,
  },
};

export default sources;
