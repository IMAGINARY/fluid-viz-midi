#version 300 es

precision highp float;
precision highp sampler2D;
out vec4 fragColor;

in vec2 vUv;
uniform sampler2D uTexture;
uniform float weight;

#define ITERATIONS (16)

void main() {
  float Density = 0.3;
  float Decay = 0.95;
  float Exposure = 0.7;

  vec2 coord = vUv;
  vec2 dir = vUv - 0.5;

  dir *= 1.0 / float(ITERATIONS) * Density;
  float illuminationDecay = 1.0;

  float color = texture(uTexture, vUv).a;

  for (int i = 0; i < ITERATIONS; i++) {
    coord -= dir;
    float col = texture(uTexture, coord).a;
    color += col * illuminationDecay * weight;
    illuminationDecay *= Decay;
  }

  fragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
}
