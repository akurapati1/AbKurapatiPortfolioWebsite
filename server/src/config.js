import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const list = (v, d) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : d);

/**
 * All runtime configuration comes from environment variables (see .env.example).
 * Nothing secret is ever sent to the browser.
 */
export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 8787),
    siteRoot: env.SITE_ROOT ? path.resolve(env.SITE_ROOT) : path.resolve(here, "../.."),
    trustProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? int(env.TRUST_PROXY, 1) : env.TRUST_PROXY) : false,
    allowedOrigins: list(env.ALLOWED_ORIGINS, [
      "https://akurapati1.github.io",
      "http://localhost:8787",
      "http://localhost:5500",
      "http://127.0.0.1:8787",
      "http://127.0.0.1:5500"
    ]),

    mail: {
      to: env.MAIL_TO || "abhilash.kurapati1301@gmail.com",
      from: env.MAIL_FROM || env.SMTP_USER || "portfolio@localhost",
      fromName: env.MAIL_FROM_NAME || "Abhilash's Portfolio",
      sendConfirmation: bool(env.SEND_CONFIRMATION, false),
      // Optional safety net: append every accepted submission to this JSONL file so nothing is lost if SMTP is down.
      logPath: env.MESSAGE_LOG_PATH || "",
      smtp: env.SMTP_HOST
        ? {
            host: env.SMTP_HOST,
            port: int(env.SMTP_PORT, 587),
            secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 587) === 465),
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || "" } : undefined
          }
        : null
    },

    llm: {
      apiKey: env.ANTHROPIC_API_KEY || "",
      // Default follows the Claude API guidance; override with ANTHROPIC_MODEL (e.g. a cheaper model) as needed.
      model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      effort: env.ANTHROPIC_EFFORT || "low",
      maxTokens: int(env.LLM_MAX_TOKENS, 1500),
      maxToolTurns: int(env.LLM_MAX_TOOL_TURNS, 4),
      dailyCallBudget: int(env.LLM_DAILY_CALL_BUDGET, 400) // global cap; beyond it the site degrades to retrieval mode
    },

    limits: {
      chatPerWindow: int(env.RATE_CHAT, 20),
      chatWindowMs: int(env.RATE_CHAT_WINDOW_MS, 10 * 60 * 1000),
      toolsPerWindow: int(env.RATE_TOOLS, 10),
      toolsWindowMs: int(env.RATE_TOOLS_WINDOW_MS, 10 * 60 * 1000),
      contactPerWindow: int(env.RATE_CONTACT, 5),
      contactWindowMs: int(env.RATE_CONTACT_WINDOW_MS, 60 * 60 * 1000),
      minFormSeconds: int(env.MIN_FORM_SECONDS, 2)
    }
  };
}
