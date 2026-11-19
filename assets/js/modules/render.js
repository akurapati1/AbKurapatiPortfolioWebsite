import { $, $$, h, svg, ICONS, onVisible, reducedMotion } from "../util.js";

/**
 * Calm rendering rules: one focal item per section. Roles, skill areas and projects are
 * picked from a list and shown one at a time, so the page never dumps everything at once.
 */

const CAT = { agents: "Agentic AI", rag: "RAG", apps: "Full-stack app", data: "Data & science", mlops: "MLOps" };
const CAT_COLOR = { agents: "var(--accent)", rag: "var(--sky)", apps: "var(--hot)", data: "var(--lilac)", mlops: "var(--amber)" };

/** Renders a master/detail pair and returns select(id). Re-selecting animates the panel in. */
function picker({ tabs, panel, items, tabClass = "tab-h", label, build, onSelect }) {
  let current = null;
  const buttons = new Map();
  const select = (id, { focus = false } = {}) => {
    if (id === current) return panel.firstElementChild;
    current = id;
    buttons.forEach((b, k) => { b.classList.toggle("on", k === id); b.setAttribute("aria-selected", String(k === id)); b.tabIndex = k === id ? 0 : -1; });
    const node = build(items.find((i) => i.id === id));
    if (!reducedMotion()) node.classList.add("panel-swap");
    panel.replaceChildren(node);
    onSelect?.(id, node);
    if (focus) buttons.get(id)?.focus();
    return node;
  };
  tabs.replaceChildren(...items.map((it) => {
    const b = h("button", { class: tabClass, type: "button", role: "tab", "aria-selected": "false", onclick: () => select(it.id) }, label(it));
    buttons.set(it.id, b); return b;
  }));
  tabs.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const i = items.findIndex((x) => x.id === current), d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    select(items[(i + d + items.length) % items.length].id, { focus: true });
  });
  select(items[0].id);
  return select;
}

/* ------------------------------------------------------------------ hero */
export function renderHero(p, { onMission } = {}) {
  $("#heroEyebrow").textContent = p.hero.eyebrow;
  $("#heroSub").textContent = p.hero.subhead;
  const ch = p.guide.chapters.filter((c) => ["did", "good", "built"].includes(c.id));
  $("#missions").replaceChildren(...ch.map((c, i) =>
    h("button", { class: "path", type: "button", onclick: () => onMission?.(c.id) },
      h("span", { class: "n" }, `0${i + 1}`), h("b", {}, c.label), h("small", {}, c.blurb))));
}

/* ------------------------------------------------------------------ metrics */
export function renderMetrics(p) {
  const picks = ["turnaround", "records", "steps", "loc"].map((id) => p.metrics.find((m) => m.id === id)).filter(Boolean);
  $("#metrics").replaceChildren(...picks.map((m, i) => {
    const val = h("div", { class: "val" });
    if (m.kind === "text") val.append(h("s", {}, m.from), h("span", { class: "arrow" }, "→"), m.to);
    else val.textContent = "0" + (m.suffix || "");
    const el = h("article", { class: "metric reveal", "data-id": m.id, style: `--d:${i * 80}ms` }, val, h("div", { class: "lbl" }, m.label), h("div", { class: "cap" }, m.caption));
    if (m.kind === "count") onVisible(el, () => countUp(val, m.value, m.suffix || ""));
    return el;
  }));
}

function countUp(el, to, suffix) {
  const fmt = (n) => Math.round(n).toLocaleString("en-US") + suffix;
  if (reducedMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 1600;
  (function tick(t) {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ------------------------------------------------------------------ about */
export function renderAbout(p) {
  $("#aboutIntro").textContent = p.positioning.intro;
  $("#aboutSummary").replaceChildren(...p.summary.map((t) => h("p", {}, t)));
}

/* ------------------------------------------------------------------ experience */
export function renderExperience(p) {
  const select = picker({
    tabs: $("#expTabs"), panel: $("#expPanel"), items: p.experience,
    label: (e) => e.role.replace("Associate ", "").replace("Technical Lead", "Tech Lead").replace("AI Full-Stack ", "") + " · " + (e.client || e.org).replace("Saint Louis University", "SLU").replace("Johnson & Johnson", "J&J"),
    build: (e) => {
      const fold = e.bullets.length > 3;
      const card = h("article", { class: `exp-panel${fold ? " fold" : ""}`, "data-id": e.id },
        h("div", { class: "exp-head" }, h("h3", {}, e.role), h("span", { class: "when" }, `${e.period} · ${e.location}`)),
        h("div", { class: "org" }, e.org + (e.client ? ` · for ${e.client}` : "")),
        h("p", { class: "sum" }, e.summary),
        h("ul", {}, e.bullets.map((b) => h("li", {}, b))),
        fold ? h("button", { class: "link-btn more", type: "button", onclick: (ev) => { const o = card.classList.toggle("open"); ev.target.textContent = o ? "Show fewer" : `Show all ${e.bullets.length} highlights`; } }, `Show all ${e.bullets.length} highlights`) : null,
        h("div", { class: "stack" }, e.stack.slice(0, 9).map((s) => h("span", {}, s))));
      return card;
    }
  });
  $("#education").replaceChildren(...p.education.map((s) =>
    h("div", { class: "edu-card", "data-edu": "" }, h("h4", {}, s.school), h("p", {}, s.degree), h("p", { class: "dim" }, `${s.period} · ${s.place}`), h("div", { class: "g" }, s.grade))));
  window.__selectExp = (id) => select(id);
}

/* ------------------------------------------------------------------ flagship case study */
export function renderCase(p) {
  const c = p.caseStudy;
  const lanes = [["data", "Data"], ["agents", "Agents"], ["trust", "Trust"], ["ops", "Operate"]];
  const detail = h("p", { class: "pdetail", "aria-live": "polite" }, "Select a step to see what it does.");
  const buttons = [];
  const show = (n) => { buttons.forEach((b) => b.classList.toggle("on", b.dataset.id === n.id)); detail.replaceChildren(h("b", {}, `${n.label}: `), n.detail); };
  const flow = h("div", { class: "flow" }, lanes.map(([id, label]) =>
    h("div", { class: "lane", "data-lane": id }, h("h5", {}, label),
      c.pipeline.filter((n) => n.lane === id).map((n) => { const b = h("button", { class: "pnode", type: "button", "data-id": n.id, onclick: () => show(n) }, h("b", {}, n.label), h("small", {}, n.tech)); buttons.push(b); return b; }))));
  $("#caseStudy").replaceChildren(h("article", { class: "case-card", id: "caseCard" },
    h("p", { class: "case-meta" }, `${c.eyebrow} · ${c.client}`),
    h("h3", { id: "caseTitle" }, c.title),
    h("p", { class: "case-result" }, c.result),
    h("details", { class: "case-story" }, h("summary", {}, "The problem and the approach"),
      h("div", { class: "story" }, h("div", {}, h("h4", {}, "Problem"), h("p", {}, c.problem)), h("div", {}, h("h4", {}, "Approach"), h("p", {}, c.approach)))),
    flow, detail, h("p", { class: "case-note" }, c.confidentialityNote)));
  window.__caseShow = show;
}

/* ------------------------------------------------------------------ skills */
export function renderSkills(p) {
  $("#skillsNote").textContent = "Core means shipped in real work. Working means comfortable. Familiar means exposure only.";
  const group = (title, mark, list, cls) => list.length ? h("div", { class: "sgroup" }, h("h4", {}, h("i", {}, mark), title), h("div", { class: "skl" }, list.map((s, i) => h("span", { class: `sk ${cls}`, style: `--i:${i}` }, s.name)))) : null;
  const select = picker({
    tabs: $("#skillTabs"), panel: $("#skillPanel"), items: p.skills.categories,
    label: (c) => c.name.replace("Agentic & Generative AI", "Agentic AI").replace("Cloud, DevOps & MLOps", "Cloud & MLOps").replace("AI Application Backend", "Backend"),
    build: (c) => {
      const by = (l) => c.skills.filter((s) => s.level === l);
      return h("article", { class: "skill-panel", "data-id": c.id, style: `--lc:${c.color}` },
        h("h3", {}, c.name), h("p", { class: "sub" }, `${by("core").length} of ${c.skills.length} at core level`),
        group("Core", "●", by("core"), "core"), group("Working", "◐", by("working"), "working"), group("Familiar", "○", by("familiar"), "familiar"));
    }
  });
  window.__selectSkill = (id) => select(id);
}

/* ------------------------------------------------------------------ projects */
export function renderProjects(p) {
  const list = p.projects.filter((x) => x.showcase);
  const select = picker({
    tabs: $("#projList"), panel: $("#projDetail"), items: list, tabClass: "pitem",
    label: (x) => [h("b", {}, x.name.split(":")[0]), h("small", {}, `${CAT[x.category] || x.category}${x.code ? " · " + x.code : ""}`)],
    build: (x) => {
      const link = x.links?.[0];
      return h("article", { class: "proj-detail", "data-id": x.id, style: `--pc:${CAT_COLOR[x.category] || "var(--accent)"}` },
        h("div", { class: "pd-top" }, h("span", { class: "pcat" }, `${CAT[x.category] || x.category} · ${x.year}`), x.code ? h("span", { class: "code-tag", title: "Size of the public codebase" }, x.code) : null),
        h("h3", {}, x.name), h("p", { class: "tag" }, x.tagline), h("p", { class: "prob" }, x.problem),
        h("h4", {}, "How it works"), h("ul", {}, x.how.map((t) => h("li", {}, t))),
        h("p", { class: "pd-impact" }, x.impact),
        h("div", { class: "pd-foot" }, h("div", { class: "stack" }, x.stack.slice(0, 7).map((s) => h("span", {}, s))),
          link ? h("a", { href: link.url, target: "_blank", rel: "noopener noreferrer" }, `View on GitHub`, h("span", { html: svg(ICONS.external, 15) })) : null));
    }
  });
  window.__selectProject = (id) => select(id);

  const featuredNames = new Set(list.flatMap((x) => (x.links || []).map((l) => l.url.split("/").pop())));
  const extra = p.atlas.items.filter((r) => r.visibility === "public" && r.url && !featuredNames.has(r.url.split("/").pop()));
  $("#moreGrid").replaceChildren(...extra.map((r) =>
    h("a", { class: "more-card", href: r.url, target: "_blank", rel: "noopener noreferrer" },
      h("h4", {}, r.title || r.name, h("span", { html: svg(ICONS.external, 15) })), h("p", {}, r.description))));
  $("#moreTitle").hidden = $("#moreGrid").hidden = !extra.length;
}

/* ------------------------------------------------------------------ how I work */
export function renderFDE(p) {
  $("#fdeSteps").replaceChildren(...p.fde.steps.map((s) =>
    h("li", { class: "step" }, h("span", { class: "n" }, s.n), h("h4", {}, s.title), h("p", {}, s.summary))));
}
