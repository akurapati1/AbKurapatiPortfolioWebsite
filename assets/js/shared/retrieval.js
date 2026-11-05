/**
 * Knowledge-base retrieval shared by the browser (offline mode) and the Node server (LLM grounding).
 * Pure ES module, zero dependencies.
 *
 *   buildChunks(profile)  -> Chunk[]       flatten profile.json into searchable passages
 *   createIndex(chunks)   -> Index         BM25 index
 *   search(index, q, k)   -> Hit[]         ranked passages
 */

const STOP = new Set(
  ("a an and are as at be but by can did do does for from has have how i in is it its of on or our so such " +
    "than that the their them then there these they this to was we were what when where which who why will with " +
    "you your he his him she her about tell me give show any all also been being just more most other some very")
    .split(" ")
);

/** Very light stemmer: enough to match "pipelines"/"pipeline", "building"/"build". */
function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t && t.length > 1 && !STOP.has(t))
    .map(stem);
}

/* ------------------------------------------------------------------ chunk building */

const j = (arr) => (arr || []).join(", ");

export function buildChunks(p) {
  const chunks = [];
  const add = (id, type, title, text, extra = {}) =>
    chunks.push({ id, type, title, text: text.trim(), ...extra });

  const id = p.identity;
  add("identity", "about", "Who Abhilash is",
    `${id.name} is an ${id.title} based in ${id.location}, open to AI Engineer and Forward Deployed Engineer roles. ` +
      p.summary.join(" "), { tags: "summary overview about background who" });

  add("contact", "contact", "How to contact Abhilash",
    `Email: ${id.email}. Phone: ${id.phone}. LinkedIn: ${id.linkedin}. GitHub: ${id.github}. ` +
      `You can also use the contact form on this website, or request a call back.`,
    { tags: "contact reach email phone call message hire linkedin github" });

  for (const e of p.experience) {
    add(`exp-${e.id}`, "experience", `${e.role} at ${e.org}${e.client ? ` (${e.client})` : ""}, ${e.period}`,
      `${e.summary} Stack: ${j(e.stack)}.`, { ref: e.id, tags: "experience role job work employer" });
    e.bullets.forEach((b, i) =>
      add(`exp-${e.id}-${i}`, "experience", `${e.role}, ${e.org}`, b, { ref: e.id, tags: "experience achievement" }));
  }

  for (const s of p.education)
    add(`edu-${s.school}`, "education", `${s.degree}, ${s.school}`,
      `${s.degree} at ${s.school} (${s.period}, ${s.place}). ${s.grade}.`, { tags: "education degree university masters bachelors school gpa" });

  const cs = p.caseStudy;
  add("case-study", "project", cs.title,
    `${cs.client}. Problem: ${cs.problem} Approach: ${cs.approach} Result: ${cs.result}`,
    { ref: cs.id, tags: "flagship production johnson medical report agentic" });
  for (const n of cs.pipeline)
    add(`case-${n.id}`, "project", `${cs.title}: ${n.label}`, `${n.label} (${n.tech}). ${n.detail}`,
      { ref: cs.id, tags: "architecture pipeline" });

  for (const pr of p.projects)
    add(`proj-${pr.id}`, "project", pr.name,
      `${pr.tagline} Problem: ${pr.problem} How it works: ${pr.how.join(" ")} Impact: ${pr.impact} ` +
        `Stack: ${j(pr.stack)}. ${pr.links.length ? "Links: " + pr.links.map((l) => `${l.label} ${l.url}`).join("; ") : "No public link."}`,
      { ref: pr.id, tags: `project ${pr.category} ${pr.status}` });

  for (const c of p.skills.categories)
    add(`skills-${c.id}`, "skills", `Skills: ${c.name}`,
      c.skills.map((s) => `${s.name} (${s.level})`).join(", ") +
        `. Levels: core = shipped in real work, working = used and comfortable, familiar = exposure only.`,
      { tags: "skills tech stack tools technologies proficiency strongest" });

  const f = p.fde;
  add("fde-overview", "fde", "Forward Deployed Engineer approach",
    `${f.intro} Steps: ${f.steps.map((s) => `${s.title}: ${s.summary}`).join(" ")}`,
    { tags: "forward deployed engineer fde customer client approach process communication stakeholder discovery pain points" });
  for (const s of f.steps)
    add(`fde-${s.id}`, "fde", `FDE step: ${s.title}`, `${s.summary} ${s.detail} Output: ${s.output}`, { tags: "forward deployed customer process" });
  for (const s of f.strengths)
    add(`fde-str-${s.title}`, "fde", `Working style: ${s.title}`, s.text, { tags: "communication strengths soft skills customer" });
  for (const pt of f.patterns)
    add(`pattern-${pt.id}`, "fde", `Workflow pattern: ${pt.name}`,
      `Pain signs: ${j(pt.painSigns)}. Where AI fits: ${j(pt.aiFit)}. Human gate: ${pt.humanGate} Proof: ${pt.proof.claim}.`,
      { ref: pt.proof.project, tags: "workflow pain point ai insertion customer" });

  for (const q of p.faq) add(`faq-${q.q}`, "faq", q.q, q.a, { tags: "faq" });

  return chunks;
}

/* ------------------------------------------------------------------ BM25 */

export function createIndex(chunks, { k1 = 1.4, b = 0.75 } = {}) {
  const docs = chunks.map((c) => {
    const body = tokenize(`${c.text} ${c.tags || ""}`);
    const title = tokenize(c.title);
    const tf = new Map();
    for (const t of body) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of title) tf.set(t, (tf.get(t) || 0) + 3); // title boost
    return { chunk: c, tf, len: body.length + title.length * 3 };
  });
  const N = docs.length;
  const avg = docs.reduce((s, d) => s + d.len, 0) / Math.max(N, 1);
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  return { docs, N, avg, df, k1, b, chunks };
}

export function search(index, query, k = 5) {
  const q = [...new Set(tokenize(query))];
  if (!q.length) return [];
  const hits = [];
  for (const d of index.docs) {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = index.df.get(t) || 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (index.k1 + 1)) / (f + index.k1 * (1 - index.b + (index.b * d.len) / index.avg)));
    }
    if (score > 0) hits.push({ chunk: d.chunk, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/* ------------------------------------------------------------------ offline answerer */

const has = (q, words) => words.some((w) => new RegExp(`\\b${w}`, "i").test(q));

const UNKNOWN_TOPICS = [
  [/\b(visa|sponsor|work authori[sz]ation|h-?1b|opt|stem|citizen|green card)/i, "work authorization"],
  [/\b(salary|compensation|pay|rate|ctc|expected)/i, "compensation expectations"],
  [/\b(notice period|start date|available from|when can they start|join)/i, "start date / notice period"],
  [/\b(relocat|remote|on-?site|hybrid)/i, "relocation / work-location preferences"]
];

export function classifyIntent(q) {
  if (UNKNOWN_TOPICS.some(([re]) => re.test(q))) return "unknown";
  if (has(q, ["contact", "email", "reach", "call", "phone", "message", "hire", "linkedin", "talk to", "connect"])) return "contact";
  if (has(q, ["johnson", "j&j", "jnj", "pozent", "current role", "current job"])) return "jnj";
  if (has(q, ["forward deployed", "fde", "customer", "client", "stakeholder", "pain point", "communicat", "discovery", "approach"])) return "fde";
  if (has(q, ["best", "project", "built", "build", "portfolio", "github", "agentic", "rag", "work"])) return "projects";
  if (has(q, ["skill", "stack", "tech", "strongest", "gcp", "google cloud", "language", "tool", "framework", "proficien"])) return "skills";
  if (has(q, ["education", "degree", "university", "school", "gpa", "masters", "study"])) return "education";
  if (has(q, ["experience", "career", "background", "history", "resume"])) return "experience";
  return "general";
}

const md = (hit) => `**${hit.chunk.title}**\n${hit.chunk.text}`;

/**
 * Compose an answer purely from retrieved passages. No generation: every sentence is sourced.
 * Returns { text, sources: [{id,title,type}], intent, mode: "retrieval" }.
 */
export function answerOffline(question, profile, index) {
  const q = String(question || "").trim();
  const id = profile.identity;
  const intent = classifyIntent(q);
  const src = (hits) => hits.map((h) => ({ id: h.chunk.id, title: h.chunk.title, type: h.chunk.type }));

  if (!q) return { text: "Ask me anything about Abhilash's experience, projects, skills or how they work with customers.", sources: [], intent, mode: "retrieval" };

  if (intent === "unknown") {
    const topic = UNKNOWN_TOPICS.find(([re]) => re.test(q))[1];
    return {
      text: `I don't have verified information about Abhilash's **${topic}**, and I won't guess. The fastest route is to ask Abhilash directly: ${id.email} or ${id.phone}, or use the contact form below.`,
      sources: [], intent, mode: "retrieval", action: { type: "open_contact", subject: `Question about ${topic}` }
    };
  }

  if (intent === "contact") {
    return {
      text: `You can reach Abhilash several ways:\n\n- **Email:** ${id.email}\n- **Phone:** ${id.phone}\n- **Message Abhilash right here:** use the contact form (it sends an email straight to their inbox)\n- **LinkedIn:** ${id.linkedin}`,
      sources: src(search(index, "contact email phone", 1)), intent, mode: "retrieval", action: { type: "open_contact" }
    };
  }

  let hits;
  if (intent === "jnj") {
    hits = [...index.chunks.filter((c) => c.id === "case-study" || c.id === "exp-pozent")].map((chunk) => ({ chunk, score: 1 }));
  } else if (intent === "projects") {
    hits = ["case-study", "proj-market-researcher", "proj-insurance-rag", "proj-ml-pipeline-gcp"]
      .map((cid) => index.chunks.find((c) => c.id === cid)).filter(Boolean).map((chunk) => ({ chunk, score: 1 }));
  } else if (intent === "fde" && /forward deployed|fde|approach|customer|client/i.test(q)) {
    hits = ["fde-overview", "fde-str-Clear communicator", "fde-str-Pain-point detective"]
      .map((cid) => index.chunks.find((c) => c.id === cid)).filter(Boolean).map((chunk) => ({ chunk, score: 1 }));
  } else {
    hits = search(index, q, 3);
  }

  if (!hits.length || (hits[0].score < 1.2 && intent === "general"))
    return {
      text: `I couldn't find that in Abhilash's profile, so I won't make something up. Try asking about the **Johnson & Johnson work**, **agentic AI projects**, **GCP/MLOps skills**, or **how Abhilash approaches customer problems**. For anything else: ${id.email}.`,
      sources: [], intent, mode: "retrieval", action: { type: "open_contact" }
    };

  const lead = {
    jnj: "At Johnson & Johnson (via Pozent), Abhilash:",
    projects: "Here's the work that best shows what Abhilash can do:",
    fde: "Here's how Abhilash approaches customer-facing work:",
    skills: "Here's the skills picture (levels are honest: *core* = shipped in real work):",
    education: "Education:",
    experience: "Experience highlights:",
    general: "Here's what I found:"
  }[intent];

  const body = hits.slice(0, 3).map(md).join("\n\n");
  return { text: `${lead}\n\n${body}`, sources: src(hits.slice(0, 3)), intent, mode: "retrieval" };
}

/* ------------------------------------------------------------------ job-fit scoring (heuristic, honest) */

/** Technologies recruiters mention that Abhilash has NOT claimed. Listing them keeps gap analysis honest. */
const OUTSIDE_TERMS = {
  AWS: ["aws", "amazon web services", "sagemaker", "bedrock", "lambda"],
  Azure: ["azure", "azure openai"],
  Snowflake: ["snowflake"],
  Databricks: ["databricks"],
  Spark: ["spark", "pyspark"],
  Go: ["golang", " go "],
  Rust: ["rust"],
  "C++": ["c++"],
  Scala: ["scala"],
  "Java (as a primary language)": ["java"],
  Terraform: ["terraform"],
  "Fine-tuning / LoRA": ["fine-tun", "finetun", "lora", "peft", "rlhf training"],
  "GPU inference (vLLM/TensorRT)": ["vllm", "tensorrt", "triton"],
  "Vector DBs (Pinecone/Weaviate)": ["pinecone", "weaviate", "milvus", "qdrant"],
  "Hugging Face": ["hugging face", "huggingface", "transformers library"],
  MLflow: ["mlflow", "weights & biases", "wandb"],
  GraphQL: ["graphql"],
  "Next.js": ["next.js", "nextjs"]
};

/** Aliases for skills Abhilash has, matched against JD text. */
const ALIASES = {
  "Google Cloud": ["gcp", "google cloud"], "Vertex AI": ["vertex"], "Cloud Composer (Airflow)": ["airflow", "composer"],
  "Claude API": ["claude", "anthropic"], "OpenAI API": ["openai", "gpt"], "RAG Pipelines": ["rag", "retrieval-augmented", "retrieval augmented", "vector search"],
  "Agentic AI": ["agent", "agentic", "multi-agent", "autonomous"], "MCP Servers": ["mcp", "model context protocol"],
  "Prompt Engineering": ["prompt"], "Human-in-the-Loop": ["human-in-the-loop", "human in the loop", "hitl"],
  "CI/CD (Cloud Build)": ["ci/cd", "cicd", "continuous integration", "continuous deployment"], "Kubernetes": ["kubernetes", "k8s"],
  "REST APIs": ["rest", "api"], "Model Monitoring": ["monitoring", "observability", "drift"], "SQL": ["sql"], "Python": ["python"],
  "scikit-learn": ["scikit", "sklearn"], "PyTorch": ["pytorch"], "TensorFlow": ["tensorflow"], "React": ["react"]
};

const FDE_SIGNALS = [
  ["customer", "Customer-facing delivery"], ["client", "Client-facing delivery"], ["stakeholder", "Stakeholder communication"],
  ["on-site", "On-site / embedded work"], ["onsite", "On-site / embedded work"], ["forward deployed", "Forward Deployed Engineer role"],
  ["solutions", "Solutions engineering"], ["requirements", "Requirements gathering"], ["workflow", "Workflow analysis"], ["deploy", "Deployment ownership"]
];

function mentions(text, needle) {
  const n = needle.toLowerCase();
  return n.length <= 3 ? new RegExp(`(^|[^a-z0-9])${n.replace(/[+/]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text) : text.includes(n);
}

export function assessFit(jdText, profile) {
  const text = " " + String(jdText || "").toLowerCase() + " ";
  const evidence = [], gaps = [], partial = [];
  const seen = new Set();

  for (const cat of profile.skills.categories) {
    for (const s of cat.skills) {
      const names = [s.name.toLowerCase(), ...(ALIASES[s.name] || [])];
      const m = names.find((nm) => mentions(text, nm));
      if (!m || seen.has(s.name)) continue;
      seen.add(s.name);
      if (s.level === "core") evidence.push({ skill: s.name, level: s.level, note: `Shipped in production work (see experience and projects).` });
      else if (s.level === "working") evidence.push({ skill: s.name, level: s.level, note: `Used and comfortable with it; not the deepest area.` });
      else partial.push({ skill: s.name, level: s.level, note: `Exposure only. Be upfront about this.` });
    }
  }
  for (const [label, needles] of Object.entries(OUTSIDE_TERMS)) {
    if (needles.some((n) => mentions(text, n))) gaps.push({ skill: label, note: "Not in the resume or projects." });
  }

  const fde = [...new Set(FDE_SIGNALS.filter(([k]) => text.includes(k)).map(([, v]) => v))];
  const core = evidence.filter((e) => e.level === "core").length;
  const total = core + evidence.length - core + partial.length + gaps.length || 1;
  const score = Math.round(((core + (evidence.length - core) * 0.6 + partial.length * 0.25) / total) * 100);
  let fit = "Partial";
  if (score >= 75 && core >= 4) fit = "Strong";
  else if (score >= 55 && core >= 2) fit = "Good";
  else if (score < 30 || (evidence.length + partial.length === 0)) fit = "Weak";

  const talking = [];
  if (fde.length) talking.push("Walk through the J&J engagement: discovery with reviewers, the 2–3 weeks → <1 minute outcome, and how reviewer edits fed back into the system.");
  if (core) talking.push("Pick one core skill from the list above and discuss a production decision Abhilash made with it.");
  if (gaps.length) talking.push(`Ask how Abhilash would ramp on ${gaps.slice(0, 2).map((g) => g.skill).join(" / ")}, given adjacent experience on GCP.`);

  const summary =
    fit === "Strong" ? "Strong overlap with the shipped work." :
    fit === "Good" ? "Good overlap, with a few areas to discuss." :
    fit === "Partial" ? "Some overlap; check the gaps below." :
    "Limited overlap with the technologies named in this description.";

  return { fit, score, summary, evidence, partial, gaps, fdeSignals: fde, talkingPoints: talking, mode: "retrieval" };
}

/* ------------------------------------------------------------------ discovery brief (FDE demo) */

export function discoveryBrief(description, profile) {
  const text = String(description || "").toLowerCase();
  const toks = new Set(tokenize(text));
  const scored = profile.fde.patterns
    .map((pt) => ({ pt, score: pt.keywords.reduce((s, k) => s + (toks.has(stem(k)) || text.includes(k) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);

  const matched = scored.filter((s) => s.score > 0).slice(0, 2).map((s) => s.pt);
  const primary = matched[0] || profile.fde.patterns.find((p) => p.id === "doc-qa");
  const generic = !matched.length;

  const nums = (description.match(/\b\d[\d,.]*\s*(hours?|hrs?|days?|weeks?|minutes?|mins?|people|analysts?|tickets?|reports?|documents?|%)/gi) || []).slice(0, 3);

  const project = (id) => profile.projects.find((p) => p.id === id);
  const proof = matched.concat(generic ? [primary] : []).map((pt) => ({
    pattern: pt.name,
    claim: pt.proof.claim,
    link: (project(pt.proof.project)?.links || [])[0] || null
  }));

  return {
    title: generic ? "Let's find the pain first" : `Likely pattern: ${primary.name}`,
    summary: generic
      ? "I couldn't confidently match this to a pattern I've shipped, which usually means we need a proper discovery conversation before designing anything. Here's how I'd start."
      : `This sounds like a ${primary.name.toLowerCase()} problem${nums.length ? ` (you mention ${nums.join(", ")})` : ""}. I've shipped this shape of system before.`,
    painPoints: primary.painSigns,
    whereAiFits: primary.aiFit,
    whereHumansStay: [primary.humanGate],
    risks: [
      "Data quality and access: confirm where the data lives and who owns it before building anything.",
      "Trust: define up front what a wrong answer costs and how users can verify one.",
      "Adoption: the best model fails if it doesn't fit how people already work."
    ],
    questionsIAsk: profile.fde.discoveryQuestions.slice(0, 5),
    firstSlice: [
      "Week 1: shadow 2–3 users, collect 10 real examples, agree success metrics.",
      "Week 2: build the thinnest end-to-end slice on real data, with a review step.",
      "Week 3: put it in front of users, measure against the baseline, capture their edits.",
      "Then: widen scope, add monitoring, and plan the next workflow."
    ],
    proof,
    mode: "retrieval"
  };
}
