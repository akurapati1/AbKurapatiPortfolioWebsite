import { $, h } from "../util.js";

/**
 * Calendly booking.
 *
 * Set identity.scheduling.url in data/profile.json (e.g. "https://calendly.com/your-name/intro-call").
 * That single value turns on: the "Book a call" button in the nav, the inline scheduler section,
 * the pop-up scheduler, the "Book a call" shortcut in the command menu, and ARI's booking answers.
 * Leave it empty and all of it stays hidden, so there is never a dead button.
 *
 * It uses Calendly's plain embed (an iframe), so no third-party script is loaded, and nothing from
 * Calendly is requested until a visitor opens the pop-up or scrolls to the scheduler.
 */

const COLORS = {
  light: { background_color: "fffdf8", text_color: "14161c", primary_color: "0f766e" },
  dark: { background_color: "151923", text_color: "f3f1ec", primary_color: "5eead4" }
};

export function createBooking(profile) {
  const s = profile.identity.scheduling || {};
  const raw = String(s.url || "").trim();
  const enabled = /^https:\/\/(www\.)?calendly\.com\/[\w.-]+/i.test(raw);
  const label = s.label || "Book a 20-minute intro call";
  const api = { enabled, label, open() { /* replaced below */ }, url: () => raw };

  const sections = $$all("#book");
  if (!enabled) { sections.forEach((el) => (el.hidden = true)); $$all("[data-book]").forEach((el) => (el.hidden = true)); return api; }

  /** Calendly URL with theme colours and whatever the visitor already typed into the contact form. */
  function embedUrl() {
    const u = new URL(raw);
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const p = u.searchParams;
    p.set("embed_domain", location.hostname || "localhost"); p.set("embed_type", "Inline");
    p.set("hide_gdpr_banner", "1");
    for (const [k, v] of Object.entries(COLORS[theme])) p.set(k, v);
    const name = $("#cName")?.value.trim(), email = $("#cEmail")?.value.trim();
    if (name) p.set("name", name);
    if (email && /^\S+@\S+\.\S+$/.test(email)) p.set("email", email);
    return u.toString();
  }

  const frame = (onload) => {
    const f = h("iframe", { class: "book-frame", title: "Book a time with Abhilash", loading: "lazy", referrerpolicy: "strict-origin-when-cross-origin", allow: "payment" });
    f.addEventListener("load", onload, { once: true });
    return f;
  };

  /* ------------------------------------------------ inline scheduler (loads when scrolled into view) */
  const inline = $("#bookInline");
  if (inline) {
    inline.setAttribute("aria-busy", "true");
    const mount = () => {
      const f = frame(() => { inline.classList.add("ready"); inline.removeAttribute("aria-busy"); });
      f.src = embedUrl(); inline.append(f);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); mount(); } }, { rootMargin: "300px 0px" });
      io.observe(inline);
    } else mount();
  }

  /* ------------------------------------------------ pop-up scheduler */
  const dlg = $("#bookModal");
  const body = $(".book-body", dlg);
  const open = () => {
    if (!dlg.open) dlg.showModal();
    body.classList.remove("ready"); body.querySelector("iframe")?.remove();
    const f = frame(() => body.classList.add("ready")); f.src = embedUrl(); body.append(f);
    $(".book-fallback", dlg).href = raw;
  };
  const close = () => { if (dlg.open) dlg.close(); };
  api.open = open;
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });            // click on the backdrop
  dlg.addEventListener("close", () => body.querySelector("iframe")?.remove());
  $(".book-x", dlg).addEventListener("click", close);

  document.addEventListener("click", (e) => { const b = e.target.closest("[data-book]"); if (b) { e.preventDefault(); open(); } });
  document.addEventListener("portfolio:book", open);

  // the nav button becomes the primary call to action
  const nav = $("#navCta"); if (nav) { nav.textContent = "Book a call"; nav.setAttribute("data-book", ""); nav.href = "#book"; }
  const cta = $("#scheduleBtn"); if (cta) { cta.textContent = label; cta.hidden = false; cta.setAttribute("data-book", ""); cta.removeAttribute("target"); }
  return api;
}

function $$all(sel) { return [...document.querySelectorAll(sel)]; }
