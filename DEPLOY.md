# PawPal — go-live checklist

## 1. MongoDB Atlas (required)
1. Create a free M0 cluster at https://www.mongodb.com/atlas.
2. **Database Access** → add a user and password. **Network Access** → allow `0.0.0.0/0` (Render IPs change).
3. **Connect → Drivers** → copy the `mongodb+srv://…` string into `MONGODB_URI`.
   On first start PawPal loads demo data into an empty database, or upgrades an existing PawPal database in place.

## 2. Email (required for sign-up, password reset and notifications)
Render's free plan blocks SMTP ports, so use **Resend**:
1. https://resend.com → add and verify your domain (DNS records).
2. Create an API key → `RESEND_API_KEY`.
3. Set `MAIL_FROM="PawPal <no-reply@your-verified-domain>"`.

(Gmail SMTP with an App Password still works locally or on hosts that allow SMTP: `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`.)

## 3. SMS phone verification (optional)
1. https://console.twilio.com → copy the **Account SID** and **Auth Token**.
2. Buy or use an SMS-capable number → `TWILIO_FROM_NUMBER` (E.164, e.g. `+61…`). Trial accounts can only text
   verified numbers.
Without these, phone verification is switched off in production (the UI says so) — nothing is faked.

## 4. AI (optional)
Set `ANTHROPIC_API_KEY` (Claude, preferred) or `OPENAI_API_KEY`. Without a key the rules engine still answers from
live data. AI endpoints are rate-limited.

## 5. Deploy on Render
1. Push this repo to GitHub (`.env` is git-ignored).
2. Render → **New + → Blueprint** → choose the repo. `render.yaml` creates the service and generates `JWT_SECRET`.
3. Fill in `APP_URL` (your Render URL), `MONGODB_URI`, `RESEND_API_KEY`, `MAIL_FROM`, and any optional keys.
4. After the first deploy, fix `APP_URL` if the real URL differs, then redeploy.

## 6. After going live
- Log in as `admin@pawpal.com` / `Admin@123` and **change the password immediately** (Settings), then change or
  deactivate the demo staff and adopter accounts in **Users & shelters**.
- Edit the shelters (names, addresses, phone numbers, hours) to your real details.
- Keep `ALLOW_DEMO_RESET=false` in production.
- Have the privacy policy and terms reviewed and add your organisation's legal details.
- Free Render instances sleep when idle — the first request can take ~50 seconds.
