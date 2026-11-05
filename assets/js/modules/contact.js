import { $, $$, h, svg, ICONS } from "../util.js";
import { net, postJson } from "../api.js";
import { briefToText } from "./aitools.js";

const EMAIL = "abhilash.kurapati1301@gmail.com";
const TOPIC_LABEL = { hiring: "Hiring / role", project: "Project", collaboration: "Collaboration", question: "Question", callback: "Call-back request" };

export function setupContact() {
  const form = $("#contactForm");
  const status = $("#contactStatus");
  const submit = $("#contactSubmit");
  const startedAt = Date.now();
  let attachedBrief = "";
  const phone = $("#cPhone"), timeField = $("#timeField"), reqMark = $(".req-callback");

  const topic = () => form.elements.topic.value;
  const syncTopic = () => {
    const cb = topic() === "callback";
    timeField.hidden = !cb; reqMark.hidden = !cb;
  };
  $$("input[name=topic]", form).forEach((r) => r.addEventListener("change", syncTopic));
  syncTopic();

  const setErr = (name, msg) => {
    const el = form.querySelector(`[data-err="${name}"]`);
    if (!el) return;
    el.textContent = msg || "";
    el.closest(".field")?.classList.toggle("invalid", Boolean(msg));
  };
  const validate = () => {
    const d = Object.fromEntries(new FormData(form));
    const errs = {};
    if ((d.name || "").trim().length < 2) errs.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((d.email || "").trim())) errs.email = "Enter a valid email so I can reply.";
    if ((d.message || "").trim().length < 10) errs.message = "A few more words, please (10+ characters).";
    if (d.topic === "callback" && (d.phone || "").replace(/\D/g, "").length < 7) errs.phone = "Add a phone number so I can call you back.";
    ["name", "email", "message", "phone"].forEach((k) => setErr(k, errs[k]));
    return { d, errs };
  };
  form.addEventListener("input", (e) => { if (e.target.name) setErr(e.target.name, ""); });

  /** Called by chat / fit / discovery tools to pre-fill the form and bring it into view. */
  document.addEventListener("portfolio:contact", (ev) => {
    const { subject = "", message = "", brief = "", topic: t } = ev.detail || {};
    document.dispatchEvent(new Event("portfolio:close-chat"));
    const msg = $("#cMessage");
    if (!msg.value.trim()) msg.value = message || (subject ? `Re: ${subject}\n\n` : "");
    if (t) { const r = form.querySelector(`input[name=topic][value=${t}]`); if (r) { r.checked = true; syncTopic(); } }
    if (brief) { attachedBrief = brief; $("#briefAttach").hidden = false; $("#briefCheck").checked = true; }
    $("#contact").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => ($("#cName").value ? msg : $("#cName")).focus({ preventScroll: true }), 650);
  });

  const mailtoFallback = (d) => {
    const body = `${d.message}\n\n— ${d.name}${d.company ? `, ${d.company}` : ""}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.preferredTime ? `\nBest time: ${d.preferredTime}` : ""}\nReply to: ${d.email}`;
    return `mailto:${EMAIL}?subject=${encodeURIComponent(`[Portfolio] ${TOPIC_LABEL[d.topic] || "Message"} from ${d.name}`)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  };

  const showSuccess = (d) => {
    form.replaceChildren(h("div", { class: "success", role: "status" },
      h("div", { class: "tick", html: svg(ICONS.check, 30) }),
      h("h3", {}, `Thanks ${d.name.split(" ")[0]}, message sent.`),
      h("p", {}, "It's in my inbox and I'll reply to " + d.email + " personally."),
      h("p", { style: "margin-top:14px" }, "Meanwhile: ", h("a", { class: "link-btn", href: "assets/Abhilash_Kurapati_AI_Engineer_Resume.pdf", download: true }, "grab my resume"), " or ", h("button", { class: "link-btn", type: "button", "data-open-chat": "" }, "ask my AI"), " anything.")));
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { d, errs } = validate();
    if (Object.keys(errs).length) { form.querySelector(".invalid input, .invalid textarea")?.focus(); status.className = "form-status bad"; status.textContent = "Please fix the highlighted fields."; return; }
    const payload = {
      name: d.name.trim(), email: d.email.trim(), phone: (d.phone || "").trim(), company: (d.company || "").trim(), topic: d.topic,
      preferredTime: (d.preferredTime || "").trim(), message: d.message.trim(), website: d.website || "", startedAt,
      brief: attachedBrief && $("#briefCheck").checked ? attachedBrief : ""
    };

    submit.disabled = true;
    const lbl = submit.querySelector(".lbl"); const prev = lbl.textContent;
    lbl.textContent = "Sending…"; submit.prepend(h("span", { class: "spin", "aria-hidden": "true" }));
    status.className = "form-status"; status.textContent = "";

    const fallback = (reason) => {
      status.className = "form-status bad";
      status.replaceChildren(`${reason} `, h("a", { class: "link-btn", href: mailtoFallback(payload) }, "Open in your email app"), ` or email ${EMAIL} directly.`);
    };
    try {
      if (!net.online) { fallback("The mail service isn't reachable from this page right now."); location.href = mailtoFallback(payload); }
      else {
        const r = await postJson("/api/contact", payload);
        if (r.devMode) fallback("Email delivery isn't configured on the server yet, so this wasn't sent.");
        else showSuccess(payload);
      }
    } catch (err) {
      if (err.fields) Object.entries(err.fields).forEach(([k, v]) => setErr(k, v));
      fallback(err.message || "Couldn't send.");
    } finally {
      submit.querySelector(".spin")?.remove(); lbl.textContent = prev; submit.disabled = false;
    }
  });

  return { setMailNote() { $("#mailMode").textContent = net.online ? "" : "(Static preview: sending falls back to your email app.)"; } };
}
