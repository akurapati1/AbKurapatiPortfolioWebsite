import { loadConfig } from "./config.js";
import { createMailer } from "./mailer.js";
import { createLLM } from "./llm.js";
import { loadKnowledgeBase } from "./kb.js";
import { createApp } from "./app.js";

const config = loadConfig();
const kb = loadKnowledgeBase(config.siteRoot);
const mailer = createMailer(config);
const llm = createLLM(config);
const app = createApp({ config, mailer, llm, kb });

const server = app.listen(config.port, () => {
  console.log(`\n  Portfolio server on http://localhost:${config.port}`);
  console.log(`  AI agent : ${llm.available() ? `Claude (${config.llm.model})` : "retrieval mode (set ANTHROPIC_API_KEY for the live LLM)"}`);
  console.log(`  Mail     : ${mailer.live ? `SMTP ${config.mail.smtp.host}:${config.mail.smtp.port} -> ${config.mail.to}` : "dev capture (set SMTP_HOST to send real email)"}\n`);
  if (mailer.live) mailer.verify().then(() => console.log("  SMTP connection verified")).catch((e) => console.warn("  SMTP verify failed:", e.message));
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
