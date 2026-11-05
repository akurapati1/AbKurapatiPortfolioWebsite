import test from "node:test";
import assert from "node:assert/strict";
import { loadKnowledgeBase } from "../src/kb.js";
import { loadConfig } from "../src/config.js";
import { search, answerOffline, assessFit, discoveryBrief, classifyIntent } from "../../assets/js/shared/retrieval.js";

const kb = loadKnowledgeBase(loadConfig({}).siteRoot);

test("BM25 finds the J&J case study for a J&J question", () => {
  const hits = search(kb.index, "What did Abhilash build at Johnson & Johnson medical reports", 3);
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => /Johnson|Pozent|Impact/i.test(h.chunk.title + h.chunk.text)));
});

test("offline answers refuse to guess about unknowns (visa, salary)", () => {
  for (const q of ["Does Abhilash need visa sponsorship?", "What is the salary expectation?"]) {
    const a = answerOffline(q, kb.profile, kb.index);
    assert.equal(a.intent, "unknown");
    assert.match(a.text, /don't have verified information/);
    assert.equal(a.action.type, "open_contact");
  }
});

test("intent classification", () => {
  assert.equal(classifyIntent("how can I contact him"), "contact");
  assert.equal(classifyIntent("tell me about the Johnson & Johnson work"), "jnj");
  assert.equal(classifyIntent("is Abhilash a forward deployed engineer"), "fde");
});

test("gibberish returns an honest not-found, not a hallucination", () => {
  const a = answerOffline("zxqv blorf quux", kb.profile, kb.index);
  assert.match(a.text, /couldn't find that/);
  assert.equal(a.sources.length, 0);
});

test("fit assessment separates evidence from gaps and never claims outside skills", () => {
  const jd = "We need an AI engineer with Python, Vertex AI, RAG pipelines, Kubernetes and AWS SageMaker plus Databricks and Spark. Customer-facing, on-site stakeholder work.";
  const r = assessFit(jd, kb.profile);
  const ev = r.evidence.map((e) => e.skill);
  assert.ok(ev.includes("Python") && ev.includes("Vertex AI"));
  const gaps = r.gaps.map((g) => g.skill);
  assert.ok(gaps.includes("AWS") && gaps.includes("Databricks") && gaps.includes("Spark"));
  assert.ok(!ev.includes("AWS"));
  assert.ok(r.fdeSignals.length >= 2);
  assert.ok(["Strong", "Good", "Partial"].includes(r.fit));
});

test("fit says Weak for an unrelated JD", () => {
  assert.equal(assessFit("Seeking a licensed electrician for residential wiring and conduit work in Ohio.", kb.profile).fit, "Weak");
});

test("discovery brief maps a reporting problem to the J&J pattern", () => {
  const b = discoveryBrief("Our analysts spend three weeks assembling compliance reports from PDFs and spreadsheets.", kb.profile);
  assert.match(b.title, /Reporting/);
  assert.ok(b.proof[0].claim.includes("Johnson"));
  assert.ok(b.firstSlice.length === 4);
});

test("discovery brief is honest when nothing matches", () => {
  const b = discoveryBrief("We sell artisanal candles and want more happiness in the office somehow", kb.profile);
  assert.match(b.title, /find the pain first/);
});
