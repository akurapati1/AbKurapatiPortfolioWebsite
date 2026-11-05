import { loadConfig } from "../src/config.js";
import { createMailer } from "../src/mailer.js";
import { createLLM } from "../src/llm.js";
import { loadKnowledgeBase } from "../src/kb.js";
import { createApp } from "../src/app.js";

const silent = { info() {}, warn() {}, error() {} };

export async function start({ env = {}, client, mailer: mailerOverride } = {}) {
  const config = loadConfig({ RATE_CONTACT: "50", RATE_CHAT: "50", RATE_TOOLS: "50", ...env });
  const kb = loadKnowledgeBase(config.siteRoot);
  const mailer = mailerOverride || createMailer(config, { logger: silent });
  const llm = createLLM(config, { client });
  const app = createApp({ config, mailer, llm, kb, logger: silent });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, config, kb, llm, close: () => new Promise((r) => server.close(r)) };
}

export const post = (base, path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** Parse an SSE response body into [{event, data}]. */
export async function readSSE(res) {
  const text = await res.text();
  return text.split("\n\n").filter(Boolean).map((blk) => {
    const ev = /^event: (.*)$/m.exec(blk)?.[1];
    const data = /^data: (.*)$/m.exec(blk)?.[1];
    return { event: ev, data: data ? JSON.parse(data) : null };
  });
}

/** Fake Anthropic client: scripted turns, each an array of events + a final message. */
export function fakeClient(turns) {
  let i = 0;
  const calls = [];
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params);
        const turn = turns[Math.min(i++, turns.length - 1)];
        return {
          async *[Symbol.asyncIterator]() {
            for (const t of turn.text || []) yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
          },
          async finalMessage() { return turn.message; }
        };
      },
      async create(params) {
        calls.push(params);
        const turn = turns[Math.min(i++, turns.length - 1)];
        return turn.message;
      }
    }
  };
}
