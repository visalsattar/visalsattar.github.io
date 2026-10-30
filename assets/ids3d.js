/* 3D view of the IDS pipeline: hand-written WebGL, no libraries. site.js loads this file lazily.
   It holds no scenario logic: it mirrors the on/hit/miss classes that play() in site.js sets on the
   2D nodes and arrows. The 2D pipeline stays in the DOM as the accessible version; this canvas is
   aria-hidden, never focusable, and if anything here fails the 2D pipeline is simply left visible. */
(() => {
const wrap = document.querySelector(".pipe-wrap");
const canvas = wrap && wrap.querySelector(".ids3d");
const pipe = wrap && wrap.querySelector(".pipe");
const gl = canvas && canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
if (!gl) return;   // no WebGL: the 2D pipeline stays as it is

const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = getComputedStyle(document.documentElement);
const hex = v => { const h = css.getPropertyValue(v).trim().slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const C = { bg: hex("--bg"), panel: hex("--panel-2"), line: hex("--line"), fg: hex("--fg"), dim: hex("--dim"), cyan: hex("--cyan"), alert: hex("--alert") };
const rgb = c => `rgb(${c.map(x => Math.round(x * 255))})`;

/* ---------- scene: nodes and edges, read from the 2D pipeline ---------- */
const IDS = ["n-cap", "n-feat", "n-rf", "n-ae", "n-rule", "n-dash"];
const DET = ["n-rf", "n-ae", "n-rule"];
const nodes = IDS.map(id => { const el = document.getElementById(id); return { id, el, b: el.querySelector("b"), name: el.querySelector("b").firstChild.textContent.trim().toUpperCase() }; });
const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
// [from, to, arrow id that marks the edge active]
const EDGES = [["n-cap", "n-feat", "a1"], ...DET.map(d => ["n-feat", d, "a2"]), ...DET.map(d => [d, "n-dash", "a3"])];
const state = n => { const c = n.el.classList; return c.contains("hit") ? "hit" : c.contains("miss") ? "miss" : c.contains("on") ? "on" : "idle"; };
// the " · ALERT" / " · no alert" suffix comes from the 2D stylesheet, so the wording lives in one place
const suffix = n => { const c = getComputedStyle(n.b, "::after").content; return c && c[0] === '"' ? JSON.parse(c).replace(/^\s*·\s*/, "") : ""; };

let vertical = false, edges = [];
function layout(){
  // all three detectors get identical boxes: nothing visual ranks one above another
  if (vertical){   // phones: stacked, detectors fed from a left rail and joined by a right rail, like the 2D view
    const main = [3.2, .6, .4], det = [2.6, .56, .4], y = { "n-cap": 2.75, "n-feat": 1.65, "n-rf": .55, "n-ae": -.55, "n-rule": -1.65, "n-dash": -2.75 };
    nodes.forEach(n => { const d = DET.includes(n.id); n.pos = [d ? .3 : 0, y[n.id], 0]; n.size = d ? det : main; });
    edges = EDGES.map(([a, b, arrow]) => {
      const A = byId[a].pos, B = byId[b].pos;
      const pts = a === "n-cap" ? [A, B] : b === "n-dash" ? [A, [1.9, A[1], 0], [1.9, B[1], 0], [1.2, B[1], 0]] : [[-1.3, A[1], 0], [-1.3, B[1], 0], B];
      return { a, b, arrow, pts };
    });
  } else {
    const main = [2, .74, .45], det = [2, .64, .45], x = { "n-cap": -3.75, "n-feat": -1.25, "n-dash": 3.75 };
    nodes.forEach(n => { const d = DET.indexOf(n.id); n.pos = d < 0 ? [x[n.id], 0, 0] : [1.25, 1.2 - d * 1.2, 0]; n.size = d < 0 ? main : det; });
    edges = EDGES.map(([a, b, arrow]) => ({ a, b, arrow, pts: [byId[a].pos, byId[b].pos] }));
  }
  for (const e of edges){   // cumulative lengths, for moving packets along the polyline
    e.cum = [0]; for (let i = 1; i < e.pts.length; i++) e.cum.push(e.cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
    e.len = e.cum[e.cum.length - 1];
  }
}
const along = (e, d) => { let i = 1; while (i < e.cum.length - 1 && e.cum[i] < d) i++; const t = (d - e.cum[i - 1]) / (e.cum[i] - e.cum[i - 1]); const p = e.pts[i - 1], q = e.pts[i]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0]; };

/* ---------- WebGL setup ---------- */
function program(vs, fs){
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]){
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++){ const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u, a: name => gl.getAttribLocation(p, name) };
}
const buffer = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
// switch program and disable the previous program's attributes, so draw-call validation never sees stale ones
let enabled = [];
function use(prog){ enabled.forEach(l => gl.disableVertexAttribArray(l)); enabled = []; gl.useProgram(prog.p); }
function attr(prog, name, buf, size, stride = 0, offset = 0){
  const loc = prog.a(name); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc); enabled.push(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
}

let P;
try {
  P = {
    // lit box faces
    box: program(
      `attribute vec3 p; attribute vec3 n; uniform mat4 vp; uniform mat4 rot; uniform vec3 pos; uniform vec3 size; varying float l;
       void main(){ gl_Position = vp * vec4(pos + p * size, 1.); vec3 m = (rot * vec4(n, 0.)).xyz; l = .5 + .5 * max(dot(m, normalize(vec3(.35, .55, .75))), 0.); }`,
      `precision mediump float; uniform vec3 c; uniform float e; varying float l; void main(){ gl_FragColor = vec4(c * l + c * e, 1.); }`),
    // box outlines, edges and the backdrop grid
    line: program(
      `attribute vec3 p; uniform mat4 vp; uniform vec3 pos; uniform vec3 size; void main(){ gl_Position = vp * vec4(pos + p * size, 1.); }`,
      `precision mediump float; uniform vec4 c; void main(){ gl_FragColor = c; }`),
    // packets
    dot: program(
      `attribute vec3 p; attribute vec4 c; uniform mat4 vp; uniform float sz; varying vec4 v; void main(){ gl_Position = vp * vec4(p, 1.); gl_PointSize = sz; v = c; }`,
      `precision mediump float; varying vec4 v; void main(){ float a = smoothstep(.5, .15, length(gl_PointCoord - .5)); gl_FragColor = v * a; }`),
    // node labels: screen-aligned quads cut from a 2D-canvas text atlas
    label: program(
      `attribute vec2 q; uniform vec2 ctr; uniform vec2 hs; uniform vec4 uv; varying vec2 t;
       void main(){ gl_Position = vec4(ctr + (q * 2. - 1.) * hs, 0., 1.); t = vec2(uv.x + q.x * uv.z, uv.y + (1. - q.y) * uv.w); }`,
      `precision mediump float; uniform sampler2D tex; varying vec2 t; void main(){ gl_FragColor = texture2D(tex, t); }`),
  };
} catch (err){ return; }   // shader failure: leave the 2D pipeline in place

// unit cube: 6 faces x 4 vertices (position, normal), and its 12 edges
const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const cubeV = [], cubeI = [];
F.forEach((n, f) => {
  const [a, b] = n[0] ? [[0, 1, 0], [0, 0, 1]] : n[1] ? [[0, 0, 1], [1, 0, 0]] : [[1, 0, 0], [0, 1, 0]];
  for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cubeV.push(...[0, 1, 2].map(i => (n[i] + a[i] * s + b[i] * t) / 2), ...n);
  cubeI.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
});
const cubeBuf = buffer(new Float32Array(cubeV));
const cubeIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeI), gl.STATIC_DRAW);
const E = .504, wire = [];   // slightly outside the faces so the outline doesn't z-fight
for (const [x, y, z] of [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0]]) wire.push(x * E, y * E, -E, x * E, y * E, E);
for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) wire.push(x * E, -E, z * E, x * E, E, z * E);
for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) wire.push(-E, y * E, z * E, E, y * E, z * E);
const wireBuf = buffer(new Float32Array(wire));
const quadBuf = buffer(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
const dynBuf = gl.createBuffer();
let gridBuf, gridCount = 0, edgeBuf, edgeRanges = [];

/* ---------- camera: orthographic, tilted so box tops and sides read as 3D ---------- */
let W = 1, H = 1, L = 1, fit = null;
const rotation = yaw => {
  const ax = vertical ? .32 : .42, cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Rx * Ry, column-major
  return new Float32Array([cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1]);
};
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const YAW = -.3, SWAY = .05;
function fitView(){
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const yaw of [YAW - SWAY, YAW + SWAY]){
    const r = rotation(yaw);
    for (const n of nodes) for (const sx of [-.5, .5]) for (const sy of [-.5, .5]) for (const sz of [-.5, .5]){
      const [x, y] = apply(r, [n.pos[0] + sx * n.size[0], n.pos[1] + sy * n.size[1], sz * n.size[2]]);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const s = Math.min(W * .94 / (x1 - x0), H * .9 / (y1 - y0));   // pixels per world unit
  fit = { s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function viewProj(yaw){
  const r = rotation(yaw), sx = 2 * fit.s / W, sy = 2 * fit.s / H, k = -.08, m = new Float32Array(16);
  for (let c = 0; c < 3; c++){ m[c * 4] = r[c * 4] * sx; m[c * 4 + 1] = r[c * 4 + 1] * sy; m[c * 4 + 2] = r[c * 4 + 2] * k; }
  m[12] = -fit.cx * sx; m[13] = -fit.cy * sy; m[15] = 1;
  return { vp: m, rot: r };
}

/* ---------- label atlas: one row per node, drawn with the site's own fonts ---------- */
const CW = 200, CH = 34;
const atlas = document.createElement("canvas"), actx = atlas.getContext("2d");
const tex = gl.createTexture();
function drawAtlas(){
  atlas.width = CW * L; atlas.height = CH * L * nodes.length;
  actx.setTransform(L, 0, 0, L, 0, 0); actx.clearRect(0, 0, CW, CH * nodes.length);
  actx.textAlign = "center"; actx.textBaseline = "middle";
  const big = vertical ? 12 : 11;
  nodes.forEach((n, i) => {
    const st = state(n), sfx = suffix(n), y = i * CH + CH / 2;
    actx.font = `600 ${big}px Oxanium, "Arial Narrow", sans-serif`;
    if ("letterSpacing" in actx) actx.letterSpacing = ".5px";
    actx.fillStyle = rgb(st === "miss" ? C.dim : C.fg);
    actx.fillText(n.name, CW / 2, sfx ? y - 6 : y);
    if (sfx){
      actx.font = `500 ${big - 2}px "JetBrains Mono", monospace`;
      if ("letterSpacing" in actx) actx.letterSpacing = "0px";
      actx.fillStyle = rgb(st === "hit" ? C.alert : C.dim);
      actx.fillText(sfx, CW / 2, y + 7);
    }
  });
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
}

/* ---------- geometry that changes only with the layout ---------- */
function buildStatic(){
  const g = [], step = .5, gx = vertical ? 2.6 : 5.5, gy = vertical ? 3.6 : 2.2, z = -.6;
  for (let x = -gx; x <= gx + 1e-6; x += step) g.push(x, -gy, z, x, gy, z);
  for (let y = -gy; y <= gy + 1e-6; y += step) g.push(-gx, y, z, gx, y, z);
  gridBuf = buffer(new Float32Array(g)); gridCount = g.length / 3;
  const e = []; edgeRanges = [];
  for (const ed of edges){ const start = e.length / 3; for (let i = 1; i < ed.pts.length; i++) e.push(...ed.pts[i - 1], ...ed.pts[i]); edgeRanges.push([start, e.length / 3 - start]); }
  edgeBuf = buffer(new Float32Array(e));
}

/* ---------- drawing ---------- */
const look = st => st === "hit" ? { fill: mix(C.panel, C.alert, .45), edge: [...C.alert, 1] }
  : st === "on" ? { fill: mix(C.panel, C.cyan, .18), edge: [...C.cyan, 1] }
  : st === "miss" ? { fill: mix(C.panel, C.bg, .6), edge: [...C.dim, .45] }
  : { fill: C.panel, edge: [...mix(C.line, C.cyan, .12), 1] };
const pre = c => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];   // premultiplied alpha
const PER_EDGE = 4;

function draw(t){
  const { vp, rot } = viewProj(YAW + (REDUCE ? 0 : SWAY * Math.sin(t * .35)));
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);

  const ln = P.line; use(ln); gl.uniformMatrix4fv(ln.u.vp, false, vp);
  gl.uniform3f(ln.u.pos, 0, 0, 0); gl.uniform3f(ln.u.size, 1, 1, 1);
  attr(ln, "p", gridBuf, 3); gl.uniform4fv(ln.u.c, pre([...C.line, .5])); gl.drawArrays(gl.LINES, 0, gridCount);

  const bx = P.box; use(bx); gl.uniformMatrix4fv(bx.u.vp, false, vp); gl.uniformMatrix4fv(bx.u.rot, false, rot);
  attr(bx, "p", cubeBuf, 3, 24, 0); attr(bx, "n", cubeBuf, 3, 24, 12); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIdx);
  const st = Object.fromEntries(nodes.map(n => [n.id, state(n)]));
  for (const n of nodes){
    const s = st[n.id];
    gl.uniform3fv(bx.u.pos, n.pos); gl.uniform3fv(bx.u.size, n.size); gl.uniform3fv(bx.u.c, look(s).fill);
    gl.uniform1f(bx.u.e, s === "hit" ? (REDUCE ? .25 : .18 + .14 * Math.sin(t * 5)) : 0);   // only an alert pulses
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  }
  use(ln); gl.uniformMatrix4fv(ln.u.vp, false, vp); attr(ln, "p", wireBuf, 3);
  for (const n of nodes){ gl.uniform3fv(ln.u.pos, n.pos); gl.uniform3fv(ln.u.size, n.size); gl.uniform4fv(ln.u.c, pre(look(st[n.id]).edge)); gl.drawArrays(gl.LINES, 0, 24); }

  // edges and packets: active once the matching 2D arrow lights up; detector-to-dashboard edges
  // carry the alert colour only from a detector that fired, and go quiet from one that missed
  gl.uniform3f(ln.u.pos, 0, 0, 0); gl.uniform3f(ln.u.size, 1, 1, 1); attr(ln, "p", edgeBuf, 3);
  const pts = [];
  edges.forEach((e, i) => {
    const on = document.getElementById(e.arrow).classList.contains("on"), from = st[e.a];
    const out = e.b === "n-dash";
    const kind = !on ? "idle" : out && from === "hit" ? "hot" : out && from === "miss" ? "dead" : "on";
    const lineC = { idle: [...mix(C.line, C.cyan, .15), 1], on: [...C.cyan, .55], hot: [...C.alert, .8], dead: [...C.dim, .2] }[kind];
    gl.uniform4fv(ln.u.c, pre(lineC)); gl.drawArrays(gl.LINES, edgeRanges[i][0], edgeRanges[i][1]);
    const dotC = { idle: [...C.cyan, .22], on: [...C.cyan, .95], hot: [...C.alert, 1], dead: [...C.dim, .18] }[kind];
    const speed = kind === "idle" || kind === "dead" ? .45 : 1.9;   // world units per second
    for (let k = 0; k < PER_EDGE; k++){
      const d = ((t * speed / e.len + k / PER_EDGE + i * .13) % 1) * e.len;
      pts.push(...along(e, d), ...pre(dotC));
    }
  });
  const dt = P.dot; use(dt); gl.uniformMatrix4fv(dt.u.vp, false, vp); gl.uniform1f(dt.u.sz, 5 * L);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
  attr(dt, "p", dynBuf, 3, 28, 0); attr(dt, "c", dynBuf, 4, 28, 12);
  gl.depthMask(false); gl.drawArrays(gl.POINTS, 0, pts.length / 7); gl.depthMask(true);

  // labels last, on top, centred on each box's front face
  gl.disable(gl.DEPTH_TEST);
  const lb = P.label; use(lb); attr(lb, "q", quadBuf, 2);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(lb.u.tex, 0);
  gl.uniform2f(lb.u.hs, CW / W, CH / H);
  nodes.forEach((n, i) => {
    const p = [n.pos[0], n.pos[1], n.size[2] / 2];
    gl.uniform2f(lb.u.ctr, vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]);
    gl.uniform4f(lb.u.uv, 0, i / nodes.length, 1, 1 / nodes.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });
}

/* ---------- sizing, run/pause, and following the 2D state ---------- */
let raf = 0, onScreen = false, last = 0;
function resize(){
  W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight); L = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * L); canvas.height = Math.round(H * L);
  const v = H > W;
  if (v !== vertical || !edgeBuf){ vertical = v; layout(); buildStatic(); }
  fitView(); drawAtlas();
}
const frame = now => { last = now / 1000; draw(last); raf = requestAnimationFrame(frame); };
function schedule(){
  const run = !REDUCE && onScreen && !document.hidden && !lost;
  if (run && !raf) raf = requestAnimationFrame(frame);
  if (!run && raf){ cancelAnimationFrame(raf); raf = 0; }
}
const redraw = () => { if (!lost && !raf) draw(last); };   // reduced motion or paused: one static frame

let lost = false;
canvas.addEventListener("webglcontextlost", () => { lost = true; schedule(); wrap.classList.remove("is-3d"); canvas.hidden = true; });

canvas.hidden = false; wrap.classList.add("is-3d");
resize(); draw(0);
new ResizeObserver(() => { resize(); redraw(); }).observe(wrap);
new MutationObserver(() => { drawAtlas(); redraw(); }).observe(pipe, { subtree: true, attributes: true, attributeFilter: ["class"] });
new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; schedule(); }).observe(wrap);
document.addEventListener("visibilitychange", schedule);
if (document.fonts) document.fonts.ready.then(() => { drawAtlas(); redraw(); });
})();
