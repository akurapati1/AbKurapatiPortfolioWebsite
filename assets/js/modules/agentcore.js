import { reducedMotion } from "../util.js";

/**
 * AgentCore: a real-time 3D "AI agent" drawn on a 2D canvas (no libraries).
 *  - a neural sphere (Fibonacci lattice + nearest-neighbour edges) that assembles itself on load
 *  - signal pulses travelling along edges, a breathing core, three tilted rotating rings
 *  - orbiting capability modules: hover to highlight, click to select (reveals a details panel)
 *  - drag to rotate with inertia, mouse parallax, scroll-linked spin, auto-tour until the user interacts
 */
export function startAgentCore(canvas, modules, { onSelect } = {}) {
  const ctx = canvas.getContext("2d");
  const still = reducedMotion();
  const N = 230;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  /* ---------- geometry ---------- */
  const base = [], scatter = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    base.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    const d = [Math.random() - .5, Math.random() - .5, Math.random() - .5], l = Math.hypot(...d) || 1, k = 1.7 + Math.random() * 1.2;
    scatter.push([d[0] / l * k, d[1] / l * k, d[2] / l * k]);
  }
  const edgeSet = new Set(), edges = [];
  for (let i = 0; i < N; i++) {
    const near = [];
    for (let j = 0; j < N; j++) if (j !== i) near.push([j, (base[i][0] - base[j][0]) ** 2 + (base[i][1] - base[j][1]) ** 2 + (base[i][2] - base[j][2]) ** 2]);
    near.sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 3; k++) { const j = near[k][0], key = i < j ? `${i}-${j}` : `${j}-${i}`; if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([Math.min(i, j), Math.max(i, j)]); } }
  }
  const rings = [{ r: 1.2, tx: 1.25, tz: 0.2, sp: 0.35, c: "#8b5cf6" }, { r: 1.34, tx: 0.55, tz: -0.9, sp: -0.28, c: "#22d3ee" }, { r: 1.48, tx: -0.4, tz: 0.6, sp: 0.2, c: "#60a5fa" }];
  const sats = modules.map((m, i) => ({ ...m, a: (i / modules.length) * TAU, sp: 0.16 + (i % 3) * 0.05, inc: 0.35 + (i % 4) * 0.28, node: (i * 0.9) % TAU, rad: 1.62 + (i % 2) * 0.12, hover: 0, sel: 0 }));

  /* ---------- state ---------- */
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let ry = 0.6, rx = 0.32, vy = 0, vx = 0, reveal = still ? 1 : 0, tilt = { x: 0, y: 0 };
  let dragging = false, moved = 0, last = { x: 0, y: 0 }, lastInteract = performance.now(), scrollY = 0;
  let hovered = -1, selected = -1, visible = true, raf = 0, prev = performance.now(), time = 0, tour = 0, nextTour = 5200;
  const pulses = [];
  let proj = new Array(N), satP = [];

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(280, r.width); H = Math.max(280, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H * 0.5; R = Math.min(W, H) * 0.245;
    if (still) draw(0);
  }

  const F = 3.4;
  function project(x, y, z, yaw = ry + scrollY * 0.0022, pitch = rx + tilt.y) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const s = F / Math.max(0.9, F - z2);
    return [cx + x1 * R * s, cy + y1 * R * s, z2, s];
  }

  /* ---------- selection ---------- */
  function select(i, auto = false) {
    selected = i;
    sats.forEach((s, k) => (s.selTarget = k === i ? 1 : 0));
    if (i >= 0) onSelect?.(modules[i], { auto, index: i });
    if (still) draw(0);
  }
  function hit(px, py) {
    let best = -1, bd = 1e9;
    satP.forEach((p, i) => { if (!p) return; const d = Math.hypot(p[0] - px, p[1] - py), rad = 22 * p[3]; if (d < rad && d < bd) { bd = d; best = i; } });
    return best;
  }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };

  canvas.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; last = pos(e); canvas.setPointerCapture(e.pointerId); lastInteract = performance.now(); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", (e) => {
    const p = pos(e); lastInteract = performance.now();
    if (dragging) {
      const dx = p.x - last.x, dy = p.y - last.y; moved += Math.abs(dx) + Math.abs(dy);
      ry += dx * 0.009; rx = clamp(rx + dy * 0.006, -0.9, 0.9); vy = dx * 0.009; vx = dy * 0.006; last = p;
    } else {
      tilt.x = (p.x / W - 0.5) * 0.4; tilt.y = (p.y / H - 0.5) * 0.25;
      const h = hit(p.x, p.y); if (h !== hovered) { hovered = h; canvas.style.cursor = h >= 0 ? "pointer" : "grab"; }
    }
    if (still) draw(0);
  });
  const up = (e) => {
    if (!dragging) return; dragging = false; canvas.style.cursor = hovered >= 0 ? "pointer" : "grab";
    if (moved < 6) { const p = pos(e), h = hit(p.x, p.y); select(h, false); }
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("pointerleave", () => { hovered = -1; tilt.x = tilt.y = 0; });
  canvas.style.cursor = "grab"; canvas.style.touchAction = "pan-y";
  addEventListener("scroll", () => { scrollY = Math.min(scrollY0(), 1400); }, { passive: true });
  const scrollY0 = () => window.scrollY || 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !still) { prev = performance.now(); raf = requestAnimationFrame(frame); } }).observe(canvas);
  new ResizeObserver(resize).observe(canvas);

  /* ---------- drawing ---------- */
  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    time += dt;
    const breathe = 0.5 + 0.5 * Math.sin(time * 1.6);

    // halo + core
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
    g.addColorStop(0, `rgba(139,92,246,${0.34 + breathe * 0.12})`); g.addColorStop(0.45, "rgba(34,211,238,0.08)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // node positions (assemble animation)
    for (let i = 0; i < N; i++) {
      const delay = (i / N) * 0.55, l = clamp((reveal - delay) / 0.45, 0, 1), e = 1 - Math.pow(1 - l, 3);
      const b = base[i], s = scatter[i];
      const k = e + (1 - e) * 0; // eased
      const x = s[0] + (b[0] - s[0]) * k, y = s[1] + (b[1] - s[1]) * k, z = s[2] + (b[2] - s[2]) * k;
      const wob = 1 + 0.018 * Math.sin(time * 2 + i);
      const p = project(x * wob, y * wob, z * wob); p[4] = l; proj[i] = p;
    }

    // edges (bucketed by depth for batching)
    const buckets = [[], [], []];
    for (const [a, b] of edges) {
      const A = proj[a], B = proj[b], d = (A[2] + B[2]) / 2, k = Math.min(A[4], B[4]);
      if (k <= 0.02) continue;
      buckets[d < -0.25 ? 0 : d < 0.35 ? 1 : 2].push(A, B, k);
    }
    const style = [["rgba(99,102,241,", 0.10], ["rgba(124,140,255,", 0.2], ["rgba(34,211,238,", 0.36]];
    buckets.forEach((arr, bi) => {
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) { ctx.moveTo(arr[i][0], arr[i][1]); ctx.lineTo(arr[i + 1][0], arr[i + 1][1]); }
      ctx.strokeStyle = style[bi][0] + style[bi][1] + ")"; ctx.lineWidth = bi === 2 ? 1.1 : 0.8; ctx.stroke();
    });

    // rings (3D circles)
    for (const r of rings) {
      r.ang = (r.ang || 0) + dt * r.sp;
      const pts = [];
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * TAU + r.ang;
        let x = Math.cos(a) * r.r, y = 0, z = Math.sin(a) * r.r;
        const c1 = Math.cos(r.tx), s1 = Math.sin(r.tx); let y1 = y * c1 - z * s1, z1 = y * s1 + z * c1; y = y1; z = z1;
        const c2 = Math.cos(r.tz), s2 = Math.sin(r.tz); const x2 = x * c2 - y * s2, y2 = x * s2 + y * c2; x = x2; y = y2;
        pts.push(project(x, y, z));
      }
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = hex(r.c, 0.28 * Math.min(1, reveal * 1.4)); ctx.lineWidth = 1; ctx.setLineDash([2, 7]); ctx.stroke(); ctx.setLineDash([]);
      const dp = pts[Math.floor(((r.ang * 3) % TAU + TAU) / TAU * 72) % 72];
      ctx.beginPath(); ctx.arc(dp[0], dp[1], 2.4 * dp[3], 0, TAU); ctx.fillStyle = hex(r.c, 0.95); ctx.fill();
    }

    // pulses travelling along edges
    if (!still && reveal > 0.8 && pulses.length < 16 && Math.random() < dt * 7) pulses.push({ e: (Math.random() * edges.length) | 0, t: 0, c: Math.random() < 0.5 ? "34,211,238" : "167,139,250" });
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i]; pl.t += dt * 1.4;
      if (pl.t >= 1) { pulses.splice(i, 1); continue; }
      const [a, b] = edges[pl.e], A = proj[a], B = proj[b], x = A[0] + (B[0] - A[0]) * pl.t, y = A[1] + (B[1] - A[1]) * pl.t;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 9); rg.addColorStop(0, `rgba(${pl.c},0.95)`); rg.addColorStop(1, `rgba(${pl.c},0)`);
      ctx.fillStyle = rg; ctx.fillRect(x - 9, y - 9, 18, 18);
    }

    // nodes (back to front)
    const order = proj.map((p, i) => i).sort((a, b) => proj[a][2] - proj[b][2]);
    for (const i of order) {
      const p = proj[i], d = clamp((p[2] + 1) / 2, 0, 1), rad = (0.9 + d * 1.5) * p[3] * 0.9;
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, TAU);
      ctx.fillStyle = d > 0.55 ? `rgba(165,243,252,${0.35 + d * 0.6 * p[4]})` : `rgba(139,148,255,${0.18 + d * 0.5 * p[4]})`; ctx.fill();
    }

    // core
    const cr = R * (0.2 + breathe * 0.04), cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 2.3);
    cg.addColorStop(0, `rgba(255,255,255,${0.9 * Math.min(1, reveal * 2)})`); cg.addColorStop(0.25, "rgba(167,139,250,0.7)"); cg.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr * 2.3, 0, TAU); ctx.fill();

    // satellites
    satP = new Array(sats.length);
    const rendered = [];
    sats.forEach((s, i) => {
      s.a += dt * s.sp;
      s.hover += ((i === hovered ? 1 : 0) - s.hover) * Math.min(1, dt * 10);
      s.sel += ((i === selected ? 1 : 0) - s.sel) * Math.min(1, dt * 8);
      let x = Math.cos(s.a) * s.rad, y = 0, z = Math.sin(s.a) * s.rad;
      const c1 = Math.cos(s.inc), s1 = Math.sin(s.inc); let y1 = y * c1 - z * s1, z1 = y * s1 + z * c1; y = y1; z = z1;
      const c2 = Math.cos(s.node), s2 = Math.sin(s.node); const x2 = x * c2 - y * s2, y2 = x * s2 + y * c2; x = x2; y = y2;
      const k = clamp((reveal - 0.65) / 0.35, 0, 1);
      const p = project(x * k, y * k, z * k); satP[i] = k > 0.05 ? p : null; rendered.push({ s, i, p, k });
    });
    rendered.sort((a, b) => a.p[2] - b.p[2]);
    // beam to selected module
    rendered.forEach(({ s, p, k }) => {
      if (s.sel > 0.02 && k > 0.5) {
        ctx.save(); ctx.globalAlpha = s.sel; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -time * 40;
        ctx.strokeStyle = hex(s.color, 0.9); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.restore();
      }
    });
    ctx.font = "600 12px Inter, system-ui, sans-serif"; ctx.textBaseline = "middle";
    rendered.forEach(({ s, p, k }) => {
      if (k <= 0.05) return;
      const depth = (p[2] + 1.8) / 3.6, alpha = clamp(0.35 + depth * 0.75, 0.35, 1) * k, rad = (6 + s.hover * 3 + s.sel * 3) * p[3];
      const gl = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 3.4); gl.addColorStop(0, hex(s.color, 0.55 * alpha)); gl.addColorStop(1, hex(s.color, 0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 3.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, TAU); ctx.fillStyle = hex(s.color, alpha); ctx.fill();
      if (s.sel > 0.05 || s.hover > 0.05) { ctx.beginPath(); ctx.arc(p[0], p[1], rad + 5 + Math.sin(time * 5) * 1.5, 0, TAU); ctx.strokeStyle = hex(s.color, 0.8 * Math.max(s.sel, s.hover)); ctx.lineWidth = 1.5; ctx.stroke(); }
      const tw = ctx.measureText(s.label).width, px = p[0] + rad + 9, py = p[1];
      ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.max(s.hover, s.sel));
      ctx.fillStyle = "rgba(9,12,26,0.78)"; roundRect(px - 8, py - 12, tw + 16, 24, 12); ctx.fill();
      ctx.strokeStyle = hex(s.color, 0.55); ctx.lineWidth = 1; roundRect(px - 8, py - 12, tw + 16, 24, 12); ctx.stroke();
      ctx.fillStyle = "#eef2ff"; ctx.fillText(s.label, px, py + 0.5); ctx.globalAlpha = 1;
    });
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function frame(now) {
    raf = 0; if (!visible) return;
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    if (reveal < 1) reveal = Math.min(1, reveal + dt / 2.6);
    if (!dragging) { ry += (vy + 0.18 * dt); vy *= 0.94; rx += vx; vx *= 0.9; rx += (0.32 - rx) * dt * 0.6; }
    // auto-tour of modules until the user takes over
    if (reveal >= 1 && now - lastInteract > 8000) { tour += dt * 1000; if (tour > nextTour) { tour = 0; select((selected + 1) % sats.length, true); } }
    draw(dt);
    raf = requestAnimationFrame(frame);
  }
  resize();
  if (still) draw(0); else { raf = requestAnimationFrame((t) => { prev = t; frame(t); }); }
  // introduce first module shortly after the assembly finishes
  if (!still) setTimeout(() => { if (selected < 0) select(0, true); }, 3000); else select(0, true);

  return { select, get selected() { return selected; }, interact() { lastInteract = performance.now(); } };
}
