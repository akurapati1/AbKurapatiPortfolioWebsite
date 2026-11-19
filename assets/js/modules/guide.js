import { $, $$, h, svg, ICONS, reducedMotion, sleep, safeStorage } from "../util.js";

/**
 * ARI — the AI guide.
 *
 * A small robot that physically travels through the page (spring physics, thruster trail,
 * look-at eyes, pointing arm), spotlights the section it is describing and narrates it in a
 * console, optionally out loud. The script is generated from data/profile.json, so adding an
 * experience, skill category or project automatically adds it to the tour.
 */

const BOT_W = 84, BOT_H = 96;
const NAV = 66;

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
const listJoin = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

export function createGuide(profile, { openChat } = {}) {
  const G = profile.guide;
  const reduce = reducedMotion();

  /* ------------------------------------------------------------ DOM */
  const bot = h("div", { class: "ari away interactive", id: "ari", role: "button", tabindex: "0", "aria-label": "ARI, the AI guide. Activate for the tour menu", "data-mood": "idle", html: `<span class="ari-halo"></span><div class="ari-tilt"><div class="ari-float">${BOT_SVG}</div></div>` });
  const fx = h("canvas", { id: "ariFx", "aria-hidden": "true" });
  const spot = h("div", { class: "spot", "aria-hidden": "true" });
  const launcher = h("button", { class: "launcher", type: "button", "aria-label": "Open the guide menu", html: `<i>${svg('<path d="M8 5v14l11-7z"/>', 14)}</i><span>Tour with ARI</span>` });
  const menu = h("div", { class: "ari-menu", role: "menu", "aria-label": "Guide menu" });
  const say = h("p", { class: "con-say", "aria-hidden": "true" });
  const live = h("span", { class: "sr-only", "aria-live": "polite" });
  const cta = h("div", { class: "con-cta" });
  const bar = h("span");
  const stepLbl = h("span", { class: "con-step" });
  const nameLbl = h("span", { class: "con-name" }, "ARI · guide");
  const slot = h("div", { class: "con-bot", "aria-hidden": "true" });
  const pills = h("div", { class: "pills", role: "tablist", "aria-label": "Tour chapters" });
  const iconBtn = (label, path, cls = "") => h("button", { class: `ctl ${cls}`, type: "button", "aria-label": label, title: label, html: svg(path, 17) });
  const btnPrev = iconBtn("Previous step", '<path d="M19 20 9 12l10-8zM5 4v16"/>');
  const btnPlay = iconBtn("Pause tour", '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', "main");
  const btnNext = iconBtn("Next step", '<path d="m5 4 10 8-10 8zM19 4v16"/>');
  const btnVoice = iconBtn("Read aloud", '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>');
  const btnExit = iconBtn("End tour", '<path d="M18 6 6 18M6 6l12 12"/>');
  btnVoice.setAttribute("aria-pressed", "false");
  const consoleEl = h("aside", { class: "console", id: "tourConsole", role: "region", "aria-label": "Guided tour with ARI" }, slot,
    h("div", { class: "con-main" },
      h("div", { class: "con-top" }, nameLbl, stepLbl),
      say, live, cta, h("div", { class: "con-bar" }, bar),
      h("div", { class: "con-ctl" }, pills, btnVoice, btnPrev, btnPlay, btnNext, btnExit)));
  document.body.append(spot, fx, bot, launcher, menu, consoleEl);

  const tilt = $(".ari-tilt", bot), eyes = $("#ariEyes", bot), armL = $(".arm.l", bot), armR = $(".arm.r", bot);
  const ctx = fx.getContext("2d");

  /* ------------------------------------------------------------ physics */
  const S = { x: innerWidth / 2, y: innerHeight - 70, vx: 0, vy: 0, s: 1, rot: 0, thrust: 0, tx: 0, ty: 0, ts: 1 };
  const spotR = { x: 0, y: 0, w: 0, h: 0, init: false };
  const parts = [];
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const eye = { x: 0, y: 0 };
  let W = innerWidth, H = innerHeight, dpr = 1;
  let touring = false, target = null, lastT = performance.now();

  const sizeFx = () => {
    W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
    fx.width = W * dpr; fx.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  sizeFx(); addEventListener("resize", sizeFx);
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  const consoleH = () => (consoleEl.classList.contains("open") ? consoleEl.offsetHeight + 36 : 0);
  const availArea = () => ({ top: NAV + 12, bottom: H - consoleH() - 12 });

  /** Where ARI lives: inside the tour panel while touring, on the hero stage otherwise, hidden elsewhere. */
  function desired() {
    if (touring) {
      const r = slot.getBoundingClientRect();
      if (r.width > 20 && consoleEl.classList.contains("open")) return { x: r.left + r.width / 2, y: r.top + r.height / 2 + 4, s: 1, away: false };
      return { x: W / 2, y: H + 80, s: 0.8, away: true };
    }
    const st = $("#stage"); const r = st?.getBoundingClientRect();
    if (r && r.bottom > 160 && r.top < H * 0.72) return { x: r.left + r.width / 2, y: r.top + r.height * 0.42, s: clamp(r.width / 230, 1.1, 2.1), away: false };
    return { x: 58, y: H + 70, s: 0.8, away: true };
  }

  /** Visible, clipped rect of the element being explained (drives the spotlight and ARI's gaze). */
  function targetRect() {
    if (!target) return null;
    const r = target.getBoundingClientRect(); const a = availArea();
    const top = Math.max(r.top, a.top), bottom = Math.min(r.bottom, a.bottom);
    return { left: Math.max(r.left, 0), right: Math.min(r.right, W), top, bottom: Math.max(bottom, top), full: r };
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastT) / 1000 || 0.016); lastT = now;
    const d = desired();
    S.tx = d.x; S.ty = d.y; S.ts = d.s;
    if (bot.classList.contains("away") !== d.away) { bot.classList.toggle("away", d.away); launcher.classList.toggle("show", d.away && !touring); }
    if (reduce) { S.x = S.tx; S.y = S.ty; S.s = S.ts; S.vx = S.vy = 0; }
    else {
      const K = 55, C = 12.5;
      S.vx += ((S.tx - S.x) * K - S.vx * C) * dt; S.vy += ((S.ty - S.y) * K - S.vy * C) * dt;
      S.x += S.vx * dt; S.y += S.vy * dt; S.s += (S.ts - S.s) * Math.min(1, dt * 7);
    }
    const speed = Math.hypot(S.vx, S.vy);
    S.rot += (clamp(S.vx * 0.024, -20, 20) - S.rot) * Math.min(1, dt * 10);
    S.thrust += (clamp(speed / 650, 0, 1) - S.thrust) * Math.min(1, dt * 9);
    bot.style.transform = `translate3d(${(S.x - BOT_W / 2).toFixed(1)}px, ${(S.y - BOT_H / 2).toFixed(1)}px, 0)`;
    tilt.style.transform = `rotate(${S.rot.toFixed(2)}deg) scale(${S.s.toFixed(3)})`;
    bot.style.setProperty("--thrust", S.thrust.toFixed(2));

    // eyes + pointing arm
    const vr = targetRect();
    const look = touring && vr ? { x: (vr.left + vr.right) / 2, y: (vr.top + vr.bottom) / 2 } : mouse;
    const dx = look.x - S.x, dy = look.y - S.y, n = Math.hypot(dx, dy) || 1;
    eye.x += ((dx / n) * Math.min(4, n / 40) - eye.x) * Math.min(1, dt * 12); eye.y += ((dy / n) * Math.min(3, n / 60) - eye.y) * Math.min(1, dt * 12);
    eyes.setAttribute("transform", `translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)})`);
    const pointing = touring && vr && speed < 120 && bot.dataset.mood !== "think";
    if (pointing) {
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (dx >= 0) { armR.style.transform = `rotate(${clamp(ang - 24, -150, 90)}deg)`; armL.style.transform = ""; }
      else { const a2 = Math.atan2(dy, -dx) * 180 / Math.PI; armL.style.transform = `rotate(${clamp(-(a2 - 24), -90, 150)}deg)`; armR.style.transform = ""; }
    } else { armL.style.transform = ""; armR.style.transform = ""; }

    // spotlight
    if (touring && vr && vr.bottom - vr.top > 20) {
      const pad = 14, tx = vr.left - pad, ty = vr.top - pad, tw = vr.right - vr.left + pad * 2, th = vr.bottom - vr.top + pad * 2;
      if (!spotR.init || reduce) Object.assign(spotR, { x: tx, y: ty, w: tw, h: th, init: true });
      else { const k = Math.min(1, dt * 13); spotR.x += (tx - spotR.x) * k; spotR.y += (ty - spotR.y) * k; spotR.w += (tw - spotR.w) * k; spotR.h += (th - spotR.h) * k; }
      spot.style.cssText = `left:${spotR.x}px;top:${spotR.y}px;width:${spotR.w}px;height:${spotR.h}px`;
      spot.classList.add("on");
    } else { spot.classList.remove("on"); spotR.init = false; }

    // thruster trail
    if (!reduce && speed > 140 && parts.length < 140) for (let i = 0; i < 2; i++) parts.push({ x: S.x + (Math.random() - .5) * 14, y: S.y + 38 * S.s, vx: -S.vx * .06 + (Math.random() - .5) * 30, vy: 24 + Math.random() * 40 - S.vy * .04, life: 1, r: 2 + Math.random() * 3, c: Math.random() > .35 ? "94,234,212" : "255,122,89" });
    if (parts.length || ctx._had) {
      ctx.clearRect(0, 0, W, H); ctx._had = parts.length > 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt * 1.7; if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; ctx.fillStyle = `rgba(${p.c},${(p.life * .8).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, 6.283); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ mood */
  const setMood = (m) => { bot.dataset.mood = m; };
  let moodTimer = 0;
  const flash = (m, ms) => { setMood(m); clearTimeout(moodTimer); moodTimer = setTimeout(() => setMood("idle"), ms); };

  /* ------------------------------------------------------------ steps */
  const el = (sel) => (typeof sel === "string" ? $(sel) : sel);
  function buildSteps() {
    const st = [];
    st.push({ ch: "intro", target: "#stage", say: G.intro, mood: "happy", tag: "Hello" });

    // 1 · what he's done
    const turn = "#metrics .metric[data-id=turnaround]";
    if ($(turn)) st.push({ ch: "did", target: turn, say: G.impact, tag: "Headline result", lit: [turn] });
    st.push({ ch: "did", target: "#metrics", say: G.impactMore, tag: "Impact in numbers" });
    for (const e of profile.experience)
      st.push({ ch: "did", target: "#expPanel", say: G.experience?.[e.id] || e.summary, tag: `${e.role} · ${e.org}`, before: () => window.__selectExp?.(e.id) });
    st.push({ ch: "did", target: "#education", say: G.education, tag: "Education" });
    st.push({ ch: "did", target: "#caseCard", say: G.case, tag: "Flagship system" });
    for (const lane of ["data", "agents", "trust", "ops"]) {
      const first = profile.caseStudy.pipeline.find((n) => n.lane === lane);
      if (G.lanes?.[lane]) st.push({ ch: "did", target: `.lane[data-lane=${lane}]`, say: G.lanes[lane], tag: `Pipeline · ${lane}`, lit: [`.lane[data-lane=${lane}]`], before: () => first && window.__caseShow?.(first) });
    }

    // 2 · what he's good at
    st.push({ ch: "good", target: "#skillTabs", say: G.skillsIntro, tag: "Skill levels" });
    for (const c of profile.skills.categories) {
      const core = c.skills.filter((s) => s.level === "core").map((s) => s.name);
      const work = c.skills.filter((s) => s.level === "working").map((s) => s.name);
      let t = core.length ? `${c.name}. Core, meaning shipped in real work: ${listJoin(core.slice(0, 6))}${core.length > 6 ? `, plus ${core.length - 6} more` : ""}.` : `${c.name}.`;
      if (work.length) t += ` Comfortable with ${listJoin(work.slice(0, 3))}.`;
      st.push({ ch: "good", target: "#skillPanel", say: t, tag: c.name, before: () => window.__selectSkill?.(c.id) });
    }

    // 3 · what he's built
    st.push({ ch: "built", target: "#projList", say: G.builtIntro, tag: "Projects" });
    for (const p of profile.projects.filter((x) => x.showcase)) {
      const link = p.links?.[0];
      st.push({
        ch: "built", target: "#projDetail", tag: p.name,
        say: `${p.name}. ${p.tagline} ${p.impact}`,
        cta: link ? [{ label: "Open the repo", href: link.url }] : [],
        before: () => window.__selectProject?.(p.id)
      });
    }
    if ($("#moreGrid") && !$("#moreGrid").hidden) st.push({ ch: "built", target: "#moreGrid", say: G.builtOutro, tag: "Also on GitHub" });

    // 4 · contact
    st.push({
      ch: "contact", target: "#contact .contact-list", say: G.closing, mood: "happy", tag: "Say hello",
      cta: [{ label: "Message Abhilash", action: () => { $("#cName")?.focus({ preventScroll: false }); } }, { label: "Resume (PDF)", href: profile.identity.resume, download: true }, { label: "Ask my AI", action: () => { stop(); openChat?.(); } }]
    });
    return st;
  }

  /* ------------------------------------------------------------ engine */
  let steps = [], idx = -1, playing = true, token = 0, advanceTimer = 0, voiceOn = false, litEls = [], doneChapters = new Set();

  const speak = (text) => new Promise((res) => {
    if (!voiceOn || !("speechSynthesis" in window)) return res(false);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = 1.04; u.pitch = 1.08; u.lang = "en-US";
      const v = speechSynthesis.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /(natural|google|samantha|aria|jenny)/i.test(x.name)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.onend = () => res(true); u.onerror = () => res(false);
      speechSynthesis.speak(u);
    } catch { res(false); }
  });

  function buildPills() {
    pills.replaceChildren(...G.chapters.filter((c) => steps.some((s) => s.ch === c.id)).map((c) =>
      h("button", { class: "pill", type: "button", role: "tab", "data-ch": c.id, title: c.label, onclick: () => goTo(steps.findIndex((s) => s.ch === c.id)) }, c.short || c.label)));
  }
  function paintPills(cur) {
    $$(".pill", pills).forEach((p) => { p.classList.toggle("active", p.dataset.ch === cur); p.classList.toggle("done", doneChapters.has(p.dataset.ch) && p.dataset.ch !== cur); p.setAttribute("aria-selected", String(p.dataset.ch === cur)); if (p.dataset.ch === cur) pills.scrollTo({ left: Math.max(0, p.getBoundingClientRect().left - pills.getBoundingClientRect().left + pills.scrollLeft - 2), behavior: "smooth" }); });
  }

  const scrollSettled = () => new Promise((res) => {
    let last = scrollY, still = 0, n = 0;
    (function poll() { n++; if (Math.abs(scrollY - last) < 1) still++; else still = 0; last = scrollY; if (still >= 5 || n > 130) res(); else requestAnimationFrame(poll); })();
  });

  async function bringIntoView(node) {
    node.classList.add("in");
    const r = node.getBoundingClientRect(), a = availArea();
    const availH = a.bottom - a.top;
    let y;
    if (r.height <= availH - 24) y = scrollY + r.top - (a.top + (availH - r.height) / 2);
    else y = scrollY + r.top - a.top - 8;
    y = clamp(y, 0, document.documentElement.scrollHeight - H);
    if (Math.abs(y - scrollY) < 6) return;
    scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
    await scrollSettled();
  }

  function clearLit() { litEls.forEach((n) => n.classList.remove("lit")); litEls = []; }

  async function goTo(i) {
    if (i < 0) i = 0;
    if (i >= steps.length) return finish();
    const my = ++token; clearTimeout(advanceTimer); try { speechSynthesis?.cancel(); } catch {}
    idx = i; const s = steps[i];
    clearLit(); bar.style.transition = "none"; bar.style.width = "0";
    cta.replaceChildren(); say.textContent = ""; stepLbl.textContent = `${i + 1} / ${steps.length}`;
    const ci = G.chapters.findIndex((c) => c.id === s.ch); G.chapters.slice(0, ci).forEach((c) => doneChapters.add(c.id));
    paintPills(s.ch);
    setMood("think");

    s.before?.();
    target = s.target ? el(s.target) : null;
    nameLbl.textContent = s.tag ? `ARI · ${s.tag}` : "ARI · guide";
    if (target) { await bringIntoView(target); if (my !== token) return; }
    else if (scrollY > 40 && s.ch === "intro") { scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); await scrollSettled(); if (my !== token) return; }
    (s.lit || []).forEach((q) => { const n = el(q); if (n) { n.classList.add("lit"); litEls.push(n); } });
    // let the bot arrive before it speaks
    if (!reduce) await sleep(target ? 520 : 200);
    if (my !== token) return;

    for (const a of s.cta || []) {
      const attrs = { class: "btn btn-ghost btn-sm", type: "button" };
      cta.append(a.href ? h("a", { ...attrs, href: a.href, ...(a.download ? { download: "" } : { target: "_blank", rel: "noopener noreferrer" }) }, a.label) : h("button", { ...attrs, onclick: a.action }, a.label));
    }
    live.textContent = s.say;
    setMood(s.mood === "happy" ? "happy" : "talk");
    const spoken = speak(s.say);
    await typeOut(s.say, my);
    if (my !== token) return;
    setMood(s.mood === "happy" ? "happy" : "idle");
    schedule(my, s.say.length, spoken);
  }

  async function typeOut(text, my) {
    if (reduce) { say.textContent = text; return; }
    const cur = h("span", { class: "cur" });
    for (let c = 1; c <= text.length; c += 2) {
      if (my !== token) return;
      say.replaceChildren(text.slice(0, c), cur);
      await sleep(15);
    }
    say.textContent = text;
  }

  function schedule(my, len, spokenP) {
    if (!playing || reduce) { bar.style.width = "100%"; bar.style.transition = "none"; return; }
    const dwell = 1700 + len * 17;
    bar.style.transition = `width ${dwell}ms linear`; bar.style.width = "100%";
    const next = () => { if (my === token && playing) goTo(idx + 1); };
    if (voiceOn) spokenP.then((ok) => { if (ok) setTimeout(next, 700); else advanceTimer = setTimeout(next, dwell); });
    else advanceTimer = setTimeout(next, dwell);
  }

  function setPlaying(on) {
    playing = on;
    btnPlay.innerHTML = on ? svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', 17) : svg('<path d="M8 5v14l11-7z"/>', 17);
    btnPlay.setAttribute("aria-label", on ? "Pause tour" : "Resume tour"); btnPlay.title = btnPlay.getAttribute("aria-label");
    if (!on) { clearTimeout(advanceTimer); const w = getComputedStyle(bar).width; bar.style.transition = "none"; bar.style.width = w; try { speechSynthesis?.pause(); } catch {} }
    else { try { speechSynthesis?.resume(); } catch {} if (say.textContent && !say.querySelector(".cur")) goTo(idx + 1); }
  }

  function begin(chapterId = "intro") {
    steps = buildSteps(); buildPills(); doneChapters = new Set();
    closeMenu(); launcher.classList.remove("show");
    touring = true; document.body.classList.add("touring"); bot.classList.remove("interactive");
    consoleEl.classList.add("open"); setPlaying(!reduce);
    safeStorage.set("ariSeen", "1");
    const start = Math.max(0, steps.findIndex((s) => s.ch === chapterId));
    goTo(start);
  }

  function finish() {
    clearTimeout(advanceTimer);
    G.chapters.forEach((c) => doneChapters.add(c.id)); paintPills("contact");
    say.textContent = "Tour complete. Scroll freely, or tap me any time to jump to a chapter.";
    stepLbl.textContent = "done"; cta.replaceChildren(); setMood("happy");
    setTimeout(() => stop(), 3200);
  }

  function stop() {
    token++; clearTimeout(advanceTimer); try { speechSynthesis?.cancel(); } catch {}
    clearLit(); target = null; touring = false;
    document.body.classList.remove("touring"); consoleEl.classList.remove("open"); bot.classList.add("interactive");
    flash("happy", 1800);
    setTimeout(() => { if (!touring && bot.classList.contains("away")) launcher.classList.add("show"); }, 600);
  }

  /* ------------------------------------------------------------ menu + nudge */
  function openMenu() {
    menu.replaceChildren(h("h4", {}, "Where to, explorer?"),
      ...G.chapters.filter((c) => c.id !== "intro" && c.id !== "contact").map((c, i) => h("button", { type: "button", role: "menuitem", onclick: () => begin(c.id) }, h("span", { class: "mi" }, `0${i + 1}`), h("span", {}, h("b", {}, c.label), h("small", {}, c.blurb)))),
      h("button", { type: "button", role: "menuitem", onclick: () => begin("intro") }, h("span", { class: "mi" }, "▶"), h("span", {}, h("b", {}, "Full guided tour"), h("small", {}, "About 3 minutes, start to finish"))),
      h("button", { type: "button", role: "menuitem", onclick: () => { closeMenu(); openChat?.(); } }, h("span", { class: "mi", html: svg(ICONS.spark, 14) }), h("span", {}, h("b", {}, "Ask me anything"), h("small", {}, "Answers grounded in the verified profile"))));
    menu.classList.add("open");
  }
  const closeMenu = () => menu.classList.remove("open");
  launcher.addEventListener("click", () => (menu.classList.contains("open") ? closeMenu() : openMenu()));
  bot.addEventListener("click", () => { if (!touring) begin("intro"); });
  bot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bot.click(); } });
  document.addEventListener("click", (e) => { if (menu.classList.contains("open") && !menu.contains(e.target) && !launcher.contains(e.target)) closeMenu(); });

  btnPrev.addEventListener("click", () => goTo(idx - 1));
  btnNext.addEventListener("click", () => goTo(idx + 1));
  btnPlay.addEventListener("click", () => setPlaying(!playing));
  btnExit.addEventListener("click", stop);
  btnVoice.addEventListener("click", () => {
    voiceOn = !voiceOn; btnVoice.setAttribute("aria-pressed", String(voiceOn));
    if (voiceOn) { speechSynthesis?.getVoices?.(); if (!("speechSynthesis" in window)) { voiceOn = false; btnVoice.setAttribute("aria-pressed", "false"); btnVoice.title = "Voice not supported in this browser"; return; } goTo(idx); }
    else { try { speechSynthesis.cancel(); } catch {} }
  });
  document.addEventListener("keydown", (e) => {
    if (!touring || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); }
    else if (e.key === " " && !e.target.closest?.("button, a")) { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === "Escape" && !document.querySelector(".palette:not([hidden])")) stop();
  });
  document.addEventListener("portfolio:tour", (e) => begin(e.detail?.chapter || "intro"));

  launcher.classList.add("show");
  setMood("idle");
  return { start: begin, stop, get touring() { return touring; } };
}
