# Abhilash Kurapati · AI Engineer & Forward Deployed Engineer

A portfolio that behaves like the work it advertises: an agent you can interview, an honest job-fit checker, a discovery-call simulator, and a contact form that sends real email.

```
Browser (static site, vanilla ES modules, no build step)
  ├─ data/profile.json ──► every section is rendered from this one file
  ├─ assets/js/shared/retrieval.js ──► BM25 search + honest rule-based answers (runs in the browser too)
  └─ /api/*  (optional but recommended)
        │
Node API (server/)  ── Express 5 · Helmet CSP · rate limits · zod validation
  ├─ POST /api/contact   → SMTP (nodemailer): reply-to the visitor, HTML-escaped, honeypot + time-trap
  ├─ POST /api/chat      → SSE stream from a Claude tool-use agent (search_profile, get_project,
  │                         assess_job_fit, suggest_contact) with a visible step trace
  ├─ POST /api/fit       → structured JSON job-fit assessment (evidence + gaps)
  ├─ POST /api/discover  → structured "discovery brief" for a visitor's workflow problem
  └─ GET  /api/health    → capability probe the UI uses to pick live vs. built-in mode
```

## It degrades gracefully (by design)

| Backend situation | Chat / fit / discovery | Contact form |
|---|---|---|
| Server + `ANTHROPIC_API_KEY` | Live Claude agent, grounded by tools, streamed | Real SMTP email |
| Server, no API key | Retrieval mode (BM25 over `profile.json`), still honest | Real SMTP email |
| No server (e.g. GitHub Pages) | Same retrieval mode, fully in the browser | Falls back to the visitor's email app (`mailto:`) |
| Daily LLM budget exhausted / API error | Automatic fallback to retrieval mode | unchanged |

A message is never silently lost: if SMTP isn't configured the form says so and offers `mailto:`.

## Run locally

```bash
npm run install:server      # once
cp server/.env.example server/.env   # then edit (all values optional for a first run)
npm start                   # http://localhost:8787  (site + API)
npm test                    # 26 tests: retrieval, contact, SSE chat agent, fit/discovery
```

Static-only preview (no API, built-in mode): `npm run serve:static` → http://localhost:8080

## Highlights

- **3D AI agent hero** (`assets/js/modules/agentcore.js`): a real-time neural sphere that assembles itself, rotates, responds to drag, and orbits capability modules; click one to reveal details and jump to that part of the site.
- **Repo atlas**: every notable repo (55 indexed) with search and category filters, generated from `data/profile.json` and also searchable by the AI.
- **Motion layer**: click ripples, 3D card tilt, magnetic buttons, word-by-word headings, decode-style labels, staggered reveals.
- **No photos** anywhere on the site by design.

## Turn on the two real features

**1. Email (SMTP).** Full walkthrough in [`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md); verify with `cd server && npm run test:mail`. In `server/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=abhilash.kurapati1301@gmail.com
SMTP_PASS=<a Google "App password">    # Google Account → Security → 2-Step Verification → App passwords
MAIL_TO=abhilash.kurapati1301@gmail.com
```
Any SMTP provider works (SendGrid, Mailgun, SES, Resend SMTP…). Never commit `.env`.

**2. Live AI agent.** Set `ANTHROPIC_API_KEY`. The model defaults to `claude-opus-5-5` and effort to `low`; override with `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT` (a smaller model is a sensible cost choice for a public endpoint). `LLM_DAILY_CALL_BUDGET` hard-caps spend: beyond it the site falls back to retrieval mode instead of failing.

## Deploy

- **Single container (recommended):** `docker compose up --build`, or push to Render using `render.yaml`. The container serves the site *and* the API on one origin, so no CORS setup is needed.
- **GitHub Pages + separate API:** keep the site on Pages, deploy the server anywhere, then set the API origin in `index.html`:
  ```html
  <meta name="api-base" content="https://your-api.example.com">
  ```
  and add `https://akurapati1.github.io` to `ALLOWED_ORIGINS` on the server. Without `api-base`, Pages runs in built-in mode.

## Keep it accurate: edit one file

All facts live in **`data/profile.json`**: metrics, experience, projects, skills (with honest `core | working | familiar` levels), FDE patterns, FAQ. The page, the in-browser assistant, and the server agent all read it, so they can't drift apart. To add a project, add an object to `projects`; it appears on the page and in the AI's knowledge immediately.

Facts the AI must not guess (visa status, salary, start date, relocation) are listed in `assistant.unknowns`; it points visitors to you instead.

## Safety notes

- Visitor text and tool output are treated as data in the system prompt; the agent is told to ignore embedded instructions, never reveal its rules, and decline off-topic requests.
- Per-IP rate limits on every endpoint, a global daily LLM budget, 64 KB body cap, strict zod validation, header-injection stripping on single-line fields, HTML-escaped emails, CSP via Helmet.
- Confirmation emails to visitors are **off** by default (`SEND_CONFIRMATION`) because they can be abused to mail third parties.

## Layout

```
index.html · assets/{css,js,img} · data/profile.json
assets/js/shared/retrieval.js   isomorphic knowledge base (browser + server)
assets/js/modules/              chat, sections, AI tools, contact, effects
server/src/                     app, agent (tool loop), llm, mailer, schemas, config
server/test/                    node:test suites (no network needed)
```
