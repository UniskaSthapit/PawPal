# PawPal — go-live checklist

## 1. MongoDB Atlas (required)
1. Create a free M0 cluster at https://www.mongodb.com/atlas.
2. **Database Access** → add a user and password. **Network Access** → allow `0.0.0.0/0` (Render IPs change).
3. **Connect → Drivers** → copy the `mongodb+srv://…` string into `MONGODB_URI`.
   On first start PawPal loads demo data into an empty database, or upgrades an existing PawPal database in place.

## 2. Owner account and email (required)
PawPal sends from your own address — **pawpaladmin@gmail.com** — through **Brevo** (HTTPS, so it works on
Render's free plan, which blocks SMTP; Resend can't be used because it needs a domain you own).
1. Create a free account at https://www.brevo.com (300 emails/day).
2. **Senders & IPs → Senders → Add a sender** → `pawpaladmin@gmail.com` → click the confirmation email Brevo sends.
3. **SMTP & API → API keys → Generate a new API key** → put it in `BREVO_API_KEY`.
4. Set `ADMIN_EMAIL=pawpaladmin@gmail.com`. On start-up PawPal makes this account the administrator and emails
   it a link to choose a password (valid 24 hours; afterwards use *Forgot password*). `MAIL_FROM` defaults to
   `PawPal <pawpaladmin@gmail.com>`.

Deliverability tip: mail sent "from" a Gmail address by another service can land in spam for some recipients.
If you later buy a domain, verify it in Brevo (or Resend) and switch `MAIL_FROM` to e.g. `hello@yourdomain.com`.

## 3. SMS phone verification (optional)
1. https://console.twilio.com → copy the **Account SID** and **Auth Token**.
2. Buy or use an SMS-capable number → `TWILIO_FROM_NUMBER` (E.164, e.g. `+61…`). Trial accounts can only text
   verified numbers.
Without these, phone verification is switched off in production (the UI says so) — nothing is faked.

## 4. AI (optional)
Pick **one**:
- **Free — Google Gemini:** https://aistudio.google.com/apikey → **Create API key** (no card) → `GEMINI_API_KEY`.
  Free-tier limits are modest, and Google may use free-tier prompts to improve its products (PawPal only sends public
  pet data and what people type into the assistant). If the free limit is hit, PawPal falls back to its rules engine.
- **Paid — Claude (best quality):** https://console.anthropic.com → add credit (min US$5) → **API keys** → `ANTHROPIC_API_KEY`.
- **Paid — OpenAI:** `OPENAI_API_KEY`.

If several keys are set, the order is Claude → OpenAI → Gemini. The startup log shows which one is active
(e.g. `AI: Google Gemini (gemini-flash-latest)`). With no key, the rules engine answers from live data.

## 5. Deploy on Render
1. Push this repo to GitHub (`.env` is git-ignored).
2. Render → **New + → Blueprint** → choose the repo. `render.yaml` creates the service and generates `JWT_SECRET`.
3. Fill in `APP_URL` (your Render URL), `MONGODB_URI`, `ADMIN_EMAIL`, `BREVO_API_KEY`, your AI key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`), and any optional keys.
4. After the first deploy, fix `APP_URL` if the real URL differs, then redeploy.

## 6. After going live
- Open the set-password email sent to `ADMIN_EMAIL`, choose a password and log in with the **Shelter staff** tab.
- In production, demo accounts that still use their published passwords are deactivated automatically on every
  start. Invite your real staff from **Users & shelters**.
- Edit the shelters (names, addresses, phone numbers, hours) to your real details.
- Keep `ALLOW_DEMO_RESET=false` in production.
- Have the privacy policy and terms reviewed and add your organisation's legal details.
- Free Render instances sleep when idle — the first request can take ~50 seconds.
