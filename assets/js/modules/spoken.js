import { classifyIntent } from "../shared/retrieval.js";

/**
 * Conversational answers for ARI when the live LLM isn't available.
 *
 * The retrieval engine returns verified passages (great to read, awful to hear). This turns the
 * same verified data into short spoken-style replies. Nothing here is invented: every fact comes
 * from data/profile.json. With the live agent enabled, its own (already conversational) answer
 * is used instead.
 */

const list = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1]);
const firstSentences = (t, n) => (String(t).match(/[^.!?]+[.!?]+/g) || [String(t)]).slice(0, n).join(" ").trim();
const clean = (t) => String(t).replace(/\*\*[^*]+\*\*\n?/g, "").replace(/Stack:.*?(?=\.\s|$)/g, "").replace(/\s+/g, " ").trim();

export function spokenAnswer(q, profile, msg) {
  const G = profile.guide, id = profile.identity, text = String(q || "").trim(), low = text.toLowerCase();
  const reply = (t, cta = []) => ({ text: t, cta });
  const contact = [{ label: "Open the contact form", action: "contact" }, { label: "Email", href: `mailto:${id.email}` }, { label: "Call", href: `tel:${id.phoneHref}` }];

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(low)) return reply("Hi! Good to meet you. What would you like to know about Abhilash?");
  if (/\b(thanks|thank you|cheers)\b/.test(low)) return reply("You're very welcome! Anything else you'd like to ask?");
  if (/\b(who|what) are you\b/.test(low)) return reply("I'm ARI, a guide built into Abhilash's portfolio. I only know what's in his verified profile, so if I don't know something, I'll tell you instead of guessing.");
  if (/\b(job description|fit|good match|right for (this|our)|suitable)\b/.test(low))
    return reply("For an honest fit check, paste the job description into the job fit tool in the Ask section. It lists the evidence, and the gaps too. Want me to take you there?", [{ label: "Open the job fit check", action: "fit" }]);

  const intent = classifyIntent(text);
  switch (intent) {
    case "jnj":
      return reply(`${G.experience.pozent} ${profile.caseStudy.result}`, [{ label: "See the flagship system", action: "case" }]);
    case "experience":
      return reply(`He's held three roles. ${profile.experience.map((e) => `${e.role} at ${e.org}`).join("; ")}. ${profile.summary[0]} Want me to walk you through them?`, [{ label: "Tour his experience", action: "tour:did" }]);
    case "projects": {
      const top = profile.projects.filter((p) => p.showcase).slice(0, 4).map((p) => p.name.split(":")[0]);
      return reply(`The ones I'd start with are ${list(top)}. They're all open source, with real code and tests. And the flagship is the medical reporting system at Johnson and Johnson. Shall I walk you through them?`, [{ label: "Tour the projects", action: "tour:built" }]);
    }
    case "skills": {
      const cats = profile.skills.categories.slice(0, 2).map((c) => ({ n: c.name.replace("&", "and"), core: c.skills.filter((s) => s.level === "core").slice(0, 5).map((s) => s.name) }));
      return reply(`His strongest area is ${cats[0].n}. Core skills there include ${list(cats[0].core)}. On the cloud side, ${cats[1].n}, with ${list(cats[1].core)}. Core means he's shipped it in real work.`, [{ label: "Tour the skills", action: "tour:good" }]);
    }
    case "education":
      return reply(G.education);
    case "fde":
      return reply(`${profile.fde.intro} His approach has five steps: ${list(profile.fde.steps.map((s) => s.title))}.`, [{ label: "How he works", action: "fde" }]);
    case "contact":
      return reply("Happily. You can send a message through the contact form, or email or call him directly. I've put the buttons right here.", contact);
    case "unknown":
      return reply("I don't have verified information about that, and I won't guess. The best route is to ask Abhilash directly. I can take you to the contact form.", contact);
    default: {
      const raw = String(msg?.text || "");
      if (!raw || /couldn't find that/i.test(raw)) return reply("Hmm, I couldn't find that in what I know about him, so I won't make something up. You could try asking about his experience, skills, or projects. Or message him directly.", [{ label: "Open the contact form", action: "contact" }]);
      const body = clean(raw.replace(/^Here's what I found:\s*/i, ""));
      return reply(`Here's what I found. ${firstSentences(body, 2)}`, [{ label: "See more in chat", action: "chat" }]);
    }
  }
}
