#version 300 es

precision highp float;
precision highp sampler2D;
out vec4 fragColor;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform sampler2D uSunrays;
uniform sampler2D uDithering;
uniform float radius;
uniform float fadeWidth;
uniform vec2 ditherScale;
uniform vec2 texelSize;

vec3 linearToGamma(vec3 color) {
  color = max(color, vec3(0));
  return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
}

void main() {
  vec3 c = texture(uTexture, vUv).rgb;

  #ifdef SHADING
  vec3 lc = texture(uTexture, vL).rgb;
  vec3 rc = texture(uTexture, vR).rgb;
  vec3 tc = texture(uTexture, vT).rgb;
  vec3 bc = texture(uTexture, vB).rgb;

  float dx = length(rc) - length(lc);
  float dy = length(tc) - length(bc);

  vec3 n = normalize(vec3(dx, dy, length(texelSize)));
  vec3 l = vec3(0.0, 0.0, 1.0);

  float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
  c *= diffuse;
  #endif

  #ifdef BLOOM
  vec3 bloom = texture(uBloom, vUv).rgb;
  #endif

  #ifdef SUNRAYS
  float sunrays = texture(uSunrays, vUv).r;
  c *= sunrays;
  #ifdef BLOOM
  bloom *= sunrays;
  #endif
  #endif

  #ifdef BLOOM
  float noise = texture(uDithering, vUv * ditherScale).r;
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
  fragColor = vec4(c, a);
}
