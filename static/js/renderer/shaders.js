/**
 * Ad Astra — Custom GLSL Shaders
 * Procedural GPU-generated surfaces for stars, planets, black holes.
 */

// ---- Star Shader: Planck blackbody + procedural noise surface ----
export const starVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const starFragmentShader = `
uniform float time;
uniform float temperature;
uniform float radius;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

// Simplex-like noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// Planck blackbody approximation → sRGB
vec3 temperatureToColor(float temp) {
    float t = temp / 100.0;
    vec3 color;

    // Red
    if (t <= 66.0) {
        color.r = 1.0;
    } else {
        color.r = clamp(1.292936 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
    }

    // Green
    if (t <= 66.0) {
        color.g = clamp(0.390082 * log(t) - 0.631841, 0.0, 1.0);
    } else {
        color.g = clamp(1.129891 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
    }

    // Blue
    if (t >= 66.0) {
        color.b = 1.0;
    } else if (t <= 19.0) {
        color.b = 0.0;
    } else {
        color.b = clamp(0.543207 * log(t - 10.0) - 1.19625, 0.0, 1.0);
    }

    return color;
}

void main() {
    vec3 baseColor = temperatureToColor(temperature);

    // Procedural surface noise
    vec3 noiseCoord = vNormal * 3.0 + time * 0.05;
    float n1 = snoise(noiseCoord) * 0.5 + 0.5;
    float n2 = snoise(noiseCoord * 4.0 + 10.0) * 0.3;
    float n3 = snoise(noiseCoord * 8.0 + 20.0) * 0.15;

    float surface = n1 + n2 + n3;

    // Sunspots (dark regions)
    float spots = smoothstep(0.35, 0.4, snoise(vNormal * 5.0 + time * 0.02));

    // Limb darkening
    float fresnel = dot(vNormal, normalize(-vPosition));
    float limbDark = pow(fresnel, 0.4);

    vec3 finalColor = baseColor * (0.8 + 0.4 * surface) * limbDark;
    finalColor *= (1.0 - spots * 0.3);

    // HDR glow — make stars emit more than 1.0
    finalColor *= 1.5;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ---- Planet Shader: procedural terrain ----
export const planetVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const planetFragmentShader = `
uniform vec3 baseColor;
uniform float time;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

// Simple hash noise
float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec3(1,0,0));
    float c = hash(i + vec3(0,1,0));
    float d = hash(i + vec3(1,1,0));
    float e = hash(i + vec3(0,0,1));
    float ff = hash(i + vec3(1,0,1));
    float g = hash(i + vec3(0,1,1));
    float h = hash(i + vec3(1,1,1));
    return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),mix(mix(e,ff,f.x),mix(g,h,f.x),f.y),f.z);
}

void main() {
    // Procedural terrain with multi-octave noise
    vec3 noisePos = vNormal * 4.0;
    float n = noise(noisePos) * 0.5 +
              noise(noisePos * 2.0) * 0.25 +
              noise(noisePos * 4.0) * 0.125;

    // Diffuse lighting from camera direction
    vec3 lightDir = normalize(-vPosition);
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.15;

    vec3 color = baseColor * (0.7 + 0.6 * n);
    color *= (ambient + (1.0 - ambient) * diff);

    // Atmosphere rim
    float rim = 1.0 - max(dot(vNormal, lightDir), 0.0);
    rim = pow(rim, 3.0);
    color += baseColor * rim * 0.3;

    gl_FragColor = vec4(color, 1.0);
}
`;

// ---- Black Hole Shader: event horizon + accretion disc ----
export const blackHoleVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const blackHoleFragmentShader = `
uniform float time;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    // Pure black center with slight distortion
    float fresnel = dot(vNormal, normalize(-vPosition));
    float edge = pow(1.0 - fresnel, 4.0);

    // Hawking radiation glow at the edge
    vec3 glowColor = vec3(0.6, 0.3, 0.0) * edge * 2.0;

    // Dark center
    vec3 finalColor = glowColor;
    float alpha = max(edge * 0.8, 0.95);

    gl_FragColor = vec4(finalColor, alpha);
}
`;

// ---- Accretion Disc Shader ----
export const accretionVertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vUv = uv;
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const accretionFragmentShader = `
uniform float time;

varying vec2 vUv;
varying vec3 vPosition;

void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    float angle = atan(center.y, center.x);

    // Ring shape
    float ring = smoothstep(0.15, 0.2, dist) * smoothstep(0.5, 0.45, dist);

    // Spiral pattern
    float spiral = sin(angle * 3.0 - time * 2.0 + dist * 20.0) * 0.5 + 0.5;

    // Temperature gradient (hotter near center)
    float temp = 1.0 - smoothstep(0.15, 0.45, dist);
    vec3 coldColor = vec3(0.8, 0.2, 0.0);
    vec3 hotColor = vec3(1.0, 0.9, 0.5);
    vec3 color = mix(coldColor, hotColor, temp);

    float brightness = ring * (0.6 + 0.4 * spiral) * 2.0;

    gl_FragColor = vec4(color * brightness, ring * 0.8);
}
`;

// ---- Atmosphere Glow Shader ----
export const atmosphereVertexShader = `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const atmosphereFragmentShader = `
uniform vec3 glowColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = 1.0 - max(0.0, dot(vWorldNormal, viewDir));
    float intensity = pow(rim, 3.0);
    gl_FragColor = vec4(glowColor, intensity * 0.7);
}
`;

// ---- Trail/Line Shader ----
export const trailVertexShader = `
attribute float alpha;
varying float vAlpha;

void main() {
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const trailFragmentShader = `
uniform vec3 color;
varying float vAlpha;

void main() {
    gl_FragColor = vec4(color, vAlpha * 0.6);
}
`;
