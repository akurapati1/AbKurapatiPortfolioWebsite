import { $, $$, h, svg, ICONS, onVisible, reducedMotion, sleep } from "../util.js";

const CAT_LABEL = { all: "All", agents: "Agents", rag: "RAG", mlops: "MLOps", data: "Data & science", knowledge: "Open knowledge" };

/* ------------------------------------------------------------------ hero */
export function renderHero(p) {
  $("#heroEyebrow").textContent = p.hero.eyebrow;
  $("#heroSub").textContent = p.hero.subhead;
  startTyped(p.hero.rotating);
  startTerminal();
}

function startTyped(lines) {
  const el = $("#typed");
  if (reducedMotion()) { el.textContent = lines[0]; return; }
  let i = 0;
  (async function loop() {
    for (;;) {
      const text = lines[i++ % lines.length];
      for (let c = 1; c <= text.length; c++) { el.textContent = text.slice(0, c); await sleep(34); }
      await sleep(1700);
      for (let c = text.length; c >= 0; c--) { el.textContent = text.slice(0, c); await sleep(16); }
      await sleep(250);
    }
  })();
}

function startTerminal() {
  const body = $("#termBody"), bar = $("#termBar"), clock = $("#termClock");
  // Illustrative run of the pipeline architecture (labelled "illustrative" in the UI).
  const script = [
    { t: 0, html: '<span class="st">request</span> Medical Impact Assessment · plan sections', p: 6 },
    { t: 3, html: '<span class="st">ingest </span> Pub/Sub → Dataflow <span class="ok">✓</span>', p: 20 },
    { t: 9, html: '<span class="st">prep   </span> Dataproc · BigQuery model-ready <span class="ok">✓</span>', p: 34 },
    { t: 15, html: '<span class="st">retrieve</span> evidence per section (RAG) <span class="ok">✓</span>', p: 48 },
    { t: 24, html: '<span class="hl">agents </span> reason · draft · assemble (5+ steps) <span class="ok">✓</span>', p: 66 },
    { t: 33, html: '<span class="st">validate</span> structure + content checks <span class="ok">✓</span>', p: 78 },
    { t: 38, html: '<span class="wn">review </span> human reviewer approves, edits become feedback', p: 90 },
    { t: 45, html: '<span class="st">deliver</span> PDF + Word generated <span class="ok">✓</span>', p: 100 },
    { t: 48, html: '<span class="ok">done   </span> 00:48 <span class="dim">(was 2–3 weeks)</span>', p: 100 }
  ];
  const fmt = (s) => `00:${String(s).padStart(2, "0")}`;
  if (reducedMotion()) {
    body.innerHTML = script.map((l) => `<div class="tl"><span class="t">${fmt(l.t)}</span><span>${l.html}</span></div>`).join("");
    bar.style.width = "100%"; clock.textContent = fmt(48);
    return;
  }
  (async function loop() {
    for (;;) {
      body.replaceChildren(); bar.style.width = "0"; clock.textContent = "00:00";
      for (const l of script) {
        await sleep(780);
        body.append(h("div", { class: "tl", html: `<span class="t">${fmt(l.t)}</span><span>${l.html}</span>` }));
        bar.style.width = l.p + "%"; clock.textContent = fmt(l.t);
      }
      await sleep(4200);
    }
  })();
}

/* ------------------------------------------------------------------ metrics */
export function renderMetrics(p) {
  const wrap = $("#metrics");
  wrap.replaceChildren(...p.metrics.map((m) => {
    const num = h("div", { class: "num" });
    if (m.kind === "text") {
      num.append(h("s", {}, m.from), h("span", { class: "arrow", "aria-hidden": "true" }, "→"), h("span", {}, m.to));
    } else {
      const v = h("span", { "data-count": m.value }, "0");
      num.append(v, m.suffix || "");
    }
    return h("div", { class: "metric reveal", style: `--mc:${m.color}` }, num, h("div", { class: "mlab" }, m.label), h("div", { class: "cap" }, m.caption));
  }));
  onVisible(wrap, () => {
    $$("[data-count]", wrap).forEach((el) => {
      const target = +el.dataset.count, t0 = performance.now(), dur = 1400;
      if (reducedMotion()) { el.textContent = target.toLocaleString(); return; }
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(target * e).toLocaleString();
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.3 });
}

/* ------------------------------------------------------------------ about / hats */
export function renderAbout(p) {
  $("#aboutIntro").textContent = p.positioning.intro;
  $("#aboutTitle").textContent = p.positioning.title;
  $("#aboutSummary").replaceChildren(...p.summary.map((t) => h("p", {}, t)));
  $("#hats").replaceChildren(...p.positioning.cards.map((c) =>
    h("article", { class: "hat" },
      h("div", { class: "ic", html: svg(ICONS[c.icon] || ICONS.cpu, 22) }),
      h("h3", {}, c.title), h("div", { class: "tag" }, c.tagline),
      h("ul", {}, c.points.map((pt) => h("li", {}, pt))))));
}

/* ------------------------------------------------------------------ case study */
export function renderCaseStudy(p) {
  const cs = p.caseStudy, root = $("#caseStudy");
  const detail = h("div", { class: "node-detail", "aria-live": "polite" });
  const nodes = cs.pipeline.map((n, i) =>
    h("button", { type: "button", class: `node lane-${n.lane}`, "data-i": i, "aria-pressed": "false" },
      h("div", { class: "n" }, String(i + 1).padStart(2, "0")), h("div", { class: "l" }, n.label), h("div", { class: "tc" }, n.tech), h("span", { class: "flowdot", "aria-hidden": "true" })));
  let manual = false, cur = 0;
  const show = (i, user) => {
    if (user) manual = true;
    cur = i;
    nodes.forEach((el, k) => { el.classList.toggle("is-active", k === i); el.setAttribute("aria-pressed", String(k === i)); });
    const n = cs.pipeline[i];
    detail.replaceChildren(h("strong", {}, `${n.label} · ${n.tech}`), h("p", {}, n.detail));
  };
  nodes.forEach((el, i) => { el.addEventListener("click", () => show(i, true)); el.addEventListener("mouseenter", () => show(i, true)); el.addEventListener("focus", () => show(i, true)); });

  root.replaceChildren(h("div", { class: "case" },
    h("p", { class: "kicker" }, cs.eyebrow),
    h("h2", { id: "caseTitle" }, cs.title),
    h("p", { class: "client" }, cs.client),
    h("div", { class: "prs" },
      h("div", { class: "pr" }, h("h4", {}, "The pain"), h("p", {}, cs.problem)),
      h("div", { class: "pr" }, h("h4", {}, "The approach"), h("p", {}, cs.approach)),
      h("div", { class: "pr result" }, h("h4", {}, "The result"), h("p", {}, cs.result))),
    h("div", { class: "flow-wrap" },
      h("h3", {}, "How it flows"),
      h("p", {}, "Hover or tap a stage."),
      h("div", { class: "flow", role: "group", "aria-label": "Pipeline stages" }, nodes),
      detail,
      h("div", { class: "lanes" },
        h("span", { class: "lane-data", style: "--lc:#fb923c" }, "Data platform"), h("span", { style: "--lc:#a78bfa" }, "Agents"),
        h("span", { style: "--lc:#34d399" }, "Trust & delivery"), h("span", { style: "--lc:#60a5fa" }, "Operations"))),
    h("p", { class: "confid" }, cs.confidentialityNote)));
  show(0);
  onVisible(root, () => {
    if (reducedMotion()) return;
    const t = setInterval(() => { if (manual || !document.body.contains(root)) return clearInterval(t); show((cur + 1) % nodes.length); }, 2600);
  });
}

/* ------------------------------------------------------------------ projects */
export function renderProjects(p) {
  const grid = $("#projects"), bar = $("#projectFilters");
  const cats = ["all", ...new Set(p.projects.map((x) => x.category))];
  let active = "all";

  const card = (x) => {
    const links = x.links.length
      ? x.links.map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, h("span", { html: svg(l.label.toLowerCase().includes("live") ? ICONS.external : ICONS.github, 15) }), l.label))
      : [h("span", { class: "nolink", title: "Private or confidential. Ask me about it." }, "Private / confidential")];
    const el = h("article", { class: `project reveal${x.featured ? " featured" : ""}`, "data-cat": x.category },
      h("div", { class: "p-top" }, h("span", { class: "p-cat" }, CAT_LABEL[x.category] || x.category), h("span", {}, `${x.year} · ${x.status}`)),
      h("h3", {}, x.name),
      h("p", { class: "tag" }, x.tagline),
      h("div", { class: "p-impact" }, h("span", { html: svg(ICONS.bolt, 16) }), h("span", {}, x.impact)),
      h("div", { class: "stack" }, x.stack.map((s) => h("span", {}, s))),
      h("details", { class: "p-more" },
        h("summary", {}, "Problem & how it works"),
        h("h4", {}, "The problem"), h("p", {}, x.problem),
        h("h4", {}, "How it works"), h("ul", {}, x.how.map((s) => h("li", {}, s)))),
      h("div", { class: "p-links" }, links));
    el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(); el.style.setProperty("--mx", `${e.clientX - r.left}px`); el.style.setProperty("--my", `${e.clientY - r.top}px`); });
    return el;
  };
  const all = p.projects.map(card);
  const apply = () => {
    all.forEach((el) => { const show = active === "all" || el.dataset.cat === active; el.hidden = !show; el.classList.add("in"); });
    $$("button", bar).forEach((b) => { const on = b.dataset.cat === active; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
  };
  bar.replaceChildren(...cats.map((c) => h("button", { type: "button", class: "chip", role: "tab", "data-cat": c, onclick: () => { active = c; apply(); } }, CAT_LABEL[c] || c)));
  grid.replaceChildren(...all);
  apply();

  const lab = p.lab;
  $("#lab").replaceChildren(
    h("h3", {}, lab.title), h("p", {}, lab.intro),
    h("div", { class: "lab-grid" }, lab.items.map((i) => h("a", { class: "lab-item", href: i.url, target: "_blank", rel: "noopener noreferrer" }, h("b", {}, i.name), h("span", {}, i.note)))));
}

/* ------------------------------------------------------------------ FDE */
export function renderFDE(p) {
  const f = p.fde;
  $("#fdeIntro").textContent = f.intro;
  const detail = $("#stepDetail");
  const btns = f.steps.map((s, i) =>
    h("li", {}, h("button", { type: "button", class: "step", "aria-pressed": "false", onclick: () => select(i) },
      h("div", { class: "sn" }, s.n), h("div", { class: "si", html: svg(ICONS[s.icon] || ICONS.spark, 24) }), h("h3", {}, s.title), h("p", {}, s.summary))));
  $("#fdeSteps").replaceChildren(...btns);
  const select = (i) => {
    btns.forEach((li, k) => { const b = li.firstChild; b.classList.toggle("is-active", k === i); b.setAttribute("aria-pressed", String(k === i)); });
    const s = f.steps[i];
    detail.replaceChildren(h("div", {}, h("h3", { style: "font-size:22px;margin-bottom:8px" }, `${s.n} · ${s.title}`), h("p", {}, s.detail)),
      h("div", { class: "out" }, h("b", {}, "You get"), h("span", {}, s.output)));
  };
  select(0);

  $("#fdeStrengths").replaceChildren(...f.strengths.map((s) => h("div", { class: "strength" }, h("h4", {}, s.title), h("p", {}, s.text))));

  // Workflow explorer
  const chips = $("#patternChips"), view = $("#patternView");
  const projById = Object.fromEntries([...p.projects, { id: p.caseStudy.id, name: p.caseStudy.title, links: [] }].map((x) => [x.id, x]));
  const showPattern = (pt) => {
    $$(".chip", chips).forEach((c) => { const on = c.dataset.id === pt.id; c.classList.toggle("is-active", on); c.setAttribute("aria-selected", String(on)); });
    const proj = projById[pt.proof.project];
    const link = proj?.links?.[0];
    const col = (cls, title, items) => h("div", { class: `pcol ${cls}` }, h("h4", {}, title), Array.isArray(items) ? h("ul", {}, items.map((i) => h("li", {}, i))) : h("p", {}, items));
    const arrow = () => h("div", { class: "parrow", "aria-hidden": "true", html: svg(ICONS.arrow, 28) });
    view.replaceChildren(
      col("pain", "Where it hurts", pt.painSigns), arrow(), col("ai", "Where AI goes", pt.aiFit), arrow(), col("human", "Where a human stays", pt.humanGate),
      h("div", { class: "proofbar", style: "grid-column:1/-1" }, h("b", {}, "I've shipped this"), h("span", {}, pt.proof.claim),
        link ? h("a", { href: link.url, target: "_blank", rel: "noopener noreferrer" }, "See the project →") : null));
  };
  chips.replaceChildren(...f.patterns.map((pt) => h("button", { type: "button", class: "chip", role: "tab", "data-id": pt.id, onclick: () => showPattern(pt) }, pt.name)));
  showPattern(f.patterns[0]);
}

/* ------------------------------------------------------------------ skills */
export function renderSkills(p) {
  $("#skillsNote").textContent = "Levels are deliberate: it's easy to list 100 buzzwords. These are tagged by how I've actually used them.";
  const lvl = (l, color) => h("span", { class: `lvl ${l}`, style: `--lc:${color}`, "aria-hidden": "true" }, h("i"), h("i"), h("i"));
  $("#skillLegend").replaceChildren(
    h("span", {}, lvl("core", "#a78bfa"), h("strong", {}, "Core"), " shipped in real work"),
    h("span", {}, lvl("working", "#a78bfa"), h("strong", {}, "Working"), " used and comfortable"),
    h("span", {}, lvl("familiar", "#a78bfa"), h("strong", {}, "Familiar"), " exposure"));
  $("#skills-grid").replaceChildren(...p.skills.categories.map((c) =>
    h("article", { class: "scat reveal", style: `--lc:${c.color}` }, h("h3", {}, c.name),
      h("div", { class: "skl" }, c.skills.map((s) => h("span", { class: `sk ${s.level}`, title: s.level }, s.name))))));
}

/* ------------------------------------------------------------------ experience */
export function renderExperience(p) {
  $("#timeline").replaceChildren(...p.experience.map((e) =>
    h("article", { class: `job reveal${e.current ? " current" : ""}` },
      h("div", { class: "job-top" },
        h("h3", {}, e.role, e.current ? h("span", { class: "now" }, "current") : null),
        h("span", { class: "when" }, `${e.period} · ${e.location}`)),
      h("div", { class: "org" }, e.org + (e.client ? ` · for ${e.client}` : "")),
      h("p", { class: "sum" }, e.summary),
      h("ul", {}, e.bullets.map((b) => h("li", {}, b))),
      h("div", { class: "stack" }, e.stack.map((s) => h("span", {}, s))))));
  $("#education").replaceChildren(...p.education.map((s) =>
    h("div", { class: "edu-card" }, h("h4", {}, s.school), h("p", {}, s.degree), h("p", { class: "dim" }, `${s.period} · ${s.place}`), h("div", { class: "g" }, s.grade))));
}
