import test from "node:test";
import assert from "node:assert/strict";
import { start, post, readSSE, fakeClient } from "./helpers.js";

const user = (c) => ({ messages: [{ role: "user", content: c }] });

test("without an API key chat answers from retrieval, with sources", async () => {
  const s = await start();
  const evs = await readSSE(await post(s.base, "/api/chat", user("What did Abhilash build at Johnson & Johnson?")));
  assert.equal(evs.find((e) => e.event === "meta").data.mode, "retrieval");
  const text = evs.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
  assert.match(text, /under a minute|1 minute|Impact Assessment/i);
  assert.ok(evs.some((e) => e.event === "sources"));
  assert.equal(evs.at(-1).event, "done");
  await s.close();
});

test("rejects malformed chat payloads", async () => {
  const s = await start();
  assert.equal((await post(s.base, "/api/chat", { messages: [] })).status, 422);
  assert.equal((await post(s.base, "/api/chat", { messages: [{ role: "assistant", content: "hi" }] })).status, 422);
  await s.close();
});

test("agent loop: tool_use -> tool_result -> final answer, streams trace + sources + action", async () => {
  const client = fakeClient([
    {
      text: [],
      message: {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "search_profile", input: { query: "Johnson & Johnson agentic" } },
          { type: "tool_use", id: "t2", name: "suggest_contact", input: { reason: "wants to hire", subject: "FDE role" } }
        ]
      }
    },
    { text: ["Abhilash cut report ", "time to under a minute."], message: { stop_reason: "end_turn", content: [{ type: "text", text: "x" }] } }
  ]);
  const s = await start({ env: { ANTHROPIC_API_KEY: "test" }, client });
  const evs = await readSSE(await post(s.base, "/api/chat", user("Tell me about J&J")));

  assert.equal(evs.find((e) => e.event === "meta").data.mode, "llm");
  const tools = evs.filter((e) => e.event === "trace" && e.data.kind === "tool").map((e) => e.data.tool);
  assert.deepEqual(tools, ["search_profile", "suggest_contact"]);
  assert.equal(evs.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), "Abhilash cut report time to under a minute.");
  assert.ok(evs.find((e) => e.event === "sources").data.length > 0);
  assert.equal(evs.find((e) => e.event === "action").data.subject, "FDE role");

  // Both tool_results must go back in a SINGLE user message, and the assistant turn is echoed unchanged.
  const second = client.calls[1].messages;
  assert.equal(second.at(-1).role, "user");
  assert.equal(second.at(-1).content.length, 2);
  assert.equal(second.at(-2).role, "assistant");
  // Opus 5.5 constraints: no forced tool_choice, no disabled thinking, no budget_tokens.
  for (const c of client.calls) {
    assert.equal(c.tool_choice, undefined);
    assert.equal(c.thinking, undefined);
    assert.equal(c.output_config.effort, "low");
  }
  await s.close();
});

test("LLM errors degrade to retrieval instead of a dead end", async () => {
  const client = { messages: { stream() { throw Object.assign(new Error("boom"), { status: 500 }); } } };
  const s = await start({ env: { ANTHROPIC_API_KEY: "test" }, client });
  const evs = await readSSE(await post(s.base, "/api/chat", user("How can I contact Abhilash?")));
  assert.ok(evs.some((e) => e.event === "fallback"));
  assert.ok(evs.filter((e) => e.event === "delta").map((e) => e.data.text).join("").includes("abhilash.kurapati1301@gmail.com"));
  await s.close();
});

test("daily call budget degrades to retrieval mode", async () => {
  const client = fakeClient([{ text: ["ok"], message: { stop_reason: "end_turn", content: [] } }]);
  const s = await start({ env: { ANTHROPIC_API_KEY: "t", LLM_DAILY_CALL_BUDGET: "1" }, client });
  const first = await readSSE(await post(s.base, "/api/chat", user("hello there")));
  assert.equal(first.find((e) => e.event === "meta").data.mode, "llm");
  const second = await readSSE(await post(s.base, "/api/chat", user("hello again")));
  assert.equal(second.find((e) => e.event === "meta").data.mode, "retrieval");
  await s.close();
});

test("refusal is handled politely", async () => {
  const client = fakeClient([{ text: [], message: { stop_reason: "refusal", content: [] } }]);
  const s = await start({ env: { ANTHROPIC_API_KEY: "t" }, client });
  const evs = await readSSE(await post(s.base, "/api/chat", user("something odd")));
  assert.match(evs.filter((e) => e.event === "delta").map((e) => e.data.text).join(""), /can't help/);
  await s.close();
});

test("fit endpoint: retrieval fallback and LLM structured path", async () => {
  const jd = "AI Engineer: Python, Vertex AI, RAG, Kubernetes, AWS. Work directly with customers on site.";
  const s1 = await start();
  const r1 = await (await post(s1.base, "/api/fit", { jobDescription: jd })).json();
  assert.equal(r1.mode, "retrieval");
  assert.ok(r1.result.gaps.some((g) => g.skill === "AWS"));
  await s1.close();

  const payload = { fit: "Good", summary: "s", evidence: [], gaps: [], talkingPoints: [] };
  const client = fakeClient([{ message: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(payload) }] } }]);
  const s2 = await start({ env: { ANTHROPIC_API_KEY: "t" }, client });
  const r2 = await (await post(s2.base, "/api/fit", { jobDescription: jd })).json();
  assert.equal(r2.mode, "llm");
  assert.equal(r2.result.fit, "Good");
  assert.equal(client.calls[0].output_config.format.type, "json_schema");
  await s2.close();
});

test("fit/discover fall back when the model returns invalid JSON", async () => {
  const client = fakeClient([{ message: { stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] } }]);
  const s = await start({ env: { ANTHROPIC_API_KEY: "t" }, client });
  const r = await (await post(s.base, "/api/discover", { description: "Analysts spend weeks building compliance reports by hand." })).json();
  assert.equal(r.mode, "retrieval");
  assert.ok(r.result.painPoints.length);
  await s.close();
});
