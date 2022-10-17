#version 300 es

precision highp float;
precision highp sampler2D;
out vec4 fragColor;

in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;

struct Splat {
  vec3 color;
  float radius;
  vec2 point;
  float attenuation;
};

uniform uint numSplats;

/**
 * Define MAX_NUM_SPLATS as a prepreocessor macro before compiling the shader.
 * The default value of 64 should work on all WebGL 2 platforms.
 */
#ifndef MAX_NUM_SPLATS
#define MAX_NUM_SPLATS (64)
#endif

uniform Splat splats[MAX_NUM_SPLATS];

void main() {
  vec3 combinedSplat = vec3(0.0, 0.0, 0.0);
  for (uint i = 0u; i < numSplats; i += 1u) {
    vec2 p = vUv - splats[i].point.xy;
    p.x *= aspectRatio;
    combinedSplat +=
      exp(-dot(p, p) / splats[i].radius) *
      splats[i].color /
      splats[i].attenuation;
  }
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + combinedSplat, 1.0);
}
