import { $, $$, reducedMotion } from "../util.js";

/** Click ripple on interactive controls. */
export function setupRipple() {
  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".btn, .chip, .tab, .step, .node, .seg span, .suggest button, .icon-btn");
    if (!el || reducedMotion()) return;
    const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement("span");
    dot.className = "ripple";
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.classList.add("has-ripple");
    el.append(dot);
    dot.addEventListener("animationend", () => dot.remove());
  });
}

/** 3D tilt following the pointer on [data-tilt] and card-like elements (added dynamically too). */
export function setupTilt() {
  if (reducedMotion() || !matchMedia("(pointer: fine)").matches) return;
  const SEL = "[data-tilt], .metric, .hat, .project, .scat, .atlas-card, .strength, .edu-card";
  let cur = null;
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(SEL);
    if (cur && cur !== el) { cur.style.transform = ""; cur.style.transition = ""; }
    cur = el || null;
    if (!el) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = "transform .08s linear";
    el.style.transform = `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (cur) { cur.style.transform = ""; cur.style.transition = ""; cur = null; } }, true);
}

/** Primary buttons lean toward the cursor. */
export function setupMagnetic() {
  if (reducedMotion() || !matchMedia("(pointer: fine)").matches) return;
  document.addEventListener("pointermove", (e) => {
    $$(".btn-primary:hover").forEach((b) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${((e.clientX - (r.left + r.width / 2)) * 0.12).toFixed(1)}px, ${((e.clientY - (r.top + r.height / 2)) * 0.2).toFixed(1)}px)`;
    });
  }, { passive: true });
  document.addEventListener("pointerout", (e) => { const b = e.target.closest?.(".btn-primary"); if (b) b.style.transform = ""; });
}

/** Expanding shock-ring where you click an in-page link, then the browser smooth-scrolls. */
export function setupWarp() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"], [data-warp]');
    if (!a || reducedMotion()) return;
    const w = document.createElement("div");
    w.className = "warp"; w.style.left = e.clientX + "px"; w.style.top = e.clientY + "px";
    document.body.append(w); w.addEventListener("animationend", () => w.remove());
  });
}

const GLYPHS = "01<>/{}[]$#*+=";
/** Decode-style scramble that resolves each character left to right. */
export function scramble(el, ms = 700) {
  const final = el.dataset.text || el.textContent; el.dataset.text = final;
  if (reducedMotion()) { el.textContent = final; return; }
  const t0 = performance.now();
  (function tick(now) {
    const k = Math.min(1, (now - t0) / ms), n = Math.floor(k * final.length);
    el.textContent = final.slice(0, n) + [...final.slice(n)].map((c) => (c === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
    if (k < 1) requestAnimationFrame(tick); else el.textContent = final;
  })(t0);
}

/** Section headings arrive word by word, kickers decode, reveal groups cascade. */
export function setupReveal() {
  // split h2 into words
  $$(".section-head h2, .contact h2").forEach((h) => {
    if (h.dataset.split) return;
    h.dataset.split = "1"; h.setAttribute("aria-label", h.textContent);
    const words = h.textContent.trim().split(/\s+/);
    h.textContent = "";
    words.forEach((w, i) => { const s = document.createElement("span"); s.className = "w"; s.setAttribute("aria-hidden", "true"); s.style.setProperty("--i", i); s.textContent = w; h.append(s, " "); });
    h.classList.add("split");
  });
  // cascade delays for sibling reveals
  const groups = new Map();
  $$(".reveal").forEach((el) => { const p = el.parentElement; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(el); });
  groups.forEach((arr) => { if (arr.length > 1) arr.forEach((el, i) => el.style.setProperty("--d", `${Math.min(i, 8) * 70}ms`)); });

  const targets = $$(".reveal, .section-head, .kicker");
  if (!("IntersectionObserver" in window) || reducedMotion()) { targets.forEach((e) => e.classList.add("in")); return () => {}; }
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in"); io.unobserve(e.target);
    if (e.target.classList.contains("kicker")) scramble(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  targets.forEach((e) => io.observe(e));
  return (root = document) => $$(".reveal:not(.in), .section-head:not(.in)", root).forEach((e) => io.observe(e));
}
