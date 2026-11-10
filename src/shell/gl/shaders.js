// GLSL for the cel engine. Lighting is done in display (gamma) space on purpose: a toon look is
// a set of flat authored colours, and "lit = the colour you typed" is what artists expect.

//
// Quality defines, prepended by the renderer (each has a default, so a shader also compiles bare):
//   LAMPS    0..8   how many point lights the fragment loop runs
//   PCF      0|1|4  shadow map taps (0 = no shadow lookups compiled in at all)
//   WATER_Q  0|1|2  0 full, 1 cheap (one stroke layer, no shadow, no lamps), 2 flat (bands and foam only)
//   CUTOUT          depth programs only: sample the material's texture and discard under its alpha cut
export const MAX_POINTS = 8;
export const MAX_FOAM = 16;
export const MAX_BONES = 32;

const COMMON_VS = `
precision highp float;
in vec3 aPos; in vec3 aNormal; in vec3 aONormal; in vec2 aUv; in vec4 aColor;
#ifdef INSTANCED
in mat4 aInst; in vec4 aInstColor;
#endif
#ifdef SKINNED
in float aBone; uniform mat4 uBones[${MAX_BONES}];
#endif
uniform mat4 uViewProj; uniform mat4 uView; uniform mat4 uProj; uniform mat4 uModel; uniform mat3 uNormalMat;
uniform vec4 uTint;
`;

const MODEL = `
#if defined(INSTANCED)
  mat4 model = uModel * aInst; mat3 nm = mat3(model);
  vec4 tint = uTint * aInstColor;
#elif defined(SKINNED)
  mat4 model = uBones[int(aBone + 0.5)]; mat3 nm = mat3(model);
  vec4 tint = uTint;
#else
  mat4 model = uModel; mat3 nm = uNormalMat;
  vec4 tint = uTint;
#endif
`;

const FOG = `
uniform vec3 uFogColor; uniform vec3 uFogParams; // density, max, start
vec3 applyFog(vec3 c, float dist, float amount) {
  float d = max(dist - uFogParams.z, 0.0) * uFogParams.x;
  float f = (1.0 - exp(-d * d)) * uFogParams.y * amount;
  return mix(c, uFogColor, f);
}
`;

const SHADOW = `
#ifndef PCF
#define PCF 4
#endif
uniform highp sampler2DShadow uShadowMap; uniform vec2 uShadowOn; // on, texel size in uv
float shadowAt(vec4 sc) {
#if PCF == 0
  return 1.0;
#else
  if (uShadowOn.x < 0.5) return 1.0;
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - 0.0012;
#if PCF >= 4
  // four hardware-filtered taps (a 3x3 tent in all), then squeezed back to a hard edge: the edge
  // stays crisp but its stair-steps are rounded off
  float o = uShadowOn.y * 0.75;
  float s = texture(uShadowMap, vec3(p.xy + vec2(-o, -o), z)) + texture(uShadowMap, vec3(p.xy + vec2(o, -o), z))
          + texture(uShadowMap, vec3(p.xy + vec2(-o, o), z)) + texture(uShadowMap, vec3(p.xy + vec2(o, o), z));
  return smoothstep(0.3, 0.7, s * 0.25);
#else
  // one hardware-filtered tap (2x2 bilinear compare), squeezed the same way: a slightly rougher edge for a quarter of the lookups
  return smoothstep(0.25, 0.75, texture(uShadowMap, vec3(p.xy, z)));
#endif
#endif
}
`;

const POINTS = `
#ifndef LAMPS
#define LAMPS ${MAX_POINTS}
#endif
uniform vec4 uPointPos[${MAX_POINTS}]; uniform vec4 uPointCol[${MAX_POINTS}]; uniform int uPointCount; // (xyz, radius) (rgb, intensity)
// Lantern light: two hard steps of falloff, and a hard terminator on the surface.
// Returns the blended lamp colour in rgb and how strongly the lamps reach this point (0..1) in a.
vec4 pointLights(vec3 P, vec3 N, float wrap) {
#if LAMPS > 0
  vec3 sum = vec3(0.0); float wsum = 0.0, miss = 1.0;
  for (int i = 0; i < LAMPS; i++) {
    if (i >= uPointCount) break;
    vec3 d = uPointPos[i].xyz - P; float dist = length(d);
    float x = 1.0 - dist / uPointPos[i].w;
    if (x <= 0.0) continue;
    float a = smoothstep(0.0, 0.025, x) * 0.4 + smoothstep(0.36, 0.385, x) * 0.6;
    float nd = smoothstep(-0.06 - wrap, 0.06 - wrap, dot(N, d / max(dist, 1e-4)));
    float w = clamp(a * nd * uPointCol[i].a, 0.0, 1.0);
    sum += uPointCol[i].rgb * w; wsum += w; miss *= 1.0 - w;
  }
  return vec4(sum / max(wsum, 1e-4), 1.0 - miss);
#else
  return vec4(0.0);
#endif
}
// A lamp does not add to what is there (that burns out to white in daylight): it pulls the surface
// toward "this colour, lit by the lamp", fully in the dark and only a little where the sun already is.
vec3 lampLit(vec3 col, vec3 base, vec4 pl) {
  vec3 lit = base * pl.rgb * 1.12 + pl.rgb * 0.04;
  float room = clamp(1.25 - dot(col, vec3(0.3, 0.55, 0.15)) / max(dot(lit, vec3(0.3, 0.55, 0.15)), 0.05), 0.22, 1.0);
  return mix(col, lit, pl.a * room);
}
`;

// ------------------------------------------------------------------------------------ toon

export const TOON_VS = COMMON_VS + `
uniform mat4 uShadowVP; uniform vec4 uUvRect; uniform float uShadowNormalBias; uniform vec3 uKeyDir;
out vec3 vWorld; out vec3 vNormal; out vec2 vUv; out vec4 vColor; out vec4 vShadow; out vec4 vTint;
void main() {
  ${MODEL}
  vec4 w = model * vec4(aPos, 1.0);
  vWorld = w.xyz; vNormal = normalize(nm * aNormal);
  vUv = aUv * uUvRect.zw + uUvRect.xy; vColor = aColor; vTint = tint;
  // push the lookup off the surface, further where the surface turns from the light: that is where a shadow map lies
  float turn = 1.0 - clamp(dot(vNormal, uKeyDir), 0.0, 1.0);
  vShadow = uShadowVP * vec4(w.xyz + vNormal * uShadowNormalBias * (1.0 + 2.5 * turn), 1.0);
  gl_Position = uViewProj * w;
}`;

export const TOON_FS = `
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec2 vUv; in vec4 vColor; in vec4 vShadow; in vec4 vTint;
out vec4 frag;
uniform vec3 uCamPos; uniform vec3 uKeyDir; uniform vec3 uKeyColor;
uniform vec3 uShadowTint; uniform vec2 uShadowLift; // lift, saturation
uniform float uLightUp;
uniform vec3 uAmbSky; uniform vec3 uAmbGround;
uniform vec3 uRimColor; uniform float uRimEdge;
uniform vec4 uBand;      // bands, edge, step between extra bands, softness
uniform vec4 uSpec;      // strength, size (cos threshold), unused, unused
uniform vec3 uSpecColor;
uniform vec4 uMat;       // rim amount, emissive, receive shadow, fog amount
uniform vec4 uMatShadow; // rgb override of the shadow tint, a = use it
uniform vec4 uMatKey;    // xyz = this material's own key direction (a character light), a = use it
uniform vec4 uFlash; uniform float uGlow; // per node: multiplies the per-vertex glow (0 puts a carried lantern out)
uniform sampler2D uMap; uniform int uTexMode; uniform float uAlphaCut;
${FOG}${SHADOW}${POINTS}
void main() {
  vec3 base = vColor.rgb * vTint.rgb; float alpha = vTint.a;
  // textures hold premultiplied colour (see createTexture)
  if (uTexMode == 1) { vec4 t = texture(uMap, vUv); base = base * (1.0 - t.a) + t.rgb * vTint.rgb; }
  else if (uTexMode == 2) { vec4 t = texture(uMap, vUv); base = t.rgb / max(t.a, 0.002) * vTint.rgb; alpha *= t.a; if (alpha < uAlphaCut) discard; }
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 toCam = uCamPos - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec3 K = mix(uKeyDir, uMatKey.xyz, uMatKey.a);
  float ndl = dot(N, normalize(mix(K, vec3(0.0, 1.0, 0.0), uLightUp)));
  float aa = fwidth(ndl) * 0.75 + uBand.w;
  float lit = 0.0; float steps = max(uBand.x - 1.0, 1.0);
  for (int i = 0; i < 4; i++) { if (float(i) >= steps) break; float e = uBand.y + float(i) * uBand.z; lit += smoothstep(e - aa, e + aa, ndl); }
  lit /= steps;
  float sh = uMat.z > 0.5 ? shadowAt(vShadow) : 1.0;
  lit = min(lit, sh);
  vec3 tintS = mix(uShadowTint, uMatShadow.rgb, uMatShadow.a);
  // shadow tone: the base colour seen through the tint, then re-saturated so it shifts hue instead of greying
  vec3 shade = base * tintS; shade = mix(vec3(dot(shade, vec3(0.3, 0.55, 0.15))), shade, uShadowLift.y); shade = max(mix(shade, tintS * 0.55, uShadowLift.x), 0.0);
  vec3 col = mix(shade, base * uKeyColor, lit);
  col += base * mix(uAmbGround, uAmbSky, smoothstep(-0.35, 0.35, N.y));
  col = lampLit(col, base, pointLights(vWorld, N, 0.0));
  // hard specular dot
  float ndh = dot(N, normalize(K + V));
  float sa = fwidth(ndh) * 0.75 + 0.002;
  col = mix(col, uSpecColor, smoothstep(uSpec.y - sa, uSpec.y + sa, ndh) * uSpec.x * lit);
  // rim: a bright edge where the surface turns away from the eye, on the side the key light reaches
  float fres = 1.0 - max(dot(N, V), 0.0);
  float ra = fwidth(fres) * 0.75 + 0.01;
  float rim = smoothstep(uRimEdge - ra, uRimEdge + ra, fres) * smoothstep(0.0, 0.1, dot(N, uKeyDir)) * uMat.x; // the rim always comes from the scene's real key
  col = mix(col, max(col, base * 0.4 + uRimColor), rim * min(1.0, length(uRimColor) * 2.0));
  float glow = clamp(vColor.a * uGlow + uMat.y, 0.0, 1.0);
  col = mix(col, base, glow);
  col = mix(col, uFlash.rgb, uFlash.a);
  col = applyFog(col, dist, uMat.w);
  frag = vec4(col, alpha);
}`;

// ------------------------------------------------------------------------------------ outline

export const OUTLINE_VS = COMMON_VS + `
uniform vec4 uOutline; // width in device px, pixel scale (world units per px at depth 1), reference depth, unused
out vec3 vColor; out float vDist;
void main() {
  ${MODEL}
  vec4 view = uView * (model * vec4(aPos, 1.0));
  float w = length(aONormal);
  vec3 vn = mat3(uView) * normalize(nm * (aONormal / max(w, 1e-5)));
  float depth = max(-view.z, 0.01);
  // constant width on screen, thinning (never below 40%) for things far beyond the reference depth
  float s = clamp(uOutline.z / depth, 0.4, 1.3);
  float l = length(vn.xy);
  vec2 dir = vn.xy / max(l, 0.45);
  view.xy += dir * (w * uOutline.x * uOutline.y * depth * s);
  view.z -= 0.0005 * depth;
  vColor = aColor.rgb * tint.rgb; vDist = depth;
  gl_Position = uProj * view;
}`;

export const OUTLINE_FS = `
precision highp float;
in vec3 vColor; in float vDist; out vec4 frag;
uniform vec4 uOutlineColor; // rgb, a = how much of the surface's own (darkened) colour to use
${FOG}
void main() {
  vec3 self = vColor * vColor * 0.42 + uOutlineColor.rgb * 0.18;
  vec3 col = mix(uOutlineColor.rgb, self, uOutlineColor.a);
  frag = vec4(applyFog(col, vDist, 1.0), 1.0);
}`;

// ------------------------------------------------------------------------------------ shadow depth

export const DEPTH_VS = COMMON_VS + `
#ifdef CUTOUT
uniform vec4 uUvRect; out vec2 vUv;
#endif
void main() {
  ${MODEL}
#ifdef CUTOUT
  vUv = aUv * uUvRect.zw + uUvRect.xy;
#endif
  gl_Position = uViewProj * (model * vec4(aPos, 1.0));
}`;
// A cutout material casts the shadow of its picture, not of the card it is painted on.
export const DEPTH_FS = `precision highp float;
#ifdef CUTOUT
in vec2 vUv; uniform sampler2D uMap; uniform float uAlphaCut;
void main() { if (texture(uMap, vUv).a < uAlphaCut) discard; }
#else
void main() {}
#endif
`;

// ------------------------------------------------------------------------------------ beam (additive meshes)

export const BEAM_VS = COMMON_VS + `
out vec3 vWorld; out vec3 vNormal; out vec2 vUv; out vec4 vColor;
void main() {
  ${MODEL}
  vec4 w = model * vec4(aPos, 1.0);
  vWorld = w.xyz; vNormal = normalize(nm * aNormal); vUv = aUv; vColor = vec4(aColor.rgb, 1.0) * tint;
  gl_Position = uViewProj * w;
}`;
export const BEAM_FS = `
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec2 vUv; in vec4 vColor; out vec4 frag;
uniform vec3 uCamPos; uniform vec4 uBeam; // edge power, opacity at v = 0, opacity at v = 1, steps
void main() {
  vec3 V = normalize(uCamPos - vWorld);
  float ndv = abs(dot(normalize(vNormal), V));
  float a = pow(ndv, uBeam.x) * mix(uBeam.y, uBeam.z, vUv.y) * vColor.a;
  if (uBeam.w > 0.5) a = floor(a * uBeam.w + 0.5) / uBeam.w;
  frag = vec4(vColor.rgb * a, 0.0);
}`;

// ------------------------------------------------------------------------------------ sky

export const SKY_VS = `
precision highp float;
in vec3 aPos; uniform mat4 uInvViewProj; out vec3 vFar;
void main() {
  vec4 f = uInvViewProj * vec4(aPos.xy, 1.0, 1.0);
  vFar = f.xyz / f.w;
  gl_Position = vec4(aPos.xy, 1.0, 1.0);
}`;
export const SKY_FS = `
precision highp float;
in vec3 vFar; out vec4 frag;
uniform vec3 uCamPos; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec4 uSkyMid; // rgb, a = where it sits 0..1
uniform vec4 uGlow;     // rgb, a = amount: the warm band low on the horizon under the sun
uniform vec3 uSunDir; uniform vec4 uSunColor; // rgb, a = angular radius (radians)
uniform vec4 uSunHalo;  // rgb, a = strength
uniform vec4 uMoon;     // phase cut 0..1, unused, unused, 1 = draw as a moon
uniform vec2 uStars;    // amount, time
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec3 d = normalize(vFar - uCamPos);
  float h = d.y;
  float ht = pow(max(h, 0.0), 0.75);
  vec3 col = ht < uSkyMid.a ? mix(uHorizon, uSkyMid.rgb, smoothstep(0.0, uSkyMid.a, ht)) : mix(uSkyMid.rgb, uZenith, smoothstep(uSkyMid.a, 1.0, ht));
  float az = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSunDir.xz + vec2(1e-5))), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.2, abs(h));
  col = mix(col, uGlow.rgb, low * (0.3 + 0.7 * az * az) * uGlow.a);
  col = mix(col, uBelow, smoothstep(0.0, -0.06, h));
  float ang = acos(clamp(dot(d, uSunDir), -1.0, 1.0)); float r = uSunColor.a; float aa = fwidth(ang) * 1.2;
  // stars sit behind the halo
  if (uStars.x > 0.0 && h > 0.0) {
    vec2 g = d.xz / (h + 0.35) * 26.0; vec2 c = floor(g); float rnd = hash(c);
    vec2 o = fract(g) - 0.5 - (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5) * 0.7;
    float tw = 0.65 + 0.35 * sin(uStars.y * (1.0 + rnd * 2.5) + rnd * 60.0);
    float sz = 0.035 + 0.06 * fract(rnd * 17.0);
    float star = (1.0 - smoothstep(sz * 0.6, sz, abs(o.x) + abs(o.y))) * step(0.82, rnd) * tw;
    col += vec3(1.0, 0.97, 0.86) * star * uStars.x * smoothstep(0.02, 0.2, h);
  }
  // the halo: a tight warm collar and a wide soft bloom, both falling away smoothly (three hard discs
  // read as a target), with a slow shimmer of rays so it is drawn rather than computed
  float out_ = max(ang - r, 0.0) / r;
  vec3 sideH = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0))); vec3 upH = cross(sideH, uSunDir);
  float spoke = atan(dot(d, upH), dot(d, sideH));
  float rays = 0.5 + 0.5 * sin(spoke * 12.0 + uStars.y * 0.35) * sin(spoke * 5.0 - uStars.y * 0.21);
  float halo = 0.62 * exp(-out_ * 2.6) + 0.3 * exp(-out_ * 0.62) * (0.8 + 0.2 * rays) + 0.12 * exp(-out_ * 0.2);
  col += uSunHalo.rgb * halo * uSunHalo.a;
  float disc = 1.0 - smoothstep(r - aa, r + aa, ang);
  if (uMoon.w > 0.5) {
    // a crescent: cut the disc with a second one offset to the side
    vec3 side = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
    vec3 c2 = normalize(uSunDir + (side * 0.8 + vec3(0.0, 0.35, 0.0)) * r * uMoon.x);
    float a2 = acos(clamp(dot(d, c2), -1.0, 1.0));
    disc *= smoothstep(r * 0.92 - aa, r * 0.92 + aa, a2);
  }
  col = mix(col, uSunColor.rgb, disc);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------------------------ water

export const WATER_VS = `
precision highp float;
in vec3 aPos; uniform mat4 uViewProj; uniform mat4 uShadowVP; uniform vec4 uWaterXform; // centre x, level, centre z, half size
out vec3 vWorld; out vec4 vShadow;
void main() {
  vec3 w = vec3(aPos.x * uWaterXform.w + uWaterXform.x, uWaterXform.y, aPos.z * uWaterXform.w + uWaterXform.z);
  vWorld = w; vShadow = uShadowVP * vec4(w, 1.0);
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
export const WATER_FS = `
precision highp float;
#ifndef WATER_Q
#define WATER_Q 0
#endif
in vec3 vWorld; in vec4 vShadow; out vec4 frag;
uniform vec3 uCamPos; uniform vec3 uKeyDir; uniform vec3 uKeyColor; uniform vec3 uShadowTint;
uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uFoamColor; uniform vec4 uGlint; // rgb, a = density
uniform vec4 uFoam[${MAX_FOAM}]; uniform int uFoamCount; uniform float uTime; uniform vec2 uDrift;
uniform vec4 uShoreBox; uniform vec2 uShoreBoxR; // centre x, centre z, half x, half z; corner radius, band width (0 = no box)
${FOG}${SHADOW}${POINTS}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// Lens-shaped white strokes in drifting rows: the highlights of a drawn sea.
float dashes(vec2 p, float scale, float density, float t) {
  vec2 q = p * vec2(0.5, 0.72) * scale;
  q.x += sin(q.y * 0.83 + t * 0.4) * 0.45;
  vec2 c = floor(q); float rnd = hash(c);
  q.x += (rnd - 0.5) * 0.9 + sin(t * 0.3 + rnd * 20.0) * 0.18; c = floor(q); rnd = hash(c + 0.37);
  vec2 f = fract(q) - 0.5;
  float life = 0.5 + 0.5 * sin(t * (0.5 + rnd * 0.9) + rnd * 50.0);
  float on = step(1.0 - density, rnd);
  float len = 0.24 + 0.2 * fract(rnd * 13.0);
  float lens = max(1.0 - (f.x * f.x) / (len * len), 0.0);
  float th = 0.2 * lens * life;
  float y = abs(f.y + sin(f.x * 6.0 + rnd * 9.0) * 0.06);
  float aa = fwidth(q.y) * 0.9;
  return on * (1.0 - smoothstep(th - aa, th + aa, y)) * step(0.02, th);
}
void main() {
  vec2 p = vWorld.xz; vec3 toCam = uCamPos - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  float t = uTime;
  // distance to the nearest shore (circles, and one rounded box: a quay, a cabinet), wobbled so it reads as drawn
  float dmin = 1e5; vec2 near = vec2(0.0);
  for (int i = 0; i < ${MAX_FOAM}; i++) {
    if (i >= uFoamCount) break;
    vec2 o = p - uFoam[i].xy; float d = (length(o) - uFoam[i].z) / max(uFoam[i].w, 0.01);
    if (d < dmin) { dmin = d; near = o; }
  }
  if (uShoreBoxR.y > 0.0) {
    vec2 o = p - uShoreBox.xy; vec2 q = abs(o) - uShoreBox.zw + uShoreBoxR.x;
    float d = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uShoreBoxR.x) / uShoreBoxR.y;
    // scallops along the straight sides: the foam leaves a quay in a row of arcs, not as a ruled line
    float along = q.x > q.y ? o.y : o.x;
    d -= abs(sin(along * 2.9 + 0.6)) * 1.25 * (1.0 - smoothstep(0.0, uShoreBoxR.x, min(q.x, q.y) + uShoreBoxR.x)) * (1.0 - smoothstep(0.6, 2.4, d));
    if (d < dmin) { dmin = d; near = o; }
  }
  float ang = atan(near.y, near.x);
  float wob = sin(ang * 5.0 + t * 0.7) * 0.07 + sin(ang * 11.0 - t * 0.45) * 0.045;
#if WATER_Q == 0
  wob += (vnoise(p * 0.9 + t * 0.1) - 0.5) * 0.22;
#else
  wob += sin(p.x * 2.3 + t * 0.6) * sin(p.y * 1.9 - t * 0.4) * 0.09;
#endif
  float d = dmin + wob;
  float e = fwidth(d) * 1.0 + 0.004;
  vec3 col = uDeep;
#if WATER_Q == 0
  // big slow patches of slightly different blue, so open water is not one flat fill
  float sw = vnoise(p * 0.035 + uDrift * t * 0.5) + 0.5 * vnoise(p * 0.09 - uDrift * t * 0.3);
  col = mix(uDeep, mix(uDeep, uMid, 0.55), smoothstep(0.78, 0.8, sw));
#endif
  col = mix(col, uMid, 1.0 - smoothstep(2.3 - e, 2.3 + e, d));
  col = mix(col, uShallow, 1.0 - smoothstep(0.95 - e, 0.95 + e, d));
#if WATER_Q == 0
  // key light: shadow on the water takes the shadow tint
  float sh = shadowAt(vShadow);
  col = mix(col * mix(vec3(1.0), uShadowTint, 0.75), col * mix(vec3(1.0), uKeyColor, 0.6), sh);
#else
  float sh = 1.0;
  col *= mix(vec3(1.0), uKeyColor, 0.6);
#endif
#if WATER_Q < 2
  // strokes: more of them in the sun's reflection
  vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
  float sunLobe = pow(max(dot(normalize(R * vec3(1.0, 0.35, 1.0)), normalize(uKeyDir * vec3(1.0, 0.35, 1.0))), 0.0), 14.0);
  float dens = uGlint.a * (0.6 + 0.4 * sh) + sunLobe * 0.7;
  vec2 pd = p + uDrift * t;
  float g = dashes(pd, 1.0, dens, t) * (1.0 - smoothstep(40.0, 85.0, dist));
#if WATER_Q == 0
  float fade = 1.0 - smoothstep(60.0, 150.0, dist);
  g += dashes(pd + 31.7, 0.33, dens, t * 0.7) * smoothstep(35.0, 70.0, dist) * fade;
#endif
  g *= smoothstep(0.5, 0.9, d);
  col = mix(col, uGlint.rgb, g * (0.75 + 0.25 * sh));
#endif
  // foam: a solid lapping edge and broken rings travelling outward
  float lap = 0.2 + 0.1 * sin(t * 1.1 + ang * 3.0);
  float foam = 1.0 - smoothstep(lap - e, lap + e, d);
#if WATER_Q < 2
  float ph = d * 1.25 - t * 0.28; float ring = abs(fract(ph) - 0.5);
  float rw = 0.11 * (1.0 - smoothstep(0.4, 2.6, d));
  float broken = step(0.1, sin(ang * 9.0 + floor(ph) * 2.4 + sin(ang * 3.0) * 2.0));
  foam = max(foam, (1.0 - smoothstep(rw - e, rw + e, ring)) * broken * step(lap, d) * step(0.02, rw));
#endif
  col = mix(col, uFoamColor * mix(uShadowTint * 1.15, vec3(1.0), sh), foam);
#if WATER_Q == 0
  // lantern light pools on the water, stretched toward the eye like a reflection
  vec4 pl = pointLights(vWorld, vec3(0.0, 1.0, 0.0), 0.3);
  col += pl.rgb * pl.a * (0.16 + 0.34 * col);
#endif
  frag = vec4(applyFog(col, dist, 1.0), 1.0);
}`;

// ------------------------------------------------------------------------------------ sprites

export const SPRITE_VS = `
precision highp float;
in vec2 aCorner; in vec4 iA; in vec4 iB; in vec4 iC; in vec4 iD; // (pos, kind) (w, h, rot, phase) (rgba) (uv rect, textured kinds)
uniform mat4 uViewProj; uniform vec3 uCamRight; uniform vec3 uCamUp; uniform vec3 uCamPos;
out vec2 vP; out vec4 vColor; out float vKind; out float vPhase; out vec2 vUv;
void main() {
  float cs = cos(iB.z), sn = sin(iB.z);
  vec2 sc = aCorner * iB.xy * 0.5;                                          // size first, then turn: a long sprite stays a rectangle
  vec2 r = vec2(sc.x * cs - sc.y * sn, sc.x * sn + sc.y * cs);
  vec3 w;
  if ((iA.w > 3.5 && iA.w < 4.5) || (iA.w > 6.5 && iA.w < 7.5)) w = iA.xyz + vec3(r.x, 0.0, r.y);   // rings and shades lie on the ground
  else {
    w = iA.xyz + uCamRight * r.x + uCamUp * r.y;
    if (iA.w < 1.5) w += normalize(uCamPos - iA.xyz) * iB.x * 0.2;          // glows sit in front of their lamp
  }
  vP = aCorner; vColor = iC; vKind = iA.w; vPhase = iB.w;
  vUv = iD.xy + (aCorner * vec2(0.5, -0.5) + 0.5) * iD.zw;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;
export const SPRITE_FS = `
precision highp float;
in vec2 vP; in vec4 vColor; in float vKind; in float vPhase; in vec2 vUv; out vec4 frag;
uniform vec2 uLight2; uniform vec3 uShadowTint; uniform vec3 uInk; uniform sampler2D uSpriteMap;
// distance to a stroke segment a -> b, and how far along it (0..1) in y
vec2 segD(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return vec2(length(p - a - ab * h), h); }
void main() {
  vec2 p = vP; float r = length(p); float e = fwidth(r) * 1.2;
  vec4 o = vec4(0.0);
  if (vKind < 0.5) {            // 0 glow: stepped halo, additive
    float a = pow(max(1.0 - r, 0.0), 2.2) * 0.62 + (1.0 - smoothstep(0.46, 0.56, r)) * 0.07 + (1.0 - smoothstep(0.2 - e, 0.22 + e, r)) * 0.3;
    o = vec4(vColor.rgb * a * vColor.a, 0.0);
  } else if (vKind < 1.5) {     // 1 sparkle: four-point star, additive
    float d = sqrt(abs(p.x)) + sqrt(abs(p.y));
    float a = 1.0 - smoothstep(0.8, 1.0, d);
    o = vec4(vColor.rgb * a * vColor.a, 0.0);
  } else if (vKind < 2.5) {     // 2 puff: a toon ball with a shadow crescent and an ink edge
    float body = 1.0 - smoothstep(0.92 - e, 0.92, r);
    float inner = 1.0 - smoothstep(0.78 - e, 0.78, r);
    float lit = smoothstep(0.80 - e, 0.80 + e, 1.62 - length(p - uLight2 * 0.42) );
    vec3 c = mix(vColor.rgb * uShadowTint, vColor.rgb, lit);
    c = mix(uInk, c, inner);
    o = vec4(c, 1.0) * body * vColor.a;
  } else if (vKind < 3.5) {     // 3 curl: a brush stroke of wind. It runs in from the left, loops once and winds up,
    // drawn as a window travelling along the path: a round fat head, a tail that thins to a point, and a
    // short second stroke riding under the run-in so it reads as a gust and not as a wire.
    const float R = 0.46, SPAN = 8.6, T0 = -1.570796; const float B = 0.36 / SPAN;
    vec2 c = vec2(0.42, 0.1); vec2 q = p - c; float rho = length(q), phi = atan(q.y, q.x);
    float est = T0 + (R - rho) / B;
    float th = clamp(phi + 6.2831853 * floor((est - phi) / 6.2831853 + 0.5), T0, T0 + SPAN);
    float rs = R - B * (th - T0);
    float dS = length(q - rs * vec2(cos(th), sin(th))); float sS = 0.4 + 0.6 * (th - T0) / SPAN;
    float y0 = c.y - R; float tx = clamp(p.x, -1.0, c.x);
    float sag = 0.05 * sin((tx + 1.0) * 2.4);                        // the run-in is not ruled: it rides a slow wave
    float dT = abs(p.y - (y0 + sag)) * 0.96 + max(-1.0 - p.x, 0.0); float sT = 0.4 * (tx + 1.0) / (c.x + 1.0);
    float dC = dS, s = sS; if (dT < dS) { dC = dT; s = sT; }
    float head = vPhase * 1.62; float u = (s - (head - 0.62)) / 0.62;  // 0 at the tail of the window, 1 at its head
    float uc = clamp(u, 0.0, 1.0);
    float w = 0.105 * pow(uc, 0.7) * (1.0 - smoothstep(0.86, 1.0, uc)) * (1.0 - 0.5 * s) * step(0.0, u) * step(u, 1.0);
    float ce = min(fwidth(dC), 0.03);
    float a = (1.0 - smoothstep(w - ce, w + ce, dC)) * step(0.006, w);
    // the rider: a shorter, thinner stroke below the run-in, a beat behind
    float u2 = (sT - (head * 0.8 - 0.3)) / 0.26; float uc2 = clamp(u2, 0.0, 1.0);
    float w2 = 0.05 * sin(uc2 * 3.14159) * step(0.0, u2) * step(u2, 1.0);
    float d2 = abs(p.y - (y0 - 0.2 + sag * 0.6));
    a = max(a, (1.0 - smoothstep(w2 - ce, w2 + ce, d2)) * step(0.006, w2) * step(-1.0, p.x) * step(p.x, c.x) * 0.8);
    o = vec4(vColor.rgb, 1.0) * a * vColor.a;
  } else if (vKind < 4.5) {     // 4 ring: an expanding foam ring on the ground; phase thins it
    float w = 0.16 * (1.0 - vPhase) + 0.02;
    float a = 1.0 - smoothstep(w - e, w + e, abs(r - 0.8));
    o = vec4(vColor.rgb, 1.0) * a * vColor.a;
  } else if (vKind < 5.5) {     // 5 dot: flat disc (spray, dust, petals)
    float a = 1.0 - smoothstep(0.9 - e, 0.9 + e, r);
    o = vec4(vColor.rgb, 1.0) * a * vColor.a;
  } else if (vKind < 6.5) {     // 6 tex: a picture from the sprite sheet, alpha blended
    vec4 t = texture(uSpriteMap, vUv);                 // premultiplied in the texture already
    o = vec4(t.rgb * vColor.rgb, t.a) * vColor.a;
  } else if (vKind < 7.5) {     // 7 shade: a flat blob of shadow on the ground, for figures with no shadow map
    float a = 1.0 - smoothstep(0.82 - e * 2.0, 0.9, r);
    o = vec4(vColor.rgb * uShadowTint * 0.55, 1.0) * a * vColor.a;
  } else if (vKind < 8.5) {     // 8 texadd: a picture from the sprite sheet, added (energy, light)
    vec4 t = texture(uSpriteMap, vUv);
    o = vec4(t.rgb * vColor.rgb * vColor.a, 0.0);
  } else {                      // 9 bolt: a streak of energy along the quad's x, hot core and soft edge, added; phase = how far its head has run
    float along = p.x * 0.5 + 0.5; float headAt = vPhase * 1.3; float u = (along - (headAt - 0.55)) / 0.55;
    float uc = clamp(u, 0.0, 1.0); float w = pow(uc, 1.6) * step(0.0, u) * step(u, 1.0);
    float core = (1.0 - smoothstep(0.12, 0.3, abs(p.y))) * w, soft = pow(max(1.0 - abs(p.y), 0.0), 2.0) * w * 0.55;
    o = vec4(mix(vColor.rgb, vec3(1.0), core * 0.7) * (core + soft) * vColor.a, 0.0);
  }
  if (o.a + o.r + o.g + o.b < 0.003) discard;
  frag = o;
}`;

// ------------------------------------------------------------------------------------ present (antialiasing)

export const PRESENT_VS = `
precision highp float;
in vec3 aPos;
void main() { gl_Position = vec4(aPos.xy, 0.0, 1.0); }`;
// Copies the off-screen frame to the canvas. With uFxaa on it is the small FXAA (nine taps): it finds the
// direction of the strongest edge from the four diagonal neighbours and blurs along it only, which is
// what an ink outline wants: the line keeps its weight and loses its stair-steps.
export const PRESENT_FS = `
precision highp float;
out vec4 frag; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFxaa;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 m = texture(uTex, uv).rgb;
  if (uFxaa < 0.5) { frag = vec4(m, 1.0); return; }
  float lNW = luma(texture(uTex, uv + vec2(-1.0, -1.0) * uTexel).rgb), lNE = luma(texture(uTex, uv + vec2(1.0, -1.0) * uTexel).rgb);
  float lSW = luma(texture(uTex, uv + vec2(-1.0, 1.0) * uTexel).rgb), lSE = luma(texture(uTex, uv + vec2(1.0, 1.0) * uTexel).rgb);
  float lM = luma(m), lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.09)) { frag = vec4(m, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -6.0, 6.0) * uTexel;
  vec3 a = 0.5 * (texture(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uTex, uv - dir * 0.5).rgb + texture(uTex, uv + dir * 0.5).rgb);
  float lB = luma(b);
  frag = vec4(lB < lMin || lB > lMax ? a : b, 1.0);
}`;
