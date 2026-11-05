/**
 * API client. The static site works with or without the Node backend:
 *   backend reachable  -> real SMTP email + (if ANTHROPIC_API_KEY is set) live Claude agent
 *   backend missing    -> in-browser retrieval answers + mailto fallback
 *
 * Point the site at a separately hosted API with <meta name="api-base" content="https://api.example.com">.
 */
const meta = document.querySelector('meta[name="api-base"]')?.content?.trim() || "";
export const API_BASE = meta.replace(/\/$/, "");

export const net = { online: false, ai: "offline", mail: "none", model: null };

export async function probe(timeout = 3500) {
  // A static host with no configured API (e.g. GitHub Pages) has nothing to probe: skip the guaranteed 404.
  if (!API_BASE && (/\.github\.io$/.test(location.hostname) || location.protocol === "file:")) return net;
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(timeout), headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (!j.ok) throw new Error("not ok");
    Object.assign(net, { online: true, ai: j.ai, mail: j.mail, model: j.model });
  } catch {
    Object.assign(net, { online: false, ai: "offline", mail: "none", model: null });
  }
  return net;
}

export async function postJson(path, body, { signal } = {}) {
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) {
    const err = new Error(data?.error || `Request failed (${r.status})`);
    err.status = r.status; err.fields = data?.fields;
    throw err;
  }
  return data;
}

/** POST and consume a text/event-stream, yielding {event, data} objects. */
export async function* streamSSE(path, body, { signal } = {}) {
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) {
    let msg = `Request failed (${r.status})`;
    try { msg = (await r.json()).error || msg; } catch { /* ignore */ }
    const err = new Error(msg); err.status = r.status; throw err;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) { try { yield { event, data: JSON.parse(data) }; } catch { /* skip bad frame */ } }
    }
  }
}
