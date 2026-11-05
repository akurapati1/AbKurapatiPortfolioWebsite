import { $, $$, h } from "../util.js";
import { net, postJson } from "../api.js";

const SAMPLE_JD = `Forward Deployed Engineer, AI
You will work directly with enterprise customers to understand their workflows, identify pain points, and deploy LLM-powered agents and RAG systems into production. Requirements: strong Python, experience with LLM frameworks (LangChain or similar), cloud platforms (GCP or AWS), Kubernetes and CI/CD, excellent communication with technical and non-technical stakeholders, comfort with ambiguity and customer-facing delivery. Nice to have: MLOps, data pipelines, Databricks.`;

const SAMPLE_DISCOVER = "Our compliance analysts spend about three weeks assembling each assessment report from PDFs, spreadsheets and email threads. Every draft needs heavy manual checking before it can be approved, and deadlines keep slipping.";

const modeBadge = (mode) =>
  h("span", { class: "mode-note " + (mode === "llm" ? "llm" : "retrieval"), title: mode === "llm" ? "Written by a live LLM grounded in the knowledge base" : "Computed from the verified knowledge base with deterministic rules" },
    mode === "llm" ? "● live AI" : "● knowledge-base rules");

const list = (items, render) => h("ul", {}, items.map(render));

/* ---------------------------------------------------------------- job-fit */
function renderFit(res, mode) {
  const lvl = (l) => (l ? h("span", { class: "lv" }, l) : null);
  const label = (e) => e.requirement || e.skill;
  const text = (e) => e.proof || e.note;
  const evid = res.evidence || [];
  const gaps = [...(res.gaps || []), ...(res.partial || [])];
  const nodes = [
    h("div", { class: "rcard" },
      h("div", { class: `fitbadge fit-${res.fit}` }, `${res.fit} fit`),
      modeBadge(mode),
      h("p", { style: "margin-top:10px;color:var(--muted)" }, res.summary)),
    h("div", { class: "rgrid" },
      h("div", { class: "rcard ev" }, h("h4", {}, "Evidence"),
        evid.length ? list(evid, (e) => h("li", {}, h("b", {}, label(e)), lvl(e.level), " ", text(e))) : h("p", { class: "muted" }, "No direct matches found in the profile.")),
      h("div", { class: "rcard gaps" }, h("h4", {}, "Gaps & things to be upfront about"),
        gaps.length ? list(gaps, (g) => h("li", {}, h("b", {}, label(g)), lvl(g.level), " ", text(g))) : h("p", { class: "muted" }, "No obvious gaps against the technologies named."))),
  ];
  if (res.fdeSignals?.length) nodes.push(h("div", { class: "rcard" }, h("h4", {}, "Forward-deployed signals in this role"), list(res.fdeSignals, (s) => h("li", {}, s)), h("p", { style: "margin-top:8px;color:var(--muted);font-size:14px" }, "See “How I work with customers” above for my approach to each.")));
  if (res.talkingPoints?.length) nodes.push(h("div", { class: "rcard" }, h("h4", {}, "Worth discussing on an intro call"), list(res.talkingPoints, (s) => h("li", {}, s))));
  nodes.push(h("div", { class: "cta-row" },
    h("button", { class: "btn btn-primary", type: "button", onclick: () => document.dispatchEvent(new CustomEvent("portfolio:contact", { detail: { subject: "About your role", message: `Hi Abhilash, I ran your profile against a job description on your site (${res.fit} fit) and would like to talk.` } })) }, "Talk to Abhilash about this role")));
  return nodes;
}

export function setupFit(brain) {
  const form = $("#fitForm"), input = $("#fitInput"), out = $("#fitResult"), status = $("#fitStatus");
  $("#fitSample").addEventListener("click", () => { input.value = SAMPLE_JD; input.focus(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const jd = input.value.trim();
    if (jd.length < 40) { status.textContent = "Paste at least a couple of sentences."; return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; status.textContent = "Comparing against verified profile data…"; out.replaceChildren();
    try {
      let res, mode = "retrieval";
      if (net.online) {
        try { const r = await postJson("/api/fit", { jobDescription: jd }); res = r.result; mode = r.mode; }
        catch (err) { if (err.status === 422 || err.status === 429) throw err; res = brain.fit(jd); }
      } else res = brain.fit(jd);
      out.replaceChildren(...renderFit(res, mode));
      status.textContent = "";
    } catch (err) { status.textContent = err.message; }
    finally { btn.disabled = false; }
  });
}

/* ---------------------------------------------------------------- discovery */
export const discoverState = { text: "" };

export function briefToText(b) {
  const sec = (t, a) => (a?.length ? `${t}:\n${a.map((x) => `- ${x}`).join("\n")}\n` : "");
  return `${b.title}\n${b.summary}\n\n${sec("Pain points", b.painPoints)}\n${sec("Where AI fits", b.whereAiFits)}\n${sec("Where humans stay in the loop", b.whereHumansStay)}\n${sec("Risks", b.risks)}\n${sec("Questions I'd ask", b.questionsIAsk)}\n${sec("First slice", b.firstSlice)}`.trim();
}

function renderBrief(b, mode) {
  const card = (cls, title, items) => (items?.length ? h("div", { class: `rcard ${cls || ""}` }, h("h4", {}, title), list(items, (x) => h("li", {}, x))) : null);
  const nodes = [
    h("div", { class: "rcard" }, h("h4", {}, "Discovery brief"), h("h3", { style: "font-size:24px;margin-bottom:8px" }, b.title), modeBadge(mode), h("p", { style: "margin-top:10px;color:var(--muted)" }, b.summary)),
    h("div", { class: "rgrid" }, card("gaps", "Likely pain points", b.painPoints), card("ev", "Where AI genuinely helps", b.whereAiFits)),
    h("div", { class: "rgrid" }, card("", "Where a human stays in the loop", b.whereHumansStay), card("gaps", "Risks I'd manage", b.risks)),
    h("div", { class: "rgrid" }, card("", "Questions I'd ask you next", b.questionsIAsk), card("", "First slice (about 3 weeks)", b.firstSlice))
  ];
  if (b.proof?.length) nodes.push(h("div", { class: "rcard ev" }, h("h4", {}, "Where I've done this before"), list(b.proof, (p) => h("li", {}, h("b", {}, p.pattern), ": ", p.claim, p.link ? [" ", h("a", { href: p.link.url, target: "_blank", rel: "noopener noreferrer", style: "color:var(--cyan)" }, "project →")] : null))));
  nodes.push(h("div", { class: "cta-row" },
    h("button", { class: "btn btn-primary", type: "button", onclick: () => document.dispatchEvent(new CustomEvent("portfolio:contact", { detail: { subject: "Let's talk about this workflow", brief: briefToText(b) } })) }, "Send this brief to Abhilash"),
    h("button", { class: "btn btn-ghost", type: "button", onclick: (e) => { navigator.clipboard?.writeText(briefToText(b)).then(() => (e.target.textContent = "Copied ✓")).catch(() => {}); } }, "Copy brief")));
  return nodes;
}

export function setupDiscover(brain) {
  const form = $("#discoverForm"), input = $("#discoverInput"), out = $("#discoverResult"), status = $("#discoverStatus");
  $("#discoverSample").addEventListener("click", () => { input.value = SAMPLE_DISCOVER; input.focus(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text.length < 20) { status.textContent = "Describe the workflow in a couple of sentences."; return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; status.textContent = "Mapping the workflow…"; out.replaceChildren();
    try {
      let res, mode = "retrieval";
      if (net.online) {
        try { const r = await postJson("/api/discover", { description: text }); res = r.result; mode = r.mode; }
        catch (err) { if (err.status === 422 || err.status === 429) throw err; res = brain.discover(text); }
      } else res = brain.discover(text);
      out.replaceChildren(...renderBrief(res, mode));
      status.textContent = "";
    } catch (err) { status.textContent = err.message; }
    finally { btn.disabled = false; }
  });
}

/* ---------------------------------------------------------------- tabs */
export function setupTabs() {
  const tabs = $$(".tab");
  const select = (name) => tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("is-active", on); t.setAttribute("aria-selected", String(on));
    const panel = $(`#panel-${t.dataset.tab}`); panel.hidden = !on; panel.classList.toggle("is-active", on);
  });
  tabs.forEach((t) => t.addEventListener("click", () => select(t.dataset.tab)));
  tabs.forEach((t, i) => t.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); select(n.dataset.tab);
  }));
  return select;
}
