import { h, md, sleep, reducedMotion, ICONS, svg } from "../util.js";
import { net, streamSSE } from "../api.js";

/**
 * Conversation store shared by every chat view (inline panel + floating drawer).
 * Message: { id, role, text, trace[], sources[], action, mode, pending }
 */
export function createChatStore({ profile, brain }) {
  const messages = [];
  const views = new Set();
  let busy = false;
  let seq = 0;
  let abort = null;

  const notify = (msg) => views.forEach((v) => v.update(msg));
  const add = (m) => { const msg = { id: ++seq, trace: [], sources: [], action: null, mode: null, pending: false, text: "", ...m }; messages.push(msg); notify(msg); return msg; };

  async function typeOut(msg, text) {
    if (reducedMotion()) { msg.text += text; notify(msg); return; }
    const step = text.length > 600 ? 14 : 5;
    for (let i = 0; i < text.length; i += step) {
      msg.text += text.slice(i, i + step);
      notify(msg);
      await sleep(10);
    }
  }

  async function answerLocally(msg, question, note) {
    const a = brain.answer(question);
    msg.mode = "retrieval";
    msg.trace.push({ kind: "think", label: "Reading your question", done: true }); notify(msg);
    await sleep(reducedMotion() ? 0 : 280);
    const t = { kind: "tool", label: "Searching verified profile data", detail: "", done: false };
    msg.trace.push(t); notify(msg);
    await sleep(reducedMotion() ? 0 : 420);
    t.done = true; t.detail = a.sources.length ? `${a.sources.length} passages` : "no match"; notify(msg);
    if (note) { msg.text += note; }
    await typeOut(msg, a.text);
    msg.sources = a.sources;
    msg.action = a.action || null;
  }

  async function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true;
    views.forEach((v) => v.setBusy(true));
    add({ role: "user", text });
    const msg = add({ role: "assistant", pending: true });

    try {
      if (net.online && net.ai === "llm") {
        abort = new AbortController();
        const history = messages
          .filter((m) => m !== msg && m.text && (m.role === "user" || m.role === "assistant"))
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.text.slice(0, 3900) }));
        // The API requires the first message to be from the user.
        while (history.length && history[0].role !== "user") history.shift();
        let gotAny = false;
        try {
          for await (const { event, data } of streamSSE("/api/chat", { messages: history }, { signal: abort.signal })) {
            gotAny = true;
            if (event === "meta") msg.mode = data.mode;
            else if (event === "trace") {
              // close previous running step, then add this one
              msg.trace.forEach((t) => (t.done = true));
              msg.trace.push({ ...data, done: data.kind !== "tool" ? false : true });
            } else if (event === "delta") { msg.trace.forEach((t) => (t.done = true)); msg.text += data.text; }
            else if (event === "sources") msg.sources = data;
            else if (event === "action") msg.action = data;
            else if (event === "fallback") msg.mode = "retrieval";
            notify(msg);
          }
          if (!msg.text) throw new Error("empty");
        } catch (err) {
          if (!gotAny || !msg.text) {
            msg.trace = []; msg.text = "";
            await answerLocally(msg, text, err?.status === 429 ? "*(You're asking quickly, so I'm answering from my built-in knowledge base.)*\n\n" : "");
          }
        }
      } else {
        await answerLocally(msg, text);
      }
    } catch (err) {
      msg.text = msg.text || "Sorry, something went wrong. You can email abhilash.kurapati1301@gmail.com directly.";
    } finally {
      msg.pending = false;
      msg.trace.forEach((t) => (t.done = true));
      busy = false;
      notify(msg);
      views.forEach((v) => v.setBusy(false));
    }
  }

  return {
    messages, send,
    get busy() { return busy; },
    attach(view) { views.add(view); messages.forEach((m) => view.update(m)); view.setBusy(busy); return () => views.delete(view); },
    stop() { abort?.abort(); }
  };
}

/** Mount a chat UI into `container` bound to `store`. */
export function mountChat(container, store, { profile, compact = false }) {
  const els = new Map();
  const msgsEl = h("div", { class: "msgs", role: "log", "aria-live": "polite", "aria-label": "Conversation" });
  const suggestEl = h("div", { class: "suggest", "aria-label": "Suggested questions" });
  const input = h("textarea", { rows: 1, maxlength: 600, placeholder: "Ask about experience, projects, skills, or paste a workflow problem…", "aria-label": "Your question" });
  const sendBtn = h("button", { class: "btn btn-primary", type: "submit", "aria-label": "Send" });
  sendBtn.innerHTML = svg(ICONS.arrow, 18);
  const form = h("form", { class: "composer" }, input, sendBtn);
  const foot = h("p", { class: "chat-foot" });
  container.replaceChildren(msgsEl, suggestEl, form, foot);

  const setFoot = () => {
    foot.textContent = net.online && net.ai === "llm"
      ? "Live agent: answers are grounded in verified profile data and may still contain mistakes."
      : "Answers come from a verified knowledge base of Abhilash's profile. Nothing here is generated freely.";
  };
  setFoot();

  const greeting = h("div", { class: "msg" },
    h("div", { class: "avatar", "aria-hidden": "true" }, "AI"),
    h("div", { class: "bubble", html: md(profile.assistant.greeting) }));
  msgsEl.append(greeting);

  for (const q of profile.assistant.suggestions.slice(0, compact ? 4 : 6)) {
    suggestEl.append(h("button", { type: "button", onclick: () => store.send(q) }, q));
  }

  function renderMsg(m) {
    let el = els.get(m.id);
    if (!el) {
      el = h("div", { class: `msg ${m.role}` });
      el.append(h("div", { class: "avatar", "aria-hidden": "true" }, m.role === "user" ? "You" : "AI"), h("div", { class: "bubble" }));
      els.set(m.id, el);
      msgsEl.append(el);
    }
    const bubble = el.lastChild;
    if (m.role === "user") { bubble.textContent = m.text; return el; }

    bubble.replaceChildren();
    if (m.trace.length) {
      bubble.append(h("div", { class: "trace", "aria-label": "Agent steps" },
        m.trace.map((t) => h("div", { class: `tr${t.done ? "" : " run"}` },
          h("i", {}, t.done ? "✓" : "◌"),
          h("span", {}, t.label), t.detail ? h("em", {}, `· ${t.detail}`) : null))));
    }
    if (m.text) bubble.append(h("div", { html: md(m.text) }));
    else if (m.pending) bubble.append(h("span", { class: "typing", "aria-label": "Thinking" }, h("i"), h("i"), h("i")));
    if (!m.pending && m.sources?.length) {
      bubble.append(h("div", { class: "src" }, h("small", {}, "sources"), m.sources.slice(0, 5).map((s) => h("span", { title: s.type }, s.title.length > 46 ? s.title.slice(0, 44) + "…" : s.title))));
    }
    if (!m.pending && m.action?.type === "open_contact") {
      const a = h("div", { class: "act" });
      a.append(h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => document.dispatchEvent(new CustomEvent("portfolio:contact", { detail: m.action })) }, "Message Abhilash"));
      bubble.append(a);
    }
    return el;
  }

  const view = {
    update(m) {
      renderMsg(m);
      suggestEl.hidden = store.messages.length > 0;
      msgsEl.scrollTop = msgsEl.scrollHeight;
      setFoot();
    },
    setBusy(b) { sendBtn.disabled = b; input.disabled = b && false; }
  };
  store.attach(view);

  const submit = () => { const v = input.value.trim(); if (!v) return; input.value = ""; autosize(); store.send(v); };
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; };
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
  form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });

  return { focus: () => input.focus(), setFoot };
}
