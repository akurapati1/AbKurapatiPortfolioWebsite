import nodemailer from "nodemailer";

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TOPIC_LABEL = {
  hiring: "Hiring / role",
  project: "Project or consulting",
  collaboration: "Collaboration",
  question: "General question",
  callback: "Call-back request"
};

/**
 * Build a mailer. With SMTP_HOST configured it sends for real; without it, messages are rendered
 * to JSON and logged so local development works with zero setup (and the API reports `delivered: false`).
 */
export function createMailer(config, { logger = console } = {}) {
  const live = Boolean(config.mail.smtp);
  const transport = live
    ? nodemailer.createTransport({ ...config.mail.smtp, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })
    : nodemailer.createTransport({ jsonTransport: true });

  const from = { name: config.mail.fromName, address: config.mail.from };

  function render(c) {
    const topic = TOPIC_LABEL[c.topic] || c.topic;
    const rows = [
      ["Name", c.name], ["Email", c.email], ["Phone", c.phone], ["Company", c.company],
      ["Topic", topic], ["Preferred time", c.preferredTime]
    ].filter(([, v]) => v);

    const textBody =
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\n--- Message ---\n${c.message}` +
      (c.brief ? `\n\n--- Discovery brief generated on the site ---\n${c.brief}` : "") +
      `\n\n(Sent from your portfolio website. Reply to this email to respond to ${c.name}.)`;

    const html = `<!doctype html><html><body style="margin:0;background:#0b0d17;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e5e7eb">
<div style="max-width:620px;margin:auto;background:#12162a;border:1px solid #232a4a;border-radius:14px;overflow:hidden">
<div style="padding:18px 22px;background:linear-gradient(135deg,#6d28d9,#0891b2);color:#fff;font-weight:700;font-size:16px">New message from your portfolio</div>
<div style="padding:22px">
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
      .map(([k, v]) => `<tr><td style="padding:6px 0;color:#94a3b8;width:130px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:#f1f5f9">${escapeHtml(v)}</td></tr>`)
      .join("")}</table>
<div style="margin-top:16px;padding:14px 16px;background:#0b0d17;border:1px solid #232a4a;border-radius:10px;white-space:pre-wrap;line-height:1.55;font-size:14px">${escapeHtml(c.message)}</div>
${c.brief ? `<div style="margin-top:14px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Discovery brief</div><div style="margin-top:6px;padding:14px 16px;background:#0b0d17;border:1px solid #232a4a;border-radius:10px;white-space:pre-wrap;font-size:13px;line-height:1.5">${escapeHtml(c.brief)}</div>` : ""}
<p style="margin:18px 0 0;color:#94a3b8;font-size:12px">Hit reply to respond directly to ${escapeHtml(c.name)}.</p>
</div></div></body></html>`;

    return { text: textBody, html, topic };
  }

  return {
    live,
    async sendContact(c, meta = {}) {
      const { text, html, topic } = render(c);
      const info = await transport.sendMail({
        from,
        to: config.mail.to,
        replyTo: { name: c.name, address: c.email },
        subject: `[Portfolio] ${topic}: ${c.name}${c.company ? ` (${c.company})` : ""}`,
        text,
        html,
        headers: { "X-Portfolio-Source": "contact-form", ...(meta.ip ? { "X-Submitter-IP": meta.ip } : {}) }
      });
      if (!live) logger.info?.("[mail:dev] contact message captured (SMTP not configured)");

      if (config.mail.sendConfirmation) {
        try {
          await transport.sendMail({
            from,
            to: { name: c.name, address: c.email },
            subject: "Thanks for reaching out to Abhilash",
            text: `Hi ${c.name},\n\nThanks for your message. It reached Abhilash, who will reply personally.\nIn the meantime, the resume and projects are on the portfolio site.\n\nThis is an automated confirmation.`,
            headers: { "Auto-Submitted": "auto-replied" }
          });
        } catch (err) {
          logger.warn?.("confirmation email failed", err.message);
        }
      }
      return { delivered: live, messageId: info.messageId };
    },
    verify: () => (live ? transport.verify() : Promise.resolve(false))
  };
}
