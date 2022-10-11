#version 300 es

precision highp float;

in vec2 aPosition;

out vec2 vUv;
out vec2 vL;
out vec2 vR;

uniform vec2 texelSize;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  float offset = 1.33333333;
  vL = vUv - texelSize * offset;
  vR = vUv + texelSize * offset;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
