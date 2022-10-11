#version 300 es

precision mediump float;
precision mediump sampler2D;
out vec4 fragColor;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
uniform sampler2D uTexture;

void main() {
  vec4 sum = texture(uTexture, vUv) * 0.29411764;
  sum += texture(uTexture, vL) * 0.35294117;
  sum += texture(uTexture, vR) * 0.35294117;
  fragColor = sum;
}
