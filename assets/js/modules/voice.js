import { safeStorage } from "../util.js";

/**
 * Natural-sounding narration + live voice input, built on the browser's speech engines.
 *
 * What makes it sound less like a screen reader:
 *  - text is cleaned for speaking (acronyms spelled, "&" -> "and", markdown removed)
 *  - it is spoken sentence by sentence, with deliberate pauses sized to the punctuation
 *    (comma < colon < full stop < paragraph), and a touch of rate/pitch variation per sentence
 *  - questions lift in pitch, short punchy sentences slow down slightly
 *  - the best available English voice is chosen automatically (neural / natural voices first)
 */

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

/* ------------------------------------------------------------------ text prep */
const SAY = [
  [/\bJ&J\b/g, "J and J"], [/&/g, " and "], [/\bCI\/CD\b/g, "C I C D"], [/\bPub\/Sub\b/g, "Pub Sub"],
  [/\bGKE\b/g, "G K E"], [/\bADK\b/g, "A D K"], [/\bGCP\b/g, "G C P"], [/\bGCS\b/g, "G C S"], [/\bMLOps\b/gi, "M L Ops"],
  [/\bLLMs?\b/g, "L L M"], [/\bSRE\b/g, "S R E"], [/\bNDA\b/g, "N D A"], [/\bMSA\b/g, "M S A"], [/\bSSE\b/g, "S S E"],
  [/\bRBAC\b/g, "role based access control"], [/\bHITL\b/g, "human in the loop"], [/\bRLHF\b/g, "R L H F"], [/\bETL\b/g, "E T L"],
  [/\bMCP\b/g, "M C P"], [/\bDAG\b/g, "dag"], [/\bAPIs\b/g, "A P I's"], [/\bAPI\b/g, "A P I"], [/\bSQL\b/g, "sequel"],
  [/\bpgvector\b/gi, "P G vector"], [/\bPostgres\b/g, "Postgres"], [/\bMongoDB\b/g, "Mongo D B"], [/\bFastAPI\b/g, "Fast A P I"],
  [/\bPDFs?\b/g, "P D F"], [/\bUAT\b/g, "U A T"], [/\bTTS\b/g, "T T S"], [/\bGPA\b/g, "G P A"], [/\bDSO\b/g, "D S O"],
  [/\bNJ\b/g, "New Jersey"], [/\be\.g\./g, "for example"], [/\bi\.e\./g, "that is"], [/\bvs\.?\b/g, "versus"],
  [/(\d+)k\+/g, "over $1 thousand"], [/(\d+)\+/g, "$1 plus"], [/(\d)–(\d)/g, "$1 to $2"], [/→/g, " to "], [/·/g, ","],
  [/\*\*|__|`/g, ""], [/\[([^\]]+)\]\([^)]+\)/g, "$1"], [/https?:\/\/\S+/g, "the link"], [/\s{2,}/g, " "]
];
export const forSpeech = (t) => SAY.reduce((s, [re, to]) => s.replace(re, to), String(t || "")).trim();

/** Strip markdown for on-screen / spoken answers. */
export function plain(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s*[-*•]\s+/gm, "").replace(/^\s*\d+\.\s+/gm, "").replace(/\n{2,}/g, "\n\n").trim();
}

/**
 * Split into speakable segments. Each segment keeps the on-screen text and the spoken text,
 * plus the pause that should follow it.
 */
export function segment(text) {
  const out = [];
  for (const para of String(text).split(/\n{2,}/)) {
    const parts = para.replace(/\n/g, " ").match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g) || [para];
    parts.forEach((p, i) => {
      const t = p.trim(); if (!t) return;
      // break very long sentences at a comma / dash / colon so the engine breathes naturally
      const chunks = t.length > 110 ? t.split(/(?<=[,;:—–])\s+/).reduce((a, c) => { const l = a[a.length - 1]; if (l && (l + " " + c).length < 90) a[a.length - 1] = l + " " + c; else a.push(c); return a; }, []) : [t];
      chunks.forEach((c, j) => {
        const last = j === chunks.length - 1;
        const end = c.slice(-1);
        let pause = last ? ({ ".": 430, "!": 460, "?": 520, "…": 760 }[end] ?? 380) : ({ ",": 170, ";": 260, ":": 300, "—": 260, "–": 260 }[end] ?? 200);
        if (last && i === parts.length - 1) pause += 360; // paragraph end
        out.push({ text: c, say: forSpeech(c), pause, question: end === "?", exclaim: end === "!", short: c.length < 28 });
      });
    });
  }
  return out;
}

/* ------------------------------------------------------------------ voices */
const NOVELTY = /(Eddy|Flo|Grandma|Grandpa|Rocko|Shelley|Reed|Sandy|Bubbles|Bahh|Bells|Boing|Cellos|Wobble|Zarvox|Trinoids|Whisper|Albert|Fred|Junior|Kathy|Ralph|Organ|Superstar|Jester|Good News|Bad News|Hysterical|Deranged|Pipe|Princess|Agnes)/i;
function score(v) {
  if (!/^en/i.test(v.lang)) return -1000;
  let s = 0; const n = v.name;
  if (/(Natural|Neural|Online)/i.test(n)) s += 90;
  if (/Google UK English Female/i.test(n)) s += 55; else if (/Google US English/i.test(n)) s += 45; else if (/Google UK English Male/i.test(n)) s += 35;
  if (/(Samantha|Ava|Allison|Serena|Daniel|Karen|Moira|Tessa|Aria|Jenny|Libby|Sonia|Ryan|Guy|Zira|Susan)/i.test(n)) s += 30;
  if (/en[-_]GB/i.test(v.lang)) s += 8; else if (/en[-_]US/i.test(v.lang)) s += 6; else if (/en[-_](AU|IN|IE|ZA|CA)/i.test(v.lang)) s += 2;
  if (!v.localService) s += 4;
  if (NOVELTY.test(n)) s -= 200;
  return s;
}

export function createVoice() {
  const supported = !!synth && typeof SpeechSynthesisUtterance !== "undefined";
  let enabled = supported && safeStorage.get("ariVoice") !== "off";
  let voice = null;
  const pick = () => { if (!supported) return; const vs = synth.getVoices(); if (vs.length) voice = [...vs].sort((a, b) => score(b) - score(a))[0] || null; };
  if (supported) { pick(); synth.addEventListener?.("voiceschanged", pick); }

  let seq = 0;
  /** Speak one segment. Resolves when it ends, is cancelled, or the engine fails. */
  function speakSegment(seg, idx = 0) {
    return new Promise((resolve) => {
      if (!supported || !enabled || !seg.say) return resolve(false);
      const u = new SpeechSynthesisUtterance(seg.say);
      const jitter = ((idx * 7 + seg.say.length) % 5 - 2) * 0.012;          // gentle, deterministic variation
      u.rate = Math.max(0.8, Math.min(1.1, 0.97 + jitter - (seg.short ? 0.05 : 0) + (seg.exclaim ? 0.03 : 0)));
      u.pitch = seg.question ? 1.1 : seg.exclaim ? 1.08 : 1.0 + jitter;
      u.volume = 1; u.lang = voice?.lang || "en-US"; if (voice) u.voice = voice;
      const my = ++seq; let done = false;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(guard); resolve(ok); };
      // Some engines never fire "end" for network voices: don't hang forever.
      const guard = setTimeout(() => fin(false), Math.max(4000, seg.say.length * 140));
      u.onend = () => fin(my === seq); u.onerror = () => fin(false);
      try { synth.speak(u); } catch { fin(false); }
    });
  }
  const cancel = () => { seq++; try { synth?.cancel(); } catch { /* ignore */ } };

  return {
    supported,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v && supported; safeStorage.set("ariVoice", enabled ? "on" : "off"); if (!enabled) cancel(); },
    get name() { return voice?.name || ""; },
    speakSegment, cancel
  };
}

/* ------------------------------------------------------------------ listening */
export function createListener({ onInterim, onFinal, onEnd, onError } = {}) {
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  let rec = null, active = false;
  const stop = () => { active = false; try { rec?.stop(); } catch { /* ignore */ } };
  function start() {
    if (!SR || active) return false;
    rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      if (interim) onInterim?.(interim);
      if (finalText.trim()) { const t = finalText.trim(); finalText = ""; active = false; try { rec.stop(); } catch { /* ignore */ } onFinal?.(t); }
    };
    rec.onerror = (e) => { active = false; onError?.(e.error); };
    rec.onend = () => { const was = active; active = false; onEnd?.(was); };
    try { rec.start(); active = true; return true; } catch { active = false; return false; }
  }
  return { supported: !!SR, start, stop, get active() { return active; } };
}
