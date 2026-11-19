import { $, $$, h, reducedMotion, safeStorage } from "../util.js";

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
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0b0d12" : "#f5f2ea");
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
    { label: "Start the guided tour with ARI", hint: "ai", run: () => document.dispatchEvent(new CustomEvent("portfolio:tour", { detail: { chapter: "intro" } })) },
    { label: "Go to What I've done", hint: "section", run: go("#experience") },
    { label: "Go to the flagship J&J system", hint: "section", run: go("#case") },
    { label: "Go to What I'm good at (skills)", hint: "section", run: go("#skills") },
    { label: "Go to What I've built (projects)", hint: "section", run: go("#work") },
    { label: "Go to How I work", hint: "section", run: go("#fde") },
    { label: "Go to Ask my AI", hint: "section", run: go("#ask") },
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
