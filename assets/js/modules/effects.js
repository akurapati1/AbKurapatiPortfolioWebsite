import { $, $$, h, reducedMotion, safeStorage } from "../util.js";

/* ---------------------------------------------------------------- neural network canvas */
export function startNeural() {
  const cv = $("#neural");
  if (!cv || reducedMotion()) return;
  const ctx = cv.getContext("2d");
  let w = 0, h_ = 0, dpr = 1, nodes = [], raf = 0, running = true;
  const mouse = { x: -999, y: -999 };
  const palette = ["139,92,246", "34,211,238", "96,165,250"];

  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h_ = innerHeight;
    cv.width = w * dpr; cv.height = h_ * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(90, Math.floor((w * h_) / 17000));
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h_, vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
      r: Math.random() * 1.6 + .8, c: palette[(Math.random() * palette.length) | 0]
    }));
  };
  const frame = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h_);
    const maxD = 140;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > w) a.vx *= -1; if (a.y < 0 || a.y > h_) a.vy *= -1;
      const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (dm < 160) { a.x += (a.x - mouse.x) * .0016; a.y += (a.y - mouse.y) * .0016; }
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283); ctx.fillStyle = `rgba(${a.c},.85)`; ctx.fill();
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxD) { ctx.strokeStyle = `rgba(${a.c},${(1 - d / maxD) * .32})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
    }
    raf = requestAnimationFrame(frame);
  };
  resize();
  addEventListener("resize", () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) frame(); else cancelAnimationFrame(raf); });
  frame();
}

/* ---------------------------------------------------------------- reveal, spy, progress, glow */
export function startReveal() {
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window) || reducedMotion()) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach((e) => io.observe(e));
  // observe elements added later (rendered sections)
  return (root = document) => $$(".reveal:not(.in)", root).forEach((e) => io.observe(e));
}

export function startChrome() {
  const nav = $("#nav"), bar = $(".scroll-progress span"), links = $$(".nav-links a"), fab = $("#fab");
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    nav.classList.toggle("is-stuck", y > 20);
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const map = new Map(links.map((a) => [a.dataset.spy, a]));
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle("is-active", a === map.get(e.target.id)));
  }), { rootMargin: "-45% 0px -50% 0px" });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });

  // hide the floating button while the inline chat is on screen
  const ask = $("#ask");
  if (ask && fab) new IntersectionObserver(([e]) => fab.classList.toggle("is-hidden", e.isIntersecting && e.intersectionRatio > .35), { threshold: [0, .35, .6] }).observe(ask);

  const menuBtn = $("#menuBtn"), navLinks = $(".nav-links");
  menuBtn.addEventListener("click", () => { const o = navLinks.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(o)); });
  links.forEach((a) => a.addEventListener("click", () => { navLinks.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }));

  if (matchMedia("(pointer: fine)").matches && !reducedMotion()) {
    const g = $(".cursor-glow");
    addEventListener("pointermove", (e) => { g.style.opacity = 1; g.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`; }, { passive: true });
  }
  $("#year").textContent = new Date().getFullYear();
}

/* ---------------------------------------------------------------- theme */
export function setupTheme() {
  const root = document.documentElement;
  const saved = safeStorage.get("theme");
  root.dataset.theme = saved === "light" ? "light" : "dark"; // dark is the signature look; light is opt-in
  $("#themeBtn").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next; safeStorage.set("theme", next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#070912" : "#f6f7fc");
  });
}

/* ---------------------------------------------------------------- chat drawer */
export function setupDrawer({ onOpen }) {
  const drawer = $("#drawer"), scrim = $("#scrim");
  const open = () => { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); scrim.hidden = false; onOpen?.(); };
  const close = () => { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); scrim.hidden = true; };
  $("#drawerClose").addEventListener("click", close);
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) close(); });
  document.addEventListener("portfolio:close-chat", close);

  // "Ask my AI" buttons: if the inline chat is on screen, focus it; otherwise open the drawer.
  const ask = $("#ask");
  const open_ = () => {
    const r = ask.getBoundingClientRect();
    const visible = r.top < innerHeight * .7 && r.bottom > innerHeight * .3;
    if (visible || innerWidth <= 0) { onOpen?.(true); return; }
    open();
  };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-open-chat]")) { e.preventDefault(); open_(); } });
  document.addEventListener("portfolio:open-chat", open_);
  return { open, close };
}

/* ---------------------------------------------------------------- command palette */
export function setupPalette({ ask, openChat }) {
  const root = $("#palette"), input = $("#paletteInput"), list = $("#paletteList");
  let items = [], sel = 0;
  const go = (id) => () => { $(id).scrollIntoView({ behavior: "smooth" }); };
  const base = [
    { label: "Go to Work", hint: "section", run: go("#work") },
    { label: "Go to Flagship case study", hint: "section", run: go("#case") },
    { label: "Go to How I work (FDE)", hint: "section", run: go("#fde") },
    { label: "Go to Ask my AI", hint: "section", run: go("#ask") },
    { label: "Go to Skills", hint: "section", run: go("#skills") },
    { label: "Go to Experience", hint: "section", run: go("#experience") },
    { label: "Go to Contact", hint: "section", run: go("#contact") },
    { label: "Open chat with my AI", hint: "ai", run: () => openChat() },
    { label: "Download resume (PDF)", hint: "file", run: () => { const a = h("a", { href: "assets/Abhilash_Kurapati_AI_Engineer_Resume.pdf", download: "" }); a.click(); } },
    { label: "Email Abhilash", hint: "contact", run: () => (location.href = "mailto:abhilash.kurapati1301@gmail.com") },
    { label: "Call +1 617-256-8369", hint: "contact", run: () => (location.href = "tel:+16172568369") },
    { label: "Toggle light / dark theme", hint: "ui", run: () => $("#themeBtn").click() }
  ];
  const draw = () => {
    list.replaceChildren(...items.map((it, i) => h("li", { role: "option", "aria-selected": String(i === sel), onclick: () => choose(i), onmousemove: () => { sel = i; paint(); } }, it.label, h("small", {}, it.hint))));
  };
  const paint = () => [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === sel)));
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    items = q ? base.filter((b) => b.label.toLowerCase().includes(q)) : base.slice();
    if (q.length > 2) items.push({ label: `Ask my AI: “${input.value.trim()}”`, hint: "ai", run: () => ask(input.value.trim()) });
    sel = 0; draw();
  };
  const close = () => { root.hidden = true; };
  const open = () => { root.hidden = false; input.value = ""; filter(); input.focus(); };
  const choose = (i) => { const it = items[i]; close(); it?.run(); };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % items.length; paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; paint(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
  });
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); root.hidden ? open() : close(); }
    else if (e.key === "Escape" && !root.hidden) close();
  });
  $("#paletteBtn").addEventListener("click", open);
}
