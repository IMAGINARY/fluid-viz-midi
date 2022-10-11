#version 300 es

precision mediump float;
precision mediump sampler2D;
out vec4 fragColor;

in highp vec2 vUv;
in highp vec2 vL;
in highp vec2 vR;
in highp vec2 vT;
in highp vec2 vB;
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
  return clamp(r, 0.0, 1.0);
}

void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);

  vec2 center = vec2(0.5, 0.5);
  float dist = length(vUv - center);
  velocity = mix(velocity, center - vUv, easeIn(dist / radius));

  fragColor = vec4(velocity, 0.0, 1.0);
}
