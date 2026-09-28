# PawPal — go live checklist

## A. Test real email on your computer (5 min)
1. Open `.env`, replace the two FILL_ME email values (sender Gmail + its App Password) and MAIL_FROM.
   Gmail: turn on 2-step verification, then Google Account → Security → App passwords → create one.
2. `npm install` then `npm start`. Startup log must say: `Email: SMTP smtp.gmail.com`.
3. Sign up with YOUR real email → the verify email arrives in your inbox → click link → log in.

## B. Put it online so anyone (e.g. Sara) can use it
1. **MongoDB Atlas** (free): create cluster → Database Access: add user/password → Network Access: allow 0.0.0.0/0
   → Connect → Drivers → copy the `mongodb+srv://...` string.
2. **GitHub**: upload this folder (the `.env` file is ignored automatically, so your passwords stay private).
3. **Render.com**: New → Blueprint → pick the repo. Enter these values when asked (copy them from your `.env`):
   `APP_URL` (your Render link), `MONGODB_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
4. After first deploy, if the real link differs from your APP_URL guess, fix APP_URL in Render → redeploy.
5. Test: open the live link, sign up with another real email, verify from that inbox, log in.

## Notes
- Staff login: admin@pawpal.com / Admin@123 — CHANGE THIS password after going live (Settings) and delete demo accounts.
- Free Render sleeps after inactivity: first visit can take ~50s.
- Gmail sends ~500/day. For a real launch use Brevo/Resend so mail comes from your own domain.
