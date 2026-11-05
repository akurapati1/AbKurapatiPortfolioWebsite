import { $, h } from "./util.js";
import { probe, net } from "./api.js";
import { createBrain } from "./brain.js";
import { createChatStore, mountChat } from "./modules/chat.js";
import { renderHero, renderMetrics, renderAbout, renderCaseStudy, renderProjects, renderFDE, renderSkills, renderExperience } from "./modules/sections.js";
import { setupFit, setupDiscover, setupTabs } from "./modules/aitools.js";
import { setupContact } from "./modules/contact.js";
import { startNeural, startReveal, startChrome, setupTheme, setupDrawer, setupPalette } from "./modules/effects.js";

async function loadProfile() {
  const r = await fetch("data/profile.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`profile.json ${r.status}`);
  return r.json();
}

async function boot() {
  setupTheme();
  startChrome();
  startNeural();

  let profile;
  const probing = probe();
  try { profile = await loadProfile(); }
  catch (err) {
    console.error(err);
    $("#main").prepend(h("div", { class: "noscript" }, h("p", {}, "The interactive content couldn't load. If you opened this file directly, serve the folder over HTTP (e.g. "), h("code", {}, "npm start"), h("p", {}, "). Email me at abhilash.kurapati1301@gmail.com.")));
    return;
  }

  // Render everything that doesn't depend on the backend immediately.
  renderHero(profile); renderMetrics(profile); renderAbout(profile); renderCaseStudy(profile);
  renderProjects(profile); renderFDE(profile); renderSkills(profile); renderExperience(profile);
  const observeNew = startReveal();
  observeNew?.();

  const brain = createBrain(profile);
  const contact = setupContact();
  const selectTab = setupTabs();
  setupFit(brain); setupDiscover(brain);

  // Chat (inline + drawer share one conversation)
  const store = createChatStore({ profile, brain });
  const inline = mountChat($("#chatInline"), store, { profile });
  const drawerChat = mountChat($("#chatDrawer"), store, { profile, compact: true });

  const drawer = setupDrawer({
    onOpen: (inlineOnly) => {
      if (inlineOnly) { selectTab("chat"); inline.focus(); } else drawerChat.focus();
    }
  });
  setupPalette({
    ask: (q) => { drawer.open(); store.send(q); },
    openChat: () => drawer.open()
  });

  // Reflect backend capabilities in the UI once the probe settles.
  await probing;
  const note = $("#modeNote");
  if (net.online && net.ai === "llm") { note.textContent = "● live agent"; note.className = "mode-note llm"; note.title = `Powered by ${net.model}, grounded in verified profile data`; }
  else if (net.online) { note.textContent = "● knowledge-base mode"; note.className = "mode-note retrieval"; note.title = "Answers come from verified profile data (add an Anthropic API key on the server for the live agent)"; }
  else { note.textContent = "● built-in mode"; note.className = "mode-note retrieval"; note.title = "Running fully in your browser. No server needed."; }
  inline.setFoot(); drawerChat.setFoot(); contact.setMailNote();
}

boot();
