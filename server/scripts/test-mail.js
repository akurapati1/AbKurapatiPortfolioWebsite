// Verifies your SMTP settings and sends one real test email to MAIL_TO.
//   cd server && npm run test:mail
import { loadConfig } from "../src/config.js";
import { createMailer } from "../src/mailer.js";

const config = loadConfig();
if (!config.mail.smtp) {
  console.error("\n✗ SMTP_HOST is not set. Copy .env.example to .env and fill in the SMTP_* values.\n");
  process.exit(1);
}
const { host, port, secure, auth } = config.mail.smtp;
console.log(`\nSMTP  : ${host}:${port} (${secure ? "TLS" : "STARTTLS"}) as ${auth?.user || "(no auth)"}`);
console.log(`Send to: ${config.mail.to}\n`);

const mailer = createMailer(config);
try {
  await mailer.verify();
  console.log("✓ Connected and authenticated.");
  await mailer.sendContact({
    name: "Portfolio test", email: config.mail.to, phone: "", company: "Setup check", topic: "question", preferredTime: "",
    message: "If you can read this, your portfolio contact form is wired up correctly. Hit reply to confirm replies work.", brief: ""
  });
  console.log(`✓ Test email sent. Check ${config.mail.to} (and the spam folder the first time).\n`);
} catch (err) {
  console.error("✗ Failed:", err.message);
  if (/Invalid login|535|Username and Password/i.test(err.message)) console.error("  → Gmail needs an *App Password* (16 characters), not your normal password. See docs/EMAIL_SETUP.md.");
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(err.message)) console.error("  → Can't reach the SMTP server. Check SMTP_HOST / SMTP_PORT and that your network or host allows outbound SMTP.");
  process.exit(1);
}
