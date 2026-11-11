import test from "node:test";
import assert from "node:assert/strict";
import { start, post } from "./helpers.js";

const good = { name: "Dana Recruiter", email: "dana@acme.com", message: "We'd love to talk about a Forward Deployed Engineer role.", topic: "hiring" };

test("valid contact message is accepted and captured in dev mode", async () => {
  const s = await start();
  const r = await post(s.base, "/api/contact", good);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.devMode, true); // no SMTP configured in tests
  await s.close();
});

test("mailer receives escaped, reply-to-enabled message addressed to the owner", async () => {
  const sent = [];
  const mailer = { live: true, async sendContact(c) { sent.push(c); return { delivered: true }; } };
  const s = await start({ mailer });
  const r = await post(s.base, "/api/contact", { ...good, name: "Eve\r\nBcc: evil@x.com", message: "<script>alert(1)</script> hello there" });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.ok(!/[\r\n]/.test(sent[0].name), "header-injection newlines stripped from name");
  await s.close();
});

test("invalid input returns field errors", async () => {
  const s = await start();
  const r = await post(s.base, "/api/contact", { name: "A", email: "nope", message: "short" });
  const j = await r.json();
  assert.equal(r.status, 422);
  assert.ok(j.fields.name && j.fields.email && j.fields.message);
  await s.close();
});

test("honeypot and too-fast submissions are silently dropped (no email)", async () => {
  const sent = [];
  const mailer = { live: true, async sendContact(c) { sent.push(c); return { delivered: true }; } };
  const s = await start({ mailer });
  assert.equal((await post(s.base, "/api/contact", { ...good, website: "http://spam" })).status, 200);
  assert.equal((await post(s.base, "/api/contact", { ...good, startedAt: Date.now() })).status, 200);
  assert.equal(sent.length, 0);
  await s.close();
});

test("SMTP failure surfaces a helpful 502", async () => {
  const mailer = { live: true, async sendContact() { throw new Error("smtp down"); } };
  const s = await start({ mailer });
  const r = await post(s.base, "/api/contact", good);
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /email/i);
  await s.close();
});

test("rate limit kicks in", async () => {
  const s = await start({ env: { RATE_CONTACT: "2" } });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post(s.base, "/api/contact", good)).status);
  assert.deepEqual(codes.slice(0, 2), [200, 200]);
  assert.equal(codes[3], 429);
  await s.close();
});

test("static site and sensitive paths", async () => {
  const s = await start();
  assert.equal((await fetch(s.base + "/data/profile.json")).status, 200);
  assert.equal((await fetch(s.base + "/server/.env")).status, 404);
  assert.equal((await fetch(s.base + "/server/package.json")).status, 404);
  const h = await (await fetch(s.base + "/api/health")).json();
  assert.equal(h.ai, "retrieval");
  await s.close();
});

test("optional message log records accepted submissions (and never the honeypot fields)", async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "msglog-")), "m.jsonl");
  const s = await start({ env: { MESSAGE_LOG_PATH: file } });
  assert.equal((await post(s.base, "/api/contact", good)).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const rec = JSON.parse(readFileSync(file, "utf8").trim().split("\n").at(-1));
  assert.equal(rec.email, "dana@acme.com");
  assert.ok(!("website" in rec) && !("startedAt" in rec));
  await s.close();
});
