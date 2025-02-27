#version 300 es

precision mediump float;
precision mediump sampler2D;
out vec4 fragColor;

in highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;

void main() {
  fragColor = value * texture(uTexture, vUv);
}
