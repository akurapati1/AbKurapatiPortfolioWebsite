# Making the contact form email you (step by step)

**How it works:** a visitor fills in the form → the browser sends it to your server (`POST /api/contact`) →
the server logs in to an email account via SMTP and sends *you* an email. When you press **Reply**, your
answer goes straight to the visitor (their address is the `Reply-To`).

GitHub Pages can only host static files, so the **server must run somewhere** (Render, Fly, Railway, a VPS…).
Without it the form still works in a basic mode: it opens the visitor's own email app with the message pre-filled.

## 1. Create an App Password (Gmail)
1. Turn on **2-Step Verification**: <https://myaccount.google.com/security>
2. Open <https://myaccount.google.com/apppasswords>, create an app password named "Portfolio".
3. Copy the 16-character password (spaces don't matter). This is `SMTP_PASS`.
   Your normal Gmail password will **not** work.

> Prefer not to use your personal Gmail? Any SMTP provider works: Brevo (free tier), Resend, SendGrid, Mailgun, Amazon SES.
> Use their SMTP host/port/username/password in the same variables below.

## 2. Configure locally and test
```bash
cd server
cp .env.example .env
# edit .env:
#   SMTP_HOST=smtp.gmail.com   SMTP_PORT=587   SMTP_SECURE=false
#   SMTP_USER=abhilash.kurapati1301@gmail.com
#   SMTP_PASS=<app password>
#   MAIL_TO=<the inbox that should receive messages>
#   MAIL_FROM=<same as SMTP_USER for Gmail>
npm run test:mail     # connects, authenticates and sends one real test email
npm start             # then open http://localhost:8787 and use the form
```

## 3. Deploy the server
**Render (easiest):** New → Blueprint → pick this repo (uses `render.yaml`). In the dashboard set the secret
variables `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (and `ANTHROPIC_API_KEY` for the live AI). Deploy. Your URL
looks like `https://abhilash-portfolio.onrender.com`; the whole site is already served from it.

**Keep the site on GitHub Pages instead?** Then tell the page where the API lives, in `index.html`:
```html
<meta name="api-base" content="https://abhilash-portfolio.onrender.com">
```
and set `ALLOWED_ORIGINS=https://akurapati1.github.io` on the server (already the default).

## 4. Verify in production
```bash
curl https://YOUR-SERVER/api/health        # → {"ok":true,"mail":"smtp",...}   ("dev-capture" means SMTP isn't configured)
```
Submit the form once from your phone. The email arrives with subject `[Portfolio] Hiring / role: Name (Company)`.

## Optional features
| Variable | What it does |
|---|---|
| `SEND_CONFIRMATION=true` | Sends the visitor an automatic "got your message" email (off by default: can be abused to mail strangers) |
| `MESSAGE_LOG_PATH=./data/messages.jsonl` | Also saves each submission to a file as a backup (note: most free hosts wipe disks on redeploy) |
| `RATE_CONTACT=5` | Max submissions per IP per hour |
| Calendar link | Put your Calendly/Cal.com URL in `data/profile.json` → `identity.scheduling.url` and a "Book a call" button appears |

## Troubleshooting
| Symptom | Fix |
|---|---|
| `535 Username and Password not accepted` | Use an **App Password**, and make sure 2-Step Verification is on |
| Form says "Email delivery isn't configured" | `/api/health` shows `dev-capture`: `SMTP_HOST` isn't set on the server |
| Works locally, not in production | Variables not set in the host's dashboard, or the host blocks outbound port 587 (try port 465 with `SMTP_SECURE=true`, or an API-based provider's SMTP) |
| Emails land in spam | Use a provider with a verified domain (SPF/DKIM); for personal use, mark the first one "Not spam" |
| Browser blocks the request (CORS) | Add the site's origin to `ALLOWED_ORIGINS` |
| "Too many requests" | Per-IP rate limit working as designed; raise `RATE_CONTACT` |
