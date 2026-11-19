import { $, $$, h, svg, ICONS, reducedMotion, sleep } from "../util.js";
import { createVoice, createListener, segment, plain } from "./voice.js";
import { spokenAnswer } from "./spoken.js";

/**
 * ARI — the AI guide.
 *
 *  - Lives on the hero stage. When you start a tour it takes off, loops around the whole page
 *    and lands in the tour panel (kinematic flight, then spring physics takes over).
 *  - Narrates each section with natural pacing (see voice.js) while a soft spotlight shows what
 *    it is talking about. The script is generated from data/profile.json.
 *  - Interactive: ask a question any time (type or talk). Answers come from the same grounded
 *    assistant as the chat, and are spoken back. Live voice mode keeps listening hands-free.
 */

const BOT_W = 84, BOT_H = 96, NAV = 68;
const BOT_SVG = `
<svg viewBox="0 0 100 112" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="ariShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f8fc"/><stop offset="1" stop-color="#b4bfd1"/></linearGradient>
    <linearGradient id="ariFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#ffa35c"/><stop offset="1" stop-color="#ff7a59" stop-opacity="0"/></linearGradient>
  </defs>
  <path class="flame" d="M41 100 Q50 134 59 100 Z"/>
  <g class="arm l"><path d="M34 84 L15 93"/></g>
  <g class="arm r"><path d="M66 84 L85 93"/></g>
  <rect class="shell" x="34" y="76" width="32" height="26" rx="12"/>
  <path d="M42 90h16" stroke="#8793a8" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="50" y1="17" x2="50" y2="26" stroke="#c9d1de" stroke-width="3" stroke-linecap="round"/>
  <circle class="tip" cx="50" cy="12" r="5"/>
  <circle class="ear" cx="12" cy="52" r="5"/><circle class="ear" cx="88" cy="52" r="5"/>
  <rect class="shell" x="17" y="24" width="66" height="56" rx="25"/>
  <rect class="screen" x="25" y="32" width="50" height="40" rx="17"/>
  <g id="ariEyes"><rect class="eye l" x="36" y="42" width="9" height="15" rx="4.5"/><rect class="eye r" x="55" y="42" width="9" height="15" rx="4.5"/></g>
  <path class="mouth-smile" d="M42 64 Q50 70 58 64"/>
  <g class="mouth-bars"><rect x="38" y="61" width="3.6" height="8" rx="1.8"/><rect x="44" y="61" width="3.6" height="8" rx="1.8"/><rect x="50" y="61" width="3.6" height="8" rx="1.8"/><rect x="56" y="61" width="3.6" height="8" rx="1.8"/><rect x="62" y="61" width="3.6" height="8" rx="1.8"/></g>
</svg>`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const listJoin = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1]);
const say_ = (t) => String(t).replace(/&/g, "and");
const spokenCode = (c) => { const m = /(\d+)k\+ lines/.exec(c || ""); return m ? `It's more than ${m[1]} thousand lines of code.` : ""; };
const cutAtSentence = (t, max) => { if (t.length <= max) return t; const cut = t.slice(0, max); const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! ")); return (i > 120 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "") + "…"); };

export function createGuide(profile, { openChat, ask } = {}) {
  const G = profile.guide;
  const reduce = reducedMotion();
  const voice = createVoice();

  /* ------------------------------------------------------------ DOM */
  const bot = h("div", { class: "ari away interactive", id: "ari", role: "button", tabindex: "0", "aria-label": "ARI, the AI guide. Activate to start the tour", "data-mood": "idle", html: `<div class="ari-tilt"><div class="ari-float">${BOT_SVG}</div></div>` });
  const fx = h("canvas", { id: "ariFx", "aria-hidden": "true" });
  const veil = h("div", { class: "veil", "aria-hidden": "true" });
  const spot = h("div", { class: "spot", "aria-hidden": "true" });
  const launcher = h("button", { class: "launcher", type: "button", "aria-label": "Open the guide menu", html: `<i>${svg('<path d="M8 5v14l11-7z"/>', 14)}</i><span>Tour with ARI</span>` });
  const menu = h("div", { class: "ari-menu", role: "menu", "aria-label": "Guide menu" });
  const say = h("p", { class: "con-say", "aria-hidden": "true" });
  const live = h("span", { class: "sr-only", "aria-live": "polite" });
  const qLine = h("p", { class: "con-q", hidden: true });
  const cta = h("div", { class: "con-cta" });
  const bar = h("span");
  const stepLbl = h("span", { class: "con-step" });
  const nameLbl = h("span", { class: "con-name" }, "ARI · guide");
  const slot = h("div", { class: "con-bot", "aria-hidden": "true" });
  const pills = h("div", { class: "pills", role: "tablist", "aria-label": "Tour chapters" });
  const iconBtn = (label, path, cls = "") => h("button", { class: `ctl ${cls}`, type: "button", "aria-label": label, title: label, html: svg(path, 17) });
  const PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', PLAY = '<path d="M8 5v14l11-7z"/>';
  const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
  const btnPrev = iconBtn("Previous step", '<path d="M19 20 9 12l10-8zM5 4v16"/>', "nav-only");
  const btnPlay = iconBtn("Pause tour", PAUSE, "main nav-only");
  const btnNext = iconBtn("Next step", '<path d="m5 4 10 8-10 8zM19 4v16"/>', "nav-only");
  const btnVoice = iconBtn("Spoken narration", '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>');
  const btnAsk = iconBtn("Ask ARI a question", '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>');
  const btnExit = iconBtn("Close", '<path d="M18 6 6 18M6 6l12 12"/>');
  btnVoice.setAttribute("aria-pressed", String(voice.enabled));
  if (!voice.supported) { btnVoice.disabled = true; btnVoice.title = "Spoken narration isn't supported in this browser"; }

  const input = h("input", { type: "text", maxlength: 400, placeholder: "Ask me anything about Abhilash…", "aria-label": "Ask ARI a question", autocomplete: "off" });
  const btnMic = h("button", { class: "ctl mic", type: "button", "aria-label": "Talk to ARI (live voice)", "aria-pressed": "false", title: "Talk to ARI", html: svg(MIC, 17) });
  const btnSend = h("button", { class: "ctl main", type: "submit", "aria-label": "Send question", html: svg(ICONS.arrow, 17) });
  const btnResume = h("button", { class: "btn btn-ghost btn-sm resume", type: "button" }, "Back to the tour");
  const askForm = h("form", { class: "con-ask", autocomplete: "off" }, input, voice.supported || true ? btnMic : null, btnSend);
  const askRow = h("div", { class: "con-askrow" }, askForm, btnResume);

  const consoleEl = h("aside", { class: "console", id: "tourConsole", role: "region", "aria-label": "Guided tour with ARI" }, slot,
    h("div", { class: "con-main" },
      h("div", { class: "con-top" }, nameLbl, stepLbl),
      qLine, say, live, cta, askRow, h("div", { class: "con-bar" }, bar),
      h("div", { class: "con-ctl" }, pills, btnVoice, btnAsk, btnPrev, btnPlay, btnNext, btnExit)));
  document.body.append(veil, spot, fx, bot, launcher, menu, consoleEl);

  const tilt = $(".ari-tilt", bot), eyes = $("#ariEyes", bot), armL = $(".arm.l", bot), armR = $(".arm.r", bot);
  const ctx = fx.getContext("2d");

  /* ------------------------------------------------------------ state */
  const S = { x: innerWidth / 2, y: innerHeight + 70, vx: 0, vy: 0, s: 0.8, rot: 0, spin: 0, thrust: 0 };
  const spotR = { x: 0, y: 0, w: 0, h: 0, init: false };
  const parts = [], mouse = { x: innerWidth / 2, y: innerHeight / 2 }, eye = { x: 0, y: 0 };
  let W = innerWidth, H = innerHeight, dpr = 1, lastT = performance.now();
  let mode = "idle";          // idle | tour | chat
  let consoleOpen = false, target = null, fl = null;
  let steps = [], idx = -1, playing = true, userPaused = false, token = 0, advanceTimer = 0, doneChapters = new Set();
  let liveVoice = false, answering = false, emptyCycles = 0, lastCh = "";

  const sizeFx = () => { W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1); fx.width = W * dpr; fx.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  sizeFx(); addEventListener("resize", sizeFx);
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  const consoleH = () => (consoleOpen ? consoleEl.offsetHeight + (W < 600 ? 66 : 36) : 0);
  const availArea = () => ({ top: NAV + 12, bottom: H - consoleH() - 12 });

  /* ------------------------------------------------------------ where ARI lives */
  function slotNow() {
    const r = slot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 + 4, s: clamp(r.width / 96, 0.6, 1), ok: r.width > 20 };
  }
  /** Final position of the slot once the panel has finished rising (works while it is still animating). */
  function slotFinal() {
    const cw = consoleEl.offsetWidth, ch = consoleEl.offsetHeight, bottom = parseFloat(getComputedStyle(consoleEl).bottom) || 20;
    const left = (W - cw) / 2, top = H - bottom - ch;
    return { x: left + slot.offsetLeft + slot.offsetWidth / 2, y: top + slot.offsetTop + slot.offsetHeight / 2 + 4, s: clamp(slot.offsetWidth / 96, 0.6, 1) };
  }
  function desired() {
    if (consoleOpen) { const r = slotNow(); if (r.ok) return { x: r.x, y: r.y, s: r.s, away: false }; return { x: W / 2, y: H + 90, s: 0.8, away: true }; }
    const st = $("#stage"); const r = st?.getBoundingClientRect();
    if (r && r.bottom > 160 && r.top < H * 0.72) return { x: r.left + r.width / 2, y: r.top + r.height * 0.42, s: clamp(r.width / 230, 1.1, 2.1), away: false };
    return { x: 58, y: H + 70, s: 0.8, away: true };
  }
  function targetRect() {
    if (!target || mode !== "tour") return null;
    const r = target.getBoundingClientRect(), a = availArea();
    const top = Math.max(r.top, a.top), bottom = Math.min(r.bottom, a.bottom);
    return { left: Math.max(r.left, 0), right: Math.min(r.right, W), top, bottom: Math.max(bottom, top) };
  }

  /** Take off from wherever ARI is, orbit the whole page once, and land in the tour panel. */
  function flyIn() {
    return new Promise((res) => {
      if (reduce) { const e = slotFinal(); Object.assign(S, { x: e.x, y: e.y, s: e.s }); bot.classList.remove("away"); return res(); }
      if (bot.classList.contains("away")) { S.x = 58; S.y = H - 60; S.s = 0.8; }
      const e = slotFinal();
      fl = { t0: performance.now(), dur: 3000, sx: S.x, sy: S.y, ss: S.s, ex: e.x, ey: e.y, es: e.s, cx: W / 2, cy: H / 2 + 14, rx: Math.min(W * 0.4, 540), ry: Math.min(H * 0.31, 290), th0: Math.atan2(S.y - H / 2, S.x - W / 2), res };
      bot.classList.remove("away"); veil.classList.add("on"); setMood("happy");
    });
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - lastT) / 1000 || 0.016)); lastT = now; // never negative (throttled tabs, screenshots)
    if (fl) {
      const u = Math.min(1, (now - fl.t0) / fl.dur), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const w = Math.pow(Math.sin(Math.PI * u), 0.8), ang = fl.th0 + Math.PI * 2 * e;
      const nx = (fl.sx + (fl.ex - fl.sx) * e) * (1 - w) + (fl.cx + fl.rx * Math.cos(ang)) * w;
      const ny = (fl.sy + (fl.ey - fl.sy) * e) * (1 - w) + (fl.cy + fl.ry * Math.sin(ang)) * w;
      S.vx = (nx - S.x) / dt; S.vy = (ny - S.y) / dt; S.x = nx; S.y = ny;
      S.s = fl.ss + (fl.es - fl.ss) * e + 0.5 * Math.sin(Math.PI * u); S.spin = 360 * smooth(0.28, 0.72, u);
      if (u >= 1) { const done = fl.res; fl = null; S.vx = S.vy = 0; S.spin = 0; veil.classList.remove("on"); setMood("idle"); done(); }
    } else {
      const d = desired();
      if (bot.classList.contains("away") !== d.away) { bot.classList.toggle("away", d.away); launcher.classList.toggle("show", d.away && !consoleOpen); }
      if (reduce) { S.x = d.x; S.y = d.y; S.s = d.s; S.vx = S.vy = 0; }
      else {
        const K = 55, C = 12.5;
        S.vx += ((d.x - S.x) * K - S.vx * C) * dt; S.vy += ((d.y - S.y) * K - S.vy * C) * dt;
        S.x += S.vx * dt; S.y += S.vy * dt; S.s += (d.s - S.s) * Math.min(1, dt * 7);
      }
    }
    if (!isFinite(S.x + S.y + S.s + S.vx + S.vy)) { const d0 = desired(); Object.assign(S, { x: d0.x, y: d0.y, s: d0.s, vx: 0, vy: 0 }); }
    const speed = Math.hypot(S.vx, S.vy);
    S.rot += (clamp(S.vx * 0.024, -22, 22) - S.rot) * Math.min(1, dt * 10);
    S.thrust += (clamp(speed / 650, 0, 1) - S.thrust) * Math.min(1, dt * 9);
    bot.style.transform = `translate3d(${(S.x - BOT_W / 2).toFixed(1)}px, ${(S.y - BOT_H / 2).toFixed(1)}px, 0)`;
    tilt.style.transform = `rotate(${(S.rot + S.spin).toFixed(2)}deg) scale(${Math.max(0.3, S.s).toFixed(3)})`;
    bot.style.setProperty("--thrust", S.thrust.toFixed(2));

    // gaze + pointing arm
    const vr = targetRect();
    const look = vr ? { x: (vr.left + vr.right) / 2, y: (vr.top + vr.bottom) / 2 } : mouse;
    const dx = look.x - S.x, dy = look.y - S.y, n = Math.hypot(dx, dy) || 1;
    eye.x += ((dx / n) * Math.min(4, n / 40) - eye.x) * Math.min(1, dt * 12); eye.y += ((dy / n) * Math.min(3, n / 60) - eye.y) * Math.min(1, dt * 12);
    eyes.setAttribute("transform", `translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)})`);
    if (vr && !fl && speed < 120 && bot.dataset.mood === "talk") {
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (dx >= 0) { armR.style.transform = `rotate(${clamp(ang - 24, -150, 90)}deg)`; armL.style.transform = ""; }
      else { const a2 = Math.atan2(dy, -dx) * 180 / Math.PI; armL.style.transform = `rotate(${clamp(-(a2 - 24), -90, 150)}deg)`; armR.style.transform = ""; }
    } else { armL.style.transform = ""; armR.style.transform = ""; }

    // spotlight
    if (vr && vr.bottom - vr.top > 20) {
      const pad = 14, tx = vr.left - pad, ty = vr.top - pad, tw = vr.right - vr.left + pad * 2, th = vr.bottom - vr.top + pad * 2;
      if (!spotR.init || reduce) Object.assign(spotR, { x: tx, y: ty, w: tw, h: th, init: true });
      else { const k = Math.min(1, dt * 11); spotR.x += (tx - spotR.x) * k; spotR.y += (ty - spotR.y) * k; spotR.w += (tw - spotR.w) * k; spotR.h += (th - spotR.h) * k; }
      spot.style.cssText = `left:${spotR.x}px;top:${spotR.y}px;width:${spotR.w}px;height:${spotR.h}px`;
      spot.classList.add("on");
    } else { spot.classList.remove("on"); spotR.init = false; }

    // thruster trail (denser during the flight)
    if (!reduce && speed > 140 && parts.length < 220) for (let i = 0; i < (fl ? 3 : 2); i++) parts.push({ x: S.x + (Math.random() - 0.5) * 16, y: S.y + 38 * Math.max(0.5, S.s), vx: -S.vx * 0.05 + (Math.random() - 0.5) * 34, vy: 22 + Math.random() * 40 - S.vy * 0.04, life: 1, r: 2 + Math.random() * 3.4, c: Math.random() > 0.35 ? "94,234,212" : "255,138,107" });
    if (parts.length || ctx._had) {
      ctx.clearRect(0, 0, W, H); ctx._had = parts.length > 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt * 1.5; if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; ctx.fillStyle = `rgba(${p.c},${(p.life * 0.75).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 6.283); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const setMood = (m) => { bot.dataset.mood = m; };
  const hop = (v = 300) => { if (!fl && !reduce) S.vy -= v; };

  /* ------------------------------------------------------------ the script */
  const el = (sel) => (typeof sel === "string" ? $(sel) : sel);
  const OPEN_SKILL = ["Let's start with", "Next up,", "Then there's", "Moving on to", "And finally,"];
  const OPEN_PROJ = ["First up,", "Next,", "Then there's", "Another good one:", "This one's different.", "And here's", "Moving on,", "One more:", "And finally,"];
  function buildSteps() {
    const st = [];
    st.push({ ch: "intro", target: "#stage", say: G.intro, mood: "happy", tag: "Hello" });

    const turn = "#metrics .metric[data-id=turnaround]";
    if ($(turn)) st.push({ ch: "did", target: turn, say: G.impact, tag: "Headline result" });
    st.push({ ch: "did", target: "#metrics", say: G.impactMore, tag: "Impact in numbers" });
    for (const e of profile.experience)
      st.push({ ch: "did", target: "#expPanel", say: G.experience?.[e.id] || e.summary, tag: `${e.role} · ${e.org}`, before: () => window.__selectExp?.(e.id) });
    st.push({ ch: "did", target: "#education", say: G.education, tag: "Education" });
    st.push({ ch: "did", target: "#caseCard", say: G.case, tag: "Flagship system" });
    for (const lane of ["data", "agents", "trust", "ops"]) {
      const first = profile.caseStudy.pipeline.find((n) => n.lane === lane);
      if (G.lanes?.[lane]) st.push({ ch: "did", target: `.lane[data-lane=${lane}]`, say: G.lanes[lane], tag: `Pipeline · ${lane}`, lit: [`.lane[data-lane=${lane}]`], before: () => first && window.__caseShow?.(first) });
    }

    st.push({ ch: "good", target: "#skillTabs", say: G.skillsIntro, tag: "Skill levels" });
    profile.skills.categories.forEach((c, i) => {
      const core = c.skills.filter((s) => s.level === "core").map((s) => s.name);
      const work = c.skills.filter((s) => s.level === "working").map((s) => s.name);
      const area = say_(c.name);
      let t = core.length
        ? `${OPEN_SKILL[Math.min(i, OPEN_SKILL.length - 1)]} ${area}. The ones he's really shipped with are ${listJoin(core.slice(0, 6))}${core.length > 6 ? `, and ${core.length - 6} more` : ""}.`
        : `${OPEN_SKILL[Math.min(i, OPEN_SKILL.length - 1)]} ${area}.`;
      if (work.length) t += ` He's also comfortable with ${listJoin(work.slice(0, 3))}.`;
      st.push({ ch: "good", target: "#skillPanel", say: t, tag: c.name, before: () => window.__selectSkill?.(c.id) });
    });

    st.push({ ch: "built", target: "#projList", say: G.builtIntro, tag: "Projects" });
    profile.projects.filter((x) => x.showcase).forEach((p, i) => {
      const link = p.links?.[0], short = p.name.split(":")[0];
      st.push({
        ch: "built", target: "#projDetail", tag: short,
        say: `${OPEN_PROJ[Math.min(i, OPEN_PROJ.length - 1)]} ${short}. ${p.tagline} ${p.impact} ${spokenCode(p.code)}`.trim(),
        cta: link ? [{ label: "Open the repo", href: link.url }] : [],
        before: () => window.__selectProject?.(p.id)
      });
    });
    if ($("#moreGrid") && !$("#moreGrid").hidden) st.push({ ch: "built", target: "#moreGrid", say: G.builtOutro, tag: "Also on GitHub" });

    st.push({
      ch: "contact", target: "#contact .contact-list", say: G.closing, mood: "happy", tag: "Say hello",
      cta: [{ label: "Message Abhilash", action: () => { stop(); $("#cName")?.focus(); } }, { label: "Resume (PDF)", href: profile.identity.resume, download: true }, { label: "Ask ARI something", action: () => openAsk() }]
    });
    return st;
  }

  /* ------------------------------------------------------------ narration (text + voice, in step) */
  function typeSeg(base, text, ms, my, paint) {
    return new Promise((res) => {
      if (reduce || ms <= 0) { paint((base ? base + " " : "") + text); return res(); }
      const t0 = performance.now();
      (function tick() {
        if (my !== token) return res();
        const k = Math.min(1, (performance.now() - t0) / ms);
        paint((base ? base + " " : "") + text.slice(0, Math.ceil(text.length * k)));
        if (k < 1) setTimeout(tick, 22); else res();
      })();
    });
  }

  /** Show and (if voice is on) speak text, sentence by sentence, with pauses sized to punctuation. */
  async function narrate(text, my, { ignorePause = false } = {}) {
    const segs = segment(text), cur = h("span", { class: "cur" });
    const paint = (t) => say.replaceChildren(t, cur);
    let shown = ""; live.textContent = text;
    for (let i = 0; i < segs.length; i++) {
      if (my !== token) return false;
      while (!ignorePause && userPaused && my === token) await sleep(120);
      const sg = segs[i]; setMood("talk");
      const sp = voice.enabled ? voice.speakSegment(sg, i) : Promise.resolve(false);
      const ms = reduce ? 0 : Math.max(260, sg.text.length * (voice.enabled ? 56 : 20));
      await Promise.all([sp, typeSeg(shown, sg.text, ms, my, paint)]);
      if (my !== token) return false;
      shown += (shown ? " " : "") + sg.text; paint(shown);
      setMood("idle");
      if (!reduce) await sleep(voice.enabled ? sg.pause : 110);
    }
    say.textContent = shown; return true;
  }

  /* ------------------------------------------------------------ tour engine */
  function buildPills() {
    pills.replaceChildren(...G.chapters.filter((c) => steps.some((s) => s.ch === c.id)).map((c) =>
      h("button", { class: "pill", type: "button", role: "tab", "data-ch": c.id, title: c.label, onclick: () => { if (consoleEl.classList.contains("asking")) resume(c.id); else goTo(steps.findIndex((s) => s.ch === c.id)); } }, c.short || c.label)));
  }
  function paintPills(cur) {
    $$(".pill", pills).forEach((p) => {
      const on = p.dataset.ch === cur;
      p.classList.toggle("active", on); p.classList.toggle("done", doneChapters.has(p.dataset.ch) && !on); p.setAttribute("aria-selected", String(on));
      if (on) pills.scrollTo({ left: Math.max(0, p.getBoundingClientRect().left - pills.getBoundingClientRect().left + pills.scrollLeft - 2), behavior: "smooth" });
    });
  }
  const scrollSettled = () => new Promise((res) => {
    let last = scrollY, still = 0, n = 0;
    (function poll() { n++; if (Math.abs(scrollY - last) < 1) still++; else still = 0; last = scrollY; if (still >= 5 || n > 140) res(); else requestAnimationFrame(poll); })();
  });
  async function bringIntoView(node) {
    node.classList.add("in");
    const r = node.getBoundingClientRect(), a = availArea(), availH = a.bottom - a.top;
    let y = r.height <= availH - 24 ? scrollY + r.top - (a.top + (availH - r.height) / 2) : scrollY + r.top - a.top - 8;
    y = clamp(y, 0, document.documentElement.scrollHeight - H);
    if (Math.abs(y - scrollY) < 6) return;
    scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
    await scrollSettled();
  }

  let litEls = [];
  const clearLit = () => { litEls.forEach((n) => n.classList.remove("lit")); litEls = []; };

  async function goTo(i) {
    if (i < 0) i = 0;
    if (i >= steps.length) return finish();
    const my = ++token; clearTimeout(advanceTimer); voice.cancel();
    idx = i; const s = steps[i];
    consoleEl.classList.remove("asking"); qLine.hidden = true; cta.replaceChildren(); clearLit();
    bar.style.transition = "none"; bar.style.width = "0"; say.textContent = ""; stepLbl.textContent = `${i + 1} / ${steps.length}`;
    const ci = G.chapters.findIndex((c) => c.id === s.ch); G.chapters.slice(0, ci).forEach((c) => doneChapters.add(c.id));
    paintPills(s.ch); setMood("think");
    if (s.ch !== lastCh) { hop(420); lastCh = s.ch; } else hop(160);

    s.before?.();
    target = s.target ? el(s.target) : null;
    nameLbl.textContent = s.tag ? `ARI · ${s.tag}` : "ARI · guide";
    if (target) { await bringIntoView(target); if (my !== token) return; }
    (s.lit || []).forEach((q) => { const n = el(q); if (n) { n.classList.add("lit"); litEls.push(n); } });
    if (!reduce) await sleep(target ? 420 : 160);
    if (my !== token) return;

    for (const a of s.cta || []) {
      const attrs = { class: "btn btn-ghost btn-sm", type: "button" };
      cta.append(a.href ? h("a", { ...attrs, href: a.href, ...(a.download ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" }) }, a.label) : h("button", { ...attrs, onclick: a.action }, a.label));
    }
    const ok = await narrate(s.say, my);
    if (!ok || my !== token) return;
    setMood(s.mood === "happy" ? "happy" : "idle");
    schedule(my, s.say.length);
  }

  function schedule(my, len) {
    if (!playing || reduce) { bar.style.width = "100%"; bar.style.transition = "none"; return; }
    const dwell = voice.enabled ? 900 : 1500 + len * 13;
    bar.style.transition = `width ${dwell}ms linear`; bar.style.width = "100%";
    advanceTimer = setTimeout(() => { if (my === token && playing) goTo(idx + 1); }, dwell);
  }

  function setPlaying(on) {
    playing = on; userPaused = !on;
    btnPlay.innerHTML = svg(on ? PAUSE : PLAY, 17);
    btnPlay.setAttribute("aria-label", on ? "Pause tour" : "Resume tour"); btnPlay.title = btnPlay.getAttribute("aria-label");
    if (!on) { clearTimeout(advanceTimer); const w = getComputedStyle(bar).width; bar.style.transition = "none"; bar.style.width = w; }
    else if (!consoleEl.classList.contains("asking") && bar.style.width && !say.querySelector(".cur") && say.textContent) goTo(idx + 1);
  }

  /* ------------------------------------------------------------ console open / close */
  async function openConsole(m) {
    closeMenu(); launcher.classList.remove("show");
    mode = m; consoleEl.classList.toggle("chat-only", m === "chat");
    if (consoleOpen) return;
    consoleOpen = true; document.body.classList.add("touring"); bot.classList.remove("interactive");
    consoleEl.classList.add("open");
    nameLbl.textContent = "ARI · taking off…"; say.textContent = ""; stepLbl.textContent = "";
    await flyIn();
  }

  async function begin(chapterId = "intro") {
    if (fl) return;
    steps = buildSteps(); buildPills(); doneChapters = new Set(); lastCh = "";
    if (chapterId === "intro") scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    await openConsole("tour");
    userPaused = false; setPlaying(!reduce);
    goTo(Math.max(0, steps.findIndex((s) => s.ch === chapterId)));
  }

  async function converse({ listen = false } = {}) {
    if (fl) return;
    await openConsole("chat");
    consoleEl.classList.add("asking"); nameLbl.textContent = "ARI · ask me anything"; stepLbl.textContent = "";
    const my = ++token; qLine.hidden = true; cta.replaceChildren(); target = null;
    const greet = listen && listener.supported ? G.greetVoice || "Hi! I'm ARI. Go ahead, I'm listening." : G.greet || "Hi! I'm ARI. Ask me anything about Abhilash.";
    await narrate(greet, my, { ignorePause: true });
    if (my !== token) return;
    if (listen && listener.supported) { liveVoice = true; startListening(); } else input.focus();
  }

  function finish() {
    clearTimeout(advanceTimer); voice.cancel(); G.chapters.forEach((c) => doneChapters.add(c.id)); paintPills("contact");
    const my = ++token; stepLbl.textContent = "done"; cta.replaceChildren(); target = null;
    narrate(G.finish || "That's everything. If anything caught your eye, just ask me.", my, { ignorePause: true }).then(() => { if (my === token) { setMood("happy"); openAsk(true); } });
  }

  function stop() {
    token++; clearTimeout(advanceTimer); voice.cancel(); listener.stop(); liveVoice = false; answering = false; fl = null; veil.classList.remove("on");
    clearLit(); target = null; consoleOpen = false; mode = "idle";
    consoleEl.classList.remove("open", "asking", "listening"); document.body.classList.remove("touring"); bot.classList.add("interactive");
    btnMic.setAttribute("aria-pressed", "false"); qLine.hidden = true;
    setMood("happy"); setTimeout(() => setMood("idle"), 1800);
    setTimeout(() => { if (!consoleOpen && bot.classList.contains("away")) launcher.classList.add("show"); }, 700);
  }

  /* ------------------------------------------------------------ interactive Q&A */
  const listener = createListener({
    onInterim: (t) => { input.value = t; },
    onFinal: (t) => { input.value = ""; handleQuestion(t); },
    onEnd: (wasActive) => {
      consoleEl.classList.remove("listening"); btnMic.setAttribute("aria-pressed", String(liveVoice));
      if (!answering && wasActive && liveVoice && consoleOpen) { // silence timeout: listen again, but not forever
        if (++emptyCycles > 3) { liveVoice = false; btnMic.setAttribute("aria-pressed", "false"); setMood("idle"); return; }
        setTimeout(() => { if (liveVoice && !answering && consoleOpen) startListening(); }, 350);
      } else if (!answering) setMood("idle");
    },
    onError: (e) => {
      consoleEl.classList.remove("listening");
      if (e === "not-allowed" || e === "service-not-allowed") { liveVoice = false; btnMic.setAttribute("aria-pressed", "false"); showNote("I can't hear you. The microphone is blocked in this browser. You can still type."); }
    }
  });
  const showNote = (t) => { say.textContent = t; };

  function startListening() {
    voice.cancel();
    if (!listener.supported) { showNote("Voice input isn't supported in this browser. Try Chrome or Edge, or just type."); input.focus(); return; }
    const ok = listener.start();
    consoleEl.classList.toggle("listening", ok); btnMic.setAttribute("aria-pressed", String(ok));
    if (ok) { setMood("listen"); if (!say.textContent || say.querySelector(".cur") === null) say.textContent = "I'm listening…"; }
  }

  /** Pause the tour (if any) and open the question box. */
  function openAsk(keepText = false) {
    if (!consoleOpen) { converse(); return; }
    if (!consoleEl.classList.contains("asking")) {
      token++; clearTimeout(advanceTimer); voice.cancel(); playing = false; userPaused = true; btnPlay.innerHTML = svg(PLAY, 17);
      setMood("idle");
      if (!keepText) say.textContent = "Of course. What would you like to know?";
    }
    consoleEl.classList.add("asking"); cta.replaceChildren(); input.focus();
  }

  async function handleQuestion(q) {
    q = (q || "").trim(); if (!q) return;
    openAsk(true);
    // a new question interrupts whatever ARI is saying (barge-in); the newest token owns the UI
    const my = ++token; answering = true; listener.stop(); voice.cancel(); clearTimeout(advanceTimer);
    qLine.textContent = `You asked: ${q}`; qLine.hidden = false; cta.replaceChildren(); say.replaceChildren(h("span", { class: "dots", html: "<i></i><i></i><i></i>" }));
    input.value = ""; input.disabled = true; setMood("think"); nameLbl.textContent = "ARI · thinking";
    let msg = null;
    try { msg = await ask?.(q); } catch { /* fall through */ }
    if (my !== token) return;
    // live agent answers are already conversational; offline retrieval is rewritten to sound spoken
    const reply = msg?.mode === "llm" ? { text: plain(msg.text), cta: [] } : spokenAnswer(q, profile, msg);
    let answer = reply.text || "Hmm, I couldn't find that. You can message Abhilash directly and he'll answer personally.";
    const long = answer.length > 620; if (long) answer = cutAtSentence(answer, 620);
    nameLbl.textContent = "ARI · answering"; input.disabled = false;
    const actions = [...(reply.cta || [])];
    if (long) actions.push({ label: "Read the full answer", action: "chat" });
    await narrate(answer, my, { ignorePause: true });
    if (my !== token) return;
    for (const a of actions) cta.append(answerButton(a));
    answering = false; emptyCycles = 0; setMood("idle"); nameLbl.textContent = "ARI · ask me anything";
    if (liveVoice && consoleOpen) startListening(); else input.focus();
  }

  /** Buttons that follow an answer: links, or shortcuts into the page. */
  function answerButton(a) {
    const attrs = { class: "btn btn-ghost btn-sm" };
    if (a.href) return h("a", { ...attrs, href: a.href }, a.label);
    const go = {
      contact: () => { stop(); $("#contact")?.scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("#cName")?.focus({ preventScroll: true }), 700); },
      chat: () => { openChat?.(); },
      fit: () => { stop(); $("#ask")?.scrollIntoView({ behavior: "smooth" }); document.getElementById("tab-fit")?.click(); },
      case: () => { stop(); $("#case")?.scrollIntoView({ behavior: "smooth" }); },
      fde: () => { stop(); $("#fde")?.scrollIntoView({ behavior: "smooth" }); }
    }[a.action];
    const run = go || (() => { const m = /^tour:(\w+)/.exec(a.action || ""); if (m) begin(m[1]); });
    return h("button", { ...attrs, type: "button", onclick: run }, a.label);
  }

  async function resume(chapterId) {
    consoleEl.classList.remove("asking", "listening"); qLine.hidden = true; listener.stop(); liveVoice = false; btnMic.setAttribute("aria-pressed", "false"); answering = false;
    playing = true; userPaused = false; btnPlay.innerHTML = svg(PAUSE, 17);
    if (chapterId) return goTo(steps.findIndex((s) => s.ch === chapterId));
    const my = ++token; say.textContent = "";
    await narrate("Alright, back to the tour.", my, { ignorePause: true });
    if (my === token) goTo(idx);
  }

  /* ------------------------------------------------------------ launcher menu */
  function openMenu() {
    menu.replaceChildren(h("h4", {}, "Where to?"),
      ...G.chapters.filter((c) => c.id !== "intro" && c.id !== "contact").map((c, i) => h("button", { type: "button", role: "menuitem", onclick: () => begin(c.id) }, h("span", { class: "mi" }, `0${i + 1}`), h("span", {}, h("b", {}, c.label), h("small", {}, c.blurb)))),
      h("button", { type: "button", role: "menuitem", onclick: () => begin("intro") }, h("span", { class: "mi" }, "▶"), h("span", {}, h("b", {}, "Full guided tour"), h("small", {}, "About 4 minutes, with voice"))),
      h("button", { type: "button", role: "menuitem", onclick: () => converse({ listen: listener.supported }) }, h("span", { class: "mi", html: svg(MIC, 14) }), h("span", {}, h("b", {}, "Talk to ARI"), h("small", {}, "Ask by voice or text"))));
    menu.classList.add("open");
  }
  const closeMenu = () => menu.classList.remove("open");

  /* ------------------------------------------------------------ wiring */
  launcher.addEventListener("click", () => (menu.classList.contains("open") ? closeMenu() : openMenu()));
  bot.addEventListener("click", () => { if (!consoleOpen) begin("intro"); });
  bot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bot.click(); } });
  document.addEventListener("click", (e) => { if (menu.classList.contains("open") && !menu.contains(e.target) && !launcher.contains(e.target)) closeMenu(); });
  btnPrev.addEventListener("click", () => (consoleEl.classList.contains("asking") ? resume() : goTo(idx - 1)));
  btnNext.addEventListener("click", () => { if (consoleEl.classList.contains("asking")) { consoleEl.classList.remove("asking"); playing = true; userPaused = false; } goTo(idx + 1); });
  btnPlay.addEventListener("click", () => { if (consoleEl.classList.contains("asking")) resume(); else setPlaying(!playing); });
  btnExit.addEventListener("click", stop);
  btnAsk.addEventListener("click", () => openAsk());
  btnResume.addEventListener("click", () => resume());
  btnVoice.addEventListener("click", () => {
    voice.enabled = !voice.enabled; btnVoice.setAttribute("aria-pressed", String(voice.enabled));
    if (voice.enabled && mode === "tour" && !consoleEl.classList.contains("asking") && idx >= 0) goTo(idx);
  });
  askForm.addEventListener("submit", (e) => { e.preventDefault(); handleQuestion(input.value); });
  btnMic.addEventListener("click", () => {
    if (listener.active || liveVoice) { liveVoice = false; listener.stop(); consoleEl.classList.remove("listening"); btnMic.setAttribute("aria-pressed", "false"); setMood("idle"); return; }
    openAsk(true); liveVoice = true; emptyCycles = 0; say.textContent = ""; startListening();
  });
  document.addEventListener("keydown", (e) => {
    if (!consoleOpen) return;
    if (e.key === "Escape" && !document.querySelector(".palette:not([hidden])")) { stop(); return; }
    if (mode !== "tour" || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); }
    else if (e.key === " " && !e.target.closest?.("button, a")) { e.preventDefault(); setPlaying(!playing); }
  });
  document.addEventListener("portfolio:tour", (e) => begin(e.detail?.chapter || "intro"));
  document.addEventListener("portfolio:converse", (e) => converse({ listen: !!e.detail?.listen }));

  launcher.classList.add("show");
  setMood("idle");
  return { start: begin, converse, stop, get touring() { return consoleOpen; } };
}
