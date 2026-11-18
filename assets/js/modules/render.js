import { $, $$, h, svg, ICONS, onVisible, reducedMotion, sleep } from "../util.js";

const CAT = { agents: "Agentic AI", rag: "RAG", apps: "Full-stack apps", data: "Data & science", mlops: "MLOps" };

/* ------------------------------------------------------------------ hero */
export function renderHero(p, { onMission } = {}) {
  $("#heroEyebrow").textContent = p.hero.eyebrow;
  $("#heroSub").textContent = p.hero.subhead;
  startTyped(p.hero.rotating);
  const ch = p.guide.chapters.filter((c) => ["did", "good", "built"].includes(c.id));
  $("#missions").replaceChildren(...ch.map((c, i) =>
    h("button", { class: "mission", type: "button", onclick: () => onMission?.(c.id) },
      h("span", { class: "n" }, `0${i + 1}`), h("b", {}, c.label), h("small", {}, c.blurb))));
}

function startTyped(lines) {
  const el = $("#typed");
  if (reducedMotion()) { el.textContent = lines[0]; return; }
  let i = 0;
  (async function loop() {
    for (;;) {
      const text = lines[i++ % lines.length];
      for (let c = 1; c <= text.length; c++) { el.textContent = text.slice(0, c); await sleep(32); }
      await sleep(1700);
      for (let c = text.length; c >= 0; c--) { el.textContent = text.slice(0, c); await sleep(14); }
      await sleep(240);
    }
  })();
}

/* ------------------------------------------------------------------ metrics */
export function renderMetrics(p) {
  const nodes = p.metrics.map((m, i) => {
    const val = h("div", { class: "val" });
    if (m.kind === "text") val.append(h("s", {}, m.from), h("span", { class: "arrow" }, "→"), m.to);
    else val.textContent = "0" + (m.suffix || "");
    const el = h("article", { class: `metric reveal${i === 0 ? " big" : ""}`, "data-id": m.id, style: `--mc:${m.color};--d:${i * 70}ms` },
      val, h("div", { class: "lbl" }, m.label), h("div", { class: "cap" }, m.caption));
    if (m.kind === "count") onVisible(el, () => countUp(val, m.value, m.suffix || ""));
    return el;
  });
  $("#metrics").replaceChildren(...nodes);
}

function countUp(el, to, suffix) {
  const fmt = (n) => Math.round(n).toLocaleString("en-US") + suffix;
  if (reducedMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 1400;
  (function tick(t) {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ------------------------------------------------------------------ about */
export function renderAbout(p) {
  $("#aboutIntro").textContent = p.positioning.intro;
  $("#aboutSummary").replaceChildren(...p.summary.map((t) => h("p", {}, t)));
  $("#hats").replaceChildren(...p.positioning.cards.map((c) =>
    h("div", { class: "hat" }, h("span", { class: "tag" }, c.tagline), h("h4", {}, c.title), h("ul", {}, c.points.map((x) => h("li", {}, x))))));
}

export function startIdCard() {
  const el = $("#idTick"); if (!el || reducedMotion()) return;
  const lines = ['agent.status = "ready"', 'agent.focus = ["agentic", "rag", "mlops"]', 'agent.cloud = "google-cloud"', 'agent.mode = "forward-deployed"', 'agent.open_to_roles = true'];
  let i = 0;
  setInterval(() => { i = (i + 1) % lines.length; el.style.opacity = 0; setTimeout(() => { el.textContent = lines[i]; el.style.opacity = 1; }, 220); }, 2600);
}

/* ------------------------------------------------------------------ experience */
export function renderExperience(p) {
  $("#timeline").replaceChildren(...p.experience.map((e, idx) => {
    const fold = e.bullets.length > 3;
    const card = h("article", { class: `job reveal${e.current ? " current" : ""}${fold ? " fold" : ""}`, "data-id": e.id },
      h("div", { class: "job-top" },
        h("h3", {}, e.role, e.current ? h("span", { class: "now" }, "current") : null),
        h("span", { class: "when" }, `${e.period} · ${e.location}`)),
      h("div", { class: "org" }, e.org + (e.client ? ` · for ${e.client}` : "")),
      h("p", { class: "sum" }, e.summary),
      h("ul", {}, e.bullets.map((b) => h("li", {}, b))),
      fold ? h("button", { class: "link-btn more", type: "button", onclick: (ev) => { const o = card.classList.toggle("open"); ev.target.textContent = o ? "Show less" : `Show all ${e.bullets.length} highlights`; } }, `Show all ${e.bullets.length} highlights`) : null,
      h("div", { class: "stack" }, e.stack.map((s) => h("span", {}, s))));
    return card;
  }));
  $("#education").replaceChildren(...p.education.map((s) =>
    h("div", { class: "edu-card reveal", "data-edu": "" }, h("h4", {}, s.school), h("p", {}, s.degree), h("p", { class: "dim" }, `${s.period} · ${s.place}`), h("div", { class: "g" }, s.grade))));
}

/* ------------------------------------------------------------------ flagship case study */
export function renderCase(p) {
  const c = p.caseStudy;
  const lanes = [["data", "Data"], ["agents", "Agents"], ["trust", "Trust"], ["ops", "Operate"]];
  const detail = h("div", { class: "pdetail", "aria-live": "polite" }, "Hover or tap any step to see what it does.");
  const flow = h("div", { class: "flow" }, lanes.map(([id, label]) => {
    const nodes = c.pipeline.filter((n) => n.lane === id);
    return h("div", { class: "lane", "data-lane": id }, h("h5", {}, label),
      nodes.map((n, i) => h("button", { class: "pnode", type: "button", "data-id": n.id, style: `--i:${i}`,
        onclick: () => show(n), onmouseenter: () => show(n), onfocus: () => show(n) }, h("b", {}, n.label), h("small", {}, n.tech))));
  }));
  const show = (n) => detail.replaceChildren(h("b", {}, `${n.label}: `), n.detail);
  $("#caseStudy").replaceChildren(h("article", { class: "case-card", id: "caseCard" },
    h("div", { class: "case-meta" }, h("span", { class: "badge hot" }, c.eyebrow), h("span", { class: "badge" }, c.client)),
    h("h3", { id: "caseTitle" }, c.title),
    h("div", { class: "prs" },
      h("div", { class: "pr" }, h("h4", {}, "Problem"), h("p", {}, c.problem)),
      h("div", { class: "pr" }, h("h4", {}, "Approach"), h("p", {}, c.approach)),
      h("div", { class: "pr result" }, h("h4", {}, "Result"), h("p", {}, c.result))),
    flow, detail, h("p", { class: "case-note" }, c.confidentialityNote)));
  window.__caseShow = show;
}

/* ------------------------------------------------------------------ skills */
export function renderSkills(p) {
  $("#skillsNote").textContent = "It's easy to list 100 buzzwords. These are tagged by how I've actually used them.";
  const pip = (l) => h("span", { class: `lvl ${l}`, style: "--lc:var(--accent)", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
  $("#skillLegend").replaceChildren(
    h("span", {}, pip("core"), h("strong", {}, "Core"), " shipped in real work"),
    h("span", {}, pip("working"), h("strong", {}, "Working"), " used and comfortable"),
    h("span", {}, pip("familiar"), h("strong", {}, "Familiar"), " exposure"));
  $("#skills-grid").replaceChildren(...p.skills.categories.map((c, ci) => {
    const core = c.skills.filter((s) => s.level === "core").length;
    return h("article", { class: "scat reveal", "data-id": c.id, style: `--lc:${c.color};--d:${ci * 60}ms` },
      h("header", {}, h("h3", {}, c.name), h("span", { class: "cnt" }, `${core}/${c.skills.length} core`)),
      h("div", { class: "meter", title: `${core} of ${c.skills.length} skills at core level` }, h("i", { style: `--w:${Math.round((core / c.skills.length) * 100)}%` })),
      h("div", { class: "skl" }, c.skills.map((s, i) => h("span", { class: `sk ${s.level}`, style: `--i:${i}`, title: s.level }, s.name))));
  }));
}

/* ------------------------------------------------------------------ projects */
export function renderProjects(p) {
  const list = p.projects.filter((x) => x.showcase);
  const cats = ["all", ...new Set(list.map((x) => x.category))];
  const cards = list.map((x, i) => {
    const links = (x.links || []).map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.label, h("span", { html: svg(ICONS.external, 14) })));
    return h("article", { class: `proj reveal cat-${x.category}${i === 0 ? " lead" : ""}`, "data-id": x.id, "data-cat": x.category, style: `--d:${(i % 4) * 60}ms` },
      h("div", { class: "proj-top" }, h("span", { class: "pcat" }, `${CAT[x.category] || x.category} · ${x.year}`), x.code ? h("span", { class: "code-tag", title: "Size of the public codebase" }, x.code) : null),
      h("h3", {}, x.name), h("p", { class: "tag" }, x.tagline), h("p", { class: "prob" }, x.problem),
      h("details", { open: i === 0 }, h("summary", {}, "How it works"), h("ul", {}, x.how.map((t) => h("li", {}, t)))),
      h("div", { class: "impact" }, x.impact),
      h("div", { class: "foot" }, h("div", { class: "stack" }, x.stack.map((s) => h("span", {}, s))), h("div", { class: "links" }, links)));
  });
  $("#projects").replaceChildren(...cards);
  const chips = $("#projectFilters");
  const apply = (cat) => {
    cards.forEach((el) => { el.hidden = !(cat === "all" || el.dataset.cat === cat); });
    $$("button", chips).forEach((b) => { const on = b.dataset.cat === cat; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
  };
  chips.replaceChildren(...cats.map((c) => h("button", { type: "button", class: "chip", role: "tab", "data-cat": c, onclick: () => apply(c) }, c === "all" ? `All (${list.length})` : CAT[c] || c)));
  apply("all");
  window.__projectsAll = () => apply("all");

  // compact "also on GitHub" list: repos with real code that aren't already featured
  const featuredNames = new Set(list.flatMap((x) => (x.links || []).map((l) => l.url.split("/").pop())));
  const extra = p.atlas.items.filter((r) => r.visibility === "public" && r.url && !featuredNames.has(r.url.split("/").pop()));
  $("#moreGrid").replaceChildren(...extra.map((r) =>
    h("a", { class: "more-card", href: r.url, target: "_blank", rel: "noopener noreferrer" },
      h("h4", {}, r.title || r.name, h("span", { html: svg(ICONS.external, 15) })), h("p", {}, r.description), h("div", { class: "stack", style: "margin:0" }, r.stack.map((s) => h("span", {}, s))))));
  $("#moreTitle").hidden = $("#moreGrid").hidden = !extra.length;
}

/* ------------------------------------------------------------------ how I work */
export function renderFDE(p) {
  $("#fdeIntro").textContent = p.fde.intro;
  $("#fdeSteps").replaceChildren(...p.fde.steps.map((s) =>
    h("li", { class: "step" }, h("span", { class: "n" }, s.n), h("h4", {}, s.title), h("p", {}, s.summary), h("div", { class: "out" }, s.output))));
  $("#fdeStrengths").replaceChildren(...p.fde.strengths.map((s) => h("div", { class: "strength" }, h("h4", {}, s.title), h("p", {}, s.text))));
}
