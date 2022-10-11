#version 300 es

precision highp float;
precision highp sampler2D;
out vec4 fragColor;

in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
uniform float radius;
uniform float fadeWidth;

vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;

  vec2 iuv = floor(st);
  vec2 fuv = fract(st);

  vec4 a = texture(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture(sam, (iuv + vec2(1.5, 1.5)) * tsize);

  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main() {
  vec2 center = vec2(0.5, 0.5);
  float dist = length(center - vUv);
  float t = clamp((dist - (radius - fadeWidth)) / fadeWidth, 0.0, 1.0);
  t = t * t * t;
  float fadedDissipation = dissipation * (1.0 - t) + 10.0 * t;

  #ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
  #else
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  #endif
  float decay = 1.0 + fadedDissipation * dt;
  fragColor = result / decay;
}
