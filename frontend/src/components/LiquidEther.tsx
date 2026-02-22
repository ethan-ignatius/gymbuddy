// @ts-nocheck
import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
precision highp float;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;
uniform float uMousePower;
uniform float uSpeed;
uniform float uScale;
uniform float uOpacity;
uniform vec3  uColorA;   // deep base
uniform vec3  uColorB;   // mid shimmer
uniform vec3  uColorC;   // highlight

in  vec2 vUv;
out vec4 fragColor;

// ── helpers ──────────────────────────────────────────────────────────────────

mat2 rot(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0 - 2.0*f);
  float a = hash(i), b = hash(i+vec2(1,0));
  float c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

float fbm(vec2 p, int oct) {
  float v=0.0, a=0.5;
  for (int i=0; i<oct; i++) {
    v += a * noise(p);
    p  = rot(0.37) * p * 2.1;
    a *= 0.5;
  }
  return v;
}

// ── main ──────────────────────────────────────────────────────────────────────

void main() {
  float t = uTime * uSpeed;
  vec2 ar = vec2(uResolution.x / uResolution.y, 1.0);

  // Normalised UV in aspect-correct space, centred
  vec2 uv = (vUv - 0.5) * ar * uScale;

  // Mouse repulsion / attraction
  vec2 mouse = (uMouse / uResolution - 0.5) * ar;
  float mdist = length(uv - mouse);
  float mForce = uMousePower / (mdist * mdist + 0.08);
  vec2  mDir   = normalize(uv - mouse + 0.001);
  uv += mDir * mForce * 0.06;

  // Layer 1 – large slow undulation
  vec2 q = uv;
  q.x += 0.4 * sin(0.7*t + q.y * 0.9 + fbm(q + t*0.08, 3) * 2.0);
  q.y += 0.4 * cos(0.6*t + q.x * 0.8 + fbm(q - t*0.07, 3) * 2.0);

  // Layer 2 – faster ripple woven through layer 1
  vec2 r = q;
  r.x += 0.55 * sin(1.1*t + 1.8*r.y + fbm(r + 0.13*t, 4) * 1.5);
  r.y += 0.55 * cos(0.9*t + 1.6*r.x + fbm(r - 0.11*t, 4) * 1.5);

  // Layer 3 – high-frequency shimmer
  vec2 s = r * 1.6;
  s.x += 0.18 * sin(2.4*t + 3.1*s.y);
  s.y += 0.18 * cos(2.1*t + 2.9*s.x);

  // Combine into a single 0-1 field
  float f = fbm(r * 0.9, 5) * 0.5
           + fbm(s * 1.4, 4) * 0.3
           + sin(length(r) * 4.0 - t * 0.5) * 0.1
           + 0.1;
  f = clamp(f, 0.0, 1.0);

  // Iridescent colour: three-way mix with a secondary oscillation
  float g = sin(f * 3.14159 * 2.0 + t * 0.25) * 0.5 + 0.5;
  vec3  col = mix(uColorA, uColorB, f);
  col = mix(col, uColorC, g * g * 0.6);

  // Subtle specular flicker
  float spec = pow(fbm(s * 2.5 + t * 0.3, 3), 3.0);
  col += spec * 0.18 * uColorC;

  // Vignette so edges fade into the page
  float vig = 1.0 - smoothstep(0.35, 1.2, length((vUv - 0.5) * ar));
  col *= vig;

  fragColor = vec4(col, uOpacity * vig * (0.7 + 0.3 * f));
}`;

function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        console.error(gl.getShaderInfoLog(s));
    return s;
}

function makeProgram(gl, vert, frag) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        console.error(gl.getProgramInfoLog(p));
    return p;
}

function hex2rgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
}

export default function LiquidEther({
    colorA = '#0d0a1a',   // deep violet-black base
    colorB = '#3a1a6e',   // rich purple mid
    colorC = '#e8c468',   // gold highlight (matches GymBuddy brand)
    speed = 0.35,
    scale = 1.4,
    opacity = 1.0,
    mouseInteractive = true,
    style = {},
}) {
    const canvasRef = useRef(null);
    const mouse = useRef([0, 0]);
    const mousePow = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl2', { alpha: true, antialias: false });
        if (!gl) { console.warn('WebGL2 not available'); return; }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const prog = makeProgram(gl, VERT, FRAG);
        gl.useProgram(prog);

        // Full-screen triangle
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, 'position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // Uniform locations
        const U = {};
        ['uTime', 'uResolution', 'uMouse', 'uMousePower', 'uSpeed', 'uScale',
            'uOpacity', 'uColorA', 'uColorB', 'uColorC'].forEach(n => {
                U[n] = gl.getUniformLocation(prog, n);
            });

        // Set static uniforms
        gl.uniform1f(U.uSpeed, speed);
        gl.uniform1f(U.uScale, scale);
        gl.uniform1f(U.uOpacity, opacity);
        gl.uniform3fv(U.uColorA, new Float32Array(hex2rgb(colorA)));
        gl.uniform3fv(U.uColorB, new Float32Array(hex2rgb(colorB)));
        gl.uniform3fv(U.uColorC, new Float32Array(hex2rgb(colorC)));

        // Resize
        const resize = () => {
            const w = canvas.clientWidth * devicePixelRatio | 0;
            const h = canvas.clientHeight * devicePixelRatio | 0;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            gl.viewport(0, 0, w, h);
            gl.useProgram(prog);
            gl.uniform2f(U.uResolution, w, h);
        };
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        resize();

        // Mouse
        const onMove = e => {
            const rect = canvas.getBoundingClientRect();
            const dpr = devicePixelRatio;
            mouse.current = [
                (e.clientX - rect.left) * dpr,
                (canvas.height) - (e.clientY - rect.top) * dpr,
            ];
            mousePow.current = Math.min(mousePow.current + 0.08, 1.0);
        };
        const onLeave = () => { mousePow.current = 0; };
        if (mouseInteractive) {
            canvas.addEventListener('mousemove', onMove);
            canvas.addEventListener('mouseleave', onLeave);
        }

        // Render loop
        let raf, t0 = null;
        const loop = ts => {
            if (t0 === null) t0 = ts;
            const t = (ts - t0) * 0.001;

            // Decay mouse power
            mousePow.current = Math.max(0, mousePow.current - 0.02);

            gl.useProgram(prog);
            gl.uniform1f(U.uTime, t);
            gl.uniform2fv(U.uMouse, new Float32Array(mouse.current));
            gl.uniform1f(U.uMousePower, mouseInteractive ? mousePow.current : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            if (mouseInteractive) {
                canvas.removeEventListener('mousemove', onMove);
                canvas.removeEventListener('mouseleave', onLeave);
            }
            gl.deleteProgram(prog);
            gl.deleteBuffer(buf);
        };
    }, [colorA, colorB, colorC, speed, scale, opacity, mouseInteractive]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                display: 'block',
                width: '100%',
                height: '100%',
                ...style,
            }}
        />
    );
}